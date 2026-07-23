"""Modelos de dominio y contratos estructurados del servidor MCP."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def utc_now() -> datetime:
    return datetime.now(UTC)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LearningLevel(StrEnum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class TopicCategory(StrEnum):
    FOUNDATIONS = "fundamentos"
    MODELS_DATA = "modelos-y-datos"
    AGENTS_TOOLS = "agentes-y-herramientas"
    QUALITY_SECURITY = "calidad-y-seguridad"
    PRODUCTION = "produccion"


class TopicStatus(StrEnum):
    BLOCKED = "blocked"
    AVAILABLE = "available"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class MasteryStatus(StrEnum):
    DEVELOPING = "developing"
    MASTERED = "mastered"


class Topic(StrEnum):
    ARTIFICIAL_INTELLIGENCE = "artificial-intelligence"
    MACHINE_LEARNING = "machine-learning"
    NLP = "nlp"
    LANGUAGE_MODELS = "language-models"
    LLM = "llm"
    TOKENS = "tokens"
    EMBEDDINGS = "embeddings"
    CONTEXT_WINDOW = "context-window"
    RAG = "rag"
    TOOL_CALLING = "tool-calling"
    AGENTS = "agents"
    MCP = "model-context-protocol"
    MULTI_AGENT = "multi-agent-systems"
    PROMPT_ENGINEERING = "prompt-engineering"
    HALLUCINATIONS_EVALUATION = "hallucinations-evaluation"
    AGENT_MEMORY = "agent-memory"
    ADVANCED_RAG = "advanced-rag"
    AI_SECURITY = "ai-security"
    OBSERVABILITY_COSTS = "observability-costs"
    FINE_TUNING = "fine-tuning"
    MULTIMODAL_AI = "multimodal-ai"
    RESPONSIBLE_AI = "responsible-ai"
    AI_PRODUCTION = "ai-production"


class LearningContent(StrictModel):
    id: str = Field(min_length=3, max_length=100, pattern=r"^[a-z0-9-]+$")
    topic: Topic
    title: str = Field(min_length=3, max_length=120)
    level: LearningLevel
    text: str = Field(min_length=40, max_length=2_000)
    source: str = Field(min_length=3, max_length=200)
    keywords: list[str] = Field(default_factory=list, max_length=20)


class SearchResult(StrictModel):
    content_id: str
    topic: Topic
    title: str
    level: LearningLevel
    fragment: str
    source: str
    score: float = Field(ge=0)


class Assessment(StrictModel):
    topic: Topic
    score: float = Field(ge=0, le=100)
    feedback: str = Field(min_length=1, max_length=1_000)
    recommendation: str = Field(min_length=1, max_length=500)
    mastered_concepts: list[str] = Field(default_factory=list, max_length=30)
    pending_concepts: list[str] = Field(default_factory=list, max_length=30)
    created_at: datetime = Field(default_factory=utc_now)

    @field_validator("mastered_concepts", "pending_concepts")
    @classmethod
    def unique_concepts(cls, concepts: list[str]) -> list[str]:
        normalized = [concept.strip() for concept in concepts]
        if any(not concept or len(concept) > 100 for concept in normalized):
            raise ValueError("cada concepto debe contener entre 1 y 100 caracteres")
        return list(dict.fromkeys(normalized))

    @model_validator(mode="after")
    def concepts_are_disjoint(self) -> "Assessment":
        overlap = set(self.mastered_concepts) & set(self.pending_concepts)
        if overlap:
            raise ValueError(
                "un concepto no puede estar dominado y pendiente en el mismo intento"
            )
        return self


class ConceptProgress(StrictModel):
    concept: str = Field(min_length=1, max_length=100)
    attempts: int = Field(ge=1)
    successful_attempts: int = Field(ge=0)
    best_score: float = Field(ge=0, le=100)
    mastery_status: MasteryStatus
    updated_at: datetime


class TopicProgress(StrictModel):
    topic: Topic
    attempts: int = Field(ge=1)
    best_score: float = Field(ge=0, le=100)
    level: LearningLevel
    mastery_status: MasteryStatus
    mastered_concepts: list[str] = Field(default_factory=list)
    pending_concepts: list[str] = Field(default_factory=list)
    concepts: list[ConceptProgress] = Field(default_factory=list)
    updated_at: datetime


class StudentProgress(StrictModel):
    student_id: str = Field(min_length=1, max_length=100)
    level: LearningLevel = LearningLevel.BEGINNER
    studied_topics: list[Topic] = Field(default_factory=list)
    assessments: list[Assessment] = Field(default_factory=list)
    topic_progress: list[TopicProgress] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=utc_now)

    @field_validator("studied_topics")
    @classmethod
    def unique_topics(cls, topics: list[Topic]) -> list[Topic]:
        return list(dict.fromkeys(topics))

    @model_validator(mode="after")
    def derive_summary_from_assessments(self) -> "StudentProgress":
        """Migra datos antiguos y conserva los resúmenes como valores derivados."""

        self.refresh_summary()
        return self

    def refresh_summary(self) -> None:
        self.topic_progress = _derive_topic_progress(self.assessments)
        self.studied_topics = [item.topic for item in self.topic_progress]
        self.level = _global_level(self.topic_progress)

    def progress_for(self, topic: Topic) -> TopicProgress | None:
        return next(
            (item for item in self.topic_progress if item.topic == topic),
            None,
        )


class LearningPath(StrictModel):
    student_id: str
    completed_topics: list[Topic]
    in_progress_topics: list[Topic]
    available_topics: list[Topic]
    blocked_topics: list[Topic]
    recommended_topics: list[Topic]
    recommendations: list["LearningRecommendation"]
    topics: list["LearningPathTopic"]
    completion_percentage: float = Field(ge=0, le=100)


class LearningRecommendation(StrictModel):
    topic: Topic
    title: str
    reason: str = Field(min_length=1, max_length=500)


class LearningPathTopic(StrictModel):
    topic: Topic
    status: TopicStatus
    prerequisites: list[Topic]
    unmet_prerequisites: list[Topic]


class PracticalExample(StrictModel):
    topic: Topic
    programming_language: str
    title: str
    code: str
    explanation: str


class TopicSummary(StrictModel):
    topic: Topic
    title: str
    category: TopicCategory
    order: int = Field(ge=1)
    prerequisites: list[Topic]
    available_levels: list[LearningLevel]


class SaveResultResponse(StrictModel):
    saved: bool
    progress: StudentProgress


MASTERY_SCORE = 80


def level_for_score(score: float) -> LearningLevel:
    if score >= 85:
        return LearningLevel.ADVANCED
    if score >= 60:
        return LearningLevel.INTERMEDIATE
    return LearningLevel.BEGINNER


def _derive_topic_progress(assessments: list[Assessment]) -> list[TopicProgress]:
    by_topic: dict[Topic, list[Assessment]] = {}
    for assessment in assessments:
        by_topic.setdefault(assessment.topic, []).append(assessment)

    result: list[TopicProgress] = []
    for topic, attempts in by_topic.items():
        best_score = max(item.score for item in attempts)
        concept_attempts: dict[str, int] = {}
        concept_successes: dict[str, int] = {}
        concept_updated: dict[str, datetime] = {}
        for assessment in attempts:
            for concept in [
                *assessment.mastered_concepts,
                *assessment.pending_concepts,
            ]:
                concept_attempts[concept] = concept_attempts.get(concept, 0) + 1
                concept_updated[concept] = assessment.created_at
            for concept in assessment.mastered_concepts:
                concept_successes[concept] = concept_successes.get(concept, 0) + 1

        concepts = [
            ConceptProgress(
                concept=concept,
                attempts=count,
                successful_attempts=concept_successes.get(concept, 0),
                best_score=100 if concept_successes.get(concept, 0) else 0,
                mastery_status=(
                    MasteryStatus.MASTERED
                    if concept_successes.get(concept, 0)
                    else MasteryStatus.DEVELOPING
                ),
                updated_at=concept_updated[concept],
            )
            for concept, count in concept_attempts.items()
        ]
        mastered = [
            item.concept
            for item in concepts
            if item.mastery_status == MasteryStatus.MASTERED
        ]
        pending = [
            item.concept
            for item in concepts
            if item.mastery_status == MasteryStatus.DEVELOPING
        ]
        result.append(
            TopicProgress(
                topic=topic,
                attempts=len(attempts),
                best_score=best_score,
                level=level_for_score(best_score),
                mastery_status=(
                    MasteryStatus.MASTERED
                    if best_score >= MASTERY_SCORE
                    else MasteryStatus.DEVELOPING
                ),
                mastered_concepts=mastered,
                pending_concepts=pending,
                concepts=concepts,
                updated_at=max(item.created_at for item in attempts),
            )
        )
    return result


def _global_level(topic_progress: list[TopicProgress]) -> LearningLevel:
    if not topic_progress:
        return LearningLevel.BEGINNER
    average_best_score = sum(item.best_score for item in topic_progress) / len(
        topic_progress
    )
    return level_for_score(average_best_score)
