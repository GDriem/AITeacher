from __future__ import annotations

from dataclasses import dataclass

from agent_app.models.chat import EvaluationStatus, Quiz
from agent_app.services.learning_tools import LearningTools
from mcp_learning_server.models import SaveResultResponse, Topic
from mcp_learning_server.services.learning import TOPIC_TITLES
from mcp_learning_server.services.retrieval import tokenize


QUIZZES: dict[Topic, Quiz] = {
    Topic.EMBEDDINGS: Quiz(
        question="¿Qué representa un embedding y para qué sirve la similitud?",
        expected_keywords=["vector", "similitud", "significado"],
    ),
    Topic.RAG: Quiz(
        question="¿Cuáles son las dos etapas principales de RAG?",
        expected_keywords=["recuperación", "generación"],
    ),
    Topic.MCP: Quiz(
        question="¿Por qué un servidor MCP no es un agente?",
        expected_keywords=["protocolo", "herramientas", "decide"],
    ),
    Topic.PROMPT_ENGINEERING: Quiz(
        question="¿Qué elementos hacen que un prompt sea claro y verificable?",
        expected_keywords=["objetivo", "contexto", "formato"],
    ),
    Topic.HALLUCINATIONS_EVALUATION: Quiz(
        question="¿Qué es una alucinación y cómo reducirías su riesgo?",
        expected_keywords=["evidencia", "verificación", "incertidumbre"],
    ),
    Topic.AGENT_MEMORY: Quiz(
        question="¿En qué se diferencian historial, contexto y memoria persistente?",
        expected_keywords=["historial", "contexto", "persistencia"],
    ),
    Topic.ADVANCED_RAG: Quiz(
        question="¿Cómo mejoran un RAG el chunking, la búsqueda híbrida y el reranking?",
        expected_keywords=["chunking", "búsqueda híbrida", "reranking"],
    ),
    Topic.AI_SECURITY: Quiz(
        question="¿Por qué el modelo no debe decidir por sí solo si una acción está autorizada?",
        expected_keywords=["permisos", "validación", "prompt injection"],
    ),
    Topic.OBSERVABILITY_COSTS: Quiz(
        question="¿Qué señales observarías para entender calidad, rendimiento y consumo?",
        expected_keywords=["trazas", "latencia", "costo"],
    ),
    Topic.FINE_TUNING: Quiz(
        question="¿Cuándo elegirías fine-tuning y cómo comprobarías que mejoró el sistema?",
        expected_keywords=["comportamiento", "dataset", "evaluación"],
    ),
    Topic.MULTIMODAL_AI: Quiz(
        question="¿Qué procesa un sistema multimodal y qué errores puede introducir?",
        expected_keywords=["texto", "imagen", "audio"],
    ),
    Topic.RESPONSIBLE_AI: Quiz(
        question="¿Qué principios aplicarías para desarrollar IA responsable?",
        expected_keywords=["privacidad", "equidad", "supervisión"],
    ),
    Topic.AI_PRODUCTION: Quiz(
        question="¿Qué necesita una aplicación de IA para operar de forma confiable en producción?",
        expected_keywords=["errores", "monitoreo", "disponibilidad"],
    ),
}

APPLICATION_QUIZZES: dict[Topic, Quiz] = {
    Topic.EMBEDDINGS: Quiz(
        question=(
            "Aplicación: ¿cómo usarías embeddings para encontrar textos relacionados "
            "aunque no compartan las mismas palabras?"
        ),
        expected_keywords=["búsqueda", "vector", "similitud"],
    ),
    Topic.RAG: Quiz(
        question=(
            "Aplicación: describe qué ocurre desde que llega una consulta hasta que "
            "RAG produce una respuesta fundamentada."
        ),
        expected_keywords=["consulta", "recuperación", "contexto", "generación"],
    ),
    Topic.MCP: Quiz(
        question=(
            "Aplicación: explica el recorrido de una solicitud desde un cliente MCP "
            "hasta una herramienta del servidor."
        ),
        expected_keywords=["cliente", "protocolo", "servidor", "herramienta"],
    ),
}

