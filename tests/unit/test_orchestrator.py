import pytest

from agent_app.agents.diagnostic import DiagnosticAgent
from agent_app.agents.evaluator import EvaluatorAgent
from agent_app.agents.orchestrator import LearningOrchestrator, detect_topic
from agent_app.agents.tutor import TutorAgent
from agent_app.models.chat import ChatRequest, EvaluationRequest, EvaluationStatus
from agent_app.providers.mock import MockModelProvider
from agent_app.services.learning_tools import LocalLearningTools
from agent_app.services.sessions import InMemorySessionRepository
from mcp_learning_server.models import Topic


def make_orchestrator(learning_service) -> LearningOrchestrator:
    tools = LocalLearningTools(learning_service)
    return LearningOrchestrator(
        DiagnosticAgent(tools),
        TutorAgent(tools, MockModelProvider()),
        EvaluatorAgent(tools, MockModelProvider()),
        InMemorySessionRepository(),
    )


def test_routing_detects_longest_specific_topic() -> None:
    assert detect_topic("Explícame modelos de lenguaje y LLM") == Topic.LANGUAGE_MODELS
    assert detect_topic("Quiero aprender MCP") == Topic.MCP


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Enséñame ingeniería de prompts", Topic.PROMPT_ENGINEERING),
        ("¿Cómo funciona la memoria de agentes?", Topic.AGENT_MEMORY),
        ("Quiero entender prompt injection", Topic.AI_SECURITY),
        ("Hablemos de búsqueda híbrida", Topic.ADVANCED_RAG),
        ("Explícame IA multimodal", Topic.MULTIMODAL_AI),
        ("¿Cómo llevar IA a producción?", Topic.AI_PRODUCTION),
    ],
)
def test_routing_detects_extended_curriculum(
    message: str, expected: Topic
) -> None:
    assert detect_topic(message) == expected


def test_routing_rejects_missing_topic() -> None:
    with pytest.raises(ValueError, match="identificar"):
        detect_topic("Quiero aprender algo interesante")


@pytest.mark.asyncio
async def test_orchestrator_delegates_to_three_specialists(learning_service) -> None:
    orchestrator = make_orchestrator(learning_service)
    response = await orchestrator.chat(
        ChatRequest(
            student_id="student-1",
            message="Explícame embeddings, pero primero comprueba cuánto sé",
        ),
        "correlation-test",
    )
    summaries = [event.summary for event in response.trace]
    assert response.topic == Topic.EMBEDDINGS
    assert response.quiz_attempt == 1
    assert any("diagnostic_agent" in summary for summary in summaries)
    assert any("tutor_agent" in summary for summary in summaries)
    assert any("evaluator_agent" in summary for summary in summaries)
    assert response.sources == ["Currículo propio AITeacher"]


@pytest.mark.asyncio
async def test_chat_continues_topic_without_repeating_keyword(learning_service) -> None:
    orchestrator = make_orchestrator(learning_service)
    first = await orchestrator.chat(
        ChatRequest(student_id="student-1", message="Enséñame embeddings")
    )
    assert first.topic == Topic.EMBEDDINGS

    follow_up = await orchestrator.chat(
        ChatRequest(
            student_id="student-1",
            session_id=first.session_id,
            message="Explícame por favor",
        )
    )
    assert follow_up.topic == Topic.EMBEDDINGS
    assert follow_up.quiz_attempt == 1
    assert follow_up.quiz.question == first.quiz.question
    assert any(
        "continúa el tema de la sesión" in event.summary for event in follow_up.trace
    )


@pytest.mark.asyncio
async def test_chat_without_topic_or_known_session_fails(learning_service) -> None:
    orchestrator = make_orchestrator(learning_service)
    with pytest.raises(ValueError, match="identificar"):
        await orchestrator.chat(
            ChatRequest(student_id="student-1", message="cual es mi progreso")
        )


@pytest.mark.asyncio
async def test_evaluator_saves_progress(learning_service) -> None:
    orchestrator = make_orchestrator(learning_service)
    chat = await orchestrator.chat(
        ChatRequest(student_id="student-1", message="Enséñame embeddings")
    )
    result = await orchestrator.evaluate(
        EvaluationRequest(
            student_id="student-1",
            session_id=chat.session_id,
            answer="Es un vector de significado y usamos similitud para compararlo.",
        )
    )
    assert result.score == 100
    assert result.status == EvaluationStatus.MASTERED
    assert result.strengths
    assert result.learning_context.startswith("Para ampliar")
    assert result.next_quiz.question.startswith("Aplicación:")
    assert result.progress.studied_topics == [Topic.EMBEDDINGS]
    topic_progress = result.progress.progress_for(Topic.EMBEDDINGS)
    assert topic_progress is not None
    assert topic_progress.mastered_concepts == [
        "vector",
        "similitud",
        "significado",
    ]
    assert topic_progress.pending_concepts == []
    assert result.trace[0].summary.startswith("Delegación a evaluator_agent")


@pytest.mark.asyncio
async def test_evaluator_adapts_feedback_and_follow_up_to_missing_concepts(
    learning_service,
) -> None:
    orchestrator = make_orchestrator(learning_service)
    chat = await orchestrator.chat(
        ChatRequest(student_id="student-1", message="Enséñame embeddings")
    )
    first = await orchestrator.evaluate(
        EvaluationRequest(
            student_id="student-1",
            session_id=chat.session_id,
            answer="Es una representación numérica.",
        )
    )
    assert first.status == EvaluationStatus.REINFORCE
    assert first.attempt == 1
    assert any("similitud" in item for item in first.improvements)
    assert "Intento 2" in first.next_quiz.question

    follow_up_chat = await orchestrator.chat(
        ChatRequest(
            student_id="student-1",
            session_id=chat.session_id,
            message="Dame otra explicación más sencilla",
        )
    )
    assert follow_up_chat.quiz_attempt == 2
    assert follow_up_chat.quiz.question == first.next_quiz.question

    second = await orchestrator.evaluate(
        EvaluationRequest(
            student_id="student-1",
            session_id=chat.session_id,
            answer="Relaciona el sentido de dos elementos según qué tan parecidos son.",
        )
    )
    assert second.status == EvaluationStatus.MASTERED
    assert second.attempt == 2
    topic_progress = second.progress.progress_for(Topic.EMBEDDINGS)
    assert topic_progress is not None
    assert topic_progress.attempts == 2
    assert topic_progress.pending_concepts == []


@pytest.mark.asyncio
async def test_diagnostic_uses_level_of_requested_topic(learning_service) -> None:
    learning_service.save_learning_result(
        "student-1", "rag", 95, "Dominio avanzado."
    )
    learning_service.save_learning_result(
        "student-1", "ai-security", 20, "Conocimiento inicial."
    )
    diagnostic = DiagnosticAgent(LocalLearningTools(learning_service))

    rag = await diagnostic.diagnose("student-1", Topic.RAG)
    security = await diagnostic.diagnose("student-1", Topic.AI_SECURITY)

    assert rag.level.value == "advanced"
    assert security.level.value == "beginner"


@pytest.mark.asyncio
async def test_evaluator_recognizes_equivalent_expressions(learning_service) -> None:
    orchestrator = make_orchestrator(learning_service)
    chat = await orchestrator.chat(
        ChatRequest(student_id="student-1", message="Enséñame embeddings")
    )
    result = await orchestrator.evaluate(
        EvaluationRequest(
            student_id="student-1",
            session_id=chat.session_id,
            answer=(
                "Es una representación numérica del sentido de un texto; podemos "
                "comparar la cercanía entre dos elementos."
            ),
        )
    )
    assert result.score == 100
