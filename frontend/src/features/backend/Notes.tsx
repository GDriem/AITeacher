import { useEffect, useRef, useState } from "react";
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
import { Button, Card, Dialog, EmptyState, PageHeader, buttonClass } from "../../ui";
import shared from "./Shared.module.css";


export function Notes() {
  const queries = useQueryClient();
  const url = usePersonalUrl();
  const offset = url.page("pagina");
  const setOffset = (value: number) => url.set("pagina", value);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const composer = useRef<HTMLTextAreaElement>(null);
  const notes = useQuery({ queryKey: ["notes", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/notes", { signal, params: { query: { offset, limit: 20 } } })) });
  const create = useMutation({ mutationFn: async () => result(await backend.POST("/api/tutor/notes", { body: { kind: "student", text } })),
    onSuccess: () => { setText(""); setNotice("Apunte guardado."); setOffset(0); composer.current?.focus(); void queries.invalidateQueries({ queryKey: ["notes"] }); } });
  return <section className={styles.screen}><PageHeader title="Tus apuntes" description="Guarda tus ideas, mensajes y resúmenes. Guardar un apunte no acredita dominio." />
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (!create.isPending) { setNotice(""); create.mutate(); } }}><Field title="Nuevo apunte"><textarea ref={composer} readOnly={create.isPending} value={text} required maxLength={12000} onChange={(event) => setText(event.target.value)} /></Field>
      <Button type="submit" variant="primary" disabled={!text.trim() || create.isPending}>{create.isPending ? "Guardando…" : "Guardar apunte"}</Button></form>{create.isError ? <Failure error={create.error} /> : null}
    <p role="status">{notice}</p>
    {notes.isPending ? <Busy /> : notes.isError ? <Failure error={notes.error} retry={() => void notes.refetch()} /> : <>
      {notes.data.items.length === 0 ? <EmptyState title="Todavía no hay apuntes" description="Escribe tu primera idea arriba o guarda un mensaje desde el tutor de una unidad." action={<Link to="/catalogo">Buscar una unidad para estudiar</Link>} /> : <ul className={styles.list}>{notes.data.items.map((note) => <li key={note.id}><Note note={note} announce={setNotice} removed={() => { if (notes.data.items.length === 1 && offset > 0) setOffset(offset - 20); requestAnimationFrame(() => composer.current?.focus()); }} /></li>)}</ul>}
      <Pages offset={offset} total={notes.data.total} change={setOffset} /></>}
  </section>;
}

function Note({ note, announce, removed }: { note: Schema["TutorNote"]; announce: (text: string) => void; removed: () => void }) {
  const queries = useQueryClient();
  const url = usePersonalUrl();
  const editing = url.search.get("editar") === note.id;
  const setEditing = (value: boolean) => url.set("editar", value ? note.id : null);
  const conversation = useTutorConversation(note.conversationId);
  const [text, setText] = useState(note.text);
  const [version, setVersion] = useState(note.version);
  const editor = useRef<HTMLTextAreaElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  // Salir de la edición cambia la URL y el router puede confirmarla después del siguiente fotograma: el foco vuelve a Editar cuando ya está montado.
  const restoreEdit = useRef(false);
  useEffect(() => {
    if (editing) editor.current?.focus();
    else if (restoreEdit.current) { restoreEdit.current = false; editButton.current?.focus(); }
  }, [editing]);
  const finishEditing = () => { restoreEdit.current = true; setEditing(false); };
  const edit = useMutation({ mutationFn: async () => result(await backend.PUT("/api/tutor/notes/{id}", { params: { path: { id: note.id } }, body: { version, text } })),
    onSuccess: async () => { await queries.invalidateQueries({ queryKey: ["notes"] }); announce("Cambios guardados."); finishEditing(); } });
  const remove = useMutation({ mutationFn: async () => {
    const response = await backend.DELETE("/api/tutor/notes/{id}", { params: { path: { id: note.id }, query: { version: deleteVersion } } });
    if (!response.response.ok) result(response);
  }, onSuccess: async () => { setConfirm(false); await queries.invalidateQueries({ queryKey: ["notes"] }); announce("Apunte eliminado."); removed(); } });
  const [confirm, setConfirm] = useState(false);
  const [deleteVersion, setDeleteVersion] = useState(note.version);
  return <Card as="article" className={styles.note}><h2>{note.kind === "student" ? "Apunte personal" : note.kind === "savedMessage" ? "Mensaje guardado" : "Resumen generado"}</h2>
    {editing ? <form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (!edit.isPending) edit.mutate(); }}><Field title="Editar apunte"><textarea ref={editor} readOnly={edit.isPending} required maxLength={12000} value={text} onChange={(event) => setText(event.target.value)} /></Field>
      <div className={shared.actions}><Button type="submit" variant="primary" disabled={edit.isPending || !text.trim()}>{edit.isPending ? "Guardando…" : "Guardar cambios"}</Button><Button disabled={edit.isPending} onClick={finishEditing}>Cancelar</Button></div></form> : <TutorMarkdown>{note.text}</TutorMarkdown>}
    <p>Actualizado: {formatDateTime(note.updatedAt)}</p>
    {note.kind === "savedMessage" && note.conversationId && note.messageId ? <p><a href={`/api/graphs/conversations/${encodeURIComponent(note.conversationId)}/messages/${encodeURIComponent(note.messageId)}`} target="_blank" rel="noopener noreferrer">Consultar mensaje de origen (nueva pestaña)</a></p> : null}
    {note.conversationId ? conversation.isPending ? <Busy /> : conversation.isError ? <Failure error={conversation.error} retry={() => void conversation.refetch()} /> : <p><Link to={conversationPath(conversation.data)}>Volver a la conversación de origen</Link></p> : null}
    {note.kind === "summary" ? <p>Resumen generado a partir de los mensajes incluidos de la conversación; su origen se conserva aunque edites el texto.</p> : null}
    {!editing ? <div className={shared.actions}><button type="button" className={buttonClass()} ref={editButton} onClick={() => { setText(note.text); setVersion(note.version); edit.reset(); announce(""); setEditing(true); }}>Editar</button><Button variant="danger" onClick={() => { remove.reset(); setDeleteVersion(note.version); setConfirm(true); }}>Eliminar</Button></div> : null}
    <Dialog open={confirm} title="¿Eliminar este apunte?" onClose={() => { if (!remove.isPending) setConfirm(false); }} actions={<>
      <Button disabled={remove.isPending} onClick={() => setConfirm(false)}>Conservar</Button>
      <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Eliminando…" : "Sí, eliminar"}</Button>
    </>}><p>Se eliminará de tus apuntes. Esta acción no se puede deshacer.</p>
      {note.kind !== "student" ? <p>La conversación de origen se conserva.</p> : null}
      {remove.isError ? <Failure title="No se eliminó el apunte" error={remove.error} /> : null}
    </Dialog>
    {editing && edit.isError ? <><Failure title="No se guardaron los cambios" error={edit.error} /><p>Tu texto sigue en el editor. Si el apunte cambió en otra pestaña, copia tu texto antes de cancelar y volver a editar.</p></> : null}
  </Card>;
}
