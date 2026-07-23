"""Casos de uso deterministas expuestos posteriormente como herramientas MCP."""

from __future__ import annotations

from collections import defaultdict

from mcp_learning_server.curriculum import (
    TOPIC_CATEGORIES,
    TOPIC_ORDER,
    TOPIC_POSITIONS,
    TOPIC_PREREQUISITES,
    TOPIC_TITLES,
)
from mcp_learning_server.models import (
    Assessment,
    EvaluationRubric,
    LearningLevel,
    LearningPath,
    LearningPathTopic,
    LearningRecommendation,
    MASTERY_SCORE,
    PracticalExample,
    SaveResultResponse,
    SearchResult,
    StudentProgress,
    Topic,
    TopicStatus,
    TopicSummary,
)
from mcp_learning_server.repositories.base import ProgressRepository
from mcp_learning_server.services.content_store import ContentStore
from mcp_learning_server.services.retrieval import LexicalRetriever, tokenize

TOPIC_ALIASES: dict[str, Topic] = {
    "artificial intelligence": Topic.ARTIFICIAL_INTELLIGENCE,
    "inteligencia artificial": Topic.ARTIFICIAL_INTELLIGENCE,
    "ai": Topic.ARTIFICIAL_INTELLIGENCE,
    "machine learning": Topic.MACHINE_LEARNING,
    "aprendizaje automatico": Topic.MACHINE_LEARNING,
    "ml": Topic.MACHINE_LEARNING,
    "nlp": Topic.NLP,
    "procesamiento de lenguaje natural": Topic.NLP,
    "modelos de lenguaje": Topic.LANGUAGE_MODELS,
    "language models": Topic.LANGUAGE_MODELS,
    "llm": Topic.LLM,
    "tokens": Topic.TOKENS,
    "embeddings": Topic.EMBEDDINGS,
    "ventana de contexto": Topic.CONTEXT_WINDOW,
    "context window": Topic.CONTEXT_WINDOW,
    "rag": Topic.RAG,
    "tool calling": Topic.TOOL_CALLING,
    "llamada de herramientas": Topic.TOOL_CALLING,
    "agentes": Topic.AGENTS,
    "agents": Topic.AGENTS,
    "mcp": Topic.MCP,
    "model context protocol": Topic.MCP,
    "sistemas multiagente": Topic.MULTI_AGENT,
    "multi agent systems": Topic.MULTI_AGENT,
    "prompt engineering": Topic.PROMPT_ENGINEERING,
    "ingenieria de prompts": Topic.PROMPT_ENGINEERING,
    "diseno de prompts": Topic.PROMPT_ENGINEERING,
    "prompts": Topic.PROMPT_ENGINEERING,
    "alucinaciones": Topic.HALLUCINATIONS_EVALUATION,
    "evaluacion de llm": Topic.HALLUCINATIONS_EVALUATION,
    "evaluacion de modelos": Topic.HALLUCINATIONS_EVALUATION,
    "hallucinations": Topic.HALLUCINATIONS_EVALUATION,
    "memoria de agentes": Topic.AGENT_MEMORY,
    "memoria de agente": Topic.AGENT_MEMORY,
    "agent memory": Topic.AGENT_MEMORY,
    "rag avanzado": Topic.ADVANCED_RAG,
    "advanced rag": Topic.ADVANCED_RAG,
    "busqueda hibrida": Topic.ADVANCED_RAG,
    "seguridad de ia": Topic.AI_SECURITY,
    "seguridad en ia": Topic.AI_SECURITY,
    "ai security": Topic.AI_SECURITY,
    "prompt injection": Topic.AI_SECURITY,
    "observabilidad": Topic.OBSERVABILITY_COSTS,
    "costos de ia": Topic.OBSERVABILITY_COSTS,
    "observability": Topic.OBSERVABILITY_COSTS,
    "fine tuning": Topic.FINE_TUNING,
    "ajuste fino": Topic.FINE_TUNING,
    "ia multimodal": Topic.MULTIMODAL_AI,
    "multimodal": Topic.MULTIMODAL_AI,
    "multimodal ai": Topic.MULTIMODAL_AI,
    "ia responsable": Topic.RESPONSIBLE_AI,
    "inteligencia artificial responsable": Topic.RESPONSIBLE_AI,
    "responsible ai": Topic.RESPONSIBLE_AI,
    "ia en produccion": Topic.AI_PRODUCTION,
    "ia a produccion": Topic.AI_PRODUCTION,
    "produccion de ia": Topic.AI_PRODUCTION,
    "ai production": Topic.AI_PRODUCTION,
}


