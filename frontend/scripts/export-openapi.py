"""Exporta el contrato OpenAPI de FastAPI de forma determinista."""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = FRONTEND_ROOT / "src" / "api" / "generated" / "openapi.json"

sys.path.insert(0, str(REPOSITORY_ROOT))

from agent_app.api.main import create_app  # noqa: E402
from agent_app.config import ModelProviderName, Settings  # noqa: E402
from agent_app.providers.mock import MockModelProvider  # noqa: E402
from agent_app.services.learning_tools import LocalLearningTools  # noqa: E402
from agent_app.services.sessions import LocalSessionRepository  # noqa: E402
from mcp_learning_server.server import build_learning_service  # noqa: E402


def render_schema() -> str:
    with tempfile.TemporaryDirectory(prefix="aiteacher-openapi-") as directory:
        temporary = Path(directory)
        settings = Settings(
            model_provider=ModelProviderName.MOCK,
            mcp_use_local_adapter=True,
            google_client_id=None,
            app_session_secret=None,
            app_sessions_backend="local",
            app_sessions_path=str(temporary / "sessions.json"),
        )
        app = create_app(
            settings,
            tools=LocalLearningTools(
                build_learning_service(
                    progress_path=temporary / "progress.json",
                    authoring_path=temporary / "authoring.json",
                )
            ),
            provider=MockModelProvider(),
            sessions=LocalSessionRepository(temporary / "sessions.json"),
        )
        return json.dumps(
            app.openapi(),
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="falla si el esquema versionado difiere del contrato actual",
    )
    args = parser.parse_args()
    rendered = render_schema()

    if args.check:
        current = SCHEMA_PATH.read_text(encoding="utf-8") if SCHEMA_PATH.exists() else ""
        if current != rendered:
            print("El contrato OpenAPI cambió; ejecuta `pnpm api:generate`.")
            return 1
        return 0

    SCHEMA_PATH.parent.mkdir(parents=True, exist_ok=True)
    SCHEMA_PATH.write_text(rendered, encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
