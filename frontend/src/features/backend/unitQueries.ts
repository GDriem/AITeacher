import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatalogData } from "./catalogQueries";
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

/** Tema de una unidad, para sus migas. Es una sola lectura: no exige cargar el catálogo completo. */
export function useUnitTopic(topicId: string | undefined) {
  return useQuery({ queryKey: ["catalog-topic", topicId], enabled: Boolean(topicId),
    queryFn: async ({ signal }) => result(await backend.GET("/api/catalog/topics/{id}", { params: { path: { id: topicId ?? "" } }, signal })) });
}

/** Página de un tema; el estado de navegación conserva los filtros del catálogo. */
export function topicPath(topicId: string) { return `/temas/${encodeURIComponent(topicId)}`; }

/** Migas Catálogo › Tema › … de una unidad; el tema no es enlace si todavía se está cargando. */
export function unitCrumbs(state: unknown, topicId: string, topicName: string | undefined) {
  return [{ label: "Catálogo", to: catalogPath(state), state }, { label: topicName ?? "Tema", to: topicName ? topicPath(topicId) : undefined, state }];
}

/** Vuelve al catálogo con los filtros que el alumno tenía al abrir la unidad. */
export function catalogPath(state: unknown) {
  const search = typeof state === "object" && state !== null && "catalogSearch" in state && typeof state.catalogSearch === "string" ? state.catalogSearch : "";
  return `/catalogo${search}`;
}

/** Nombres de los niveles del currículo de origen; solo se piden cuando la unidad es una lectura con nivel. */
export function useSourceLevels(level: string | undefined) {
  const client = useQueryClient();
  // Si el alumno viene del catálogo, sus niveles ya están en caché: no se repite la petición.
  const catalog = () => client.getQueryData<CatalogData>(["curriculum-explorer"]);
  return useQuery({ queryKey: ["source-curriculum"], enabled: Boolean(level), staleTime: Infinity,
    initialData: () => catalog()?.source.levels, initialDataUpdatedAt: () => client.getQueryState(["curriculum-explorer"])?.dataUpdatedAt,
    queryFn: async ({ signal }) => result(await backend.GET("/api/catalog/source-curriculum", { signal })).levels });
}

/** Nivel editorial del tema, cuando el autor le asignó uno. */
export function useCatalogLevel(levelId: string | undefined) {
  return useQuery({ queryKey: ["catalog-level", levelId], enabled: Boolean(levelId),
    queryFn: async ({ signal }) => result(await backend.GET("/api/catalog/levels/{id}", { params: { path: { id: levelId ?? "" } }, signal })) });
}