class LearningService:
    def __init__(
        self,
        progress_repository: ProgressRepository,
        content_store: ContentStore,
        retriever: LexicalRetriever,
    ) -> None:
        self.progress_repository = progress_repository
        self.content_store = content_store
        self.retriever = retriever

    def get_student_progress(self, student_id: str) -> StudentProgress:
        return self.progress_repository.get(student_id)

    def search_learning_content(
        self, topic: str, level: LearningLevel, limit: int = 3
    ) -> list[SearchResult]:
        resolved = resolve_topic(topic)
        query = f"{topic} {TOPIC_TITLES[resolved]}"
        return self.retriever.search(
            query, topic=resolved, level=level, limit=limit
        )

    def get_learning_path(self, student_id: str) -> LearningPath:
        progress = self.get_student_progress(student_id)
        best_scores = _best_scores(progress)
        completed = [
            topic
            for topic in TOPIC_ORDER
            if best_scores.get(topic, 0) >= COMPLETION_SCORE
        ]
        completed_set = set(completed)
        in_progress = [
            topic
            for topic in TOPIC_ORDER
            if topic in progress.studied_topics and topic not in completed_set
        ]
        in_progress_set = set(in_progress)
        path_topics: list[LearningPathTopic] = []
        available: list[Topic] = []
        blocked: list[Topic] = []
        for topic in TOPIC_ORDER:
            prerequisites = list(TOPIC_PREREQUISITES[topic])
            unmet = [
                prerequisite
                for prerequisite in prerequisites
                if prerequisite not in completed_set
            ]
            if topic in completed_set:
                status = TopicStatus.COMPLETED
            elif topic in in_progress_set:
                status = TopicStatus.IN_PROGRESS
            elif unmet:
                status = TopicStatus.BLOCKED
                blocked.append(topic)
            else:
                status = TopicStatus.AVAILABLE
                available.append(topic)
            path_topics.append(
                LearningPathTopic(
                    topic=topic,
                    status=status,
                    prerequisites=prerequisites,
                    unmet_prerequisites=unmet,
                )
            )
        candidates = in_progress + available
        recommendations = [
            _recommendation(topic, completed_set, best_scores)
            for topic in candidates[:3]
        ]
        return LearningPath(
            student_id=progress.student_id,
            completed_topics=completed,
            in_progress_topics=in_progress,
            available_topics=available,
            blocked_topics=blocked,
            recommended_topics=[item.topic for item in recommendations],
            recommendations=recommendations,
            topics=path_topics,
            completion_percentage=round(
                len(completed) / len(TOPIC_ORDER) * 100, 2
            ),
        )

    def save_learning_result(
        self,
        student_id: str,
        topic: str,
        score: float,
        feedback: str,
        recommendation: str | None = None,
        mastered_concepts: list[str] | None = None,
        pending_concepts: list[str] | None = None,
        rubric: EvaluationRubric | None = None,
        result_explanation: str | None = None,
    ) -> SaveResultResponse:
        resolved = resolve_topic(topic)
        if not feedback.strip():
            raise ValueError("feedback no puede estar vacío")
        next_topic = recommendation or self._next_topic(resolved)
        assessment = Assessment(
            topic=resolved,
            score=score,
            feedback=feedback,
            recommendation=next_topic,
            mastered_concepts=mastered_concepts or [],
            pending_concepts=pending_concepts or [],
            rubric=rubric,
            result_explanation=result_explanation,
        )
        progress = self.progress_repository.save_assessment(student_id, assessment)
        return SaveResultResponse(saved=True, progress=progress)

    def find_practical_example(
        self, topic: str, programming_language: str
    ) -> PracticalExample:
        resolved = resolve_topic(topic)
        language = programming_language.strip().lower()
        if not language or len(language) > 30:
            raise ValueError(
                "programming_language debe contener entre 1 y 30 caracteres"
            )
        code, explanation = _example_for(resolved, language)
        return PracticalExample(
            topic=resolved,
            programming_language=language,
            title=f"Ejemplo mínimo de {TOPIC_TITLES[resolved]}",
            code=code,
            explanation=explanation,
        )

    def list_available_topics(self) -> list[TopicSummary]:
        levels_by_topic: dict[Topic, set[LearningLevel]] = defaultdict(set)
        for chunk in self.content_store.all():
            levels_by_topic[chunk.topic].add(chunk.level)
        return [
            TopicSummary(
                topic=topic,
                title=TOPIC_TITLES[topic],
                category=TOPIC_CATEGORIES[topic],
                order=TOPIC_POSITIONS[topic],
                prerequisites=list(TOPIC_PREREQUISITES[topic]),
                available_levels=sorted(
                    levels_by_topic[topic], key=list(LearningLevel).index
                ),
            )
            for topic in TOPIC_ORDER
            if topic in levels_by_topic
        ]

    @staticmethod
    def _next_topic(topic: Topic) -> str:
        index = TOPIC_ORDER.index(topic)
        next_topic = TOPIC_ORDER[min(index + 1, len(TOPIC_ORDER) - 1)]
        return f"Continuar con: {TOPIC_TITLES[next_topic]}"


