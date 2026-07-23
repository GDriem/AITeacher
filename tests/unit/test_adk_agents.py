from agent_app.agent import build_adk_root_agent
from agent_app.config import Settings


def test_adk_root_declares_exactly_three_specialists() -> None:
    root = build_adk_root_agent(Settings())
    assert root.name == "learning_orchestrator"
    assert [agent.name for agent in root.sub_agents] == [
        "diagnostic_agent",
        "tutor_agent",
        "evaluator_agent",
    ]
    assert [agent.mode for agent in root.sub_agents] == [
        "single_turn",
        "task",
        "task",
    ]

