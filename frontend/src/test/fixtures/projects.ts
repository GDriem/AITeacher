import type { ProjectCatalogResponse, ProjectEvaluationResponse } from "../../features/projects/projectsApi";

const rubric = [
  { id: "arquitectura", title: "Arquitectura", description: "Separa responsabilidades y decisiones." },
  { id: "fundamentacion", title: "Fundamentación", description: "Justifica las decisiones con evidencia." },
  { id: "seguridad", title: "Seguridad", description: "Incluye límites y manejo de errores." },
  { id: "evaluacion", title: "Evaluación", description: "Define señales y pruebas verificables." },
];

export const projectsFixture: ProjectCatalogResponse = {
  projects: [
    {
      id: "asistente-rag-confiable",
      title: "Asistente RAG confiable",
      summary: "Diseña un asistente que responda con evidencia y reconozca cuándo no tiene contexto suficiente.",
      challenge: "Describe la arquitectura, el recorrido de una consulta y los controles que evitan respuestas inventadas.",
      topics: ["embeddings", "rag", "hallucinations-evaluation", "ai-security"],
      deliverables: ["Flujo de extremo a extremo.", "Estrategia de evidencia y citas.", "Controles de calidad y seguridad."],
      rubric,
      estimated_minutes: 45,
    },
    {
      id: "agente-mcp-observable",
      title: "Agente MCP observable",
      summary: "Propón un agente que elija herramientas con autorización, trazas y recuperación ante fallos.",
      challenge: "Describe roles, contratos, autorización y señales operativas.",
      topics: ["agents", "tool-calling", "model-context-protocol", "observability-costs"],
      deliverables: ["Secuencia de una solicitud.", "Contrato de herramienta.", "Plan mínimo de trazas."],
      rubric,
      estimated_minutes: 50,
    },
    {
      id: "experiencia-multimodal-responsable",
      title: "Experiencia multimodal responsable",
      summary: "Diseña una experiencia con texto, imagen o voz preparada para usuarios reales.",
      challenge: "Explica modalidades, riesgos y mecanismos de protección.",
      topics: ["multimodal-ai", "responsible-ai", "ai-production", "observability-costs"],
      deliverables: ["Flujo de interacción.", "Riesgos y mitigaciones.", "Plan de monitoreo."],
      rubric,
      estimated_minutes: 40,
    },
  ],
};

export const projectEvaluationFixture: ProjectEvaluationResponse = {
  project_id: "asistente-rag-confiable",
  score: 81.25,
  status: "mastered",
  feedback: "La propuesta integra evidencia, controles y medición.",
  evaluation_mode: "model",
  rubric: rubric.map((item) => ({
    criterion_id: item.id,
    title: item.title,
    score: item.id === "evaluacion" ? 3 : 4,
    explanation: `La entrega desarrolla ${item.title.toLocaleLowerCase()} con decisiones concretas.`,
  })),
};
