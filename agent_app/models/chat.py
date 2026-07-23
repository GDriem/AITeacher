"""Contratos HTTP y de coordinación del tutor."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator

from mcp_learning_server.models import (
    EvaluationRubric,
    LearningLevel,
    LearningRecommendation,
    StudentProgress,
    Topic,
    TopicCategory,
    TopicProgress,
    TopicStatus,
    utc_now,
)


class AppModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class TraceKind(StrEnum):
    USER = "user_message"
    DECISION = "decision"
    DELEGATION = "delegation"
    TOOL = "tool_call"
    MODEL = "model_call"
    RESPONSE = "response"
    ERROR = "error"


class EvaluationStatus(StrEnum):
    REINFORCE = "reinforce"
    PROGRESSING = "progressing"
    MASTERED = "mastered"


class TraceEvent(AppModel):
    kind: TraceKind
    actor: str
    action: str
    summary: str
    duration_ms: float = Field(default=0, ge=0)
    success: bool = True
    timestamp: datetime = Field(default_factory=utc_now)


class ChatRequest(AppModel):
    student_id: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=2, max_length=4_000)
    session_id: str | None = Field(default=None, min_length=1, max_length=100)


class TopicCatalogItem(AppModel):
    topic: Topic
    title: str
    category: TopicCategory
    order: int = Field(ge=1)
    prerequisites: list[Topic]
    unmet_prerequisites: list[Topic]
    available_levels: list[LearningLevel]
    status: TopicStatus
    progress: TopicProgress | None


class TopicCatalogResponse(AppModel):
    total_topics: int = Field(ge=0)
    completed_topics: int = Field(ge=0)
    in_progress_topics: int = Field(ge=0)
    available_topics: int = Field(ge=0)
    blocked_topics: int = Field(ge=0)
    completion_percentage: float = Field(ge=0, le=100)
    recommendation: LearningRecommendation | None
    progress: StudentProgress
    topics: list[TopicCatalogItem]


class Diagnostic(AppModel):
    student_id: str
    level: LearningLevel
    topic: Topic
    missing_knowledge: list[str]
    progress: StudentProgress


class Quiz(AppModel):
    question: str
    expected_keywords: list[str] = Field(exclude=True)


class ChatResponse(AppModel):
    correlation_id: str
    session_id: str
    topic: Topic
    level: LearningLevel
    answer: str
    sources: list[str]
    progress: StudentProgress
    quiz: Quiz
    quiz_attempt: int = Field(ge=1)
    trace: list[TraceEvent]


class EvaluationRequest(AppModel):
    student_id: str = Field(min_length=1, max_length=100)
    session_id: str = Field(min_length=1, max_length=100)
    answer: str = Field(min_length=1, max_length=2_000)


class SessionUpdateRequest(AppModel):
    student_id: str = Field(min_length=1, max_length=100)
    title: str | None = Field(default=None, min_length=1, max_length=100)
    archived: bool | None = None

    @model_validator(mode="after")
    def has_update(self) -> "SessionUpdateRequest":
        if self.title is None and self.archived is None:
            raise ValueError("Debe indicar title o archived")
        return self


class EvaluationResponse(AppModel):
    correlation_id: str
    session_id: str
    topic: Topic
    score: float = Field(ge=0, le=100)
    status: EvaluationStatus
    attempt: int = Field(ge=1)
    feedback: str
    rubric: EvaluationRubric
    result_explanation: str
    strengths: list[str]
    improvements: list[str]
    learning_context: str
    recommendation: str
    next_quiz: Quiz
    progress: StudentProgress
    trace: list[TraceEvent]
