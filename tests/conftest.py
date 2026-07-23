from pathlib import Path

import pytest

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

