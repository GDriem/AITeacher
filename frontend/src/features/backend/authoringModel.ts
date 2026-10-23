import type { Schema } from "./client";
export type Document = Schema["UnitDocument"];
export const emptyDocument = (): Document => ({ kind: "learningUnit", title: "", concepts: [], objectives: [], readings: [], exercises: [], assessments: [], prerequisites: [] });
export const steps = ["datos", "objetivos", "lecturas", "ejercicios", "evaluaciones", "revision"] as const;
export type Step = typeof steps[number];
export const stepLabels: Record<Step, string> = { datos: "Datos", objetivos: "Conceptos y objetivos", lecturas: "Lecturas", ejercicios: "Ejercicios", evaluaciones: "Evaluaciones editoriales", revision: "Revisión" };
export const applicableSteps = (doc: Document) => steps.filter((step) => doc.kind !== "reading" || ["datos", "lecturas", "revision"].includes(step));
/** Errores por campo, con identificadores estables entre pasos y recargas. */
export function validateStep(doc: Document, step: Step, topicId: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const text = (key: string, value: string, max: number) => { if (!value.trim() || value.length > max) errors[key] = `Completa este campo (máximo ${String(max)} caracteres).`; };
  if (step === "datos") { if (!topicId) errors.topic = "Selecciona un tema."; text("title", doc.title, 150); }
  if (step === "objetivos") {
    doc.concepts.forEach((item) => text(`${item.id}.name`, item.name, 150));
    doc.objectives.forEach((item) => { text(`${item.id}.description`, item.description, 2000); if (!item.conceptIds.length || item.conceptIds.some((id) => !doc.concepts.some((c) => c.id === id))) errors[`${item.id}.references`] = "Selecciona al menos un concepto de esta unidad."; });
    const seen = new Set<string>(), active = new Set<string>();
    const visit = (id: string): boolean => {
      if (active.has(id)) return false;
      if (seen.has(id)) return true;
      active.add(id);
      for (const edge of doc.prerequisites.filter((p) => p.conceptId === id)) if (!visit(edge.requiresConceptId)) return false;
      active.delete(id); seen.add(id); return true;
    };
    doc.prerequisites.forEach((edge, index) => {
      if (!doc.concepts.some((c) => c.id === edge.conceptId) || !doc.concepts.some((c) => c.id === edge.requiresConceptId) || !visit(edge.conceptId)) errors[`prerequisite.${String(index)}`] = "Selecciona dos conceptos distintos sin crear ciclos.";
    });
  }
  if (step === "lecturas") {
    if (!doc.readings.length) errors.readings = "Añade al menos una lectura.";
    doc.readings.forEach((item) => { text(`${item.id}.title`, item.title, 150); text(`${item.id}.text`, item.text, 100000); text(`${item.id}.source`, item.source, 1000); });
  }
  if (step === "ejercicios") doc.exercises.forEach((item) => text(`${item.id}.prompt`, item.prompt, 20000));
  if (step === "evaluaciones") doc.assessments.forEach((item) => { text(`${item.id}.prompt`, item.prompt, 20000); text(`${item.id}.privateCriteria`, item.privateCriteria, 20000); });
  const linked = step === "lecturas" ? doc.readings : step === "ejercicios" ? doc.exercises : step === "evaluaciones" ? doc.assessments : [];
  if (doc.kind !== "reading") linked.forEach((item) => { if (!item.objectiveIds.length || item.objectiveIds.some((id) => !doc.objectives.some((o) => o.id === id))) errors[`${item.id}.references`] = "Selecciona al menos un objetivo de esta unidad."; });
  return errors;
}
export function orphanObjectives(doc: Document) {
  return doc.objectives.flatMap((objective) => {
    const missing = [[doc.readings, "lectura"], [doc.exercises, "ejercicio"], [doc.assessments, "evaluación"]] as const;
    const sections = missing.filter(([items]) => !items.some((item) => item.objectiveIds.includes(objective.id))).map(([, label]) => label);
    return sections.length ? [`${objective.description || "Objetivo sin descripción"}: falta ${sections.join(", ")}.`] : [];
  });
}
const sections = ["concepts", "objectives", "readings", "exercises", "assessments", "prerequisites"] as const;
const labels = { concepts: "Conceptos", objectives: "Objetivos", readings: "Lecturas", exercises: "Ejercicios", assessments: "Evaluaciones editoriales", prerequisites: "Prerrequisitos" };
/** Compara por identidad, no por índice; conserva los valores para revisar también texto y referencias. */
export function revisionDiff(before: Document | null, after: Document) {
  const changes: { section: string; kind: "Añadido" | "Quitado" | "Modificado"; before?: unknown; after?: unknown }[] = [];
  for (const key of ["title", "kind", "readingProvenance"] as const) if (JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after[key] ?? null)) changes.push({ section: key === "title" ? "Título" : key === "kind" ? "Tipo" : "Procedencia", kind: before ? "Modificado" : "Añadido", before: before?.[key], after: after[key] });
  for (const section of sections) {
    const identity = (item: Document[typeof section][number]) => "id" in item ? item.id : `${item.conceptId}:${item.requiresConceptId}`;
    const previous = new Map((before?.[section] ?? []).map((item) => [identity(item), item]));
    const next = new Map(after[section].map((item) => [identity(item), item]));
    for (const [id, item] of previous) if (!next.has(id)) changes.push({ section: labels[section], kind: "Quitado", before: item });
    for (const [id, item] of next) if (JSON.stringify(previous.get(id)) !== JSON.stringify(item)) changes.push({ section: labels[section], kind: previous.has(id) ? "Modificado" : "Añadido", before: previous.get(id), after: item });
  }
  return changes;
}
/** `revisionId` es la revisión cabeza sobre la que se basa el borrador; decide si la versión actual sigue siendo válida. */
export interface UnitDraft { document: Document; topicId: string; version: number | null; revisionId?: string | null }
const draftKey = (owner: string, id: string) => `aiteacher.autoria.${owner}.${id}`;
export function readUnitDraft(owner: string, id: string): UnitDraft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(draftKey(owner, id)) ?? "null") as UnitDraft | null;
    return value && typeof value.topicId === "string" && typeof value.document.title === "string" && sections.every((key) => Array.isArray(value.document[key])) ? value : null;
  } catch { return null; }
}
export function writeUnitDraft(owner: string, id: string, value: UnitDraft | null) {
  try { if (value) sessionStorage.setItem(draftKey(owner, id), JSON.stringify(value)); else sessionStorage.removeItem(draftKey(owner, id)); } catch { /* El editor sigue disponible sin almacenamiento. */ }
}
