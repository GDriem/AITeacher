import type { Document } from "./authoringModel";
import styles from "./Publication.module.css";

const labels: Record<string, string> = { name: "Nombre", description: "Objetivo", title: "Título", text: "Texto", source: "Fuente", prompt: "Consigna", privateCriteria: "Criterios privados", objectiveIds: "Objetivos cubiertos", conceptIds: "Conceptos", conceptId: "Concepto", requiresConceptId: "Requiere conocer", sourceId: "Currículo de origen", topic: "Tema de origen", level: "Nivel de origen", keywords: "Palabras clave" };
/** El diff muestra contenido y nombres de las referencias, nunca identificadores internos. */
export function RevisionValue({ value, document }: { value: unknown; document: Document }) {
  const concept = (id: unknown) => document.concepts.find((item) => item.id === id)?.name ?? "Concepto retirado";
  const objective = (id: unknown) => document.objectives.find((item) => item.id === id)?.description ?? "Objetivo retirado";
  const format = (key: string, field: unknown): string => {
    if (key === "conceptId" || key === "requiresConceptId") return concept(field);
    if (Array.isArray(field)) return field.map((id: unknown) => key === "conceptIds" ? concept(id) : key === "objectiveIds" ? objective(id) : String(id)).join(", ") || "Sin referencias";
    return typeof field === "string" || typeof field === "number" || typeof field === "boolean" ? String(field) : "Sin dato";
  };
  if (!value || typeof value !== "object") return <p className={styles.value}>{value === "reading" ? "Solo lectura" : value === "learningUnit" ? "Unidad con objetivos, práctica y evaluación" : typeof value === "string" ? value : "Sin procedencia"}</p>;
  return <dl className={styles.value}>{Object.entries(value).filter(([key]) => key !== "id").map(([key, field]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd>{format(key, field)}</dd></div>)}</dl>;
}
