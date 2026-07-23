import pytest

from mcp_learning_server.models import (
    LearningLevel,
    Topic,
    TopicCategory,
    TopicStatus,
)


def test_new_student_starts_with_first_foundation(learning_service) -> None:
    path = learning_service.get_learning_path("student-1")
    assert path.completion_percentage == 0
    assert path.completed_topics == []
    assert path.in_progress_topics == []
    assert path.available_topics == [Topic.ARTIFICIAL_INTELLIGENCE]
    assert path.recommended_topics == [Topic.ARTIFICIAL_INTELLIGENCE]
    assert path.recommendations[0].reason.startswith("Es el punto de partida")
    assert len(path.blocked_topics) == len(Topic) - 1


def test_partial_assessment_prioritizes_topic_in_progress(learning_service) -> None:
    learning_service.save_learning_result(
        "student-1", "artificial-intelligence", 50, "Falta profundizar."
    )

    path = learning_service.get_learning_path("student-1")

    assert path.in_progress_topics == [Topic.ARTIFICIAL_INTELLIGENCE]
    assert path.completed_topics == []
    assert path.recommended_topics == [Topic.ARTIFICIAL_INTELLIGENCE]
    assert "50/100" in path.recommendations[0].reason


def test_mastering_prerequisite_unlocks_next_topics(learning_service) -> None:
    learning_service.save_learning_result(
        "student-1", "artificial-intelligence", 100, "Dominio demostrado."
    )

    path = learning_service.get_learning_path("student-1")

    assert path.completed_topics == [Topic.ARTIFICIAL_INTELLIGENCE]
    assert path.recommended_topics == [
        Topic.MACHINE_LEARNING,
        Topic.NLP,
        Topic.RESPONSIBLE_AI,
    ]
    assert "Inteligencia artificial" in path.recommendations[0].reason
    assert path.completion_percentage == pytest.approx(4.35)


def test_prerequisites_drive_status_without_preventing_study(learning_service) -> None:
    initial = learning_service.get_learning_path("student-1")
    rag = next(item for item in initial.topics if item.topic == Topic.RAG)
    assert rag.status == TopicStatus.BLOCKED
    assert rag.unmet_prerequisites == [Topic.EMBEDDINGS, Topic.CONTEXT_WINDOW]

    learning_service.save_learning_result(
        "student-1", "rag", 100, "Estudio elegido fuera de la ruta."
    )
    updated = learning_service.get_learning_path("student-1")
    rag = next(item for item in updated.topics if item.topic == Topic.RAG)
    assert rag.status == TopicStatus.COMPLETED


def test_save_result_updates_progress(learning_service) -> None:
    response = learning_service.save_learning_result(
        "student-1", "embeddings", 80, "Buena explicación de similitud."
    )
    assert response.saved is True
    assert response.progress.level == LearningLevel.INTERMEDIATE
    assert response.progress.studied_topics == [Topic.EMBEDDINGS]
    assert response.progress.recommendations


def test_score_outside_range_is_rejected(learning_service) -> None:
    with pytest.raises(ValueError):
        learning_service.save_learning_result(
            "student-1", "rag", 101, "Resultado inválido"
        )


def test_topics_and_practical_example(learning_service) -> None:
    topics = learning_service.list_available_topics()
    example = learning_service.find_practical_example("mcp", "python")
    assert len(topics) == len(Topic)
    assert topics[0].topic == Topic.ARTIFICIAL_INTELLIGENCE
    assert topics[0].category == TopicCategory.FOUNDATIONS
    assert topics[0].order == 1
    assert topics[0].prerequisites == []
    assert next(topic for topic in topics if topic.topic == Topic.MCP).category == (
        TopicCategory.AGENTS_TOOLS
    )
    assert next(topic for topic in topics if topic.topic == Topic.MCP).prerequisites == [
        Topic.TOOL_CALLING
    ]
    assert "call_tool" in example.code


def test_spanish_topic_alias_ignores_accents(learning_service) -> None:
    results = learning_service.search_learning_content(
        "aprendizaje automático", LearningLevel.BEGINNER
    )
    assert results[0].topic == Topic.MACHINE_LEARNING


def test_different_topics_keep_independent_levels(learning_service) -> None:
    learning_service.save_learning_result(
        "student-1",
        "rag",
        95,
        "Domina recuperación y generación.",
        mastered_concepts=["recuperación", "generación"],
    )
    response = learning_service.save_learning_result(
        "student-1",
        "ai-security",
        20,
        "Debe reforzar autorización.",
        pending_concepts=["permisos", "validación"],
    )

    rag = response.progress.progress_for(Topic.RAG)
    security = response.progress.progress_for(Topic.AI_SECURITY)
    assert rag is not None and rag.level == LearningLevel.ADVANCED
    assert security is not None and security.level == LearningLevel.BEGINNER
    assert response.progress.level == LearningLevel.BEGINNER
