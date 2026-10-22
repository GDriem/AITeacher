import { useQuery } from "@tanstack/react-query";
import { backend, required, result } from "./client";

/** Unidad tal como la estudia el alumno: siempre la publicación activa, nunca un borrador más nuevo. */
export function useStudyUnit(unitId: string) {
  return useQuery({ queryKey: ["unit", unitId], queryFn: async ({ signal }) => {
    let value = result(await backend.GET("/api/units/{unitId}", { params: { path: { unitId } }, signal }));
    // Authors can have a newer draft. Learning always uses the active publication.
    if (value.publishedRevisionId && value.revision.id !== value.publishedRevisionId)
      value = result(await backend.GET("/api/units/{unitId}/revisions/{revisionId}", { params: { path: { unitId: value.id, revisionId: value.publishedRevisionId } }, signal }));
    return value;
  } });
}

export function useTutorAvailability() {
  return useQuery({ queryKey: ["tutor-availability"], queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/availability", { signal })) });
}

/** Conversación del tutor; la comparten la ruta (modo del encabezado) y el panel del tutor. */
export function useTutorConversation(id: string | null) {
  return useQuery({ queryKey: ["conversation", id], enabled: Boolean(id), queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/conversations/{id}", { signal, params: { path: { id: required(id) } } })) });
}

export type TutorMode = "chat" | "reading" | "practice";

/** Ruta del tutor de una unidad; el modo y la actividad viajan en la consulta para sobrevivir a la recarga. */
export function tutorPath(unitId: string, mode: TutorMode = "chat", activityId?: string, conversationId?: string) {
  const query = new URLSearchParams();
  if (mode !== "chat") query.set("modo", mode);
  if (activityId) query.set("actividad", activityId);
  const search = query.size ? `?${query.toString()}` : "";
  return `/unidades/${encodeURIComponent(unitId)}/tutor${conversationId ? `/${encodeURIComponent(conversationId)}` : ""}${search}`;
}

/** Vuelve al catálogo con los filtros que el alumno tenía al abrir la unidad. */
export function catalogPath(state: unknown) {
  const search = typeof state === "object" && state !== null && "catalogSearch" in state && typeof state.catalogSearch === "string" ? state.catalogSearch : "";
  return `/catalogo${search}`;
}
