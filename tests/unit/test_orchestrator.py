import pytest

from agent_app.agents.diagnostic import DiagnosticAgent
from agent_app.agents.evaluator import EvaluatorAgent
from agent_app.agents.orchestrator import LearningOrchestrator, detect_topic
from agent_app.agents.tutor import TutorAgent
from agent_app.models.chat import ChatRequest, EvaluationRequest, EvaluationStatus
from agent_app.models.activities import (
    PracticeDifficulty,
    PracticeEvaluationRequest,
    PracticeStartRequest,
)
from agent_app.providers.mock import MockModelProvider
from agent_app.services.learning_tools import LocalLearningTools
from agent_app.services.sessions import InMemorySessionRepository
from mcp_learning_server.curriculum import TOPIC_TITLES
from mcp_learning_server.models import LearningLevel, Topic


def make_orchestrator(learning_service) -> LearningOrchestrator:
    tools = LocalLearningTools(learning_service)
    return LearningOrchestrator(
        DiagnosticAgent(tools),
        TutorAgent(tools, MockModelProvider()),
        EvaluatorAgent(tools, MockModelProvider()),
        InMemorySessionRepository(),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("level", list(LearningLevel))
async def test_selected_level_reaches_retrieval_and_follow_up(
    learning_service, monkeypatch, level
) -> None:
    orchestrator = make_orchestrator(learning_service)
    requested_levels = []
    original_search = orchestrator.tutor.tools.search_learning_content

    async def track_search(topic, requested_level):
        requested_levels.append(requested_level)
        return await original_search(topic, requested_level)

    monkeypatch.setattr(orchestrator.tutor.tools, "search_learning_content", track_search)
    first = await orchestrator.chat(ChatRequest(
        student_id="level-student", message="Enséñame embeddings", level=level,
    ))
    follow_up = await orchestrator.chat(ChatRequest(
        student_id="level-student", session_id=first.session_id,
        message="Explícame con otro ejemplo",
    ))
    assert first.level == follow_up.level == level
    assert requested_levels == [level, level]
    assert orchestrator.sessions.get(first.session_id, "level-student").preferred_level == level
    assert learning_service.get_student_progress("level-student").topic_progress == []

    changed_topic = await orchestrator.chat(ChatRequest(
        student_id="level-student", session_id=first.session_id,
        message="Enséñame ingeniería de prompts",
    ))
    assert changed_topic.level == LearningLevel.BEGINNER
    assert orchestrator.sessions.get(first.session_id, "level-student").preferred_level is None


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
        ("Quiero aprender inglés", Topic.ENGLISH_GREETINGS),
        ("Practiquemos vocabulario en inglés", Topic.ENGLISH_VOCABULARY),
        ("Enséñame gramática inglesa", Topic.ENGLISH_GRAMMAR),
        ("Quiero conversación en inglés", Topic.ENGLISH_CONVERSATION),
    ],
)
def test_routing_detects_extended_curriculum(
    message: str, expected: Topic
) -> None:
    assert detect_topic(message) == expected


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Quiero aprender subredes", Topic.IP_SUBNETTING),
        ("Cómo calculo subredes IPv4", Topic.IP_SUBNETTING),
        ("Explícame redes", Topic.ROUTING_FUNDAMENTALS),
        ("¿Qué es un router?", Topic.ROUTING_FUNDAMENTALS),
        ("Explícame OSPF", Topic.OSPF),
        ("Quiero aprender BGP", Topic.BGP),
        ("Explícame las rutas estáticas flotantes", Topic.FLOATING_STATIC_ROUTING),
        ("Explícame enrutamiento estático", Topic.STATIC_ROUTING),
        ("Explícame las redes neuronales", Topic.MACHINE_LEARNING),
    ],
)
def test_routing_detects_network_topics_by_whole_word(
    message: str, expected: Topic
) -> None:
    # Las frases se comparan por palabra completa: "subredes" no debe activar "redes".
    assert detect_topic(message) == expected


def test_routing_rejects_missing_topic() -> None:
    with pytest.raises(ValueError, match="selecciona un tema"):
        detect_topic("Quiero aprender algo interesante")


