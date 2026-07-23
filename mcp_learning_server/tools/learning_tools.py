"""Adaptador MCP: las herramientas delegan en casos de uso deterministas."""

import json
from typing import Annotated

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from mcp_learning_server.models import EvaluationRubric, LearningLevel
from mcp_learning_server.services.learning import LearningService

StudentId = Annotated[str, Field(min_length=1, max_length=100)]
TopicName = Annotated[str, Field(min_length=1, max_length=100)]


def register_learning_tools(mcp: FastMCP, service: LearningService) -> None:
    @mcp.tool()
    def get_student_progress(student_id: StudentId) -> dict:
        """Obtiene el resumen y el dominio por tema y concepto del estudiante."""
        return service.get_student_progress(student_id).model_dump(mode="json")

    @mcp.tool()
    def search_learning_content(
        topic: TopicName,
        level: LearningLevel,
        limit: Annotated[int, Field(ge=1, le=10)] = 3,
    ) -> list[dict]:
        """Recupera fragmentos curriculares con fuente, tema, nivel y relevancia."""
        return [
            result.model_dump(mode="json")
            for result in service.search_learning_content(topic, level, limit)
        ]

    @mcp.tool()
    def get_learning_path(student_id: StudentId) -> dict:
        """Devuelve estados, prerrequisitos y próximos temas con su motivo."""
        return service.get_learning_path(student_id).model_dump(mode="json")

    @mcp.tool()
    def save_learning_result(
        student_id: StudentId,
        topic: TopicName,
        score: Annotated[float, Field(ge=0, le=100)],
        feedback: Annotated[str, Field(min_length=1, max_length=1_000)],
        recommendation: Annotated[
            str | None, Field(max_length=500)
        ] = None,
        mastered_concepts: Annotated[
            list[str] | None, Field(max_length=30)
        ] = None,
        pending_concepts: Annotated[
            list[str] | None, Field(max_length=30)
        ] = None,
        rubric: EvaluationRubric | None = None,
        result_explanation: Annotated[
            str | None, Field(min_length=1, max_length=500)
        ] = None,
    ) -> dict:
        """Guarda una evaluación y actualiza de forma determinista el progreso."""
        return service.save_learning_result(
            student_id,
            topic,
            score,
            feedback,
            recommendation,
            mastered_concepts,
            pending_concepts,
            rubric,
            result_explanation,
        ).model_dump(mode="json")

    @mcp.tool()
    def find_practical_example(
        topic: TopicName,
        programming_language: Annotated[str, Field(min_length=1, max_length=30)],
    ) -> dict:
        """Obtiene un ejemplo breve para un tema y lenguaje de programación."""
        return service.find_practical_example(
            topic, programming_language
        ).model_dump(mode="json")

    @mcp.tool()
    def list_available_topics() -> list[dict]:
        """Lista el currículo disponible y los niveles de cada tema."""
        return [topic.model_dump(mode="json") for topic in service.list_available_topics()]

    @mcp.resource("learning://topics", mime_type="application/json")
    def available_topics_resource() -> str:
        """Recurso legible con el catálogo curricular disponible."""
        return json.dumps(
            [topic.model_dump(mode="json") for topic in service.list_available_topics()],
            ensure_ascii=False,
        )
