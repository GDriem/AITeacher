import type { TopicCatalogItem } from "./catalogApi";

const subjectLabels: Record<string, string> = {
  "artificial-intelligence": "Inteligencia artificial",
  english: "Inglés",
  networks: "Redes",
};

const categoryLabels: Record<string, string> = {
  fundamentos: "Fundamentos",
  "modelos-y-datos": "Modelos y datos",
  "agentes-y-herramientas": "Agentes y herramientas",
  "calidad-y-seguridad": "Calidad y seguridad",
  produccion: "Producción",
  comunicacion: "Comunicación",
  vocabulario: "Vocabulario",
  gramatica: "Gramática",
  enrutamiento: "Enrutamiento",
};

const levelLabels: Record<string, string> = {
  beginner: "Principiante",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};

const statusLabels: Record<string, string> = {
  blocked: "Bloqueado",
  available: "Disponible",
  in_progress: "En progreso",
  completed: "Completado",
};

const actionLabels: Record<string, string> = {
  blocked: "Estudiar de todos modos",
  available: "Comenzar tema",
  in_progress: "Continuar tema",
  completed: "Repasar tema",
};

export const subjectLabel = (value: string) => subjectLabels[value] ?? value;
export const categoryLabel = (value: string) => categoryLabels[value] ?? value;
export const levelLabel = (value: string) => levelLabels[value] ?? value;
export const statusLabel = (value: string) => statusLabels[value] ?? value;
export const topicActionLabel = (value: string) => actionLabels[value] ?? "Abrir tema";

export function prerequisiteLabel(topic: TopicCatalogItem, titles: Map<string, string>) {
  if (topic.prerequisites.length === 0) return "Sin prerrequisitos";
  if (topic.unmet_prerequisites.length === 0) return "Prerrequisitos completados";
  const unmet = topic.unmet_prerequisites.map((id) => titles.get(id) ?? id).join(", ");
  return `Antes se recomienda: ${unmet}`;
}
