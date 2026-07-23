import pytest
from pydantic import ValidationError

from mcp_learning_server.models import LearningContent
from mcp_learning_server.repositories.content_authoring import (
    LocalContentAuthoringRepository,
)
from mcp_learning_server.services.authoring import ContentAuthoringService
from mcp_learning_server.services.content_store import InMemoryContentStore
from mcp_learning_server.services.retrieval import LexicalRetriever


def lesson(
    lesson_id: str = "rag-authoring",
    *,
    text: str = (
        "RAG recupera evidencia relevante antes de generar una respuesta "
        "para mantener el resultado conectado con fuentes verificables."
    ),
) -> LearningContent:
    return LearningContent(
        id=lesson_id,
        topic="rag",
        title="RAG con evidencia verificable",
        level="beginner",
        text=text,
        source="Currículo propio AITeacher",
        keywords=["recuperación", "evidencia"],
    )


def build_service(tmp_path, bootstrap=()):
    store = InMemoryContentStore()
    repository = LocalContentAuthoringRepository(
        tmp_path / "content-authoring.json",
        bootstrap,
    )
    return ContentAuthoringService(repository, store), store


def test_draft_only_reaches_retriever_after_publish(tmp_path) -> None:
    service, store = build_service(tmp_path)
    retriever = LexicalRetriever(store)

    created = service.create_lesson(lesson(), "editora")
    before_publish = retriever.search("evidencia", topic="rag")
    published = service.publish_lesson(created.id, "editora")
    after_publish = retriever.search("evidencia", topic="rag")

    assert created.published is False
    assert before_publish == []
    assert published.published is True
    assert after_publish[0].content_id == created.id


def test_edit_publish_unpublish_and_revert_are_versioned(tmp_path) -> None:
    original = lesson()
    service, store = build_service(tmp_path, [original])
    changed = lesson(
        text=(
            "RAG combina recuperación, ranking y generación; cada respuesta "
            "debe citar evidencia y registrar métricas de calidad observables."
        )
    )

    edited = service.update_lesson(original.id, changed, "ana")
    still_published = next(item for item in store.all() if item.id == original.id)
    republished = service.publish_lesson(original.id, "ana")
    newly_published = next(item for item in store.all() if item.id == original.id)
    unpublished = service.unpublish_lesson(original.id, "ana")
    unpublished_corpus = store.all()
    reverted = service.revert_lesson(original.id, 2, "revisor")

    assert edited.version == 2
    assert still_published.text == original.text
    assert republished.version == 3
    assert newly_published.text == changed.text
    assert unpublished.published is False
    assert not any(item.id == original.id for item in unpublished_corpus)
    assert reverted.version == 5
    assert reverted.revisions[-1].action == "reverted"
    assert reverted.revisions[-1].reverted_from == 2
    assert reverted.published is True
    assert next(item for item in store.all() if item.id == original.id).text == original.text


def test_invalid_lesson_cannot_be_created_or_published(tmp_path) -> None:
    service, _ = build_service(tmp_path)

    with pytest.raises(ValidationError):
        lesson(lesson_id="ID inválido")
    with pytest.raises(ValidationError, match="palabras clave"):
        LearningContent(
            id="invalid-keywords",
            topic="rag",
            title="Contenido inválido",
            level="beginner",
            text="Texto suficientemente largo para superar el mínimo requerido.",
            source="AITeacher",
            keywords=["RAG", "rag"],
        )

    assert service.list_lessons() == []


def test_repository_recovers_history_after_restart(tmp_path) -> None:
    path = tmp_path / "content-authoring.json"
    first_store = InMemoryContentStore()
    first = ContentAuthoringService(
        LocalContentAuthoringRepository(path, []),
        first_store,
    )
    first.create_lesson(lesson(), "ana")
    first.publish_lesson("rag-authoring", "ana")

    second_store = InMemoryContentStore()
    restarted = ContentAuthoringService(
        LocalContentAuthoringRepository(path, []),
        second_store,
    )

    recovered = restarted.get_lesson("rag-authoring")
    assert recovered.version == 2
    assert [revision.action for revision in recovered.revisions] == [
        "created",
        "published",
    ]
    assert second_store.all()[0].id == "rag-authoring"
