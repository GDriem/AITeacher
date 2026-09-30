"""FastAPI del flujo de aprendizaje por texto."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import secrets
import time
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import (
    FastAPI,
    Header,
    HTTPException,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware

from agent_app.agents.diagnostic import DiagnosticAgent
from agent_app.agents.evaluator import EvaluatorAgent
from agent_app.agents.orchestrator import LearningOrchestrator
from agent_app.agents.tutor import TutorAgent
from agent_app.config import Settings
from agent_app.models.chat import (
    ChatRequest,
    ChatResponse,
    EvaluationRequest,
    EvaluationResponse,
    SessionUpdateRequest,
    TopicCatalogItem,
    TopicCatalogResponse,
)
from agent_app.models.activities import (
    PracticeEvaluationRequest,
    PracticeEvaluationResponse,
    PracticeStartRequest,
    PracticeStartResponse,
    ProjectCatalogResponse,
    ProjectEvaluationRequest,
    ProjectEvaluationResponse,
)
from agent_app.providers.base import ModelProvider
from agent_app.providers.factory import create_model_provider
from agent_app.services.learning_tools import (
    LearningToolsUnavailable,
    LearningTools,
    LocalLearningTools,
    RemoteMcpLearningTools,
)
from agent_app.services.logging import configure_logging
from agent_app.services.observability import (
    ObservableModelProvider,
    ObservabilityRegistry,
)
from agent_app.services.rate_limit import (
    RateLimitExceeded,
    StudentConcurrencyLimiter,
    StudentRateLimiter,
)
from agent_app.services.live_voice import GeminiLiveBridge, VoiceUnavailable
from agent_app.services.activities import PROJECTS, evaluate_project
from agent_app.services.auth import (
    AuthService,
    AuthStatus,
    AuthenticationError,
    FirestoreStudentProfileRepository,
    GoogleLoginRequest,
    GoogleTokenVerifier,
    LocalStudentProfileRepository,
    PublicStudentProfile,
    SessionSigner,
    StudentProfileRepository,
)
from agent_app.models.capabilities import AppCapabilities
from agent_app.models.observability import ObservabilitySnapshot
from agent_app.services.authoring import (
    AuthoringGateway,
    LocalAuthoringGateway,
    RemoteAuthoringGateway,
)
from agent_app.services.sessions import (
    ChatRequestLeaseLost,
    ChatRequestStatus,
    ConversationDetail,
    ConversationListResponse,
    FirestoreSessionRepository,
    LocalSessionRepository,
    SessionRepository,
    conversation_detail,
    conversation_summary,
)
from mcp_learning_server.models import (
    AuthoredLesson,
    LearningContent,
    LessonActionRequest,
    LessonMutationRequest,
    LessonRevertRequest,
    TopicStatus,
)
from mcp_learning_server.server import build_learning_service

logger = logging.getLogger(__name__)
STATIC_DIR = Path(__file__).parents[1] / "static"
REACT_DIST_DIR = Path(__file__).parents[2] / "frontend" / "dist"
AUTH_COOKIE_NAME = "ait_session"


def _chat_request_fingerprint(payload: ChatRequest) -> str:
    canonical = json.dumps(
        {"message": payload.message, "session_id": payload.session_id},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _reconcile_persisted_chat_response(
    sessions: SessionRepository,
    request_id: str,
    student_id: str,
    session_id: str,
) -> ChatResponse | None:
    """Recupera la respuesta ya persistida de una solicitud idempotente.

    Es una función **bloqueante**: agrupa dos llamadas al repositorio para que
    un único `asyncio.to_thread` las saque del event loop (ver `_in_thread`).
    """
    try:
        session = sessions.get(session_id, student_id)
    except KeyError:
        return None
    response = session.completed_chat_requests.get(request_id)
    if response is None:
        return None
    try:
        sessions.reconcile_chat_request(request_id, student_id, response)
    except KeyError:
        # El dueño puede haber liberado el claim entre la lectura de la sesión
        # y la reconciliación. La respuesta persistida sigue siendo autoritativa.
        pass
    return response


async def _in_thread[T](operation: Callable[..., T], *args: object) -> T:
    """Ejecuta una operación de persistencia fuera del hilo del event loop.

    `SessionRepository` y `StudentProfileRepository` son protocolos síncronos:
    el backend `firestore` hace E/S de red y el `local` escribe en disco. Si se
    invocaran directamente desde un handler `async`, congelarían el loop entero
    —y con él el bombeo de audio del WebSocket de voz— durante toda la ida y
    vuelta. Toda llamada a un repositorio desde código asíncrono debe pasar por
    aquí.
    """
    return await asyncio.to_thread(operation, *args)


def build_session_repository(settings: Settings) -> SessionRepository:
    if settings.app_sessions_backend == "local":
        return LocalSessionRepository(
            settings.app_sessions_path,
            settings.app_session_retention_days,
        )
    try:
        from google.cloud import firestore
    except ImportError as exc:  # pragma: no cover - depende del extra cloud
        raise RuntimeError(
            "El backend firestore requiere instalar el extra cloud"
        ) from exc
    return FirestoreSessionRepository(
        firestore.Client(project=settings.google_cloud_project),
        collection=settings.firestore_sessions_collection,
        retention_days=settings.app_session_retention_days,
    )


def build_student_profile_repository(
    settings: Settings,
) -> StudentProfileRepository:
    if settings.app_student_profiles_backend == "local":
        return LocalStudentProfileRepository(settings.app_student_profiles_path)
    try:
        from google.cloud import firestore
    except ImportError as exc:  # pragma: no cover - depende del extra cloud
        raise RuntimeError(
            "El backend firestore requiere instalar el extra cloud"
        ) from exc
    return FirestoreStudentProfileRepository(
        firestore.Client(project=settings.google_cloud_project),
        collection=settings.firestore_student_profiles_collection,
    )


def build_auth_service(settings: Settings) -> AuthService | None:
    if not settings.google_auth_enabled:
        return None
    if not settings.app_session_secret:
        raise RuntimeError(
            "APP_SESSION_SECRET es obligatorio cuando GOOGLE_CLIENT_ID está configurado"
        )
    return AuthService(
        GoogleTokenVerifier(settings.google_client_id or ""),
        build_student_profile_repository(settings),
        SessionSigner(settings.app_session_secret, settings.app_auth_session_days),
    )


def build_orchestrator(
    settings: Settings,
    tools: LearningTools | None = None,
    provider: ModelProvider | None = None,
    sessions: SessionRepository | None = None,
) -> LearningOrchestrator:
    if tools is None:
        tools = (
            LocalLearningTools(build_learning_service())
            if settings.mcp_use_local_adapter
            else RemoteMcpLearningTools(
                settings.mcp_server_url,
                settings.mcp_timeout_seconds,
                settings.mcp_auth_audience,
            )
        )
    provider = provider or create_model_provider(settings)
    return LearningOrchestrator(
        DiagnosticAgent(tools),
        TutorAgent(tools, provider),
        EvaluatorAgent(tools, provider),
        sessions or build_session_repository(settings),
    )


def build_learning_tools(settings: Settings) -> LearningTools:
    return (
        LocalLearningTools(build_learning_service())
        if settings.mcp_use_local_adapter
        else RemoteMcpLearningTools(
            settings.mcp_server_url,
            settings.mcp_timeout_seconds,
            settings.mcp_auth_audience,
        )
    )


def build_authoring_gateway(
    settings: Settings,
    tools: LearningTools,
) -> AuthoringGateway | None:
    if isinstance(tools, LocalLearningTools):
        if tools.service.authoring is None:
            return None
        return LocalAuthoringGateway(tools.service.authoring)
    if not settings.mcp_authoring_token:
        return None
    return RemoteAuthoringGateway(
        settings.mcp_authoring_url,
        settings.mcp_authoring_token,
        settings.mcp_timeout_seconds,
        settings.mcp_auth_audience,
    )


def create_app(
    settings: Settings | None = None,
    tools: LearningTools | None = None,
    provider: ModelProvider | None = None,
    sessions: SessionRepository | None = None,
    authoring: AuthoringGateway | None = None,
    observability: ObservabilityRegistry | None = None,
    auth_service: AuthService | None = None,
) -> FastAPI:
    settings = settings or Settings()
    tools = tools or build_learning_tools(settings)
    sessions = sessions or build_session_repository(settings)
    authoring = authoring or build_authoring_gateway(settings, tools)
    provider = provider or create_model_provider(settings)
    observability = observability or ObservabilityRegistry(
        provider_name=provider.name,
        input_cost_per_million_usd=settings.model_input_cost_per_million_usd,
        output_cost_per_million_usd=settings.model_output_cost_per_million_usd,
        max_latency_samples=settings.observability_max_latency_samples,
    )
    auth_service = auth_service or build_auth_service(settings)
    observed_provider = ObservableModelProvider(provider, observability)
    rate_limiter = StudentRateLimiter(
        settings.model_rate_limit_requests_per_minute
    )
    voice_session_limiter = StudentConcurrencyLimiter(
        settings.voice_max_concurrent_sessions_per_student
    )
    orchestrator = build_orchestrator(
        settings,
        tools,
        observed_provider,
        sessions,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        if isinstance(tools, RemoteMcpLearningTools):
            await tools.aclose()

    app = FastAPI(
        title="AITeacher",
        version="0.8.0",
        description=(
            "Tutor de IA multiagente con aprendizaje adaptativo y herramientas "
            "MCP independientes."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(GZipMiddleware, minimum_size=1_000)
    app.state.orchestrator = orchestrator
    app.state.learning_tools = tools
    app.state.sessions = sessions
    app.state.authoring = authoring
    app.state.settings = settings
    app.state.observability = observability
    app.state.auth_service = auth_service
    app.state.rate_limiter = rate_limiter
    app.state.voice_session_limiter = voice_session_limiter
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.mount(
        "/assets",
        StaticFiles(directory=REACT_DIST_DIR / "assets", check_dir=False),
        name="react-assets",
    )

    @app.middleware("http")
    async def correlation_middleware(request: Request, call_next):
        correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
        request.state.correlation_id = correlation_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - started) * 1_000
            route = getattr(request.scope.get("route"), "path", "<unmatched>")
            if not request.url.path.startswith(("/static/", "/assets/")):
                observability.record_http(
                    method=request.method,
                    route=route,
                    status_code=500,
                    duration_ms=duration_ms,
                )
            logger.exception(
                "http_request_failed",
                extra={
                    "correlation_id": correlation_id,
                    "method": request.method,
                    "route": route,
                    "status_code": 500,
                    "duration_ms": round(duration_ms, 2),
                },
            )
            raise
        duration_ms = (time.perf_counter() - started) * 1_000
        route = getattr(request.scope.get("route"), "path", "<unmatched>")
        if not request.url.path.startswith(("/static/", "/assets/")):
            observability.record_http(
                method=request.method,
                route=route,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )
        logger.info(
            "http_request_completed",
            extra={
                "correlation_id": correlation_id,
                "method": request.method,
                "route": route,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 2),
            },
        )
        if request.url.path.startswith("/assets/") and response.status_code == 200:
            response.headers.setdefault(
                "cache-control",
                "public, max-age=31536000, immutable",
            )
        elif request.url.path.startswith("/static/"):
            response.headers.setdefault(
                "cache-control",
                "public, max-age=3600, stale-while-revalidate=86400",
            )
        elif not request.url.path.startswith(
            ("/api/", "/ws/", "/healthz", "/readyz")
        ):
            response.headers.setdefault("cache-control", "no-cache")
        response.headers.setdefault("x-content-type-options", "nosniff")
        response.headers.setdefault(
            "referrer-policy", "strict-origin-when-cross-origin"
        )
        response.headers.setdefault(
            "cross-origin-opener-policy", "same-origin-allow-popups"
        )
        response.headers.setdefault(
            "permissions-policy",
            "camera=(), geolocation=(), microphone=(self), payment=()",
        )
        response.headers.setdefault(
            "content-security-policy",
            "default-src 'self'; "
            "script-src 'self' https://accounts.google.com; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https://*.googleusercontent.com; "
            "connect-src 'self' https://accounts.google.com; "
            "frame-src https://accounts.google.com; "
            "object-src 'none'; base-uri 'self'; form-action 'self'; "
            "frame-ancestors 'none'",
        )
        response.headers["x-correlation-id"] = correlation_id
        return response

    @app.exception_handler(AuthenticationError)
    async def invalid_authentication(
        _: Request, exc: AuthenticationError
    ) -> JSONResponse:
        return JSONResponse(status_code=401, content={"detail": str(exc)})

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_exceeded(
        _: Request, exc: RateLimitExceeded
    ) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={"detail": str(exc)},
            headers={"Retry-After": str(exc.retry_after)},
        )

    @app.exception_handler(ValueError)
    async def invalid_request(_: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(KeyError)
    async def missing_session(_: Request, exc: KeyError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc.args[0])})

    @app.exception_handler(PermissionError)
    async def forbidden_session(_: Request, exc: PermissionError) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(exc)})

    @app.exception_handler(LearningToolsUnavailable)
    async def learning_tools_unavailable(
        request: Request, exc: LearningToolsUnavailable
    ) -> JSONResponse:
        logger.exception(
            "herramientas_aprendizaje_no_disponibles",
            extra={
                "correlation_id": getattr(request.state, "correlation_id", None),
            },
        )
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "El catálogo de aprendizaje no está disponible en este momento. "
                    "Vuelve a intentarlo en unos segundos."
                )
            },
        )

    @app.get("/healthz")
    async def health() -> dict:
        return {
            "status": "ok",
            "service": "agent-app",
            "model_provider": settings.model_provider.value,
            "mcp_mode": "local" if settings.mcp_use_local_adapter else "remote",
        }

    @app.get("/readyz", response_model=None)
    async def readiness() -> dict | Response:
        try:
            async with asyncio.timeout(settings.mcp_timeout_seconds):
                await tools.list_available_topics()
        except Exception:
            logger.exception("readiness_dependency_failed")
            return JSONResponse(
                status_code=503,
                content={
                    "status": "not_ready",
                    "service": "agent-app",
                    "dependency": "learning-mcp",
                },
            )
        return {
            "status": "ready",
            "service": "agent-app",
            "mcp_mode": "local" if settings.mcp_use_local_adapter else "remote",
        }

    @app.get("/api/observability", response_model=ObservabilitySnapshot)
    async def observability_summary(request: Request) -> dict:
        await authenticated_profile(request)
        return observability.snapshot()

    @app.get("/api/capabilities", response_model=AppCapabilities)
    async def capabilities() -> AppCapabilities:
        return AppCapabilities(
            text=True,
            voice=settings.voice_enabled,
            voice_model=(
                settings.resolved_gemini_live_model if settings.voice_enabled else None
            ),
            authoring=bool(settings.app_authoring_token and authoring),
        )

    async def authenticated_profile(request: Request):
        if auth_service is None:
            return None
        # `authenticate` lee el perfil del repositorio (Firestore en la nube) y
        # ocurre en cada petición autenticada: nunca en el hilo del loop.
        return await _in_thread(
            auth_service.authenticate, request.cookies.get(AUTH_COOKIE_NAME)
        )

    async def resolve_student_id(
        request: Request, claimed_student_id: str | None
    ) -> str:
        profile = await authenticated_profile(request)
        if profile is not None:
            return profile.student_id
        normalized = (claimed_student_id or "").strip()
        if not normalized or len(normalized) > 100:
            raise ValueError("student_id debe contener entre 1 y 100 caracteres")
        return normalized

    async def limited_student_id(
        request: Request, claimed_student_id: str | None
    ) -> str:
        student_id = await resolve_student_id(request, claimed_student_id)
        rate_limiter.check(student_id)
        return student_id

    @app.get("/api/auth/status", response_model=AuthStatus)
    async def auth_status(request: Request) -> AuthStatus:
        if auth_service is None:
            return AuthStatus(enabled=False, authenticated=False)
        try:
            profile = await authenticated_profile(request)
        except AuthenticationError:
            return AuthStatus(
                enabled=True,
                authenticated=False,
                google_client_id=settings.google_client_id,
            )
        return AuthStatus(
            enabled=True,
            authenticated=True,
            google_client_id=settings.google_client_id,
            profile=PublicStudentProfile.from_profile(profile),
        )

    @app.post("/api/auth/google", response_model=PublicStudentProfile)
    async def google_login(
        payload: GoogleLoginRequest, response: Response
    ) -> PublicStudentProfile:
        if auth_service is None:
            raise HTTPException(
                status_code=409,
                detail="Google Login no está configurado en este entorno",
            )
        token, _, profile = await _in_thread(auth_service.login, payload.credential)
        response.set_cookie(
            AUTH_COOKIE_NAME,
            token,
            max_age=settings.app_auth_session_days * 86_400,
            httponly=True,
            secure=settings.app_auth_cookie_secure,
            samesite="lax",
            path="/",
        )
        return PublicStudentProfile.from_profile(profile)

    @app.post("/api/auth/logout", status_code=204)
    async def logout(response: Response) -> None:
        response.delete_cookie(
            AUTH_COOKIE_NAME,
            httponly=True,
            secure=settings.app_auth_cookie_secure,
            samesite="lax",
            path="/",
        )

    def require_authoring(
        supplied_token: str | None,
    ) -> AuthoringGateway:
        if not settings.app_authoring_token or authoring is None:
            raise HTTPException(
                status_code=503,
                detail="El panel de autoría no está configurado",
            )
        if not supplied_token or not secrets.compare_digest(
            supplied_token,
            settings.app_authoring_token,
        ):
            raise HTTPException(
                status_code=401,
                detail="Credencial de autoría inválida",
            )
        return authoring

    @app.get("/api/authoring/lessons", response_model=list[AuthoredLesson])
    async def list_authored_lessons(
        x_authoring_token: str | None = Header(default=None),
    ) -> list[AuthoredLesson]:
        gateway = require_authoring(x_authoring_token)
        return await gateway.list_lessons()

    @app.post(
        "/api/authoring/lessons",
        response_model=AuthoredLesson,
        status_code=201,
    )
    async def create_authored_lesson(
        payload: LessonMutationRequest,
        x_authoring_token: str | None = Header(default=None),
    ) -> AuthoredLesson:
        gateway = require_authoring(x_authoring_token)
        return await gateway.create_lesson(payload)

    @app.get(
        "/api/authoring/lessons/{lesson_id}",
        response_model=AuthoredLesson,
    )
    async def get_authored_lesson(
        lesson_id: str,
        x_authoring_token: str | None = Header(default=None),
    ) -> AuthoredLesson:
        gateway = require_authoring(x_authoring_token)
        return await gateway.get_lesson(lesson_id)

    @app.put(
        "/api/authoring/lessons/{lesson_id}",
        response_model=AuthoredLesson,
    )
    async def update_authored_lesson(
        lesson_id: str,
        payload: LessonMutationRequest,
        x_authoring_token: str | None = Header(default=None),
    ) -> AuthoredLesson:
        gateway = require_authoring(x_authoring_token)
        return await gateway.update_lesson(lesson_id, payload)

    @app.get(
        "/api/authoring/lessons/{lesson_id}/preview",
        response_model=LearningContent,
    )
    async def preview_authored_lesson(
        lesson_id: str,
        x_authoring_token: str | None = Header(default=None),
    ) -> LearningContent:
        gateway = require_authoring(x_authoring_token)
        return await gateway.preview_lesson(lesson_id)

    @app.post(
        "/api/authoring/lessons/{lesson_id}/publish",
        response_model=AuthoredLesson,
    )
    async def publish_authored_lesson(
        lesson_id: str,
        payload: LessonActionRequest,
        x_authoring_token: str | None = Header(default=None),
    ) -> AuthoredLesson:
        gateway = require_authoring(x_authoring_token)
        return await gateway.publish_lesson(lesson_id, payload)

    @app.post(
        "/api/authoring/lessons/{lesson_id}/unpublish",
        response_model=AuthoredLesson,
    )
    async def unpublish_authored_lesson(
        lesson_id: str,
        payload: LessonActionRequest,
        x_authoring_token: str | None = Header(default=None),
    ) -> AuthoredLesson:
        gateway = require_authoring(x_authoring_token)
        return await gateway.unpublish_lesson(lesson_id, payload)

    @app.post(
        "/api/authoring/lessons/{lesson_id}/revert",
        response_model=AuthoredLesson,
    )
    async def revert_authored_lesson(
        lesson_id: str,
        payload: LessonRevertRequest,
        x_authoring_token: str | None = Header(default=None),
    ) -> AuthoredLesson:
        gateway = require_authoring(x_authoring_token)
        return await gateway.revert_lesson(lesson_id, payload)

    @app.get("/api/topics", response_model=TopicCatalogResponse)
    async def topics(
        request: Request, student_id: str | None = None
    ) -> TopicCatalogResponse:
        student_id = await resolve_student_id(request, student_id)
        catalog, progress, path = await asyncio.gather(
            tools.list_available_topics(),
            tools.get_student_progress(student_id),
            tools.get_learning_path(student_id),
        )
        path_by_topic = {item.topic: item for item in path.topics}
        progress_by_topic = {
            item.topic: item for item in progress.topic_progress
        }
        items = [
            TopicCatalogItem(
                topic=item.topic,
                title=item.title,
                subject=item.subject,
                category=item.category,
                order=item.order,
                prerequisites=item.prerequisites,
                unmet_prerequisites=path_by_topic[item.topic].unmet_prerequisites,
                available_levels=item.available_levels,
                status=path_by_topic[item.topic].status,
                progress=progress_by_topic.get(item.topic),
            )
            for item in catalog
        ]
        total = len(items)
        status_counts = {
            status.value: sum(item.status == status for item in items)
            for status in TopicStatus
        }
        return TopicCatalogResponse(
            total_topics=total,
            completed_topics=status_counts.get("completed", 0),
            in_progress_topics=status_counts.get("in_progress", 0),
            available_topics=status_counts.get("available", 0),
            blocked_topics=status_counts.get("blocked", 0),
            completion_percentage=path.completion_percentage,
            recommendation=path.recommendations[0] if path.recommendations else None,
            progress=progress,
            topics=items,
        )

    @app.get("/api/sessions", response_model=ConversationListResponse)
    async def list_sessions(
        request: Request,
        student_id: str | None = None,
        include_archived: bool = False,
    ) -> ConversationListResponse:
        student_id = await resolve_student_id(request, student_id)
        items = await _in_thread(sessions.list, student_id, include_archived)
        return ConversationListResponse(
            sessions=[conversation_summary(item) for item in items],
            retention_days=sessions.retention_days,
        )

    @app.get(
        "/api/sessions/{session_id}",
        response_model=ConversationDetail,
    )
    async def get_session(
        session_id: str, request: Request, student_id: str | None = None
    ) -> ConversationDetail:
        student_id = await resolve_student_id(request, student_id)
        return conversation_detail(
            await _in_thread(sessions.get, session_id, student_id)
        )

    @app.patch(
        "/api/sessions/{session_id}",
        response_model=ConversationDetail,
    )
    async def update_session(
        session_id: str, payload: SessionUpdateRequest, request: Request
    ) -> ConversationDetail:
        student_id = await resolve_student_id(request, payload.student_id)
        session = await _in_thread(sessions.get, session_id, student_id)
        if payload.title is not None:
            session = await _in_thread(
                sessions.rename, session_id, student_id, payload.title
            )
        if payload.archived is not None:
            session = await _in_thread(
                sessions.set_archived, session_id, student_id, payload.archived
            )
        return conversation_detail(session)

    @app.delete("/api/sessions/{session_id}", status_code=204)
    async def delete_session(
        session_id: str, request: Request, student_id: str | None = None
    ) -> Response:
        student_id = await resolve_student_id(request, student_id)
        await _in_thread(sessions.delete, session_id, student_id)
        return Response(status_code=204)

    @app.websocket("/ws/live")
    async def live_voice(websocket: WebSocket) -> None:
        voice_student_id = websocket.query_params.get("student_id")
        if auth_service is not None:
            try:
                profile = await _in_thread(
                    auth_service.authenticate,
                    websocket.cookies.get(AUTH_COOKIE_NAME),
                )
                voice_student_id = profile.student_id
            except AuthenticationError:
                await websocket.close(code=4401)
                return

        voice_student_id = (voice_student_id or "").strip()
        if not voice_student_id or len(voice_student_id) > 100:
            await websocket.close(code=4400)
            return
        if not voice_session_limiter.acquire(voice_student_id):
            await websocket.close(code=4429)
            return

        try:
            # El cupo se reserva antes de aceptar la conexión o construir el
            # cliente Gemini Live, que es el recurso con costo.
            await websocket.accept()
            session_context = ""
            session_id = websocket.query_params.get("session_id")
            if session_id:
                try:
                    current_session = await _in_thread(
                        sessions.get, session_id, voice_student_id
                    )
                    context_parts = [
                        f"Tema: {current_session.topic.value}.",
                        f"Conversación: {current_session.title}.",
                        (
                            "Actividad pendiente: "
                            f"{current_session.pending_evaluation.quiz.question}"
                        ),
                    ]
                    last_explanation = next(
                        (
                            item.content
                            for item in reversed(current_session.messages)
                            if item.role.value == "assistant"
                        ),
                        "",
                    )
                    if last_explanation:
                        context_parts.append(
                            f"Última explicación del tutor: {last_explanation[:1_000]}"
                        )
                    session_context = " ".join(context_parts)
                except (KeyError, PermissionError, ValueError):
                    logger.warning("voice_session_context_unavailable")
            try:
                bridge = GeminiLiveBridge(settings, session_context=session_context)
            except VoiceUnavailable as exc:
                await websocket.send_json({"type": "unavailable", "message": str(exc)})
                await websocket.close(code=4403)
                return
            try:
                await bridge.run(websocket)
            except WebSocketDisconnect:
                logger.info("voice_client_disconnected")
            except Exception:
                logger.exception("voice_session_failed")
                try:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message": "La voz se desconectó; continúa usando el chat de texto.",
                        }
                    )
                    await websocket.close(code=1011)
                except RuntimeError:
                    pass
        finally:
            voice_session_limiter.release(voice_student_id)

    @app.post("/api/chat", response_model=ChatResponse)
    async def chat(payload: ChatRequest, request: Request) -> ChatResponse:
        creates_session = payload.session_id is None
        payload = payload.model_copy(
            update={"student_id": await limited_student_id(request, payload.student_id)}
        )
        correlation_id = request.state.correlation_id
        logger.info("chat_started", extra={"correlation_id": correlation_id})
        with observability.activity("guided_explanation"):
            if payload.request_id is None:
                result = await orchestrator.chat(payload, correlation_id)
            else:
                session_id = payload.session_id or str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"ait-chat:{payload.student_id}:{payload.request_id}",
                    )
                )
                request_fingerprint = _chat_request_fingerprint(payload)
                lease_seconds = max(
                    60.0,
                    settings.model_timeout_seconds
                    + (2 * settings.mcp_timeout_seconds)
                    + 30.0,
                )
                claim = await _in_thread(
                    sessions.claim_chat_request,
                    payload.request_id,
                    payload.student_id,
                    session_id,
                    request_fingerprint,
                    lease_seconds,
                )
                if claim.response is not None:
                    result = claim.response
                elif not claim.acquired:
                    recovered = await _in_thread(
                        _reconcile_persisted_chat_response,
                        sessions,
                        payload.request_id,
                        payload.student_id,
                        claim.session_id,
                    )
                    if recovered is not None:
                        result = recovered
                    else:
                        result = None
                    deadline = time.monotonic() + settings.model_timeout_seconds + 5
                    while result is None and time.monotonic() < deadline:
                        await asyncio.sleep(0.05)
                        record = await _in_thread(
                            sessions.get_chat_request,
                            payload.request_id,
                            payload.student_id,
                        )
                        if (
                            record is not None
                            and record.status == ChatRequestStatus.COMPLETED
                            and record.response is not None
                        ):
                            result = record.response
                            break
                        recovered = await _in_thread(
                            _reconcile_persisted_chat_response,
                            sessions,
                            payload.request_id,
                            payload.student_id,
                            claim.session_id,
                        )
                        if recovered is not None:
                            result = recovered
                            break
                    if result is None:
                        raise HTTPException(
                            status_code=409,
                            detail=(
                                "El envío original sigue procesándose; reintenta "
                                "con el mismo request_id."
                            ),
                        )
                else:
                    if claim.claim_token is None:
                        raise RuntimeError("El claim adquirido no contiene token")
                    idempotent_payload = payload.model_copy(
                        update={"session_id": claim.session_id}
                    )
                    try:
                        result = await orchestrator.chat(
                            idempotent_payload,
                            correlation_id,
                            create_session_if_missing=creates_session,
                        )
                        try:
                            await _in_thread(
                                sessions.complete_chat_request,
                                payload.request_id,
                                payload.student_id,
                                claim.claim_token,
                                result,
                            )
                        except ChatRequestLeaseLost:
                            # El lease expiró y otro proceso reclamó la solicitud.
                            # El orquestador ya persistió la respuesta en la sesión,
                            # así que devolverla es correcto y evita un 403 espurio.
                            logger.warning(
                                "chat_lease_lost",
                                extra={"correlation_id": correlation_id},
                            )
                    except BaseException:
                        await _in_thread(
                            sessions.release_chat_request,
                            payload.request_id,
                            payload.student_id,
                            claim.claim_token,
                        )
                        raise
        logger.info("chat_completed", extra={"correlation_id": correlation_id})
        return result

    @app.post("/api/evaluate", response_model=EvaluationResponse)
    async def evaluate(
        payload: EvaluationRequest, request: Request
    ) -> EvaluationResponse:
        payload = payload.model_copy(
            update={"student_id": await limited_student_id(request, payload.student_id)}
        )
        with observability.activity("topic_evaluation"):
            return await orchestrator.evaluate(
                payload, request.state.correlation_id
            )

    @app.post("/api/practice/start", response_model=PracticeStartResponse)
    async def start_practice(
        payload: PracticeStartRequest, request: Request
    ) -> PracticeStartResponse:
        payload = payload.model_copy(
            update={"student_id": await limited_student_id(request, payload.student_id)}
        )
        return await orchestrator.start_practice(payload)

    @app.post("/api/practice/evaluate", response_model=PracticeEvaluationResponse)
    async def evaluate_practice(
        payload: PracticeEvaluationRequest, request: Request
    ) -> PracticeEvaluationResponse:
        payload = payload.model_copy(
            update={"student_id": await limited_student_id(request, payload.student_id)}
        )
        with observability.activity("practice_evaluation"):
            return await orchestrator.evaluate_practice(payload)

    @app.get("/api/projects", response_model=ProjectCatalogResponse)
    async def projects() -> ProjectCatalogResponse:
        return ProjectCatalogResponse(projects=list(PROJECTS.values()))

    @app.post(
        "/api/projects/{project_id}/evaluate",
        response_model=ProjectEvaluationResponse,
    )
    async def evaluate_integrative_project(
        project_id: str,
        payload: ProjectEvaluationRequest,
        request: Request,
    ) -> ProjectEvaluationResponse:
        payload = payload.model_copy(
            update={"student_id": await limited_student_id(request, payload.student_id)}
        )
        project = PROJECTS.get(project_id)
        if project is None:
            raise KeyError("No existe el proyecto solicitado")
        with observability.activity("project_evaluation"):
            return await evaluate_project(
                orchestrator.evaluator.provider,
                project,
                payload.submission,
            )

    # Catch-all: se declara al final para no ocultar rutas /api, /static,
    # /assets, /healthz, /readyz ni el websocket de voz. Sirve el shell de
    # React tanto en "/" como en cualquier ruta profunda para que el
    # recargado del navegador funcione con enrutamiento del lado del cliente.
    @app.get("/", include_in_schema=False)
    @app.get("/{path:path}", include_in_schema=False)
    async def react_app(path: str = "") -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        index_path = REACT_DIST_DIR / "index.html"
        if not index_path.is_file():
            raise HTTPException(
                status_code=503,
                detail="El build de React no está disponible; ejecuta `pnpm build`.",
            )
        return FileResponse(index_path)

    return app


configure_logging()


def main() -> None:
    settings = Settings()
    uvicorn.run(
        create_app(settings),
        host=settings.app_host,
        port=settings.app_port,
    )


if __name__ == "__main__":
    main()