CONCEPT_ALIASES: dict[str, tuple[str, ...]] = {
    "vector": ("vector", "lista de numeros", "representacion numerica"),
    "similitud": ("similitud", "parecido", "cercania", "distancia"),
    "significado": ("significado", "semantica", "sentido", "concepto"),
    "búsqueda": ("busqueda", "recuperar", "encontrar", "ranking"),
    "recuperación": ("recuperacion", "buscar", "busqueda", "encontrar"),
    "generación": ("generacion", "generar", "respuesta"),
    "consulta": ("consulta", "pregunta", "query", "entrada"),
    "contexto": ("contexto", "evidencia", "fragmentos", "fuentes"),
    "protocolo": ("protocolo", "estandar", "comunicacion"),
    "herramientas": ("herramientas", "operaciones", "funciones"),
    "herramienta": ("herramienta", "operacion", "funcion"),
    "decide": ("decide", "decision", "razona", "objetivo"),
    "cliente": ("cliente", "aplicacion", "host"),
    "servidor": ("servidor", "servicio"),
    "objetivo": ("objetivo", "meta", "tarea"),
    "formato": ("formato", "estructura", "json", "esquema"),
    "evidencia": ("evidencia", "fuente", "fuentes", "respaldo"),
    "verificación": ("verificacion", "validar", "comprobar", "revisar"),
    "incertidumbre": ("incertidumbre", "duda", "no sabe", "no estar seguro"),
    "historial": ("historial", "mensajes", "conversacion"),
    "persistencia": ("persistencia", "persistente", "guardar", "almacenar"),
    "chunking": ("chunking", "fragmentacion", "fragmentos", "dividir documentos"),
    "búsqueda híbrida": ("busqueda hibrida", "lexica y semantica", "bm25"),
    "reranking": ("reranking", "reordenar", "reordenamiento"),
    "permisos": ("permisos", "autorizacion", "autorizar", "privilegios"),
    "validación": ("validacion", "validar", "comprobar"),
    "prompt injection": ("prompt injection", "inyeccion de prompt", "instruccion maliciosa"),
    "trazas": ("trazas", "tracing", "registros", "logs"),
    "latencia": ("latencia", "tiempo de respuesta", "velocidad"),
    "costo": ("costo", "coste", "consumo", "tokens"),
    "comportamiento": ("comportamiento", "conducta", "estilo", "patron"),
    "dataset": ("dataset", "datos", "ejemplos de entrenamiento"),
    "evaluación": ("evaluacion", "pruebas", "metricas"),
    "texto": ("texto", "lenguaje"),
    "imagen": ("imagen", "imagenes", "vision"),
    "audio": ("audio", "voz", "sonido"),
    "privacidad": ("privacidad", "datos personales", "consentimiento"),
    "equidad": ("equidad", "justicia", "sesgo", "sesgos"),
    "supervisión": ("supervision", "revision humana", "humano"),
    "errores": ("errores", "fallos", "excepciones"),
    "monitoreo": ("monitoreo", "monitorizacion", "observabilidad", "metricas"),
    "disponibilidad": ("disponibilidad", "resiliencia", "continuidad", "uptime"),
}

CONCEPT_LABELS: dict[str, str] = {
    "vector": "la representación numérica o vectorial",
    "similitud": "la comparación por similitud",
    "significado": "la relación con el significado",
    "búsqueda": "el uso para búsqueda semántica",
    "recuperación": "la etapa de recuperación de evidencia",
    "generación": "la etapa de generación de la respuesta",
    "consulta": "la consulta que inicia el flujo",
    "contexto": "el contexto o evidencia recuperada",
    "protocolo": "el papel de MCP como protocolo",
    "herramientas": "las herramientas expuestas",
    "herramienta": "la ejecución de una herramienta",
    "decide": "quién toma las decisiones",
    "cliente": "el rol del cliente MCP",
    "servidor": "el rol del servidor MCP",
    "objetivo": "el objetivo de la instrucción",
    "formato": "el formato esperado de salida",
    "evidencia": "la evidencia que respalda la respuesta",
    "verificación": "la verificación de las afirmaciones",
    "incertidumbre": "el reconocimiento de la incertidumbre",
    "historial": "el historial de mensajes",
    "persistencia": "la memoria persistente",
    "chunking": "la división de documentos en fragmentos",
    "búsqueda híbrida": "la combinación de búsqueda léxica y semántica",
    "reranking": "el reordenamiento de resultados",
    "permisos": "los permisos de la operación",
    "validación": "la validación determinista",
    "prompt injection": "el riesgo de prompt injection",
    "trazas": "las trazas de extremo a extremo",
    "latencia": "la latencia del sistema",
    "costo": "el costo o consumo de tokens",
    "comportamiento": "el comportamiento que se desea adaptar",
    "dataset": "el dataset de entrenamiento",
    "evaluación": "la evaluación contra una línea base",
    "texto": "la modalidad de texto",
    "imagen": "la modalidad de imagen",
    "audio": "la modalidad de audio",
    "privacidad": "la protección de la privacidad",
    "equidad": "la equidad y el control de sesgos",
    "supervisión": "la supervisión humana",
    "errores": "el manejo de errores",
    "monitoreo": "el monitoreo del servicio",
    "disponibilidad": "la disponibilidad y resiliencia",
}


@dataclass(frozen=True)
class EvaluationResult:
    score: float
    status: EvaluationStatus
    feedback: str
    strengths: list[str]
    improvements: list[str]
    learning_context: str
    recommendation: str
    next_quiz: Quiz
    saved: SaveResultResponse


