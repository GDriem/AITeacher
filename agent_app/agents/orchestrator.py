"""Orquestador de aplicación con delegaciones explícitas y trazables."""

from __future__ import annotations

import time
import uuid

from agent_app.agents.diagnostic import DiagnosticAgent
from agent_app.agents.evaluator import EvaluatorAgent
from agent_app.agents.tutor import TutorAgent
from agent_app.models.chat import (
    ChatRequest,
    ChatResponse,
    EvaluationRequest,
    EvaluationResponse,
    TraceEvent,
    TraceKind,
)
from agent_app.services.sessions import (
    ConversationMessage,
    InMemorySessionRepository,
    MessageRole,
    PendingEvaluation,
    SessionRepository,
    StoredConversation,
)
from mcp_learning_server.models import RubricEvaluationMode, Topic
from mcp_learning_server.services.learning import TOPIC_ALIASES
from mcp_learning_server.services.retrieval import tokenize


class LearningOrchestrator:
    name = "root_orchestrator"

    def __init__(
        self,
        diagnostic: DiagnosticAgent,
        tutor: TutorAgent,
        evaluator: EvaluatorAgent,
        sessions: SessionRepository | None = None,
    ) -> None:
        self.diagnostic = diagnostic
        self.tutor = tutor
        self.evaluator = evaluator
        self.sessions = sessions or InMemorySessionRepository()

    async def chat(
        self, request: ChatRequest, correlation_id: str | None = None
    ) -> ChatResponse:
        correlation_id = correlation_id or str(uuid.uuid4())
        session_id = request.session_id or str(uuid.uuid4())
        session = (
            self.sessions.get(session_id, request.student_id)
            if request.session_id
            else None
        )
        if session is not None and session.archived_at is not None:
            raise ValueError("La conversación está archivada; restáurala para continuar")
        trace = [
            TraceEvent(
                kind=TraceKind.USER,
                actor="user",
                action="send_message",
                summary="El usuario envió una solicitud de aprendizaje.",
            )
        ]
        started = time.perf_counter()
        try:
            topic = detect_topic(request.message)
            detection_summary = f"Intención educativa; tema detectado: {topic.value}."
        except ValueError:
            if session is None:
                raise
            topic = session.topic
            detection_summary = (
                f"Sin tema nuevo en el mensaje; continúa el tema de la sesión: {topic.value}."
            )
        trace.append(
            TraceEvent(
                kind=TraceKind.DECISION,
                actor=self.name,
                action="detect_intent",
                summary=detection_summary,
                duration_ms=_elapsed(started),
            )
        )

        trace.append(_delegation(self.name, self.diagnostic.name, "diagnosticar nivel"))
        started = time.perf_counter()
        diagnostic = await self.diagnostic.diagnose(request.student_id, topic)
        trace.append(
            TraceEvent(
                kind=TraceKind.TOOL,
                actor=self.diagnostic.name,
                action="get_student_progress",
                summary=f"Progreso recuperado; nivel {diagnostic.level.value}.",
                duration_ms=_elapsed(started),
            )
        )

        trace.append(_delegation(self.name, self.tutor.name, "explicar con RAG"))
        started = time.perf_counter()
        answer, sources = await self.tutor.teach(diagnostic, request.message)
        tutor_duration = _elapsed(started)
        trace.extend(
            [
                TraceEvent(
                    kind=TraceKind.TOOL,
                    actor=self.tutor.name,
                    action="search_learning_content",
                    summary=f"Se recuperaron fuentes para {topic.value}.",
                    duration_ms=tutor_duration,
                ),
                TraceEvent(
                    kind=TraceKind.MODEL,
                    actor=self.tutor.name,
                    action="generate_grounded_explanation",
                    summary="Explicación adaptada al nivel usando evidencia recuperada.",
                    duration_ms=tutor_duration,
                ),
            ]
        )

        trace.append(_delegation(self.name, self.evaluator.name, "crear evaluación corta"))
        pending = session.pending_evaluation if session is not None else None
        if (
            pending is not None
            and pending.student_id == request.student_id
            and pending.topic == topic
        ):
            quiz = pending.quiz
            quiz_attempt = pending.attempt
            quiz_summary = (
                f"Se conservó la evaluación pendiente de la ronda {quiz_attempt}."
            )
        else:
            quiz = self.evaluator.create_quiz(topic)
            quiz_attempt = 1
            quiz_summary = "Se creó la primera evaluación del tema."
        pending = PendingEvaluation(
            student_id=request.student_id,
            topic=topic,
            quiz=quiz,
            attempt=quiz_attempt,
        )
        trace.append(
            TraceEvent(
                kind=TraceKind.DECISION,
                actor=self.evaluator.name,
                action="prepare_evaluation",
                summary=quiz_summary,
            )
        )
        trace.append(
            TraceEvent(
                kind=TraceKind.RESPONSE,
                actor=self.name,
                action="final_response",
                summary="Respuesta y evaluación preparadas.",
            )
        )
        response = ChatResponse(
            correlation_id=correlation_id,
            session_id=session_id,
            topic=topic,
            level=diagnostic.level,
            answer=answer,
            sources=sources,
            progress=diagnostic.progress,
            quiz=quiz,
            quiz_attempt=quiz_attempt,
            trace=trace,
        )
        if session is None:
            session = StoredConversation(
                id=session_id,
                student_id=request.student_id,
                title=_default_title(request.message),
                topic=topic,
                pending_evaluation=pending,
            )
        else:
            session.topic = topic
            session.pending_evaluation = pending
        session.messages.extend(
            [
                ConversationMessage(
                    role=MessageRole.USER,
                    label="Tú",
                    content=request.message,
                ),
                ConversationMessage(
                    role=MessageRole.ASSISTANT,
                    label="Tutor Agent",
                    content=answer,
                    sources=sources,
                ),
            ]
        )
        self.sessions.save(session)
        return response

    async def evaluate(
        self, request: EvaluationRequest, correlation_id: str | None = None
    ) -> EvaluationResponse:
        correlation_id = correlation_id or str(uuid.uuid4())
        session = self.sessions.get(request.session_id, request.student_id)
        if session.archived_at is not None:
            raise ValueError("La conversación está archivada; restáurala para continuar")
        pending = session.pending_evaluation
        trace = [
            TraceEvent(
                kind=TraceKind.DELEGATION,
                actor=self.name,
                action="delegate",
                summary=f"Delegación a {self.evaluator.name} para calificar.",
            )
        ]
        started = time.perf_counter()
        result = await self.evaluator.evaluate(
            request.student_id,
            pending.topic,
            pending.quiz,
            request.answer,
            pending.attempt,
        )
        session.pending_evaluation = PendingEvaluation(
            student_id=request.student_id,
            topic=pending.topic,
            quiz=result.next_quiz,
            attempt=pending.attempt + 1,
        )
        session.messages.extend(
            [
                ConversationMessage(
                    role=MessageRole.USER,
                    label="Tu explicación",
                    content=request.answer,
                ),
                ConversationMessage(
                    role=MessageRole.ASSISTANT,
                    label="Evaluator Agent",
                    content=result.feedback,
                    note=result.learning_context,
                ),
            ]
        )
        self.sessions.save(session)
        trace.append(
            TraceEvent(
                kind=TraceKind.MODEL,
                actor=self.evaluator.name,
                action="evaluate_with_rubric",
                summary=(
                    "Rúbrica del modelo validada y combinada con conceptos esenciales."
                    if result.rubric.evaluation_mode
                    == RubricEvaluationMode.HYBRID_MODEL
                    else "Se aplicó la rúbrica determinista de respaldo."
                ),
                duration_ms=_elapsed(started),
            )
        )
        trace.append(
            TraceEvent(
                kind=TraceKind.TOOL,
                actor=self.evaluator.name,
                action="save_learning_result",
                summary=f"Resultado guardado con puntaje {result.score}.",
                duration_ms=_elapsed(started),
            )
        )
        trace.append(
            TraceEvent(
                kind=TraceKind.DECISION,
                actor=self.evaluator.name,
                action="adapt_learning_step",
                summary=(
                    f"Se preparó contexto y una nueva pregunta según el resultado "
                    f"{result.status.value}."
                ),
            )
        )
        return EvaluationResponse(
            correlation_id=correlation_id,
            session_id=request.session_id,
            topic=pending.topic,
            score=result.score,
            status=result.status,
            attempt=pending.attempt,
            feedback=result.feedback,
            rubric=result.rubric,
            result_explanation=result.result_explanation,
            strengths=result.strengths,
            improvements=result.improvements,
            learning_context=result.learning_context,
            recommendation=result.recommendation,
            next_quiz=result.next_quiz,
            progress=result.saved.progress,
            trace=trace,
        )


def detect_topic(message: str) -> Topic:
    normalized = " ".join(tokenize(message))
    matches = [
        (len(alias.split()), topic)
        for alias, topic in TOPIC_ALIASES.items()
        if " ".join(tokenize(alias)) in normalized
    ]
    if not matches:
        raise ValueError(
            "No pude identificar el tema. Menciona uno como embeddings, RAG, MCP, "
            "prompt engineering, seguridad de IA o agentes."
        )
    return max(matches, key=lambda item: item[0])[1]


def _delegation(actor: str, target: str, purpose: str) -> TraceEvent:
    return TraceEvent(
        kind=TraceKind.DELEGATION,
        actor=actor,
        action="delegate",
        summary=f"Delegación a {target}: {purpose}.",
    )


def _elapsed(started: float) -> float:
    return round((time.perf_counter() - started) * 1_000, 3)


def _default_title(message: str) -> str:
    normalized = " ".join(message.split())
    return normalized if len(normalized) <= 70 else f"{normalized[:67].rstrip()}…"
