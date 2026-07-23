from mcp_learning_server.models import LearningLevel, Topic

from agent_app.models.chat import Diagnostic
from agent_app.services.learning_tools import LearningTools


class DiagnosticAgent:
    name = "diagnostic_agent"

    def __init__(self, tools: LearningTools) -> None:
        self.tools = tools

    async def diagnose(self, student_id: str, topic: Topic) -> Diagnostic:
        progress = await self.tools.get_student_progress(student_id)
        topic_progress = progress.progress_for(topic)
        missing = []
        if topic_progress is None:
            missing.append("No existe una evaluación previa para este tema.")
        elif topic_progress.pending_concepts:
            missing.extend(
                f"Concepto pendiente: {concept}."
                for concept in topic_progress.pending_concepts
            )
        if not progress.topic_progress:
            missing.append("Aún no hay evidencia de conocimientos evaluados.")
        return Diagnostic(
            student_id=student_id,
            level=topic_progress.level if topic_progress else LearningLevel.BEGINNER,
            topic=topic,
            missing_knowledge=missing,
            progress=progress,
        )
