import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend, result, required, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";

type QuestionType = Schema["ClosedQuestionDocument"]["type"];
const types: [QuestionType, string][] = [["singleChoice", "Opción única"], ["multipleChoice", "Selección múltiple"], ["trueFalse", "Verdadero o falso"], ["openResponse", "Respuesta abierta"], ["caseAnalysis", "Análisis de caso"], ["practicalExercise", "Ejercicio práctico"]];
export function AssessmentAuthor({ unitId, revisionId, topicId }: { unitId: string; revisionId: string; topicId: string }) {
  const unit = useQuery({ queryKey: ["published-author-unit", unitId, revisionId], queryFn: async ({ signal }) => result(await backend.GET("/api/units/{unitId}/revisions/{revisionId}", { signal, params: { path: { unitId, revisionId } } })) });
  return <section><h2>Banco, evaluaciones y referencia curricular</h2>{unit.isPending ? <Busy /> : unit.isError ? <Failure error={unit.error} retry={() => void unit.refetch()} /> : <>
    <QuestionEditor key={revisionId} unit={unit.data} /><DefinitionEditor key={`definition-${revisionId}`} unit={unit.data} /><GraphEditor key={`graph-${revisionId}`} unit={unit.data} topicId={topicId} />
  </>}</section>;
}

function QuestionEditor({ unit }: { unit: Schema["UnitResponse"] }) {
  const queries = useQueryClient();
  const [type, setType] = useState<QuestionType>("singleChoice"); const [prompt, setPrompt] = useState("");
  const [objectiveIds, setObjectiveIds] = useState<string[]>([]);
  const [options, setOptions] = useState([{ id: crypto.randomUUID(), text: "" }, { id: crypto.randomUUID(), text: "" }]);
  const [correctOptionIds, setCorrectOptionIds] = useState<string[]>([]);
  const [criteria, setCriteria] = useState([{ id: crypto.randomUUID(), description: "", maxPoints: 1 }]);
  const [guidance, setGuidance] = useState("");
  const open = ["openResponse", "caseAnalysis", "practicalExercise"].includes(type);
  const create = useMutation({ mutationFn: async () => result(await backend.POST("/api/assessments/questions", { body: {
    id: crypto.randomUUID(), number: 1, document: { unitId: unit.id, unitRevisionId: unit.revision.id, objectiveIds,
      conceptIds: [...new Set(unit.revision.document.objectives.filter((item) => objectiveIds.includes(item.id)).flatMap((item) => item.conceptIds))],
      type, prompt, options: open ? [] : options, correctOptionIds: open ? [] : correctOptionIds,
      scoringPolicy: open ? "rubric" : "exactMatch", rubric: open ? { version: 1, criteria, privateGuidance: guidance } : undefined },
  } })), onSuccess: () => { setPrompt(""); void queries.invalidateQueries({ queryKey: ["author-questions"] }); } });
  return <form className="backend-panel" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><h3>Añadir pregunta al banco</h3>
    <Field title="Tipo de pregunta"><select value={type} onChange={(event) => { const value = event.target.value as QuestionType; setType(value); setCorrectOptionIds([]); if (value === "trueFalse") setOptions([{ id: crypto.randomUUID(), text: "Verdadero" }, { id: crypto.randomUUID(), text: "Falso" }]); }}>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field title="Enunciado"><textarea required maxLength={20000} value={prompt} onChange={(event) => setPrompt(event.target.value)} /></Field>
    <fieldset><legend>Objetivos evaluados</legend>{unit.revision.document.objectives.map((item) => <label className="backend-choice" key={item.id}><input type="checkbox" checked={objectiveIds.includes(item.id)} onChange={(event) => setObjectiveIds(event.target.checked ? [...objectiveIds, item.id] : objectiveIds.filter((id) => id !== item.id))} />{item.description}</label>)}</fieldset>
    {open ? <><Field title="Guía privada de corrección"><textarea required maxLength={20000} value={guidance} onChange={(event) => setGuidance(event.target.value)} /></Field>
      {criteria.map((item, index) => <fieldset key={item.id}><legend>Criterio {index + 1}</legend><Field title="Descripción"><input required maxLength={2000} value={item.description} onChange={(event) => setCriteria(criteria.map((value) => value.id === item.id ? { ...value, description: event.target.value } : value))} /></Field>
        <Field title="Puntos máximos"><input required type="number" min="0.01" max="1000" step="0.01" value={item.maxPoints} onChange={(event) => setCriteria(criteria.map((value) => value.id === item.id ? { ...value, maxPoints: Number(event.target.value) } : value))} /></Field></fieldset>)}
      <button type="button" onClick={() => setCriteria([...criteria, { id: crypto.randomUUID(), description: "", maxPoints: 1 }])}>Añadir criterio</button></> : <>
      <p>Marca la respuesta correcta{type === "multipleChoice" ? " o las respuestas correctas" : ""}. La puntuación exige coincidencia exacta.</p>
      {options.map((item, index) => <fieldset key={item.id}><Field title={`Opción ${String(index + 1)}`}><input required maxLength={2000} readOnly={type === "trueFalse"} value={item.text} onChange={(event) => setOptions(options.map((value) => value.id === item.id ? { ...value, text: event.target.value } : value))} /></Field>
        <label className="backend-choice"><input type={type === "multipleChoice" ? "checkbox" : "radio"} name="correct-options" checked={correctOptionIds.includes(item.id)} onChange={(event) => setCorrectOptionIds(type !== "multipleChoice" ? [item.id] : event.target.checked ? [...correctOptionIds, item.id] : correctOptionIds.filter((id) => id !== item.id))} />Respuesta correcta</label></fieldset>)}
      {type !== "trueFalse" ? <button type="button" onClick={() => setOptions([...options, { id: crypto.randomUUID(), text: "" }])}>Añadir opción</button> : null}</>}
    <div className="backend-actions"><button type="submit" disabled={create.isPending || objectiveIds.length === 0}>Guardar pregunta</button></div>
    {create.isSuccess ? <p role="status">Pregunta guardada en el banco.</p> : create.isError ? <Failure error={create.error} /> : null}
  </form>;
}

