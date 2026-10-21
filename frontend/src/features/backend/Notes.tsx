import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TutorMarkdown } from "../tutor/TutorMarkdown";
import { backend, result, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";

export function Notes() {
  const queries = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [text, setText] = useState("");
  const notes = useQuery({ queryKey: ["notes", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/notes", { signal, params: { query: { offset, limit: 20 } } })) });
  const create = useMutation({ mutationFn: async () => result(await backend.POST("/api/tutor/notes", { body: { kind: "student", text } })),
    onSuccess: () => { setText(""); setOffset(0); void queries.invalidateQueries({ queryKey: ["notes"] }); } });
  return <section><h1>Tus apuntes</h1><p>Guarda tus ideas, mensajes y resúmenes. Guardar un apunte no acredita dominio.</p>
    <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><Field title="Nuevo apunte"><textarea value={text} required maxLength={12000} onChange={(event) => setText(event.target.value)} /></Field>
      <button type="submit" disabled={!text.trim() || create.isPending}>Guardar apunte</button></form>{create.isError ? <Failure error={create.error} /> : null}
    {notes.isPending ? <Busy /> : notes.isError ? <Failure error={notes.error} retry={() => void notes.refetch()} /> : <>
      {notes.data.items.length === 0 ? <p>Todavía no hay apuntes.</p> : notes.data.items.map((note) => <Note key={`${note.id}-${String(note.version)}`} note={note} />)}
      <Pages offset={offset} total={notes.data.total} change={setOffset} /></>}
  </section>;
}

function Note({ note }: { note: Schema["TutorNote"] }) {
  const queries = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const edit = useMutation({ mutationFn: async () => result(await backend.PUT("/api/tutor/notes/{id}", { params: { path: { id: note.id } }, body: { version: note.version, text } })),
    onSuccess: () => { setEditing(false); void queries.invalidateQueries({ queryKey: ["notes"] }); } });
  const remove = useMutation({ mutationFn: async () => {
    const response = await backend.DELETE("/api/tutor/notes/{id}", { params: { path: { id: note.id }, query: { version: note.version } } });
    if (!response.response.ok) result(response);
  }, onSuccess: () => { void queries.invalidateQueries({ queryKey: ["notes"] }); } });
  const [confirm, setConfirm] = useState(false);
  return <article className="backend-panel"><h2>{note.kind === "student" ? "Apunte personal" : note.kind === "savedMessage" ? "Mensaje guardado" : "Resumen generado"}</h2>
    {editing ? <form onSubmit={(event) => { event.preventDefault(); edit.mutate(); }}><Field title="Editar apunte"><textarea required maxLength={12000} value={text} onChange={(event) => setText(event.target.value)} /></Field>
      <button type="submit" disabled={edit.isPending}>Guardar cambios</button><button type="button" onClick={() => setEditing(false)}>Cancelar</button></form> : <TutorMarkdown>{note.text}</TutorMarkdown>}
    <p>Actualizado: {new Date(note.updatedAt).toLocaleString()}</p>
    {note.kind === "savedMessage" && note.conversationId && note.messageId ? <p><a href={`/api/graphs/conversations/${note.conversationId}/messages/${note.messageId}`} target="_blank" rel="noopener noreferrer">Consultar mensaje de origen y fuentes</a></p> : null}
    {note.kind === "summary" ? <p>Resumen generado a partir de los mensajes incluidos de la conversación; su origen se conserva aunque edites el texto.</p> : null}
    <div className="backend-actions"><button type="button" onClick={() => setEditing(true)}>Editar</button><button type="button" onClick={() => setConfirm(true)}>Eliminar</button></div>
    {confirm ? <div><p>¿Eliminar este apunte?</p><button type="button" disabled={remove.isPending} onClick={() => remove.mutate()}>Sí, eliminar</button><button type="button" onClick={() => setConfirm(false)}>Conservar</button></div> : null}
    {edit.isError ? <Failure error={edit.error} retry={() => void queries.invalidateQueries({ queryKey: ["notes"] })} /> : null}{remove.isError ? <Failure error={remove.error} /> : null}
  </article>;
}