@pytest.mark.parametrize("topic", list(Topic))
def test_routing_detects_topic_card_click(topic: Topic) -> None:
    # La UI arma "Quiero aprender sobre {título}" al hacer clic en una tarjeta
    # de la sección Estudiar; el título completo del currículo debe resolver
    # siempre al mismo tema, aunque no exista un alias corto que lo cubra.
    title = TOPIC_TITLES[topic]
    assert detect_topic(f"Quiero aprender sobre {title}") == topic


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
    with pytest.raises(ValueError, match="selecciona un tema"):
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
async def test_english_lesson_uses_language_quiz_and_evaluation(
    learning_service,
) -> None:
    orchestrator = make_orchestrator(learning_service)
    chat = await orchestrator.chat(
        ChatRequest(student_id="english-student", message="Quiero aprender inglés")
    )

    assert chat.topic == Topic.ENGLISH_GREETINGS
    assert "tres líneas en inglés" in chat.quiz.question
    assert chat.sources == ["Currículo de inglés AITeacher"]

    result = await orchestrator.evaluate(
        EvaluationRequest(
            student_id="english-student",
            session_id=chat.session_id,
            answer="Hello! My name is Ana. Nice to meet you. Goodbye!",
        )
    )

    assert result.status == EvaluationStatus.MASTERED
    assert result.score == 100
    assert result.next_quiz.question.startswith("Aplicación:")
    assert result.progress.studied_topics == [Topic.ENGLISH_GREETINGS]
    assert result.progress.level.value == "beginner"
    assert "Para iniciar una conversación" in result.learning_context
    assert "intención comunicativa" in result.feedback


@pytest.mark.asyncio
async def test_english_grammar_matches_whole_words_not_substrings(
    learning_service,
) -> None:
    orchestrator = make_orchestrator(learning_service)
    chat = await orchestrator.chat(
        ChatRequest(
            student_id="grammar-student",
            message="Enséñame gramática inglesa",
        )
    )
    result = await orchestrator.evaluate(
        EvaluationRequest(
            student_id="grammar-student",
            session_id=chat.session_id,
            answer="This sentence has no completed answers.",
        )
    )

    assert result.status == EvaluationStatus.REINFORCE
    assert any("«is»" in improvement for improvement in result.improvements)


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


@pytest.mark.asyncio
async def test_practice_adapts_without_replacing_main_quiz(learning_service) -> None:
    orchestrator = make_orchestrator(learning_service)
    chat = await orchestrator.chat(
        ChatRequest(student_id="practice-student", message="Enséñame embeddings")
    )
    evaluated = await orchestrator.evaluate(
        EvaluationRequest(
            student_id="practice-student",
            session_id=chat.session_id,
            answer="Es una representación numérica.",
        )
    )

    started = await orchestrator.start_practice(
        PracticeStartRequest(
            student_id="practice-student",
            session_id=chat.session_id,
            focus_concept="similitud",
        )
    )

    assert started.exercise.focus_concepts == ["similitud"]
    assert started.exercise.based_on_attempts == 1
    assert started.exercise.difficulty == PracticeDifficulty.FOUNDATION
    assert started.main_quiz.question == evaluated.next_quiz.question

    practice_result = await orchestrator.evaluate_practice(
        PracticeEvaluationRequest(
            student_id="practice-student",
            session_id=chat.session_id,
            answer=(
                "La similitud permite comparar qué tan cercanos son dos vectores "
                "para encontrar elementos relacionados."
            ),
        )
    )

    assert practice_result.main_quiz.question == evaluated.next_quiz.question
    assert practice_result.next_exercise.round == 2
    assert practice_result.next_exercise.difficulty == PracticeDifficulty.APPLICATION
    assert practice_result.progress.progress_for(Topic.EMBEDDINGS).attempts == 1
    recovered = orchestrator.sessions.get(chat.session_id, "practice-student")
    assert recovered.pending_evaluation.quiz.question == evaluated.next_quiz.question
    assert recovered.pending_practice is not None
    assert recovered.pending_practice.exercise.id == practice_result.next_exercise.id


@pytest.mark.asyncio
async def test_practice_rejects_concept_outside_pending_work(learning_service) -> None:
    orchestrator = make_orchestrator(learning_service)
    chat = await orchestrator.chat(
        ChatRequest(student_id="practice-student", message="Enséñame embeddings")
    )

    with pytest.raises(ValueError, match="no está pendiente"):
        await orchestrator.start_practice(
            PracticeStartRequest(
                student_id="practice-student",
                session_id=chat.session_id,
                focus_concept="recuperación",
            )
        )


@pytest.mark.asyncio
async def test_tutor_receives_recent_history_and_evaluator_keeps_topic_answers(learning_service):
    class RecordingProvider(MockModelProvider):
        def __init__(self):
            self.requests = []

        async def generate(self, request):
            self.requests.append(request)
            return await super().generate(request)

    provider = RecordingProvider()
    orchestrator = make_orchestrator(learning_service)
    orchestrator.tutor.provider = provider
    chat = await orchestrator.chat(ChatRequest(student_id="context", message="Enséñame embeddings"))
    answer = "Un embedding es un vector que representa significado."
    await orchestrator.evaluate(EvaluationRequest(student_id="context", session_id=chat.session_id, answer=answer))
    await orchestrator.chat(ChatRequest(student_id="context", session_id=chat.session_id, message="Aclara lo que me falta"))
    assert answer in provider.requests[-1].prompt
    assert chat.answer in provider.requests[-1].prompt
    session = orchestrator.sessions.get(chat.session_id, "context")
    assert session.pending_evaluation.student_answers == [answer]
    await orchestrator.chat(ChatRequest(student_id="context", session_id=chat.session_id, message="Enséñame RAG"))
    assert orchestrator.sessions.get(chat.session_id, "context").pending_evaluation.student_answers == []


