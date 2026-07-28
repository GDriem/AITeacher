"""Definición única del currículo adaptativo y sus prerrequisitos."""

from __future__ import annotations

from dataclasses import dataclass

from mcp_learning_server.models import LearningSubject, Topic, TopicCategory


@dataclass(frozen=True)
class CurriculumTopic:
    topic: Topic
    title: str
    category: TopicCategory
    prerequisites: tuple[Topic, ...] = ()
    subject: LearningSubject = LearningSubject.ARTIFICIAL_INTELLIGENCE


CURRICULUM: tuple[CurriculumTopic, ...] = (
    CurriculumTopic(
        Topic.ARTIFICIAL_INTELLIGENCE,
        "Inteligencia artificial",
        TopicCategory.FOUNDATIONS,
    ),
    CurriculumTopic(
        Topic.MACHINE_LEARNING,
        "Machine Learning",
        TopicCategory.FOUNDATIONS,
        (Topic.ARTIFICIAL_INTELLIGENCE,),
    ),
    CurriculumTopic(
        Topic.NLP,
        "Procesamiento de lenguaje natural",
        TopicCategory.FOUNDATIONS,
        (Topic.ARTIFICIAL_INTELLIGENCE,),
    ),
    CurriculumTopic(
        Topic.LANGUAGE_MODELS,
        "Modelos de lenguaje",
        TopicCategory.FOUNDATIONS,
        (Topic.NLP,),
    ),
    CurriculumTopic(
        Topic.LLM,
        "Modelos grandes de lenguaje (LLM)",
        TopicCategory.FOUNDATIONS,
        (Topic.LANGUAGE_MODELS,),
    ),
    CurriculumTopic(
        Topic.TOKENS,
        "Tokens",
        TopicCategory.FOUNDATIONS,
        (Topic.LLM,),
    ),
    CurriculumTopic(
        Topic.EMBEDDINGS,
        "Embeddings",
        TopicCategory.MODELS_DATA,
        (Topic.TOKENS,),
    ),
    CurriculumTopic(
        Topic.CONTEXT_WINDOW,
        "Ventana de contexto",
        TopicCategory.MODELS_DATA,
        (Topic.TOKENS,),
    ),
    CurriculumTopic(
        Topic.RAG,
        "Retrieval-Augmented Generation (RAG)",
        TopicCategory.MODELS_DATA,
        (Topic.EMBEDDINGS, Topic.CONTEXT_WINDOW),
    ),
    CurriculumTopic(
        Topic.PROMPT_ENGINEERING,
        "Ingeniería de prompts",
        TopicCategory.AGENTS_TOOLS,
        (Topic.LLM,),
    ),
    CurriculumTopic(
        Topic.TOOL_CALLING,
        "Tool calling",
        TopicCategory.AGENTS_TOOLS,
        (Topic.LLM,),
    ),
    CurriculumTopic(
        Topic.AGENTS,
        "Agentes",
        TopicCategory.AGENTS_TOOLS,
        (Topic.TOOL_CALLING,),
    ),
    CurriculumTopic(
        Topic.MCP,
        "Model Context Protocol",
        TopicCategory.AGENTS_TOOLS,
        (Topic.TOOL_CALLING,),
    ),
    CurriculumTopic(
        Topic.AGENT_MEMORY,
        "Memoria y estado de agentes",
        TopicCategory.AGENTS_TOOLS,
        (Topic.AGENTS, Topic.CONTEXT_WINDOW),
    ),
    CurriculumTopic(
        Topic.MULTI_AGENT,
        "Sistemas multiagente",
        TopicCategory.AGENTS_TOOLS,
        (Topic.AGENTS, Topic.MCP),
    ),
    CurriculumTopic(
        Topic.ADVANCED_RAG,
        "RAG avanzado",
        TopicCategory.MODELS_DATA,
        (Topic.RAG,),
    ),
    CurriculumTopic(
        Topic.HALLUCINATIONS_EVALUATION,
        "Alucinaciones y evaluación",
        TopicCategory.QUALITY_SECURITY,
        (Topic.RAG, Topic.PROMPT_ENGINEERING),
    ),
    CurriculumTopic(
        Topic.AI_SECURITY,
        "Seguridad para aplicaciones con IA",
        TopicCategory.QUALITY_SECURITY,
        (Topic.AGENTS, Topic.PROMPT_ENGINEERING),
    ),
    CurriculumTopic(
        Topic.OBSERVABILITY_COSTS,
        "Observabilidad y costos",
        TopicCategory.PRODUCTION,
        (Topic.AGENTS,),
    ),
    CurriculumTopic(
        Topic.FINE_TUNING,
        "Fine-tuning y adaptación",
        TopicCategory.MODELS_DATA,
        (Topic.LLM,),
    ),
    CurriculumTopic(
        Topic.MULTIMODAL_AI,
        "IA multimodal",
        TopicCategory.MODELS_DATA,
        (Topic.EMBEDDINGS,),
    ),
    CurriculumTopic(
        Topic.RESPONSIBLE_AI,
        "IA responsable",
        TopicCategory.QUALITY_SECURITY,
        (Topic.ARTIFICIAL_INTELLIGENCE,),
    ),
    CurriculumTopic(
        Topic.AI_PRODUCTION,
        "IA en producción",
        TopicCategory.PRODUCTION,
        (
            Topic.AI_SECURITY,
            Topic.OBSERVABILITY_COSTS,
            Topic.RESPONSIBLE_AI,
        ),
    ),
    CurriculumTopic(
        Topic.ENGLISH_GREETINGS,
        "Saludos y presentaciones en inglés",
        TopicCategory.COMMUNICATION,
        subject=LearningSubject.ENGLISH,
    ),
    CurriculumTopic(
        Topic.ENGLISH_VOCABULARY,
        "Vocabulario cotidiano en inglés",
        TopicCategory.VOCABULARY,
        (Topic.ENGLISH_GREETINGS,),
        subject=LearningSubject.ENGLISH,
    ),
    CurriculumTopic(
        Topic.ENGLISH_GRAMMAR,
        "Gramática inglesa en contexto",
        TopicCategory.GRAMMAR,
        (Topic.ENGLISH_GREETINGS,),
        subject=LearningSubject.ENGLISH,
    ),
    CurriculumTopic(
        Topic.ENGLISH_CONVERSATION,
        "Conversación en inglés",
        TopicCategory.COMMUNICATION,
        (Topic.ENGLISH_VOCABULARY, Topic.ENGLISH_GRAMMAR),
        subject=LearningSubject.ENGLISH,
    ),
)

