import { useState } from "react";
import { formatDateTime } from "./labels";
import { Link } from "react-router-dom";
import { usePersonalUrl } from "./usePersonalUrl";
import { useTutorConversation } from "./unitQueries";
import { conversationPath } from "./personalQueries";
import styles from "./Notes.module.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TutorMarkdown } from "../tutor/TutorMarkdown";
import { backend, result, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";
import { Button, Card, EmptyState, PageHeader } from "../../ui";
import shared from "./Shared.module.css";


export function Notes() {
  const queries = useQueryClient();
  const url = usePersonalUrl();
  const offset = url.page("pagina");
  const setOffset = (value: number) => url.set("pagina", value);
  const [text, setText] = useState("");
  const notes = useQuery({ queryKey: ["notes", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/notes", { signal, params: { query: { offset, limit: 20 } } })) });
  const create = useMutation({ mutationFn: async () => result(await backend.POST("/api/tutor/notes", { body: { kind: "student", text } })),
    onSuccess: () => { setText(""); setOffset(0); void queries.invalidateQueries({ queryKey: ["notes"] }); } });
  return <section className={styles.screen}><PageHeader title="Tus apuntes" description="Guarda tus ideas, mensajes y resúmenes. Guardar un apunte no acredita dominio." />
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><Field title="Nuevo apunte"><textarea value={text} required maxLength={12000} onChange={(event) => setText(event.target.value)} /></Field>
      <Button type="submit" variant="primary" disabled={!text.trim() || create.isPending}>Guardar apunte</Button></form>{create.isError ? <Failure error={create.error} /> : null}
    {notes.isPending ? <Busy /> : notes.isError ? <Failure error={notes.error} retry={() => void notes.refetch()} /> : <>
      {notes.data.items.length === 0 ? <EmptyState title="Todavía no hay apuntes" description="Escribe tu primera idea arriba o guarda un mensaje desde el tutor de una unidad." action={<Link to="/catalogo">Buscar una unidad para estudiar</Link>} /> : <ul className={styles.list}>{notes.data.items.map((note) => <li key={`${note.id}-${String(note.version)}`}><Note note={note} /></li>)}</ul>}
      <Pages offset={offset} total={notes.data.total} change={setOffset} /></>}
  </section>;
}

function Note({ note }: { note: Schema["TutorNote"] }) {
  const queries = useQueryClient();
  const url = usePersonalUrl();
  const editing = url.search.get("editar") === note.id;
  const setEditing = (value: boolean) => url.set("editar", value ? note.id : null);
  const conversation = useTutorConversation(note.conversationId);
  const [text, setText] = useState(note.text);
  const edit = useMutation({ mutationFn: async () => result(await backend.PUT("/api/tutor/notes/{id}", { params: { path: { id: note.id } }, body: { version: note.version, text } })),
    onSuccess: () => { setEditing(false); void queries.invalidateQueries({ queryKey: ["notes"] }); } });
  const remove = useMutation({ mutationFn: async () => {
    const response = await backend.DELETE("/api/tutor/notes/{id}", { params: { path: { id: note.id }, query: { version: note.version } } });
    if (!response.response.ok) result(response);
  }, onSuccess: () => { void queries.invalidateQueries({ queryKey: ["notes"] }); } });
  const [confirm, setConfirm] = useState(false);
  return <Card as="article" className={styles.note}><h2>{note.kind === "student" ? "Apunte personal" : note.kind === "savedMessage" ? "Mensaje guardado" : "Resumen generado"}</h2>
    {editing ? <form onSubmit={(event) => { event.preventDefault(); edit.mutate(); }}><Field title="Editar apunte"><textarea required maxLength={12000} value={text} onChange={(event) => setText(event.target.value)} /></Field>
      <Button type="submit" variant="primary" disabled={edit.isPending}>Guardar cambios</Button><Button onClick={() => setEditing(false)}>Cancelar</Button></form> : <TutorMarkdown>{note.text}</TutorMarkdown>}
    <p>Actualizado: {formatDateTime(note.updatedAt)}</p>
    {note.kind === "savedMessage" && note.conversationId && note.messageId ? <p><a href={`/api/graphs/conversations/${encodeURIComponent(note.conversationId)}/messages/${encodeURIComponent(note.messageId)}`} target="_blank" rel="noopener noreferrer">Consultar mensaje de origen</a></p> : null}
    {note.conversationId ? conversation.isPending ? <Busy /> : conversation.isError ? <Failure error={conversation.error} retry={() => void conversation.refetch()} /> : <p><Link to={conversationPath(conversation.data)}>Volver a la conversación de origen</Link></p> : null}
    {note.kind === "summary" ? <p>Resumen generado a partir de los mensajes incluidos de la conversación; su origen se conserva aunque edites el texto.</p> : null}
    <div className={shared.actions}><Button onClick={() => setEditing(true)}>Editar</Button><Button onClick={() => setConfirm(true)}>Eliminar</Button></div>
    {confirm ? <div><p>¿Eliminar este apunte?</p><Button disabled={remove.isPending} onClick={() => remove.mutate()}>Sí, eliminar</Button><Button onClick={() => setConfirm(false)}>Conservar</Button></div> : null}
    {edit.isError ? <Failure error={edit.error} retry={() => void queries.invalidateQueries({ queryKey: ["notes"] })} /> : null}{remove.isError ? <Failure error={remove.error} /> : null}
  </Card>;
}