function DefinitionEditor({ unit }: { unit: Schema["UnitResponse"] }) {
  const queries = useQueryClient();
  const [offset, setOffset] = useState(0); const [selected, setSelected] = useState<Schema["QuestionRevision"][]>([]);
  const [title, setTitle] = useState(""); const [mode, setMode] = useState<"practice" | "assessment">("assessment");
  const [minutes, setMinutes] = useState(30); const [attempts, setAttempts] = useState(3); const [feedback, setFeedback] = useState<"afterSubmission" | "never">("afterSubmission");
  const questions = useQuery({ queryKey: ["author-questions", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/assessments/questions", { signal, params: { query: { offset, limit: 20 } } })) });
  const publish = useMutation({ mutationFn: async () => result(await backend.POST("/api/assessments/definitions", { body: { id: crypto.randomUUID(), number: 1, document: {
    title, unitId: unit.id, unitRevisionId: unit.revision.id, objectiveIds: [...new Set(selected.flatMap((item) => item.document.objectiveIds))],
    questionRevisionIds: selected.map((item) => item.id), mode, timeLimitMinutes: minutes, maxAttempts: attempts, feedback, assistance: "none",
  } } })), onSuccess: () => { setSelected([]); setTitle(""); void queries.invalidateQueries({ queryKey: ["definitions"] }); } });
  return <form className="backend-panel" onSubmit={(event) => { event.preventDefault(); publish.mutate(); }}><h3>Crear evaluación disponible para alumnos</h3>
    <Field title="Título de evaluación"><input required maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
    <Field title="Modo"><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="assessment">Evaluación</option><option value="practice">Práctica</option></select></Field>
    {questions.isPending ? <Busy /> : questions.isError ? <Failure error={questions.error} retry={() => void questions.refetch()} /> : <>
      <fieldset><legend>Preguntas de esta publicación</legend>{questions.data.items.filter((item) => item.document.unitId === unit.id && item.document.unitRevisionId === unit.revision.id).map((item) => <label className="backend-choice" key={item.id}><input type="checkbox" checked={selected.some((value) => value.id === item.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, item] : selected.filter((value) => value.id !== item.id))} />{item.document.prompt}</label>)}</fieldset>
      <Pages offset={offset} total={questions.data.total} change={setOffset} /></>}
    <Field title="Duración en minutos"><input required type="number" min="1" max="1440" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></Field>
    <Field title="Máximo de intentos"><input required type="number" min="1" max="100" value={attempts} onChange={(event) => setAttempts(Number(event.target.value))} /></Field>
    <Field title="Cuándo mostrar resultados"><select value={feedback} onChange={(event) => setFeedback(event.target.value as typeof feedback)}><option value="afterSubmission">Después de entregar y corregir</option><option value="never">No mostrar resultados</option></select></Field>
    <button type="submit" disabled={publish.isPending || selected.length === 0}>Publicar evaluación</button>
    {publish.isSuccess ? <p role="status">Evaluación disponible.</p> : publish.isError ? <Failure error={publish.error} /> : null}
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
  return <form className="backend-panel" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><h3>Crear referencia curricular</h3><p>Incluye los conceptos y prerrequisitos de esta publicación, con su procedencia.</p>
    <Field title="Título de referencia curricular"><input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
    <button type="submit" disabled={create.isPending}>Publicar referencia curricular</button>{create.isSuccess ? <p role="status">Referencia curricular publicada.</p> : create.isError ? <Failure error={create.error} /> : null}
  </form>;
}
