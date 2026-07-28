from agent_app.models.chat import Diagnostic
from agent_app.providers.base import ModelProvider, ModelRequest
from agent_app.services.learning_tools import LearningTools
from mcp_learning_server.curriculum import TOPIC_SUBJECTS
from mcp_learning_server.models import LearningSubject


class TutorAgent:
    name = "tutor_agent"

    def __init__(self, tools: LearningTools, provider: ModelProvider) -> None:
        self.tools = tools
        self.provider = provider

    async def teach(self, diagnostic: Diagnostic, user_message: str) -> tuple[str, list[str]]:
        results = await self.tools.search_learning_content(
            diagnostic.topic.value, diagnostic.level
        )
        if not results:
            return (
                "No encontré información suficiente en las fuentes curriculares "
                "para explicar este tema.",
                [],
            )
        evidence = "\n\n".join(
            f"FUENTE: {result.source}\nFRAGMENTO: {result.fragment}"
            for result in results
        )
        prompt = (
            f"Pregunta: {user_message}\n"
            f"Nivel: {diagnostic.level.value}\n"
            f"Tema: {diagnostic.topic.value}\n\n{evidence}"
        )
        pedagogy = (
            (
                "Actúa como docente de inglés para una persona hispanohablante. "
                "Incluye ejemplos auténticos en inglés y una oportunidad breve para "
                "que el estudiante produzca el idioma. En nivel beginner, explica la "
                "regla en español y usa inglés corto con traducción; en intermediate, "
                "combina ambos idiomas; en advanced, responde principalmente en inglés "
                "y aclara matices en español sólo cuando ayude. Corrige con tacto, "
                "explica el porqué y prioriza comunicación útil sobre memorización."
            )
            if TOPIC_SUBJECTS[diagnostic.topic] == LearningSubject.ENGLISH
            else (
                "Enseña el tema técnico con una explicación conceptual y un ejemplo "
                "verificable."
            )
        )
        answer = await self.provider.generate(
            ModelRequest(
                system_instruction=(
                    "Eres Tutor Agent. El diagnóstico del nivel del estudiante ya se "
                    "realizó antes de que intervengas: nunca le preguntes al usuario "
                    "qué tanto sabe ni le pidas que se autoevalúe. Responde directamente "
                    "a su pregunta explicando únicamente con la evidencia incluida. "
                    "Adapta vocabulario y profundidad al nivel indicado. "
                    f"{pedagogy} Si falta evidencia, dilo. No inventes referencias."
                ),
                prompt=prompt,
            )
        )
        return answer, list(dict.fromkeys(result.source for result in results))

