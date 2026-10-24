import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend, result, required, type Schema } from "./client";
import { Busy, Failure, Field } from "./Shared";
import { Button, Dialog, EmptyState, Toast, ToastRegion } from "../../ui";
import shared from "./Shared.module.css";
import { panel } from "./panel";
import { authorPages } from "./authorQueries";
import { usePersonalUrl } from "./usePersonalUrl";
import styles from "./AssessmentAuthor.module.css";

type QuestionType = Schema["ClosedQuestionDocument"]["type"];
const types: [QuestionType, string][] = [["singleChoice", "Opción única"], ["multipleChoice", "Selección múltiple"], ["trueFalse", "Verdadero o falso"], ["openResponse", "Respuesta abierta"], ["caseAnalysis", "Análisis de caso"], ["practicalExercise", "Ejercicio práctico"]];
export function AssessmentAuthor({ unitId, revisionId, topicId }: { unitId: string; revisionId: string; topicId: string }) {
  const unit = useQuery({ queryKey: ["published-author-unit", unitId, revisionId], queryFn: async ({ signal }) => result(await backend.GET("/api/units/{unitId}/revisions/{revisionId}", { signal, params: { path: { unitId, revisionId } } })) });
  return <section className={styles.screen}><h2>Banco, evaluaciones y referencia curricular</h2>{unit.isPending ? <Busy /> : unit.isError ? <Failure error={unit.error} retry={() => void unit.refetch()} /> : <>
    <QuestionBank key={revisionId} unit={unit.data} /><DefinitionEditor key={`definition-${revisionId}`} unit={unit.data} /><GraphEditor key={`graph-${revisionId}`} unit={unit.data} topicId={topicId} />
  </>}</section>;
}

function useBank(unit: Schema["UnitResponse"]) {
  return useQuery({ queryKey: ["author-questions", "all", unit.id, unit.revision.id], queryFn: ({ signal }) => authorPages((offset) => backend.GET("/api/assessments/questions", { signal, params: { query: { offset, limit: 100 } } }).then(result)), select: (items) => {
    const latest = new Map<string, Schema["QuestionRevision"]>();
    for (const item of items.filter((q) => q.document.unitId === unit.id && q.document.unitRevisionId === unit.revision.id)) if ((latest.get(item.resourceId)?.number ?? 0) < item.number) latest.set(item.resourceId, item);
    return [...latest.values()];
  } });
}
function QuestionBank({ unit }: { unit: Schema["UnitResponse"] }) {
  const bank = useBank(unit);
  const url = usePersonalUrl();
  const objective = url.search.get("objetivo") ?? "";
  const type = url.search.get("tipo") ?? "";
  const [editing, setEditing] = useState<Schema["QuestionRevision"] | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const questions = bank.data?.filter((item) => (!objective || item.document.objectiveIds.includes(objective)) && (!type || item.document.type === type)) ?? [];
  return <section className={panel}><h3>Banco de preguntas</h3><Button onClick={() => setEditing("new")}>Añadir pregunta</Button>
    <Field title="Filtrar por objetivo"><select value={objective} onChange={(e) => url.set("objetivo", e.target.value)}><option value="">Todos los objetivos</option>{unit.revision.document.objectives.map((o) => <option key={o.id} value={o.id}>{o.description}</option>)}</select></Field>
    <Field title="Filtrar por tipo"><select value={type} onChange={(e) => url.set("tipo", e.target.value)}><option value="">Todos los tipos</option>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    {bank.isPending ? <Busy /> : bank.isError ? <Failure error={bank.error} retry={() => void bank.refetch()} /> : questions.length ? <ul>{questions.map((item) => <li key={item.id}><p>{item.document.prompt} · revisión {item.number}</p><Button onClick={() => setEditing(item)}>Editar pregunta</Button></li>)}</ul> : <EmptyState headingLevel={3} title="No hay preguntas con estos filtros" description="Añade una pregunta o cambia los filtros para comenzar." />}
    <Dialog open={editing !== null} title={editing === "new" ? "Nueva pregunta" : "Editar pregunta"} onClose={() => { if (!saving) setEditing(null); }} actions={<Button disabled={saving} onClick={() => setEditing(null)}>Cancelar</Button>}>
      {editing ? <QuestionEditor key={editing === "new" ? "new" : editing.id} unit={unit} editing={editing === "new" ? undefined : editing} busy={setSaving} done={() => { setEditing(null); setNotice("Pregunta guardada en el banco."); }} /> : null}
    </Dialog><ToastRegion>{notice ? <Toast tone="success" onDismiss={() => setNotice("")}>{notice}</Toast> : null}</ToastRegion>
  </section>;
}

