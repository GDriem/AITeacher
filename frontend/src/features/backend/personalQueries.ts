import { useQuery } from "@tanstack/react-query";
import { backend, required, result, type Schema } from "./client";

/** Recorre todas las páginas: las listas pueden incluir actividad antigua antes de la pendiente. */
async function allPages<T>(read: (offset: number) => Promise<{ items: T[]; total: number }>) {
  const items: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await read(offset);
    items.push(...page.items);
    if (offset + page.items.length >= page.total || page.items.length === 0) return items;
  }
}
export function usePersonalConversations() {
  return useQuery({ queryKey: ["conversations", "all"], queryFn: ({ signal }) => allPages((offset) =>
    backend.GET("/api/tutor/conversations", { signal, params: { query: { offset, limit: 100 } } }).then(result)) });
}
export function usePersonalAttempts() {
  return useQuery({ queryKey: ["attempts", "all"], queryFn: ({ signal }) => allPages((offset) =>
    backend.GET("/api/assessments/attempts", { signal, params: { query: { offset, limit: 100 } } }).then(result)) });
}
export function usePersonalReviews() {
  return useQuery({ queryKey: ["reviews", "all"], queryFn: ({ signal }) => allPages((offset) =>
    backend.GET("/api/learning/reviews", { signal, params: { query: { offset, limit: 100 } } }).then(result)) });
}
export function useAttemptUnit(definitionId: string | undefined) {
  return useQuery({ queryKey: ["definitions", "all"], enabled: Boolean(definitionId),
    queryFn: ({ signal }) => allPages((offset) => backend.GET("/api/assessments/definitions", { signal, params: { query: { offset, limit: 100 } } }).then(result)),
    select: (items) => required(items.find((item) => item.id === definitionId)) });
}
export function conversationPath(item: Schema["TutorConversation"]) {
  return `/unidades/${encodeURIComponent(item.unitId)}/tutor/${encodeURIComponent(item.id)}`;
}
export const attemptPath = (id: string) => `/evaluaciones/${encodeURIComponent(id)}`;
export const conversationLabel = (item: Schema["TutorConversation"]) => item.mode === "reading" ? "Consulta de lectura" : item.mode === "practice" ? "Práctica con el tutor" : "Conversación con el tutor";
