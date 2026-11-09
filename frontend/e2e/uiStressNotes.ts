import type { components } from "../src/api/generated/backend-schema";

// Synthetic API fixtures only; no production switch or customer data.
// Notes accept 1–12000 characters (TutorService / ck_note_text).
const texts = [
  "J",
  "Apuntes de María José de la Cruz y Fernández · 王秀英 · 👩🏽‍💻\n\nContacto: bartholomew.fitzgerald@northwind-industries-holdings.example.com",
  "# Comparación de métodos\n\n| Método | Observación |\n| --- | --- |\n| Recuperación espaciada | https://example.org/materiales/neurociencia/aprendizaje/recuperacion-espaciada?actividad=comparacion-de-resultados |\n\n```text\nhttps://example.org/materiales/neurociencia/aprendizaje/recuperacion-espaciada?actividad=comparacion-de-resultados\n```",
  ("La recuperación espaciada permite comparar lo que recordamos antes y después de revisar un ejemplo.\n\n".repeat(130)).slice(0, 12000),
];

export const noteCases = { demo: 2, empty: 0, one: 1, boundary: 21, many: 1000 } as const;
export type NoteCase = keyof typeof noteCases;

export function stressNotes(state: NoteCase, offset: number): components["schemas"]["TutorNotePage"] {
  const total = noteCases[state];
  const items: components["schemas"]["TutorNote"][] = Array.from({ length: Math.min(20, Math.max(0, total - offset)) }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(offset + index + 1).padStart(12, "0")}`,
    kind: "student", text: state === "demo" ? "Una idea para revisar mañana." : texts[(offset + index) % texts.length] ?? "J",
    version: 1, createdAt: "2026-11-08T10:00:00Z", updatedAt: "2026-11-08T10:00:00Z",
    conversationId: null, messageId: null, origin: {},
  }));
  return { items, total, offset, limit: 20 };
}
