import type { ContentRevision, LearningLevel } from "./authoringApi";

const levelLabels: Record<LearningLevel, string> = {
  beginner: "Principiante",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};

const revisionLabels: Record<ContentRevision["action"], string> = {
  bootstrapped: "Contenido inicial",
  created: "Borrador creado",
  updated: "Borrador actualizado",
  published: "Publicado",
  unpublished: "Despublicado",
  reverted: "Revertido",
};

export const authoringLevelLabel = (level: LearningLevel) => levelLabels[level];
export const revisionActionLabel = (action: ContentRevision["action"]) => revisionLabels[action];

export function revisionDate(value?: string) {
  if (!value) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Guatemala",
  }).format(new Date(value));
}
