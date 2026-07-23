"""Punto de entrada ASGI del servicio MCP remoto."""

from __future__ import annotations

import contextlib
import os
import secrets
from pathlib import Path

import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route

from mcp_learning_server.repositories.local_progress import LocalProgressRepository
from mcp_learning_server.repositories.content_authoring import (
    LocalContentAuthoringRepository,
)
from mcp_learning_server.repositories.base import ProgressRepository
from mcp_learning_server.repositories.firestore_progress import (
    FirestoreProgressRepository,
)
from mcp_learning_server.services.content_store import InMemoryContentStore
from mcp_learning_server.services.authoring import ContentAuthoringService
from mcp_learning_server.services.ingestion import load_content
from mcp_learning_server.services.learning import LearningService
from mcp_learning_server.services.retrieval import LexicalRetriever
from mcp_learning_server.tools.learning_tools import register_learning_tools
from mcp_learning_server.models import (
    LessonActionRequest,
    LessonMutationRequest,
    LessonRevertRequest,
)

CONTENT_PATH = Path(__file__).parent / "content" / "learning_content.json"


def build_learning_service(
    progress_path: str | Path | None = None,
    authoring_path: str | Path | None = None,
) -> LearningService:
    store = InMemoryContentStore()
    bootstrap_content = load_content(CONTENT_PATH)
    repository = build_progress_repository(progress_path)
    authoring_repository = LocalContentAuthoringRepository(
        authoring_path
        or os.getenv("MCP_CONTENT_AUTHORING_PATH", ".data/content_authoring.json"),
        bootstrap_content,
    )
    authoring = ContentAuthoringService(authoring_repository, store)
    return LearningService(
        repository,
        store,
        LexicalRetriever(store),
        authoring=authoring,
    )


def build_progress_repository(
    progress_path: str | Path | None = None,
) -> ProgressRepository:
    backend = os.getenv("MCP_PROGRESS_BACKEND", "local").lower()
    if backend == "local":
        return LocalProgressRepository(
            progress_path or os.getenv("MCP_PROGRESS_PATH", ".data/student_progress.json")
        )
    if backend == "firestore":
        from google.cloud import firestore

        client = firestore.Client(project=os.getenv("GOOGLE_CLOUD_PROJECT") or None)
        return FirestoreProgressRepository(
            client,
            collection=os.getenv("FIRESTORE_PROGRESS_COLLECTION", "student_progress"),
        )
    raise ValueError("MCP_PROGRESS_BACKEND debe ser local o firestore")


def build_transport_security(
    extra_hosts: list[str] | None = None,
) -> TransportSecuritySettings | None:
    """Protección anti DNS-rebinding con hosts adicionales permitidos.

    FastMCP sólo auto-habilita esta protección para 127.0.0.1/localhost. Sin
    esto, cualquier despliegue detrás de otro nombre de host (el servicio
    "mcp-server" de docker-compose, o el hostname real de Cloud Run) recibe
    421 Misdirected Request en cada llamada MCP.
    """
    if extra_hosts is None:
        extra_hosts = [
            host.strip()
            for host in os.getenv("MCP_ALLOWED_HOSTS", "").split(",")
            if host.strip()
        ]
    if not extra_hosts:
        return None
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=["127.0.0.1:*", "localhost:*", "[::1]:*", *extra_hosts],
        allowed_origins=[
            "http://127.0.0.1:*",
            "http://localhost:*",
            "http://[::1]:*",
        ],
    )


def create_mcp_server(
    service: LearningService | None = None,
    allowed_hosts: list[str] | None = None,
) -> FastMCP:
    server = FastMCP(
        "Learning MCP Server",
        instructions=(
            "Expone contenido educativo y progreso. No es un agente y no toma "
            "decisiones pedagógicas."
        ),
        stateless_http=True,
        json_response=True,
        streamable_http_path="/",
        transport_security=build_transport_security(allowed_hosts),
    )
    register_learning_tools(server, service or build_learning_service())
    return server