function QuestionEditor({ unit, editing, done, busy }: { unit: Schema["UnitResponse"]; editing?: Schema["QuestionRevision"]; done: () => void; busy: (pending: boolean) => void }) {
  const queries = useQueryClient();
  const [type, setType] = useState<QuestionType>(editing?.document.type ?? "singleChoice"); const [prompt, setPrompt] = useState(editing?.document.prompt ?? "");
  const [objectiveIds, setObjectiveIds] = useState<string[]>(editing?.document.objectiveIds ?? []);
  const [options, setOptions] = useState(editing?.document.options ?? [{ id: crypto.randomUUID(), text: "" }, { id: crypto.randomUUID(), text: "" }]);
  const [correctOptionIds, setCorrectOptionIds] = useState<string[]>(editing?.document.correctOptionIds ?? []);
  const [criteria, setCriteria] = useState(editing?.document.rubric?.criteria ?? [{ id: crypto.randomUUID(), description: "", maxPoints: 1 }]);
  const [guidance, setGuidance] = useState(editing?.document.rubric?.privateGuidance ?? "");
  const open = ["openResponse", "caseAnalysis", "practicalExercise"].includes(type);
  const create = useMutation({ onMutate: () => busy(true), onSettled: () => busy(false), mutationFn: async () => result(await backend.POST("/api/assessments/questions", { body: {
    id: editing?.resourceId ?? crypto.randomUUID(), number: editing ? editing.number + 1 : 1, document: { unitId: unit.id, unitRevisionId: unit.revision.id, objectiveIds,
      conceptIds: [...new Set(unit.revision.document.objectives.filter((item) => objectiveIds.includes(item.id)).flatMap((item) => item.conceptIds))],
      type, prompt, options: open ? [] : options, correctOptionIds: open ? [] : correctOptionIds,
      scoringPolicy: open ? "rubric" : editing?.document.type === type ? editing.document.scoringPolicy : "exactMatch", rubric: open ? { version: 1, criteria, privateGuidance: guidance } : undefined },
  } })), onSuccess: () => { void queries.invalidateQueries({ queryKey: ["author-questions"] }); done(); } });
  return <form className={panel} onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><h3>{editing ? "Editar pregunta (nueva revisión)" : "Añadir pregunta al banco"}</h3>
    <Field title="Tipo de pregunta"><select value={type} onChange={(event) => { const value = event.target.value as QuestionType; setType(value); setCorrectOptionIds([]); if (value === "trueFalse") setOptions([{ id: crypto.randomUUID(), text: "Verdadero" }, { id: crypto.randomUUID(), text: "Falso" }]); }}>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field title="Enunciado"><textarea required maxLength={20000} value={prompt} onChange={(event) => setPrompt(event.target.value)} /></Field>
    <fieldset><legend>Objetivos evaluados</legend>{unit.revision.document.objectives.map((item) => <label className={shared.choice} key={item.id}><input type="checkbox" checked={objectiveIds.includes(item.id)} onChange={(event) => setObjectiveIds(event.target.checked ? [...objectiveIds, item.id] : objectiveIds.filter((id) => id !== item.id))} />{item.description}</label>)}</fieldset>
    {open ? <><Field title="Guía privada de corrección"><textarea required maxLength={20000} value={guidance} onChange={(event) => setGuidance(event.target.value)} /></Field>
      {criteria.map((item, index) => <fieldset key={item.id}><legend>Criterio {index + 1}</legend><Field title="Descripción"><input required maxLength={2000} value={item.description} onChange={(event) => setCriteria(criteria.map((value) => value.id === item.id ? { ...value, description: event.target.value } : value))} /></Field>
        <Field title="Puntos máximos"><input required type="number" min="0.01" max="1000" step="0.01" value={item.maxPoints} onChange={(event) => setCriteria(criteria.map((value) => value.id === item.id ? { ...value, maxPoints: Number(event.target.value) } : value))} /></Field></fieldset>)}
      <Button onClick={() => setCriteria([...criteria, { id: crypto.randomUUID(), description: "", maxPoints: 1 }])}>Añadir criterio</Button></> : <>
      <p>Marca la respuesta correcta{type === "multipleChoice" ? " o las respuestas correctas" : ""}. La puntuación exige coincidencia exacta.</p>
      {options.map((item, index) => <fieldset key={item.id}><Field title={`Opción ${String(index + 1)}`}><input required maxLength={2000} readOnly={type === "trueFalse"} value={item.text} onChange={(event) => setOptions(options.map((value) => value.id === item.id ? { ...value, text: event.target.value } : value))} /></Field>
        <label className={shared.choice}><input type={type === "multipleChoice" ? "checkbox" : "radio"} name="correct-options" checked={correctOptionIds.includes(item.id)} onChange={(event) => setCorrectOptionIds(type !== "multipleChoice" ? [item.id] : event.target.checked ? [...correctOptionIds, item.id] : correctOptionIds.filter((id) => id !== item.id))} />Respuesta correcta</label></fieldset>)}
      {type !== "trueFalse" ? <Button onClick={() => setOptions([...options, { id: crypto.randomUUID(), text: "" }])}>Añadir opción</Button> : null}</>}
    <div className={shared.actions}><Button type="submit" variant="primary" disabled={create.isPending || objectiveIds.length === 0 || (!open && correctOptionIds.length === 0)}>Guardar pregunta</Button></div>
    {create.isError ? <Failure error={create.error} /> : null}
  </form>;
}