TOPIC_ORDER = [item.topic for item in CURRICULUM]
TOPIC_TITLES = {item.topic: item.title for item in CURRICULUM}
TOPIC_SUBJECTS = {item.topic: item.subject for item in CURRICULUM}
TOPIC_CATEGORIES = {item.topic: item.category for item in CURRICULUM}
TOPIC_PREREQUISITES = {
    item.topic: item.prerequisites for item in CURRICULUM
}
TOPIC_POSITIONS = {
    item.topic: position for position, item in enumerate(CURRICULUM, start=1)
}


def validate_curriculum() -> None:
    """Falla al importar si faltan temas o un prerrequisito aparece después."""

    ordered = set(TOPIC_ORDER)
    if len(TOPIC_ORDER) != len(ordered) or ordered != set(Topic):
        raise RuntimeError("El currículo debe incluir cada tema exactamente una vez")
    positions = {topic: index for index, topic in enumerate(TOPIC_ORDER)}
    for topic, prerequisites in TOPIC_PREREQUISITES.items():
        if topic in prerequisites:
            raise RuntimeError(f"{topic.value} no puede ser su propio prerrequisito")
        for prerequisite in prerequisites:
            if TOPIC_SUBJECTS[prerequisite] != TOPIC_SUBJECTS[topic]:
                raise RuntimeError(
                    f"{topic.value} no puede depender de otra materia"
                )
            if positions[prerequisite] >= positions[topic]:
                raise RuntimeError(
                    f"El prerrequisito {prerequisite.value} debe aparecer antes "
                    f"que {topic.value}"
                )


validate_curriculum()
