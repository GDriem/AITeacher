const topicLabels: Record<string, string> = {
  embeddings: "Embeddings",
  rag: "RAG",
  "hallucinations-evaluation": "Alucinaciones y evaluación",
  "ai-security": "Seguridad en IA",
  agents: "Agentes",
  "tool-calling": "Uso de herramientas",
  "model-context-protocol": "MCP",
  "observability-costs": "Observabilidad y costos",
  "multimodal-ai": "IA multimodal",
  "responsible-ai": "IA responsable",
  "ai-production": "IA en producción",
};

const statusLabels: Record<string, string> = {
  mastered: "Dominado",
  progressing: "En progreso",
  reinforce: "Necesita refuerzo",
};

export const projectTopicLabel = (topic: string) => topicLabels[topic] ?? topic;
export const projectStatusLabel = (status: string) => statusLabels[status] ?? status;