@pytest.mark.asyncio
async def test_tutor_and_evaluator_receive_only_recent_context(learning_service):
    from agent_app.agents.orchestrator import (
        EVALUATOR_ANSWERS_LIMIT,
        TUTOR_HISTORY_LIMIT,
    )
    from agent_app.services.sessions import ConversationMessage, MessageRole

    orchestrator = make_orchestrator(learning_service)
    chat = await orchestrator.chat(ChatRequest(student_id="recent", message="Enséñame embeddings"))
    session = orchestrator.sessions.get(chat.session_id, "recent")
    session.messages = [
        ConversationMessage(role=MessageRole.USER, label="Tú", content=f"mensaje {index}")
        for index in range(TUTOR_HISTORY_LIMIT + 5)
    ]
    orchestrator.sessions.save(session)

    received = {}
    original_teach = orchestrator.tutor.teach
    original_evaluate = orchestrator.evaluator.evaluate

    async def record_teach(diagnostic, message, history):
        received["history"] = history
        return await original_teach(diagnostic, message, history)

    async def record_evaluate(*args, previous_answers=None, **kwargs):
        received["answers"] = previous_answers
        return await original_evaluate(*args, previous_answers=previous_answers, **kwargs)

    orchestrator.tutor.teach = record_teach
    orchestrator.evaluator.evaluate = record_evaluate
    await orchestrator.chat(ChatRequest(student_id="recent", session_id=chat.session_id, message="Continúa"))
    contents = [message["content"] for message in received["history"]]
    assert len(contents) == TUTOR_HISTORY_LIMIT
    assert contents[0] == "mensaje 5"
    assert contents[-1] == f"mensaje {TUTOR_HISTORY_LIMIT + 4}"

    session = orchestrator.sessions.get(chat.session_id, "recent")
    session.pending_evaluation.student_answers = [
        f"respuesta {index}" for index in range(EVALUATOR_ANSWERS_LIMIT + 3)
    ]
    orchestrator.sessions.save(session)
    await orchestrator.evaluate(
        EvaluationRequest(student_id="recent", session_id=chat.session_id, answer="Un vector de significado.")
    )
    assert received["answers"] == [
        f"respuesta {index}" for index in range(3, EVALUATOR_ANSWERS_LIMIT + 3)
    ]


@pytest.mark.asyncio
async def test_restores_legacy_answers_and_replaces_identifier_based_ai_quiz(learning_service):
    from agent_app.models.chat import Quiz
    from agent_app.services.sessions import PendingEvaluation

    orchestrator = make_orchestrator(learning_service)
    chat = await orchestrator.chat(ChatRequest(student_id="legacy", message="Enséñame inteligencia artificial"))
    answer = "Es una tecnología que usa patrones para tomar decisiones."
    await orchestrator.evaluate(EvaluationRequest(student_id="legacy", session_id=chat.session_id, answer=answer))
    session = orchestrator.sessions.get(chat.session_id, "legacy")
    session.pending_evaluation = PendingEvaluation(
        student_id="legacy", topic=Topic.ARTIFICIAL_INTELLIGENCE,
        quiz=Quiz(question="Define artificial", expected_keywords=["artificial", "intelligence"]), attempt=2,
    )
    orchestrator._restore_evaluation_context(session)
    assert session.pending_evaluation.student_answers == [answer]
    assert "artificial" not in session.pending_evaluation.quiz.expected_keywords


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("topic", "message"),
    [
        (Topic.MACHINE_LEARNING, "Enséñame machine learning"),
        (Topic.TOOL_CALLING, "Enséñame tool calling"),
    ],
)
async def test_replaces_generic_identifier_quiz_for_any_topic(learning_service, topic, message):
    from agent_app.agents.evaluator import QUIZZES
    from agent_app.models.chat import Quiz
    from agent_app.services.sessions import PendingEvaluation

    orchestrator = make_orchestrator(learning_service)
    chat = await orchestrator.chat(ChatRequest(student_id="generic", message=message))
    session = orchestrator.sessions.get(chat.session_id, "generic")
    identifier_words = topic.value.split("-")
    session.pending_evaluation = PendingEvaluation(
        student_id="generic", topic=topic,
        quiz=Quiz(
            question=f"Explica con tus palabras la idea principal de {topic.value}.",
            expected_keywords=identifier_words,
        ),
        attempt=1,
    )
    orchestrator._restore_evaluation_context(session)
    assert session.pending_evaluation.quiz == QUIZZES[topic]
    assert not set(identifier_words) & set(session.pending_evaluation.quiz.expected_keywords)
