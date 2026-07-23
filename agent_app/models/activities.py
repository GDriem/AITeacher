"""Contratos del modo práctica y los proyectos integradores."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from agent_app.models.chat import EvaluationStatus, Quiz
from mcp_learning_server.models import (
    EvaluationRubric,
    StudentProgress,
    Topic,
)


class ActivityModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PracticeDifficulty(StrEnum):
    FOUNDATION = "foundation"
    APPLICATION = "application"
    CHALLENGE = "challenge"


class PracticeExercise(ActivityModel):
    id: str = Field(min_length=1, max_length=100)
    topic: Topic
    round: int = Field(ge=1)
    based_on_attempts: int = Field(ge=0)
    difficulty: PracticeDifficulty
    focus_concepts: list[str] = Field(min_length=1, max_length=10)
    title: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=1, max_length=1_000)
    hint: str = Field(min_length=1, max_length=500)


class PracticeStartRequest(ActivityModel):
    student_id: str = Field(min_length=1, max_length=100)
    session_id: str = Field(min_length=1, max_length=100)
    focus_concept: str | None = Field(default=None, min_length=1, max_length=100)


class PracticeEvaluationRequest(ActivityModel):
    student_id: str = Field(min_length=1, max_length=100)
    session_id: str = Field(min_length=1, max_length=100)
    answer: str = Field(min_length=1, max_length=2_000)


class PracticeStartResponse(ActivityModel):
    session_id: str
    exercise: PracticeExercise
    main_quiz: Quiz


class PracticeEvaluationResponse(ActivityModel):
    session_id: str
    exercise: PracticeExercise
    score: float = Field(ge=0, le=100)
    status: EvaluationStatus
    feedback: str
    rubric: EvaluationRubric
    next_exercise: PracticeExercise
    main_quiz: Quiz
    progress: StudentProgress


class ProjectCriterionDefinition(ActivityModel):
    id: str = Field(pattern=r"^[a-z][a-z0-9-]*$", max_length=60)
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=300)


class IntegrativeProject(ActivityModel):
    id: str = Field(pattern=r"^[a-z][a-z0-9-]*$", max_length=60)
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=500)
    challenge: str = Field(min_length=1, max_length=1_500)
    topics: list[Topic] = Field(min_length=2, max_length=8)
    deliverables: list[str] = Field(min_length=2, max_length=10)
    rubric: list[ProjectCriterionDefinition] = Field(min_length=4, max_length=6)
    estimated_minutes: int = Field(ge=15, le=240)


class ProjectCatalogResponse(ActivityModel):
    projects: list[IntegrativeProject]


class ProjectEvaluationRequest(ActivityModel):
    student_id: str = Field(min_length=1, max_length=100)
    submission: str = Field(min_length=1, max_length=8_000)


class ProjectCriterionResult(ActivityModel):
    criterion_id: str
    title: str
    score: int = Field(ge=0, le=4)
    explanation: str = Field(min_length=1, max_length=400)


class ProjectEvaluationMode(StrEnum):
    MODEL = "model"
    DETERMINISTIC_FALLBACK = "deterministic_fallback"


class ProjectEvaluationResponse(ActivityModel):
    project_id: str
    score: float = Field(ge=0, le=100)
    status: EvaluationStatus
    feedback: str = Field(min_length=1, max_length=1_000)
    rubric: list[ProjectCriterionResult]
    evaluation_mode: ProjectEvaluationMode
