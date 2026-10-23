import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { TutorMarkdown } from "../tutor/TutorMarkdown";
import { backend, result, required } from "./client";
import { Busy, Failure, Pages } from "./Shared";
import { Button, Card, EmptyState, PageHeader, buttonClass } from "../../ui";
import styles from "./Archive.module.css";
import { usePersonalUrl } from "./usePersonalUrl";
import { attemptPath, conversationLabel, conversationPath, usePersonalAttempts, usePersonalConversations } from "./personalQueries";
import { attemptLabels } from "./labels";

export function Archive() {
  const url = usePersonalUrl();
  const offset = url.page("pagina");
  const setOffset = (value: number) => url.set("pagina", value);
  const selected = url.search.get("conversacion");
  const messageOffset = url.page("mensajes");
  const setMessageOffset = (value: number) => url.set("mensajes", value);
  const progressOffset = url.page("progreso");
  const setProgressOffset = (value: number) => url.set("progreso", value);
  const tutor = usePersonalConversations();
  const attempts = usePersonalAttempts();
  const tutorOffset = url.page("tutor");
  const attemptOffset = url.page("intentos");
  const conversations = useQuery({ queryKey: ["history", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/history/conversations", { signal, params: { query: { offset, limit: 20 } } })) });
  const progress = useQuery({ queryKey: ["legacy-progress", progressOffset], queryFn: async ({ signal }) => result(await backend.GET("/api/history/progress", { signal, params: { query: { offset: progressOffset, limit: 20 } } })) });
  const messages = useQuery({ queryKey: ["history-messages", selected, messageOffset], enabled: Boolean(selected), queryFn: async ({ signal }) => result(await backend.GET("/api/history/conversations/{id}/messages", { signal, params: { path: { id: required(selected) }, query: { offset: messageOffset, limit: 20 } } })) });
  return <section className={styles.screen}><PageHeader title="Tu historial" description="Tus conversaciones y evaluaciones, junto con el material conservado de la versión anterior." />
    <section aria-labelledby="historial-tutor"><h2 id="historial-tutor">Conversaciones del tutor</h2>
      {tutor.isPending ? <Busy /> : tutor.isError ? <Failure error={tutor.error} retry={() => void tutor.refetch()} /> : tutor.data.length ? <><ul className={styles.list}>{tutor.data.slice(tutorOffset, tutorOffset + 20).map((item) => <li key={item.id}><Card><h3>{conversationLabel(item)}</h3><p>{new Date(item.createdAt).toLocaleString()}</p><Link to={conversationPath(item)}>Abrir conversación del tutor</Link></Card></li>)}</ul><Pages offset={tutorOffset} total={tutor.data.length} change={(value) => url.set("tutor", value)} /></> : <EmptyState headingLevel={3} title="Aún no tienes conversaciones del tutor" description="Abre una unidad y pregunta sobre lo que estás aprendiendo." action={<Link to="/catalogo">Elegir una unidad</Link>} />}
    </section>
    <section aria-labelledby="historial-intentos"><h2 id="historial-intentos">Tus evaluaciones</h2>
      {attempts.isPending ? <Busy /> : attempts.isError ? <Failure error={attempts.error} retry={() => void attempts.refetch()} /> : attempts.data.length ? <><ul className={styles.list}>{attempts.data.slice(attemptOffset, attemptOffset + 20).map((item) => <li key={item.id}><Card><h3>{item.title}</h3><p>{attemptLabels[item.status]}</p><Link to={attemptPath(item.id)}>{item.status === "inProgress" ? "Retomar evaluación" : "Consultar evaluación"}</Link></Card></li>)}</ul><Pages offset={attemptOffset} total={attempts.data.length} change={(value) => url.set("intentos", value)} /></> : <EmptyState headingLevel={3} title="Aún no tienes evaluaciones" description="Encontrarás prácticas y evaluaciones en cada unidad." action={<Link to="/catalogo">Explorar el catálogo</Link>} />}
    </section>
    <h2>Conversaciones importadas</h2><p>Las actividades antiguas se conservan para consulta.</p>
    <p>Para continuar aprendiendo, elige una unidad publicada. Comenzarás una actividad nueva; las respuestas y notas antiguas se conservan en este historial.</p>
    <Link className={buttonClass()} to="/catalogo">Elegir una unidad para continuar</Link>
    {conversations.isPending ? <Busy /> : conversations.isError ? <Failure error={conversations.error} retry={() => void conversations.refetch()} /> : <>
      {conversations.data.items.length === 0 ? <EmptyState headingLevel={3} title="No hay conversaciones históricas importadas para tu cuenta." description="Tus conversaciones nuevas aparecen en la sección del tutor." action={<Link to="/catalogo">Volver al catálogo</Link>} /> : <ul>{conversations.data.items.map((item) => <li key={item.id}>
        <Button aria-pressed={selected === item.id} onClick={() => { url.setSearch((previous) => { const next = new URLSearchParams(previous); next.set("conversacion", item.id); next.delete("mensajes"); return next; }); }}>{item.title} · {item.messageCount} mensajes</Button></li>)}</ul>}
      <Pages offset={offset} total={conversations.data.total} change={setOffset} /></>}
    {selected ? <section aria-label="Mensajes históricos">{messages.isPending ? <Busy /> : messages.isError ? <Failure error={messages.error} retry={() => void messages.refetch()} /> : <>
      {messages.data.items.length === 0 ? <EmptyState headingLevel={3} title="Esta conversación no tiene mensajes" description="Puedes abrir otra conversación de tu historial." action={<Link to="/historial">Volver al historial</Link>} /> : messages.data.items.map((item) => <article className={styles.record} key={item.id}><h3>{item.role === "user" ? "Tú" : "Tutor"}</h3><TutorMarkdown>{item.content}</TutorMarkdown></article>)}
      <Pages offset={messageOffset} total={messages.data.total} change={setMessageOffset} /></>}</section> : null}
    <h2>Progreso histórico</h2><p>Estos resultados no acreditan dominio calibrado en la beta.</p>
    {progress.isPending ? <Busy /> : progress.isError ? <Failure error={progress.error} retry={() => void progress.refetch()} /> : <>
      {progress.data.items.length === 0 ? <EmptyState headingLevel={3} title="No hay resultados históricos importados." description="Puedes consultar tus nuevas entregas en Tus evaluaciones." action={<Link to="/catalogo">Estudiar una unidad</Link>} /> : progress.data.items.map((item) => {
        const assessments = item.payload.assessments;
        const topics = item.payload.studied_topics;
        return <article className={styles.record} key={item.id}><h3>Registro anterior</h3><p>{Array.isArray(assessments) ? assessments.length : 0} evaluaciones conservadas.</p>
          {Array.isArray(topics) ? <ul>{topics.filter((topic): topic is string => typeof topic === "string").map((topic) => <li key={topic}>{topic}</li>)}</ul> : null}</article>;
      })}<Pages offset={progressOffset} total={progress.data.total} change={setProgressOffset} /></>}
  </section>;
}