COMPLETION_SCORE = MASTERY_SCORE


def _best_scores(progress: StudentProgress) -> dict[Topic, float]:
    return {item.topic: item.best_score for item in progress.topic_progress}


def _recommendation(
    topic: Topic,
    completed: set[Topic],
    best_scores: dict[Topic, float],
) -> LearningRecommendation:
    if topic in best_scores:
        reason = (
            f"Continúa este tema: tu mejor resultado es {best_scores[topic]:g}/100 "
            f"y se completa al alcanzar {COMPLETION_SCORE}."
        )
    else:
        prerequisites = TOPIC_PREREQUISITES[topic]
        if not prerequisites:
            reason = "Es el punto de partida del currículo y no requiere conocimientos previos."
        else:
            titles = ", ".join(
                TOPIC_TITLES[prerequisite]
                for prerequisite in prerequisites
                if prerequisite in completed
            )
            reason = f"Ya completaste sus prerrequisitos: {titles}."
    return LearningRecommendation(
        topic=topic,
        title=TOPIC_TITLES[topic],
        reason=reason,
    )


def resolve_topic(value: str) -> Topic:
    normalized = " ".join(tokenize(value))
    if normalized in TOPIC_ALIASES:
        return TOPIC_ALIASES[normalized]
    for topic in Topic:
        if normalized == topic.value.replace("-", " "):
            return topic
    available = ", ".join(topic.value for topic in Topic)
    raise ValueError(f"Tema desconocido: {value}. Temas disponibles: {available}")


def _example_for(topic: Topic, language: str) -> tuple[str, str]:
    if topic == Topic.EMBEDDINGS:
        if language == "python":
            return (
                "similarity = sum(a * b for a, b in zip(vector_a, vector_b))",
                "El producto punto compara dos representaciones vectoriales normalizadas.",
            )
        return (
            "similarity = dot(vectorA, vectorB)",
            "El producto punto es una forma compacta de comparar embeddings.",
        )
    if topic == Topic.RAG:
        return (
            "context = retrieve(question)\nanswer = model(question, context=context)",
            "Primero se recupera evidencia y después se genera con ese contexto.",
        )
    if topic == Topic.TOOL_CALLING:
        return (
            "result = tools[call.name](**call.arguments)",
            "La aplicación valida y ejecuta la herramienta elegida por el modelo.",
        )
    if topic == Topic.MCP:
        return (
            "result = await session.call_tool('list_available_topics', {})",
            "El cliente MCP descubre y llama una operación determinista del servidor.",
        )
    return (
        "concept = {'topic': '%s', 'language': '%s'}" % (topic.value, language),
        "Una estructura mínima permite inspeccionar el concepto durante la demo.",
    )
