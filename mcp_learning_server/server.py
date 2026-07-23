"""Punto de entrada ASGI del servicio MCP remoto."""

from __future__ import annotations

import contextlib
import os
from pathlib import Path

import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route

from mcp_learning_server.repositories.local_progress import LocalProgressRepository
from mcp_learning_server.repositories.base import ProgressRepository
from mcp_learning_server.repositories.firestore_progress import (
    FirestoreProgressRepository,
)
from mcp_learning_server.services.content_store import InMemoryContentStore
from mcp_learning_server.services.ingestion import load_content
from mcp_learning_server.services.learning import LearningService
from mcp_learning_server.services.retrieval import LexicalRetriever
from mcp_learning_server.tools.learning_tools import register_learning_tools

CONTENT_PATH = Path(__file__).parent / "content" / "learning_content.json"


def build_learning_service(
    progress_path: str | Path | None = None,
) -> LearningService:
    store = InMemoryContentStore()
    store.replace(load_content(CONTENT_PATH))
    repository = build_progress_repository(progress_path)
    return LearningService(repository, store, LexicalRetriever(store))


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
) -> Starlette:
    mcp_server = create_mcp_server(service, allowed_hosts)

    @contextlib.asynccontextmanager
    async def lifespan(_: Starlette):
        async with mcp_server.session_manager.run():
            yield

    async def health(_: Request) -> JSONResponse:
        return JSONResponse({"status": "ok", "service": "learning-mcp"})

    app = Starlette(
        routes=[
            Route("/healthz", endpoint=health),
            Route("/readyz", endpoint=health),
            Mount("/mcp", app=mcp_server.streamable_http_app()),
        ],
        lifespan=lifespan,
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
