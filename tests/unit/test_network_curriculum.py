import pytest

from agent_app.agents.evaluator import QUIZZES
from mcp_learning_server.models import LearningLevel, LearningSubject, Topic, TopicCategory


@pytest.mark.parametrize('level', list(LearningLevel))
def test_routing_topics_have_retrievable_content_and_quizzes(learning_service, level):
    topics = [
        item for item in learning_service.list_available_topics()
        if item.subject == LearningSubject.NETWORKS
    ]
    assert len(topics) == 7
    for item in topics:
        assert item.category == TopicCategory.ROUTING
        assert item.available_levels == list(LearningLevel)
        results = learning_service.search_learning_content(item.topic.value, level)
        assert results and all(result.level == level for result in results)
        assert QUIZZES[item.topic].expected_keywords


def test_network_prerequisites_unlock_independently(learning_service):
    path = learning_service.get_learning_path('network-student')
    assert Topic.ROUTING_FUNDAMENTALS in path.available_topics
    assert Topic.IP_SUBNETTING in path.blocked_topics
    learning_service.save_learning_result(
        'network-student', 'fundamentos de enrutamiento', 100,
        'El router consulta el destino en su tabla de rutas para elegir el siguiente salto.',
    )
    path = learning_service.get_learning_path('network-student')
    assert Topic.IP_SUBNETTING in path.available_topics
    assert Topic.STATIC_ROUTING in path.blocked_topics
    assert Topic.ARTIFICIAL_INTELLIGENCE in path.available_topics
    assert Topic.ENGLISH_GREETINGS in path.available_topics


@pytest.mark.parametrize('alias, expected', [
    ('Redes', Topic.ROUTING_FUNDAMENTALS),
    ('subredes', Topic.IP_SUBNETTING),
    ('enrutamiento estático', Topic.STATIC_ROUTING),
    ('enrutamientos flotantes', Topic.FLOATING_STATIC_ROUTING),
    ('rutas estáticas flotantes', Topic.FLOATING_STATIC_ROUTING),
    ('OSPF', Topic.OSPF),
    ('BGP', Topic.BGP),
    ('diagnóstico de rutas', Topic.ROUTING_TROUBLESHOOTING),
])
def test_routing_aliases(learning_service, alias, expected):
    results = learning_service.search_learning_content(alias, LearningLevel.BEGINNER)
    assert results[0].topic == expected


def test_floating_route_topic_unlocks_after_static_routing(learning_service):
    path = learning_service.get_learning_path('floating-route-student')
    topic = next(item for item in path.topics if item.topic == Topic.FLOATING_STATIC_ROUTING)
    assert topic.unmet_prerequisites == [Topic.STATIC_ROUTING]
    learning_service.save_learning_result(
        'floating-route-student', 'enrutamiento estático', 100,
        'La ruta define el destino y siguiente salto; la predeterminada cubre destinos sin otra coincidencia.',
    )
    path = learning_service.get_learning_path('floating-route-student')
    assert Topic.FLOATING_STATIC_ROUTING in path.available_topics
    assert Topic.FLOATING_STATIC_ROUTING not in path.blocked_topics
