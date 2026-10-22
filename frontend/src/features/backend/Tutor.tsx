import { lazy, Suspense, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { TutorMarkdown } from "../tutor/TutorMarkdown";
import { backend, result, required, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";
import { ConceptMap } from "./ConceptMap";
import { Button, EmptyState, buttonClass } from "../../ui";
import shared from "./Shared.module.css";
import { panel } from "./panel";
import { tutorPath, useTutorConversation } from "./unitQueries";
const VoiceSessionDialog = lazy(() => import("../voice/VoiceSessionDialog").then((module) => ({ default: module.VoiceSessionDialog })));

/**
 * Conversación educativa de una unidad. La conversación abierta la decide quien
 * monta el componente (la URL en producción) y debe remontarlo con otra `key`
 * al cambiarla, para no arrastrar solicitudes en memoria de otra conversación.
 */
export function Tutor({ unit, mode, activityId, conversationId, openConversation }: {
  unit: Schema["UnitResponse"]; mode: "chat" | "reading" | "practice"; activityId?: string;
  conversationId: string | null; openConversation: (id: string | null) => void;
}) {
  const queries = useQueryClient();
  const id = conversationId;
  const [text, setText] = useState("");
  const [offset, setOffset] = useState(0);
  const [listOffset, setListOffset] = useState(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Elegir en el select no navega: con flechas, cada `change` abriría otra conversación y movería el foco.
  const [selected, setSelected] = useState(id ?? "");
  const request = useRef<Schema["CreateTutorTurn"] | null>(null);
  const voice = useQuery({ queryKey: ["voice-availability"], queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/voice", { signal })) });
  const conversations = useQuery({ queryKey: ["conversations", listOffset], queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/conversations", { signal, params: { query: { offset: listOffset, limit: 20 } } })) });
  const conversation = useTutorConversation(id);
  const pending = useQuery({ queryKey: ["pending-turn", id], enabled: Boolean(id), queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/conversations/{id}/pending-turn", { signal, params: { path: { id: required(id) } } })) });
  const messages = useQuery({ queryKey: ["messages", id, offset], enabled: Boolean(id), queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/conversations/{id}/messages", { signal, params: { path: { id: required(id) }, query: { offset, limit: 20 } } })) });
  const start = useMutation({ mutationFn: async () => result(await backend.POST("/api/tutor/conversations", { body: { unitId: unit.id, mode, activityId } })),
    onSuccess: (value) => { request.current = null; send.reset(); setOffset(0); void queries.invalidateQueries({ queryKey: ["conversations"] }); openConversation(value.id); } });
  const send = useMutation({ mutationFn: async (body: Schema["CreateTutorTurn"]) => result(await backend.POST("/api/tutor/conversations/{id}/turns", { params: { path: { id: required(id) } }, body })),
    onSuccess: () => {
      request.current = null; setText("");
      const total = (messages.data?.total ?? 0) + 2;
      setOffset(Math.floor(Math.max(0, total - 1) / 20) * 20);
      void queries.invalidateQueries({ queryKey: ["messages", id] });
      void queries.invalidateQueries({ queryKey: ["conversation", id] });
    }, onSettled: () => {
      void queries.invalidateQueries({ queryKey: ["pending-turn", id] });
      void queries.invalidateQueries({ queryKey: ["conversation", id] });
    } });
  const save = useMutation({ mutationFn: async (messageId: string | null) => result(await backend.POST("/api/tutor/notes", {
    body: messageId ? { kind: "savedMessage", conversationId: id, messageId } : { kind: "summary", conversationId: id },
  })), onSuccess: () => { void queries.invalidateQueries({ queryKey: ["notes"] }); } });
  const submit = () => {
    const original = request.current ?? pending.data?.request;
    if (original) { request.current = original; send.mutate(original); return; }
    if (!conversation.data || !text.trim() || pending.isPending || pending.isError || conversation.data.activeTurnId) return;
    request.current ??= { requestId: crypto.randomUUID(), version: conversation.data.version, text };
    send.mutate(request.current);
  };
  return <section className={panel} aria-label="Conversación educativa">
    <div className={shared.actions}><Button disabled={start.isPending || send.isPending} onClick={() => start.mutate()}>Nueva conversación</Button>
      {conversations.data ? <Field title="Retomar una conversación"><select value={selected} disabled={send.isPending} onChange={(event) => setSelected(event.target.value)}><option value="">Selecciona una conversación</option>{conversations.data.items.filter((item) => item.unitId === unit.id && item.revisionId === unit.revision.id).map((item) =>
        <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.mode}</option>)}</select></Field> : null}
      {conversations.data ? <Button disabled={!selected || selected === id || send.isPending} onClick={() => openConversation(selected)}>Abrir conversación seleccionada</Button> : null}</div>
    {conversations.data ? <Pages offset={listOffset} total={conversations.data.total} change={setListOffset} /> : null}
    {start.isError ? <Failure error={start.error} /> : null}
    {conversations.isError ? <Failure error={conversations.error} retry={() => void conversations.refetch()} /> : null}
    {id && conversation.isPending ? <Busy />
    : id && conversation.isError ? <Failure error={conversation.error} retry={() => void conversation.refetch()} />
    // El id llega de la URL: un enlace editado o de otra unidad no debe mostrar sus mensajes bajo esta unidad.
    : id && conversation.data && conversation.data.unitId !== unit.id
      ? <EmptyState title="Esta conversación pertenece a otra unidad" description="El enlace abre una conversación que no corresponde a esta unidad."
        action={<Link className={buttonClass("primary")} to={tutorPath(conversation.data.unitId, conversation.data.mode, conversation.data.activityId ?? undefined, conversation.data.id)}>Ir a la unidad de la conversación</Link>} />
    : id ? <>
      {conversation.data && conversation.data.revisionId !== unit.revision.id ? <p role="status">Esta conversación se inició con una publicación anterior de la unidad; el material puede haber cambiado.</p> : null}
      {voice.data?.enabled && conversation.data ? <div className={shared.actions}><Button disabled={send.isPending} onClick={() => setVoiceOpen(true)}>Conversar por voz</Button><p>La voz no guarda mensajes ni acredita progreso. Al reconectar se retoma el contexto de la actividad.</p></div> : null}
      {voiceOpen ? <Suspense fallback={<Busy />}><VoiceSessionDialog activeSessionId={id} studentId="" endpoint={`/api/tutor/conversations/${encodeURIComponent(id)}/voice`}
        onClose={() => setVoiceOpen(false)} onFallback={() => setVoiceOpen(false)} /></Suspense> : null}
      {messages.isPending ? <Busy /> : messages.isError ? <Failure error={messages.error} retry={() => void messages.refetch()} /> : <>
        {messages.data.items.map((item) => <article className={panel} key={item.id} id={`message-${item.id}`}><h3>{item.role === "user" ? "Tú" : "Tutor"}</h3>
          <TutorMarkdown>{item.text}</TutorMarkdown>{item.sources.map((source) => <details key={source.id}><summary>Fuente: {source.title}</summary><p>{source.excerpt}</p><p>{source.source}</p></details>)}
          <Button disabled={save.isPending} onClick={() => save.mutate(item.id)}>Guardar mensaje en apuntes</Button></article>)}
        <Pages offset={offset} total={messages.data.total} change={setOffset} />
      </>}
      <form onSubmit={(event) => { event.preventDefault(); submit(); }}><Field title="Tu mensaje"><textarea required maxLength={4000} value={text}
        disabled={send.isPending || send.isError || pending.isPending || pending.isError || Boolean(pending.data.request) || Boolean(conversation.data?.activeTurnId)} onChange={(event) => setText(event.target.value)} /></Field>
        <Button type="submit" variant="primary" disabled={!conversation.data || send.isPending || send.isError || pending.isPending || pending.isError || Boolean(pending.data.request) || Boolean(conversation.data.activeTurnId) || !text.trim()}>{send.isPending ? "Preparando respuesta…" : "Enviar"}</Button></form>
      {pending.isError ? <Failure error={pending.error} retry={() => void pending.refetch()} /> : null}
      {pending.data?.request ? <div role="status"><p>Hay un mensaje pendiente: {pending.data.request.text}</p>
        <p>Si la solicitud anterior se interrumpió, puedes recuperarla. Si sigue activa, espera a que venza su reserva y reintenta.</p>
        <Button disabled={send.isPending} onClick={submit}>Recuperar mensaje pendiente</Button></div> : null}
      {send.isError ? <Failure error={send.error} retry={submit} /> : null}
      {send.isPending ? <p role="status">El tutor está preparando tu respuesta.</p> : null}
      <Button disabled={save.isPending || send.isPending} onClick={() => save.mutate(null)}>Guardar resumen de la conversación</Button>
      {save.isSuccess ? <p role="status">Apunte guardado.</p> : save.isError ? <Failure error={save.error} /> : null}
      <ConceptMap topicId={unit.topicId} conversationId={id} messages={messages.data?.items ?? []} />
    </> : <p>Abre una conversación para explorar esta actividad con el tutor.</p>}
  </section>;
}
