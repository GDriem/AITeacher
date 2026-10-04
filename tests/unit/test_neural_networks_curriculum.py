import pytest

from agent_app.agents.evaluator import GENERIC_QUIZ_PREFIX, QUIZZES
from mcp_learning_server.curriculum import CURRICULUM
from mcp_learning_server.models import LearningLevel, Topic, TopicCategory


def test_neural_networks_follow_machine_learning_in_foundations():
    entry = next(item for item in CURRICULUM if item.topic == Topic.NEURAL_NETWORKS)
    assert entry.title == "Redes neuronales"
    assert entry.category == TopicCategory.FOUNDATIONS
    assert entry.prerequisites == (Topic.MACHINE_LEARNING,)


def test_curriculum_graph_remains_acyclic():
    prerequisites = {item.topic: item.prerequisites for item in CURRICULUM}
    visiting: set[Topic] = set()
    visited: set[Topic] = set()

    def visit(topic: Topic) -> None:
        assert topic not in visiting, f"Ciclo de prerrequisitos en {topic.value}"
        if topic in visited:
            return
        visiting.add(topic)
        for prerequisite in prerequisites[topic]:
            visit(prerequisite)
        visiting.remove(topic)
        visited.add(topic)

    for topic in prerequisites:
        visit(topic)
    assert visited == set(Topic)


@pytest.mark.parametrize("level", list(LearningLevel))
def test_neural_networks_have_content_for_every_level(learning_service, level):
    results = learning_service.search_learning_content(Topic.NEURAL_NETWORKS.value, level)
    assert results and all(
        result.topic == Topic.NEURAL_NETWORKS and result.level == level for result in results
    )


def test_backpropagation_query_retrieves_neural_network_lesson(learning_service):
    results = learning_service.search_learning_content(
        "retropropagación", LearningLevel.INTERMEDIATE
    )
    assert results[0].topic == Topic.NEURAL_NETWORKS
    assert results[0].content_id == "nn-intermediate-training"


def test_neural_networks_quiz_is_specific():
    quiz = QUIZZES[Topic.NEURAL_NETWORKS]
    assert not quiz.question.startswith(GENERIC_QUIZ_PREFIX)
    assert {"pesos", "activación", "retropropagación"} <= set(quiz.expected_keywords)
