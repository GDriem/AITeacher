import { lazy, Suspense, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { TutorMarkdown } from "../tutor/TutorMarkdown";
import { backend, result, required, type Schema } from "./client";
import { Busy, Failure } from "./Shared";
import { ConceptMap } from "./ConceptMap";
import { Button, EmptyState, buttonClass } from "../../ui";
import { TutorConversations } from "./TutorConversations";
import { tutorPath, useTutorConversation } from "./unitQueries";
import { appendTurn, conversationTitle, useTutorMessages } from "./tutorQueries";
import styles from "./Tutor.module.css";
const VoiceSessionDialog = lazy(() => import("../voice/VoiceSessionDialog").then((module) => ({ default: module.VoiceSessionDialog })));

const time = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Espacio del tutor de una unidad: conversaciones de la unidad, chat y mapa de
 * conceptos. La conversación abierta la decide quien monta el componente (la URL
 * en producción) y debe remontarlo con otra `key` al cambiarla, para no
 * arrastrar solicitudes en memoria de otra conversación.
 */
export function Tutor({ unit, mode, activityId, conversationId, openConversation }: {
  unit: Schema["UnitResponse"]; mode: "chat" | "reading" | "practice"; activityId?: string;
  conversationId: string | null; openConversation: (id: string | null) => void;
}) {
  const queries = useQueryClient();
  const id = conversationId;
  const [text, setText] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const request = useRef<Schema["CreateTutorTurn"] | null>(null);
  const voice = useQuery({ queryKey: ["voice-availability"], queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/voice", { signal })) });
  const conversation = useTutorConversation(id);
  const pending = useQuery({ queryKey: ["pending-turn", id], enabled: Boolean(id), queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/conversations/{id}/pending-turn", { signal, params: { path: { id: required(id) } } })) });
  const messages = useTutorMessages(id);
  const start = useMutation({ mutationFn: async () => result(await backend.POST("/api/tutor/conversations", { body: { unitId: unit.id, mode, activityId } })),
    onSuccess: (value) => { request.current = null; send.reset(); void queries.invalidateQueries({ queryKey: ["conversations"] }); openConversation(value.id); } });
  const send = useMutation({ mutationFn: async (body: Schema["CreateTutorTurn"]) => result(await backend.POST("/api/tutor/conversations/{id}/turns", { params: { path: { id: required(id) } }, body })),
    onSuccess: (turn) => {
      request.current = null; setText("");
      appendTurn(queries, required(id), turn);
    }, onSettled: () => {
      void queries.invalidateQueries({ queryKey: ["pending-turn", id] });
      void queries.invalidateQueries({ queryKey: ["conversation", id] });
    } });
  const save = useMutation({ mutationFn: async (messageId: string | null) => result(await backend.POST("/api/tutor/notes", {
    body: messageId ? { kind: "savedMessage", conversationId: id, messageId } : { kind: "summary", conversationId: id },
  })), onSuccess: (_, messageId) => {
    if (messageId) setSaved((previous) => [...previous, messageId]);
    void queries.invalidateQueries({ queryKey: ["notes"] });
  } });
  const items = messages.data?.pages.flatMap((page) => page.items) ?? [];
  const confirmed = id && conversation.data?.unitId === unit.id ? conversation.data : null;
  // El historial puede llegar antes que la conversación: el salto al final espera a que el chat esté montado.
  const { end, ready, keep, follow } = useChatScroll(messages.isSuccess && Boolean(confirmed), `${items.at(-1)?.id ?? ""}:${String(send.isPending)}`, items[0]?.id);
  const top = useRef<HTMLDivElement>(null);
  const { hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage } = messages;
  const earlier = () => { keep(); void fetchPreviousPage(); };
  // Subir hasta el principio del historial carga la ventana anterior, sin botones de paginación.
  useEffect(() => {
    const node = top.current;
    if (!node || !ready || !hasPreviousPage || isFetchingPreviousPage || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { keep(); void fetchPreviousPage(); } });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready, keep, hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage]);

  const blocked = !conversation.data || send.isPending || send.isError || pending.isPending || pending.isError || Boolean(pending.data.request) || Boolean(conversation.data.activeTurnId);
  const submit = () => {
    const original = request.current ?? pending.data?.request;
    follow();
    if (original) { request.current = original; send.mutate(original); return; }
    if (!conversation.data || !text.trim() || blocked) return;
    request.current ??= { requestId: crypto.randomUUID(), version: conversation.data.version, text };
    send.mutate(request.current);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  };
  return <div className={[styles.workspace, mapOpen && confirmed ? styles.withMap : null].filter(Boolean).join(" ")}>
    <TutorConversations unit={unit} current={id} busy={send.isPending} starting={start.isPending} start={() => start.mutate()} open={(next) => { if (next !== id) openConversation(next); }} />
    <section className={styles.chat} aria-label="Conversación educativa">
      {start.isError ? <Failure error={start.error} /> : null}
      {!id ? <EmptyState title="Elige o inicia una conversación" description={<>Retoma una conversación de la lista o empieza una nueva: tendrá el contexto de «{conversationTitle(unit, { mode, activityId: activityId ?? null })}».</>} />
      : conversation.isPending ? <Busy />
      : conversation.isError ? <Failure error={conversation.error} retry={() => void conversation.refetch()} />
      // El id llega de la URL: un enlace editado o de otra unidad no debe mostrar sus mensajes bajo esta unidad.
      : !confirmed ? <EmptyState title="Esta conversación pertenece a otra unidad" description="El enlace abre una conversación que no corresponde a esta unidad."
        action={<Link className={buttonClass("primary")} to={tutorPath(conversation.data.unitId, conversation.data.mode, conversation.data.activityId ?? undefined, conversation.data.id)}>Ir a la unidad de la conversación</Link>} />
      : <>
        <header className={styles.chatHeader}>
          <h2>{conversationTitle(unit, confirmed)}</h2>
          <div className={styles.toolbar}>
            {voice.data?.enabled ? <Button size="sm" disabled={send.isPending} onClick={() => setVoiceOpen(true)}>Conversar por voz</Button> : null}
            <Button size="sm" variant="ghost" disabled={save.isPending || send.isPending} onClick={() => save.mutate(null)}>Guardar resumen de la conversación</Button>
            <Button size="sm" variant="ghost" aria-expanded={mapOpen} aria-controls="tutor-map" onClick={() => setMapOpen((value) => !value)}>Mapa de conceptos</Button>
          </div>
        </header>
        {voice.data?.enabled ? <p className={styles.muted}>La voz no guarda mensajes ni acredita progreso. Al reconectar se retoma el contexto de la actividad.</p> : null}
        {confirmed.revisionId !== unit.revision.id ? <p className={styles.banner} role="status">Esta conversación se inició con una publicación anterior de la unidad; el material puede haber cambiado.</p> : null}
        <p className={styles.notice} role="status">{save.isSuccess ? save.variables ? "Apunte guardado." : "Resumen guardado en apuntes." : ""}</p>
        {save.isError ? <Failure error={save.error} /> : null}
        {voiceOpen ? <Suspense fallback={<Busy />}><VoiceSessionDialog activeSessionId={id} studentId="" endpoint={`/api/tutor/conversations/${encodeURIComponent(id)}/voice`}
          onClose={() => setVoiceOpen(false)} onFallback={() => setVoiceOpen(false)} /></Suspense> : null}
        <div className={styles.feed} aria-busy={send.isPending || isFetchingPreviousPage}>
          {messages.isPending ? <Busy /> : !messages.data ? <Failure error={messages.error} retry={() => void messages.refetch()} /> : <>
            {hasPreviousPage ? <div ref={top} className={styles.earlier}>
              <Button size="sm" variant="ghost" disabled={isFetchingPreviousPage} onClick={earlier}>{isFetchingPreviousPage ? "Cargando mensajes anteriores…" : "Cargar mensajes anteriores"}</Button>
            </div> : null}
            {messages.isFetchPreviousPageError ? <Failure error={messages.error} retry={earlier} /> : null}
            {!items.length && !send.isPending ? <p className={styles.muted}>Pregunta lo que quieras sobre esta actividad: el tutor responde con el material de la unidad.</p> : null}
            <ol className={styles.messages}>
              {items.map((item) => <Message key={item.id} item={item} saved={saved.includes(item.id)} saving={save.isPending && save.variables === item.id}
                save={() => save.mutate(item.id)} disabled={save.isPending || send.isPending} />)}
              {send.isPending ? <>
                <li className={[styles.message, styles.mine].join(" ")}><article><h3 className={styles.author}>Tú</h3><p>{send.variables.text}</p></article></li>
                <li className={styles.message}><div className={styles.typing}><span aria-hidden="true"><i /><i /><i /></span><span role="status">El tutor está preparando tu respuesta.</span></div></li>
              </> : null}
            </ol>
          </>}
        </div>
        <div className={styles.dock}>
          {pending.isError ? <Failure error={pending.error} retry={() => void pending.refetch()} /> : null}
          {pending.data?.request && !send.isPending ? <div className={styles.banner} role="status">
            <p><strong>Tienes un mensaje sin respuesta:</strong> «{pending.data.request.text}»</p>
            <p>Si la solicitud se interrumpió, recupérala. Si sigue activa, espera a que venza su reserva y reintenta.</p>
            <Button size="sm" variant="primary" aria-label="Recuperar mensaje pendiente" onClick={submit}>Recuperar</Button>
          </div> : null}
          {send.isError ? <Failure error={send.error} retry={submit} /> : null}
          <Composer text={text} change={setText} blocked={blocked} pending={send.isPending} submit={submit} keyDown={keyDown} />
        </div>
        <div ref={end} className={styles.end} />
      </>}
    </section>
    {mapOpen && confirmed ? <MapPanel close={() => setMapOpen(false)}>
      <ConceptMap topicId={unit.topicId} conversationId={confirmed.id} messages={items} />
    </MapPanel> : null}
  </div>;
}

function Message({ item, saved, saving, save, disabled }: { item: Schema["TutorMessage"]; saved: boolean; saving: boolean; save: () => void; disabled: boolean }) {
  const mine = item.role === "user";
  return <li className={[styles.message, mine ? styles.mine : null].filter(Boolean).join(" ")} id={`message-${item.id}`}>
    <article>
      <header className={styles.messageHeader}><h3 className={styles.author}>{mine ? "Tú" : "Tutor"}</h3><time dateTime={item.createdAt}>{time.format(new Date(item.createdAt))}</time></header>
      <TutorMarkdown>{item.text}</TutorMarkdown>
      {item.sources.length ? <ul className={styles.sources} aria-label="Fuentes">{item.sources.map((source) => <li key={source.id}>
        <details className={styles.source}><summary>{source.title}</summary><p>{source.excerpt}</p><p className={styles.muted}>{source.source}</p></details>
      </li>)}</ul> : null}
      {mine ? null : <div className={styles.messageActions}>
        <Button size="sm" variant="ghost" disabled={disabled || saved} onClick={save}>{saved ? "Guardado en apuntes" : saving ? "Guardando…" : "Guardar en apuntes"}</Button>
      </div>}
    </article>
  </li>;
}

function Composer({ text, change, blocked, pending, submit, keyDown }: {
  text: string; change: (value: string) => void; blocked: boolean; pending: boolean; submit: () => void; keyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const field = useId();
  return <form className={styles.composer} aria-busy={pending} onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <label htmlFor={field}>Tu mensaje</label>
    <textarea id={field} required rows={2} maxLength={4000} value={text} disabled={blocked} aria-describedby={`${field}-hint`}
      placeholder="Pregunta, pide un ejemplo o explica con tus palabras…" onChange={(event) => change(event.target.value)} onKeyDown={keyDown} />
    <div className={styles.composerFooter}>
      <span id={`${field}-hint`} className={styles.muted}>Ctrl/⌘ + Enter para enviar · {text.length} de 4000</span>
      <Button type="submit" variant="primary" disabled={blocked || !text.trim()}>{pending ? "Preparando respuesta…" : "Enviar"}</Button>
    </div>
  </form>;
}

/** Mapa de conceptos plegable: columna lateral en escritorio y hoja inferior en móvil. Escape lo cierra. */
function MapPanel({ close, children }: { close: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // El foco entra al abrir y vuelve al cerrar: el efecto no debe repetirse en cada render.
  const onEscape = useEffectEvent(close);
  useEffect(() => {
    heading.current?.focus();
    const toggle = document.querySelector<HTMLElement>('[aria-controls="tutor-map"]');
    const node = panel.current;
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onEscape(); };
    node?.addEventListener("keydown", escape);
    // Al cerrar, el foco vuelve al botón que lo abrió.
    return () => { node?.removeEventListener("keydown", escape); toggle?.focus(); };
  }, []);
  return <aside ref={panel} id="tutor-map" className={styles.map} aria-labelledby="tutor-map-title">
    <header className={styles.mapHeader}>
      <h2 id="tutor-map-title" ref={heading} tabIndex={-1}>Mapa de conceptos</h2>
      <Button size="sm" variant="ghost" onClick={close}>Cerrar mapa</Button>
    </header>
    {children}
  </aside>;
}

/**
 * Desplazamiento del chat sobre la ventana: abre en el mensaje más reciente, lo
 * sigue mientras el alumno está al final y conserva la posición al cargar
 * mensajes anteriores. El anclaje nativo del navegador se desactiva para no
 * compensar dos veces.
 */
function useChatScroll(ready: boolean, last: string, first: string | undefined) {
  const end = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const anchor = useRef<number | null>(null);
  const opened = useRef(false);
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflowAnchor;
    root.style.overflowAnchor = "none";
    const track = () => { following.current = root.scrollHeight - window.scrollY - window.innerHeight < 160; };
    window.addEventListener("scroll", track, { passive: true });
    // Contenido que crece después del salto (avisos, la lista plegable, imágenes del texto) no debe sacar al alumno del final.
    const resize = typeof ResizeObserver === "undefined" ? null
      : new ResizeObserver(() => { if (opened.current && following.current) end.current?.scrollIntoView({ block: "end", behavior: "instant" }); });
    resize?.observe(document.body);
    return () => { root.style.overflowAnchor = previous; window.removeEventListener("scroll", track); resize?.disconnect(); };
  }, []);
  useLayoutEffect(() => {
    // Sin `scrollIntoView` (jsdom) tampoco hay desplazamiento que compensar.
    if (anchor.current === null || typeof end.current?.scrollIntoView !== "function") return;
    window.scrollBy({ top: document.documentElement.scrollHeight - anchor.current, behavior: "instant" });
    anchor.current = null;
  }, [first]);
  useLayoutEffect(() => {
    if (!ready || !following.current || typeof end.current?.scrollIntoView !== "function") return;
    // Al abrir se salta al final sin animación ("auto" heredaría el scroll suave global); los mensajes nuevos se siguen con suavidad.
    const smooth = opened.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    end.current.scrollIntoView({ block: "end", behavior: smooth ? "smooth" : "instant" });
    opened.current = true;
  }, [ready, last]);
  // Los efectos corren después de este salto: la carga automática de mensajes anteriores no se dispara al abrir.
  return { end, ready, keep: () => { anchor.current = document.documentElement.scrollHeight; }, follow: () => { following.current = true; } };
}
