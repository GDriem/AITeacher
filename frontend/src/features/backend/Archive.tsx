import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TutorMarkdown } from "../tutor/TutorMarkdown";
import { backend, result, required } from "./client";
import { Busy, Failure, Pages } from "./Shared";

export function Archive({ startNew }: { startNew: () => void }) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [messageOffset, setMessageOffset] = useState(0);
  const [progressOffset, setProgressOffset] = useState(0);
  const conversations = useQuery({ queryKey: ["history", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/history/conversations", { signal, params: { query: { offset, limit: 20 } } })) });
  const progress = useQuery({ queryKey: ["legacy-progress", progressOffset], queryFn: async ({ signal }) => result(await backend.GET("/api/history/progress", { signal, params: { query: { offset: progressOffset, limit: 20 } } })) });
  const messages = useQuery({ queryKey: ["history-messages", selected, messageOffset], enabled: Boolean(selected), queryFn: async ({ signal }) => result(await backend.GET("/api/history/conversations/{id}/messages", { signal, params: { path: { id: required(selected) }, query: { offset: messageOffset, limit: 20 } } })) });
  return <section><h1>Tu historial</h1><p>Conversaciones y resultados conservados de la versión anterior. Puedes consultarlos; las actividades antiguas no se reanudan automáticamente.</p>
    <p>Para continuar aprendiendo, elige una unidad publicada. Comenzarás una actividad nueva; las respuestas y notas antiguas se conservan en este historial.</p>
    <button type="button" onClick={startNew}>Elegir una unidad para continuar</button>
    {conversations.isPending ? <Busy /> : conversations.isError ? <Failure error={conversations.error} retry={() => void conversations.refetch()} /> : <>
      {conversations.data.items.length === 0 ? <p>No hay conversaciones históricas importadas para tu cuenta.</p> : <ul>{conversations.data.items.map((item) => <li key={item.id}>
        <button type="button" aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setMessageOffset(0); }}>{item.title} · {item.messageCount} mensajes</button></li>)}</ul>}
      <Pages offset={offset} total={conversations.data.total} change={setOffset} /></>}
    {selected ? <section aria-label="Mensajes históricos">{messages.isPending ? <Busy /> : messages.isError ? <Failure error={messages.error} retry={() => void messages.refetch()} /> : <>
      {messages.data.items.map((item) => <article className="backend-panel" key={item.id}><h2>{item.role === "user" ? "Tú" : "Tutor"}</h2><TutorMarkdown>{item.content}</TutorMarkdown></article>)}
      <Pages offset={messageOffset} total={messages.data.total} change={setMessageOffset} /></>}</section> : null}
    <h2>Progreso histórico</h2><p>Estos resultados no acreditan dominio calibrado en la beta.</p>
    {progress.isPending ? <Busy /> : progress.isError ? <Failure error={progress.error} retry={() => void progress.refetch()} /> : <>
      {progress.data.items.length === 0 ? <p>No hay resultados históricos importados.</p> : progress.data.items.map((item) => {
        const assessments = item.payload.assessments;
        const topics = item.payload.studied_topics;
        return <article className="backend-panel" key={item.id}><h3>Registro anterior</h3><p>{Array.isArray(assessments) ? assessments.length : 0} evaluaciones conservadas.</p>
          {Array.isArray(topics) ? <ul>{topics.filter((topic): topic is string => typeof topic === "string").map((topic) => <li key={topic}>{topic}</li>)}</ul> : null}</article>;
      })}<Pages offset={progressOffset} total={progress.data.total} change={setProgressOffset} /></>}
  </section>;
}