function DefinitionEditor({ unit }: { unit: Schema["UnitResponse"] }) {
  const queries = useQueryClient();
  const [selected, setSelected] = useState<Schema["QuestionRevision"][]>([]);
  const [title, setTitle] = useState(""); const [mode, setMode] = useState<"practice" | "assessment">("assessment");
  const [minutes, setMinutes] = useState(30); const [attempts, setAttempts] = useState(3); const [feedback, setFeedback] = useState<"afterSubmission" | "never">("afterSubmission");
  const questions = useBank(unit);
  const publish = useMutation({ mutationFn: async () => result(await backend.POST("/api/assessments/definitions", { body: { id: crypto.randomUUID(), number: 1, document: {
    title, unitId: unit.id, unitRevisionId: unit.revision.id, objectiveIds: [...new Set(selected.flatMap((item) => item.document.objectiveIds))],
    questionRevisionIds: selected.map((item) => item.id), mode, timeLimitMinutes: minutes, maxAttempts: attempts, feedback, assistance: "none",
  } } })), onSuccess: () => { setSelected([]); setTitle(""); void queries.invalidateQueries({ queryKey: ["definitions"] }); } });
  return <form className={panel} onSubmit={(event) => { event.preventDefault(); publish.mutate(); }}><h3>Crear evaluación disponible para alumnos</h3>
    <Field title="Título de evaluación"><input required maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
    <Field title="Modo"><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="assessment">Evaluación</option><option value="practice">Práctica</option></select></Field>
    {questions.isPending ? <Busy /> : questions.isError ? <Failure error={questions.error} retry={() => void questions.refetch()} /> : <>
      <fieldset><legend>Preguntas de esta publicación</legend>{questions.data.map((item) => <label className={shared.choice} key={item.id}><input type="checkbox" checked={selected.some((value) => value.id === item.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, item] : selected.filter((value) => value.id !== item.id))} />{item.document.prompt}</label>)}</fieldset>
</>}
    <h4>Orden de las preguntas elegidas</h4><ol>{selected.map((item, index) => <li key={item.id}><p>{item.document.prompt} · revisión {item.number}</p>
      <Button disabled={index === 0} onClick={() => setSelected((items) => { const next = [...items]; [next[index - 1], next[index]] = [required(next[index]), required(next[index - 1])]; return next; })}>Subir pregunta {index + 1}</Button>
      <Button disabled={index === selected.length - 1} onClick={() => setSelected((items) => { const next = [...items]; [next[index + 1], next[index]] = [required(next[index]), required(next[index + 1])]; return next; })}>Bajar pregunta {index + 1}</Button>
      <Button onClick={() => setSelected(selected.filter((q) => q.id !== item.id))}>Quitar pregunta {index + 1}</Button>
    </li>)}</ol>
    <Field title="Duración en minutos"><input required type="number" min="1" max="1440" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></Field>
    <Field title="Máximo de intentos"><input required type="number" min="1" max="100" value={attempts} onChange={(event) => setAttempts(Number(event.target.value))} /></Field>
    <Field title="Cuándo mostrar resultados"><select value={feedback} onChange={(event) => setFeedback(event.target.value as typeof feedback)}><option value="afterSubmission">Después de entregar y corregir</option><option value="never">No mostrar resultados</option></select></Field>
    <p>{feedback === "never" ? "El alumno verá la entrega registrada, sin nota ni aciertos." : selected.some((q) => q.document.scoringPolicy === "rubric") ? "El alumno verá «Pendiente de corrección docente». La nota aparecerá después de corregir la rúbrica." : "El alumno verá la nota inmediatamente después de entregar."}</p>
    <Button type="submit" variant="primary" disabled={publish.isPending || selected.length === 0}>Publicar evaluación</Button>
    <ToastRegion>{publish.isSuccess ? <Toast tone="success">Evaluación disponible.</Toast> : null}</ToastRegion>{publish.isError ? <Failure error={publish.error} /> : null}
  </form>;
}