def create_app(
    service: LearningService | None = None,
    allowed_hosts: list[str] | None = None,
    authoring_token: str | None = None,
) -> Starlette:
    runtime = service or build_learning_service()
    mcp_server = create_mcp_server(runtime, allowed_hosts)
    configured_authoring_token = (
        authoring_token
        if authoring_token is not None
        else os.getenv("MCP_AUTHORING_TOKEN")
    )

    @contextlib.asynccontextmanager
    async def lifespan(_: Starlette):
        async with mcp_server.session_manager.run():
            yield

    async def health(_: Request) -> JSONResponse:
        return JSONResponse({"status": "ok", "service": "learning-mcp"})

    def authorize(request: Request) -> JSONResponse | None:
        if not configured_authoring_token:
            return JSONResponse(
                {"detail": "La autoría está deshabilitada en el servidor MCP"},
                status_code=503,
            )
        supplied = request.headers.get("x-authoring-token", "")
        if not secrets.compare_digest(supplied, configured_authoring_token):
            return JSONResponse(
                {"detail": "Credencial de autoría inválida"},
                status_code=401,
            )
        if runtime.authoring is None:
            return JSONResponse(
                {"detail": "El servicio de autoría no está disponible"},
                status_code=503,
            )
        return None

    def lesson_response(lesson, status_code: int = 200) -> JSONResponse:
        return JSONResponse(
            lesson.model_dump(mode="json"),
            status_code=status_code,
        )

    async def lessons(request: Request) -> JSONResponse:
        denied = authorize(request)
        if denied is not None:
            return denied
        assert runtime.authoring is not None
        if request.method == "GET":
            return JSONResponse(
                [
                    lesson.model_dump(mode="json")
                    for lesson in runtime.authoring.list_lessons()
                ]
            )
        payload = LessonMutationRequest.model_validate(await request.json())
        lesson = runtime.authoring.create_lesson(payload.content, payload.author)
        return lesson_response(lesson, 201)

    async def lesson_detail(request: Request) -> JSONResponse:
        denied = authorize(request)
        if denied is not None:
            return denied
        assert runtime.authoring is not None
        lesson_id = request.path_params["lesson_id"]
        if request.method == "GET":
            return lesson_response(runtime.authoring.get_lesson(lesson_id))
        payload = LessonMutationRequest.model_validate(await request.json())
        return lesson_response(
            runtime.authoring.update_lesson(
                lesson_id,
                payload.content,
                payload.author,
            )
        )

    async def lesson_preview(request: Request) -> JSONResponse:
        denied = authorize(request)
        if denied is not None:
            return denied
        assert runtime.authoring is not None
        content = runtime.authoring.preview_lesson(request.path_params["lesson_id"])
        return JSONResponse(content.model_dump(mode="json"))

    async def lesson_action(request: Request) -> JSONResponse:
        denied = authorize(request)
        if denied is not None:
            return denied
        assert runtime.authoring is not None
        payload = LessonActionRequest.model_validate(await request.json())
        lesson_id = request.path_params["lesson_id"]
        action = request.path_params["action"]
        if action == "publish":
            lesson = runtime.authoring.publish_lesson(lesson_id, payload.author)
        elif action == "unpublish":
            lesson = runtime.authoring.unpublish_lesson(lesson_id, payload.author)
        else:
            raise KeyError("No existe la acción de autoría solicitada")
        return lesson_response(lesson)

    async def lesson_revert(request: Request) -> JSONResponse:
        denied = authorize(request)
        if denied is not None:
            return denied
        assert runtime.authoring is not None
        payload = LessonRevertRequest.model_validate(await request.json())
        lesson = runtime.authoring.revert_lesson(
            request.path_params["lesson_id"],
            payload.version,
            payload.author,
        )
        return lesson_response(lesson)

    async def invalid_request(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=422)

    async def missing_lesson(_: Request, exc: Exception) -> JSONResponse:
        detail = exc.args[0] if exc.args else str(exc)
        return JSONResponse({"detail": str(detail)}, status_code=404)

    app = Starlette(
        routes=[
            Route("/healthz", endpoint=health),
            Route("/readyz", endpoint=health),
            Route("/admin/lessons", endpoint=lessons, methods=["GET", "POST"]),
            Route(
                "/admin/lessons/{lesson_id:str}",
                endpoint=lesson_detail,
                methods=["GET", "PUT"],
            ),
            Route(
                "/admin/lessons/{lesson_id:str}/preview",
                endpoint=lesson_preview,
                methods=["GET"],
            ),
            Route(
                "/admin/lessons/{lesson_id:str}/revert",
                endpoint=lesson_revert,
                methods=["POST"],
            ),
            Route(
                "/admin/lessons/{lesson_id:str}/{action:str}",
                endpoint=lesson_action,
                methods=["POST"],
            ),
            Mount("/mcp", app=mcp_server.streamable_http_app()),
        ],
        lifespan=lifespan,
        exception_handlers={
            ValueError: invalid_request,
            KeyError: missing_lesson,
        },
    )
    app.state.mcp_server = mcp_server
    return app


app = create_app()


def main() -> None:
    uvicorn.run(
        "mcp_learning_server.server:app",
        host=os.getenv("MCP_HOST", "0.0.0.0"),
        port=int(os.getenv("MCP_PORT", "8001")),
    )


if __name__ == "__main__":
    main()
