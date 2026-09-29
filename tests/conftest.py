from pathlib import Path

import pytest

from agent_app.config import Settings
from mcp_learning_server.repositories.local_progress import LocalProgressRepository
from mcp_learning_server.server import CONTENT_PATH
from mcp_learning_server.services.content_store import InMemoryContentStore
from mcp_learning_server.services.ingestion import load_content
from mcp_learning_server.services.learning import LearningService
from mcp_learning_server.services.retrieval import LexicalRetriever


@pytest.fixture
def learning_service(tmp_path: Path) -> LearningService:
    store = InMemoryContentStore()
    store.replace(load_content(CONTENT_PATH))
    return LearningService(
        LocalProgressRepository(tmp_path / "progress.json"),
        store,
        LexicalRetriever(store),
    )


@pytest.fixture(autouse=True, scope="session")
def _ignore_local_dotenv() -> None:
    """Aísla las pruebas del `.env` de desarrollo.

    `Settings` declara `env_file=".env"`, así que al ejecutar pytest desde la
    raíz del repositorio la configuración local (por ejemplo credenciales de
    Vertex AI) se filtraba y alteraba el resultado de las pruebas. Las pruebas
    deben depender sólo de los valores que declaran explícitamente.
    """

    Settings.model_config["env_file"] = None
