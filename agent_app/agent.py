"""Definición nativa ADK 2.x para `adk run agent_app` y `adk web`."""

from google.adk import Agent
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import (
    StreamableHTTPConnectionParams,
)

from agent_app.config import Settings


def _toolset(settings: Settings, names: list[str]) -> McpToolset:
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=settings.mcp_server_url,
            timeout=settings.mcp_timeout_seconds,
        ),
        tool_filter=names,
    )


def build_adk_root_agent(settings: Settings | None = None) -> Agent:
    settings = settings or Settings()
    diagnostic = Agent(
        name="diagnostic_agent",
        description="Consulta progreso y produce un diagnóstico estructurado.",
        model=settings.gemini_model,
        mode="single_turn",
        instruction=(
            "Usa las herramientas MCP para consultar progreso y camino. Determina "
            "nivel y conocimientos faltantes. Devuelve el diagnóstico al orquestador."
        ),
        tools=[
            _toolset(settings, ["get_student_progress", "get_learning_path"])
        ],
    )
    tutor = Agent(
        name="tutor_agent",
        description="Explica contenido curricular adaptado al nivel con RAG.",
        model=settings.gemini_model,
        mode="task",
        instruction=(
            "Busca contenido mediante MCP. Para explicaciones curriculares usa sólo "
            "los fragmentos recuperados, cita source y reconoce evidencia insuficiente."
        ),
        tools=[
            _toolset(
                settings,
                [
                    "search_learning_content",
                    "find_practical_example",
                    "list_available_topics",
                ],
            )
        ],
    )
    evaluator = Agent(
        name="evaluator_agent",
        description="Crea, califica y persiste una evaluación corta.",
        model=settings.gemini_model,
        mode="task",
        instruction=(
            "Crea una pregunta corta del tema, comprueba conceptos esenciales y "
            "califica precisión, comprensión, aplicación y claridad con una rúbrica "
            "estructurada. Ofrece feedback y usa save_learning_result para persistir "
            "el resultado."
        ),
        tools=[_toolset(settings, ["save_learning_result", "get_learning_path"])],
    )
    return Agent(
        name="learning_orchestrator",
        description="Coordina una experiencia de aprendizaje personalizada.",
        model=settings.gemini_model,
        instruction=(
            "Identifica la intención y delega al especialista correcto. Para una solicitud "
            "de aprendizaje, primero delega diagnóstico, después tutoría y finalmente "
            "evaluación. No respondas directamente cuando corresponda a un especialista."
        ),
        sub_agents=[diagnostic, tutor, evaluator],
    )


root_agent = build_adk_root_agent()