class EvaluatorAgent:
    name = "evaluator_agent"

    def __init__(self, tools: LearningTools) -> None:
        self.tools = tools

    def create_quiz(self, topic: Topic) -> Quiz:
        return QUIZZES.get(
            topic,
            Quiz(
                question=f"Explica con tus palabras la idea principal de {topic.value}.",
                expected_keywords=[word for word in topic.value.split("-") if len(word) > 2],
            ),
        )

    async def evaluate(
        self,
        student_id: str,
        topic: Topic,
        quiz: Quiz,
        answer: str,
        attempt: int = 1,
    ) -> EvaluationResult:
        normalized = " ".join(tokenize(answer))
        matched = [
            concept
            for concept in quiz.expected_keywords
            if _matches_concept(normalized, concept)
        ]
        missing = [
            concept for concept in quiz.expected_keywords if concept not in matched
        ]
        score = round(len(matched) / max(len(quiz.expected_keywords), 1) * 100, 2)
        if score >= 80:
            status = EvaluationStatus.MASTERED
            feedback = (
                "Respuesta sólida. Ya puedes aplicar la idea en un escenario más concreto."
            )
        elif score >= 50:
            status = EvaluationStatus.PROGRESSING
            feedback = (
                "Vas por buen camino. Tu respuesta contiene una parte importante, "
                "pero todavía puedes conectar mejor las ideas."
            )
        else:
            status = EvaluationStatus.REINFORCE
            feedback = (
                "Gracias por intentarlo. Reforcemos la base con una explicación más "
                "directa y una pregunta enfocada."
            )

        strengths = (
            [f"Identificaste {_concept_label(concept)}." for concept in matched]
            if matched
            else ["Expresaste una idea inicial que podemos desarrollar."]
        )
        improvements = (
            [f"Falta explicar {_concept_label(concept)}." for concept in missing]
            if missing
            else ["El siguiente paso es aplicar el concepto, no sólo definirlo."]
        )
        recommendation = (
            f"Profundizar {TOPIC_TITLES[topic]} con un caso de uso."
            if status == EvaluationStatus.MASTERED
            else f"Reforzar {TOPIC_TITLES[topic]} enfocándose en lo que faltó."
        )
        saved = await self.tools.save_learning_result(
            student_id,
            topic.value,
            score,
            feedback,
            recommendation,
            matched,
            missing,
        )
        topic_progress = saved.progress.progress_for(topic)
        content = await self.tools.search_learning_content(
            topic.value,
            topic_progress.level if topic_progress else saved.progress.level,
        )
        fragment = (
            content[0].fragment
            if content
            else f"Repasa la definición central de {TOPIC_TITLES[topic]}."
        )
        learning_context = _context_for(status, fragment)
        next_quiz = self.create_follow_up(topic, missing, status, attempt)
        return EvaluationResult(
            score=score,
            status=status,
            feedback=feedback,
            strengths=strengths,
            improvements=improvements,
            learning_context=learning_context,
            recommendation=recommendation,
            next_quiz=next_quiz,
            saved=saved,
        )

    def create_follow_up(
        self,
        topic: Topic,
        missing: list[str],
        status: EvaluationStatus,
        attempt: int,
    ) -> Quiz:
        if missing:
            focus = " y ".join(_concept_label(concept) for concept in missing)
            verb = "tienen" if len(missing) > 1 else "tiene"
            return Quiz(
                question=(
                    f"Intento {attempt + 1}: explica con tus palabras qué papel {verb} "
                    f"{focus} en el tema {TOPIC_TITLES[topic]}."
                ),
                expected_keywords=missing,
            )
        if status == EvaluationStatus.MASTERED and topic in APPLICATION_QUIZZES:
            return APPLICATION_QUIZZES[topic]
        original = self.create_quiz(topic)
        return Quiz(
            question=(
                f"Ahora da un ejemplo práctico de {TOPIC_TITLES[topic]} y explica "
                "por qué representa correctamente el concepto."
            ),
            expected_keywords=original.expected_keywords,
        )


def _matches_concept(normalized_answer: str, concept: str) -> bool:
    aliases = CONCEPT_ALIASES.get(concept, (concept,))
    return any(" ".join(tokenize(alias)) in normalized_answer for alias in aliases)


def _concept_label(concept: str) -> str:
    return CONCEPT_LABELS.get(concept, f"el concepto «{concept}»")


def _context_for(status: EvaluationStatus, fragment: str) -> str:
    prefix = {
        EvaluationStatus.REINFORCE: "Volvamos a la idea esencial:",
        EvaluationStatus.PROGRESSING: "Para conectar lo que ya sabes:",
        EvaluationStatus.MASTERED: "Para ampliar tu comprensión:",
    }[status]
    return f"{prefix} {fragment}"
