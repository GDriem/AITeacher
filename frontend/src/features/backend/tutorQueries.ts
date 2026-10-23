import { useInfiniteQuery, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { backend, required, result, type Schema } from "./client";

const size = 20;
type MessagePage = Schema["TutorMessagePage"];
/** Ventana de mensajes; null pide la más reciente, que es por donde se abre una conversación. */
type Window = { offset: number; limit: number } | null;
export type MessageHistory = InfiniteData<MessagePage, Window>;

export const messagesKey = (id: string | null) => ["messages", id];

/**
 * Historial de una conversación, de los mensajes más recientes hacia atrás. Solo
 * cambia con los turnos de este alumno, que se añaden al final con
 * `appendTurn`: volver a pedirlo desplazaría las ventanas ya cargadas.
 */
export function useTutorMessages(id: string | null) {
  return useInfiniteQuery({
    queryKey: messagesKey(id), enabled: Boolean(id), staleTime: Infinity, initialPageParam: null as Window,
    queryFn: async ({ pageParam, signal }) => {
      const read = async (offset: number, limit: number) => result(await backend.GET("/api/tutor/conversations/{id}/messages", { signal, params: { path: { id: required(id) }, query: { offset, limit } } }));
      if (pageParam) return read(pageParam.offset, pageParam.limit);
      // La API pagina desde el primer mensaje: el total dice dónde empieza la última ventana.
      const first = await read(0, size);
      return first.total > size ? read(first.total - size, size) : first;
    },
    getPreviousPageParam: (first): Window | undefined => first.offset > 0 ? { offset: Math.max(0, first.offset - size), limit: Math.min(size, first.offset) } : undefined,
    getNextPageParam: (): Window | undefined => undefined,
  });
}

/**
 * Añade al historial en caché los mensajes de un turno confirmado, sin duplicar
 * los de un reintento. Las secuencias de una conversación son contiguas (cada
 * turno ocupa `2 · versión` y `2 · versión + 1`): si el turno no sigue al último
 * mensaje conocido, hubo turnos desde otra pestaña o dispositivo y el historial
 * se vuelve a abrir en la ventana más reciente.
 */
export function appendTurn(queries: QueryClient, id: string, turn: Schema["TutorTurnResult"]) {
  const history = queries.getQueryData<MessageHistory>(messagesKey(id));
  const known = new Set(history?.pages.flatMap((page) => page.items.map((item) => item.id)));
  const added = turn.messages.filter((item) => !known.has(item.id)).sort((a, b) => a.sequence - b.sequence);
  const last = history?.pages.at(-1)?.items.at(-1);
  // `reset` y no `invalidate`: un refetch partiría de la ventana más antigua cargada y no sabría avanzar hasta el final.
  if (!history || !last || (added[0] && added[0].sequence !== last.sequence + 1)) { void queries.resetQueries({ queryKey: messagesKey(id) }); return; }
  queries.setQueryData<MessageHistory>(messagesKey(id), {
    ...history,
    pages: history.pages.map((page, index, pages) => ({ ...page, total: page.total + added.length, items: index === pages.length - 1 ? [...page.items, ...added] : page.items })),
  });
}

/** Conversaciones del alumno, de la más reciente a la más antigua; la API no filtra por unidad. */
export function useConversations() {
  return useInfiniteQuery({
    queryKey: ["conversations"], initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => result(await backend.GET("/api/tutor/conversations", { signal, params: { query: { offset: pageParam, limit: 100 } } })),
    getNextPageParam: (last) => last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined,
  });
}

/** Título legible de una conversación según la actividad de la unidad con la que se abrió. */
export function conversationTitle(unit: Schema["UnitResponse"], conversation: Pick<Schema["TutorConversation"], "mode" | "activityId">) {
  const document = unit.revision.document;
  if (conversation.mode === "reading")
    return `Lectura: ${document.readings.find((item) => item.id === conversation.activityId)?.title ?? "lectura de la unidad"}`;
  if (conversation.mode === "practice") {
    const index = document.exercises.findIndex((item) => item.id === conversation.activityId);
    return `Práctica: ${index >= 0 ? `Ejercicio ${String(index + 1)}` : "ejercicio de la unidad"}`;
  }
  return "Conversación libre";
}
