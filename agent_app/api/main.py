"""FastAPI del flujo de aprendizaje por texto."""

from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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
from agent_app.providers.base import ModelProvider
from agent_app.providers.factory import create_model_provider
from agent_app.services.learning_tools import (
    LearningTools,
    LocalLearningTools,
    RemoteMcpLearningTools,
)
from agent_app.services.logging import configure_logging
from agent_app.services.live_voice import GeminiLiveBridge, VoiceUnavailable
from agent_app.services.sessions import (
    ConversationDetail,
    ConversationListResponse,
    FirestoreSessionRepository,
    LocalSessionRepository,
    SessionRepository,
    conversation_detail,
    conversation_summary,
)
from mcp_learning_server.models import TopicStatus
from mcp_learning_server.server import build_learning_service

logger = logging.getLogger(__name__)
STATIC_DIR = Path(__file__).parents[1] / "static"


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
        EvaluatorAgent(tools),
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


def create_app(
    settings: Settings | None = None,
    tools: LearningTools | None = None,
    provider: ModelProvider | None = None,
    sessions: SessionRepository | None = None,
) -> FastAPI:
    settings = settings or Settings()
    tools = tools or build_learning_tools(settings)
    sessions = sessions or build_session_repository(settings)
    orchestrator = build_orchestrator(settings, tools, provider, sessions)
    app = FastAPI(
        title="AITeacher",
        version="0.4.0",
        description=(
            "Tutor de IA multiagente con aprendizaje adaptativo y herramientas "
            "MCP independientes."
        ),
    )
    app.state.orchestrator = orchestrator
    app.state.learning_tools = tools
    app.state.sessions = sessions
    app.state.settings = settings
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.middleware("http")
    async def correlation_middleware(request: Request, call_next):
        correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
        request.state.correlation_id = correlation_id
        response = await call_next(request)
        response.headers["x-correlation-id"] = correlation_id
        return response

    @app.exception_handler(ValueError)
    async def invalid_request(_: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(KeyError)
    async def missing_session(_: Request, exc: KeyError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc.args[0])})

    @app.exception_handler(PermissionError)
    async def forbidden_session(_: Request, exc: PermissionError) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(exc)})

    @app.get("/healthz")
    async def health() -> dict:
        return {
            "status": "ok",
            "service": "agent-app",
            "model_provider": settings.model_provider.value,
            "mcp_mode": "local" if settings.mcp_use_local_adapter else "remote",
        }

    @app.get("/api/capabilities")
    async def capabilities() -> dict:
        return {
            "text": True,
            "voice": settings.voice_enabled,
            "voice_model": settings.gemini_live_model if settings.voice_enabled else None,
        }

    @app.get("/api/topics", response_model=TopicCatalogResponse)
    async def topics(student_id: str) -> TopicCatalogResponse:
        if not student_id.strip() or len(student_id) > 100:
            raise ValueError("student_id debe contener entre 1 y 100 caracteres")
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
        student_id: str, include_archived: bool = False
    ) -> ConversationListResponse:
        items = sessions.list(student_id, include_archived)
        return ConversationListResponse(
            sessions=[conversation_summary(item) for item in items],
            retention_days=sessions.retention_days,
        )

    @app.get(
        "/api/sessions/{session_id}",
        response_model=ConversationDetail,
    )
    async def get_session(session_id: str, student_id: str) -> ConversationDetail:
        return conversation_detail(sessions.get(session_id, student_id))

    @app.patch(
        "/api/sessions/{session_id}",
        response_model=ConversationDetail,
    )
    async def update_session(
        session_id: str, payload: SessionUpdateRequest
    ) -> ConversationDetail:
        session = sessions.get(session_id, payload.student_id)
        if payload.title is not None:
            session = sessions.rename(session_id, payload.student_id, payload.title)
        if payload.archived is not None:
            session = sessions.set_archived(
                session_id, payload.student_id, payload.archived
            )
        return conversation_detail(session)

    @app.delete("/api/sessions/{session_id}", status_code=204)
    async def delete_session(
        session_id: str, student_id: str
    ) -> Response:
        sessions.delete(session_id, student_id)
        return Response(status_code=204)

    @app.websocket("/ws/live")
    async def live_voice(websocket: WebSocket) -> None:
        await websocket.accept()
        try:
            bridge = GeminiLiveBridge(settings)
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

    @app.get("/", include_in_schema=False)
    async def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.post("/api/chat", response_model=ChatResponse)
    async def chat(payload: ChatRequest, request: Request) -> ChatResponse:
        correlation_id = request.state.correlation_id
        logger.info("chat_started", extra={"correlation_id": correlation_id})
        result = await orchestrator.chat(payload, correlation_id)
        logger.info("chat_completed", extra={"correlation_id": correlation_id})
        return result

    @app.post("/api/evaluate", response_model=EvaluationResponse)
    async def evaluate(
        payload: EvaluationRequest, request: Request
    ) -> EvaluationResponse:
        return await orchestrator.evaluate(payload, request.state.correlation_id)

    return app


configure_logging()
app = create_app()


def main() -> None:
    settings = Settings()
    uvicorn.run(
        "agent_app.api.main:app",
        host=settings.app_host,
        port=settings.app_port,
    )


if __name__ == "__main__":
    main()
