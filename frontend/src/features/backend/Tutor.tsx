import { lazy, Suspense, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TutorMarkdown } from "../tutor/TutorMarkdown";
import { backend, result, required, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";
import { ConceptMap } from "./ConceptMap";
const VoiceSessionDialog = lazy(() => import("../voice/VoiceSessionDialog").then((module) => ({ default: module.VoiceSessionDialog })));

export function Tutor({ unit, mode, activityId }: { unit: Schema["UnitResponse"]; mode: "chat" | "reading" | "practice"; activityId?: string }) {
  const queries = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [offset, setOffset] = useState(0);
  const [listOffset, setListOffset] = useState(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const request = useRef<Schema["CreateTutorTurn"] | null>(null);
  const voice = useQuery({ queryKey: ["voice-availability"], queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/voice", { signal })) });
  const conversations = useQuery({ queryKey: ["conversations", listOffset], queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/conversations", { signal, params: { query: { offset: listOffset, limit: 20 } } })) });
  const conversation = useQuery({ queryKey: ["conversation", id], enabled: Boolean(id), queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/conversations/{id}", { signal, params: { path: { id: required(id) } } })) });
  const messages = useQuery({ queryKey: ["messages", id, offset], enabled: Boolean(id), queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/conversations/{id}/messages", { signal, params: { path: { id: required(id) }, query: { offset, limit: 20 } } })) });
  const start = useMutation({ mutationFn: async () => result(await backend.POST("/api/tutor/conversations", { body: { unitId: unit.id, mode, activityId } })),
    onSuccess: (value) => { setId(value.id); request.current = null; setOffset(0); void queries.invalidateQueries({ queryKey: ["conversations"] }); } });
  const send = useMutation({ mutationFn: async (body: Schema["CreateTutorTurn"]) => result(await backend.POST("/api/tutor/conversations/{id}/turns", { params: { path: { id: required(id) } }, body })),
    onSuccess: () => {
      request.current = null; setText("");
      const total = (messages.data?.total ?? 0) + 2;
      setOffset(Math.floor(Math.max(0, total - 1) / 20) * 20);
      void queries.invalidateQueries({ queryKey: ["messages", id] });
      void queries.invalidateQueries({ queryKey: ["conversation", id] });
    } });
  const save = useMutation({ mutationFn: async (messageId: string | null) => result(await backend.POST("/api/tutor/notes", {
    body: messageId ? { kind: "savedMessage", conversationId: id, messageId } : { kind: "summary", conversationId: id },
  })), onSuccess: () => { void queries.invalidateQueries({ queryKey: ["notes"] }); } });
  const submit = () => {
    if (!conversation.data || !text.trim()) return;
    request.current ??= { requestId: crypto.randomUUID(), version: conversation.data.version, text };
    send.mutate(request.current);
  };
  return <section className="backend-panel" aria-label="Conversación educativa">
    <div className="backend-actions"><button type="button" disabled={start.isPending || send.isPending} onClick={() => start.mutate()}>Nueva conversación</button>
      {conversations.data ? <Field title="Retomar una conversación"><select value={id ?? ""} disabled={send.isPending} onChange={(event) => {
        setId(event.target.value || null); setOffset(0); request.current = null; send.reset();
      }}><option value="">Selecciona una conversación</option>{conversations.data.items.filter((item) => item.unitId === unit.id && item.revisionId === unit.revision.id).map((item) =>
        <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.mode}</option>)}</select></Field> : null}</div>
    {conversations.data ? <Pages offset={listOffset} total={conversations.data.total} change={setListOffset} /> : null}
    {start.isError ? <Failure error={start.error} /> : null}
    {conversations.isError ? <Failure error={conversations.error} retry={() => void conversations.refetch()} /> : null}
    {id ? <>
      {voice.data?.enabled ? <div className="backend-actions"><button type="button" disabled={send.isPending} onClick={() => setVoiceOpen(true)}>Conversar por voz</button><p>La voz no guarda mensajes ni acredita progreso. Al reconectar se retoma el contexto de la actividad.</p></div> : null}
      {voiceOpen ? <Suspense fallback={<Busy />}><VoiceSessionDialog activeSessionId={id} studentId="" endpoint={`/api/tutor/conversations/${id}/voice`}
        onClose={() => setVoiceOpen(false)} onFallback={() => setVoiceOpen(false)} /></Suspense> : null}
      {conversation.isError ? <Failure error={conversation.error} retry={() => void conversation.refetch()} /> : null}
      {messages.isPending ? <Busy /> : messages.isError ? <Failure error={messages.error} retry={() => void messages.refetch()} /> : <>
        {messages.data.items.map((item) => <article className="backend-panel" key={item.id} id={`message-${item.id}`}><h3>{item.role === "user" ? "Tú" : "Tutor"}</h3>
          <TutorMarkdown>{item.text}</TutorMarkdown>{item.sources.map((source) => <details key={source.id}><summary>Fuente: {source.title}</summary><p>{source.excerpt}</p><p>{source.source}</p></details>)}
          <button type="button" disabled={save.isPending} onClick={() => save.mutate(item.id)}>Guardar mensaje en apuntes</button></article>)}
        <Pages offset={offset} total={messages.data.total} change={setOffset} />
      </>}
      <form onSubmit={(event) => { event.preventDefault(); submit(); }}><Field title="Tu mensaje"><textarea required maxLength={4000} value={text}
        disabled={send.isPending || send.isError} onChange={(event) => setText(event.target.value)} /></Field>
        <button type="submit" disabled={!conversation.data || send.isPending || send.isError || !text.trim()}>{send.isPending ? "Preparando respuesta…" : "Enviar"}</button></form>
      {send.isError ? <Failure error={send.error} retry={submit} /> : null}
      {send.isPending ? <p role="status">El tutor está preparando tu respuesta.</p> : null}
      <button type="button" disabled={save.isPending || send.isPending} onClick={() => save.mutate(null)}>Guardar resumen de la conversación</button>
      {save.isSuccess ? <p role="status">Apunte guardado.</p> : save.isError ? <Failure error={save.error} /> : null}
      <ConceptMap topicId={unit.topicId} conversationId={id} messages={messages.data?.items ?? []} />
    </> : <p>Abre una conversación para explorar esta actividad con el tutor.</p>}
  </section>;
}