function GraphEditor({ unit, topicId }: { unit: Schema["UnitResponse"]; topicId: string }) {
  const queries = useQueryClient();
  const [title, setTitle] = useState("");
  const create = useMutation({ mutationFn: async () => {
    const nodes = unit.revision.document.concepts.map((item) => ({ id: crypto.randomUUID(), unitId: unit.id, unitRevisionId: unit.revision.id, conceptId: item.id }));
    const byConcept = new Map(nodes.map((item) => [item.conceptId, item.id]));
    return result(await backend.POST("/api/graphs/revisions", { body: { graphId: crypto.randomUUID(), number: 1, topicId, title, nodes,
      edges: unit.revision.document.prerequisites.map((item) => ({ fromNodeId: required(byConcept.get(item.conceptId)), toNodeId: required(byConcept.get(item.requiresConceptId)), relation: "requires" as const })) } }));
  }, onSuccess: () => { void queries.invalidateQueries({ queryKey: ["graphs", topicId] }); } });
  return <form className={panel} onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><h3>Crear referencia curricular</h3><p>Incluye los conceptos y prerrequisitos de esta publicación, con su procedencia.</p>
    <Field title="Título de referencia curricular"><input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
    <Button type="submit" variant="primary" disabled={create.isPending}>Publicar referencia curricular</Button>{create.isSuccess ? <p role="status">Referencia curricular publicada.</p> : create.isError ? <Failure error={create.error} /> : null}
  </form>;
}
