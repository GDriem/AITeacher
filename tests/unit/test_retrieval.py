from mcp_learning_server.models import LearningLevel, Topic


def test_retrieval_returns_source_and_requested_level(learning_service) -> None:
    results = learning_service.search_learning_content(
        "embeddings", LearningLevel.INTERMEDIATE
    )
    assert results
    assert results[0].topic == Topic.EMBEDDINGS
    assert results[0].level == LearningLevel.INTERMEDIATE
    assert results[0].source == "Currículo propio AITeacher"
    assert results[0].score > 0


def test_retrieval_falls_back_when_level_has_no_specific_chunk(learning_service) -> None:
    results = learning_service.search_learning_content(
        "tokens", LearningLevel.ADVANCED
    )
    assert results
    assert results[0].topic == Topic.TOKENS
    assert results[0].level == LearningLevel.BEGINNER


def test_unknown_topic_is_rejected(learning_service) -> None:
    import pytest

    with pytest.raises(ValueError, match="Tema desconocido"):
        learning_service.search_learning_content(
            "teletransportación", LearningLevel.BEGINNER
        )


def test_retrieval_supports_new_advanced_curriculum(learning_service) -> None:
    results = learning_service.search_learning_content(
        "seguridad de IA", LearningLevel.ADVANCED
    )
    assert results
    assert results[0].topic == Topic.AI_SECURITY
    assert results[0].level == LearningLevel.ADVANCED
    assert results[0].content_id == "ai-security-advanced-threat-model"
