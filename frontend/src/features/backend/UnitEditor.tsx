import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { backend, result, type Schema } from "./client";
import { Failure, Field } from "./Shared";

const empty = (): Schema["UnitDocument"] => ({ kind: "learningUnit", title: "", concepts: [], objectives: [], readings: [], exercises: [], assessments: [], prerequisites: [] });
export function UnitEditor({ topicId, unit, saved }: { topicId: string; unit?: Schema["UnitResponse"]; saved: (unit: Schema["UnitResponse"]) => void }) {
  const queries = useQueryClient();
  const [document, setDocument] = useState<Schema["UnitDocument"]>(() => unit && "assessments" in unit.revision.document ? structuredClone(unit.revision.document) : empty());
  const save = useMutation({ mutationFn: async () => unit
    ? result(await backend.POST("/api/units/{unitId}/revisions", { params: { path: { unitId: unit.id } }, body: { version: unit.version, document } }))
    : result(await backend.POST("/api/units", { body: { topicId, document } })),
    onSuccess: (value) => { saved(value); void queries.invalidateQueries({ queryKey: ["author-units"] }); } });
  const references = (values: { id: string; title: string }[], selected: string[], change: (ids: string[]) => void) => <div>{values.map((item) =>
    <label className="backend-choice" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => change(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />{item.title}</label>)}</div>;
  const objectives = document.objectives.map((item) => ({ id: item.id, title: item.description || "Objetivo sin descripción" }));
  const concepts = document.concepts.map((item) => ({ id: item.id, title: item.name || "Concepto sin nombre" }));
  return <form className="backend-panel" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><h2>{unit ? "Crear una nueva revisión" : "Crear unidad"}</h2>
    <Field title="Tipo de material"><select value={document.kind} onChange={(event) => setDocument({ ...document, kind: event.target.value as "learningUnit" | "reading" })}>
      <option value="learningUnit">Unidad con objetivos, práctica y evaluación</option><option value="reading">Solo lectura</option>
    </select></Field>
    <Field title="Título de la unidad"><input required maxLength={150} value={document.title} onChange={(event) => setDocument({ ...document, title: event.target.value })} /></Field>
    <h3>Conceptos</h3>{document.concepts.map((item) => <fieldset key={item.id}><Field title="Nombre del concepto"><input required maxLength={150} value={item.name} onChange={(event) => setDocument({ ...document, concepts: document.concepts.map((value) => value.id === item.id ? { ...value, name: event.target.value } : value) })} /></Field></fieldset>)}
    <button type="button" onClick={() => setDocument({ ...document, concepts: [...document.concepts, { id: crypto.randomUUID(), name: "" }] })}>Añadir concepto</button>
    <h3>Objetivos observables</h3>{document.objectives.map((item) => <fieldset key={item.id}><Field title="Descripción del objetivo"><textarea required maxLength={2000} value={item.description} onChange={(event) => setDocument({ ...document, objectives: document.objectives.map((value) => value.id === item.id ? { ...value, description: event.target.value } : value) })} /></Field>
      <p>Conceptos que cubre</p>{references(concepts, item.conceptIds, (conceptIds) => setDocument({ ...document, objectives: document.objectives.map((value) => value.id === item.id ? { ...value, conceptIds } : value) }))}</fieldset>)}
    <button type="button" onClick={() => setDocument({ ...document, objectives: [...document.objectives, { id: crypto.randomUUID(), description: "", conceptIds: [] }] })}>Añadir objetivo</button>
    <h3>Lecturas</h3>{document.readings.map((item) => <fieldset key={item.id}>
      <Field title="Título de lectura"><input required maxLength={150} value={item.title} onChange={(event) => setDocument({ ...document, readings: document.readings.map((value) => value.id === item.id ? { ...value, title: event.target.value } : value) })} /></Field>
      <Field title="Texto de lectura"><textarea required maxLength={100000} value={item.text} onChange={(event) => setDocument({ ...document, readings: document.readings.map((value) => value.id === item.id ? { ...value, text: event.target.value } : value) })} /></Field>
      <Field title="Fuente de lectura"><input required maxLength={1000} value={item.source} onChange={(event) => setDocument({ ...document, readings: document.readings.map((value) => value.id === item.id ? { ...value, source: event.target.value } : value) })} /></Field>
      <p>Objetivos cubiertos</p>{references(objectives, item.objectiveIds, (objectiveIds) => setDocument({ ...document, readings: document.readings.map((value) => value.id === item.id ? { ...value, objectiveIds } : value) }))}</fieldset>)}
    <button type="button" onClick={() => setDocument({ ...document, readings: [...document.readings, { id: crypto.randomUUID(), title: "", text: "", source: "", objectiveIds: [] }] })}>Añadir lectura</button>
    <h3>Ejercicios</h3>{document.exercises.map((item) => <fieldset key={item.id}><Field title="Consigna del ejercicio"><textarea required maxLength={20000} value={item.prompt} onChange={(event) => setDocument({ ...document, exercises: document.exercises.map((value) => value.id === item.id ? { ...value, prompt: event.target.value } : value) })} /></Field>
      <p>Objetivos cubiertos</p>{references(objectives, item.objectiveIds, (objectiveIds) => setDocument({ ...document, exercises: document.exercises.map((value) => value.id === item.id ? { ...value, objectiveIds } : value) }))}</fieldset>)}
    <button type="button" onClick={() => setDocument({ ...document, exercises: [...document.exercises, { id: crypto.randomUUID(), prompt: "", objectiveIds: [] }] })}>Añadir ejercicio</button>
    <h3>Evaluación editorial</h3>{document.assessments.map((item) => <fieldset key={item.id}><Field title="Consigna de evaluación"><textarea required maxLength={20000} value={item.prompt} onChange={(event) => setDocument({ ...document, assessments: document.assessments.map((value) => value.id === item.id ? { ...value, prompt: event.target.value } : value) })} /></Field>
      <Field title="Criterios privados de evaluación"><textarea required maxLength={20000} value={item.privateCriteria} onChange={(event) => setDocument({ ...document, assessments: document.assessments.map((value) => value.id === item.id ? { ...value, privateCriteria: event.target.value } : value) })} /></Field>
      <p>Objetivos cubiertos</p>{references(objectives, item.objectiveIds, (objectiveIds) => setDocument({ ...document, assessments: document.assessments.map((value) => value.id === item.id ? { ...value, objectiveIds } : value) }))}</fieldset>)}
    <button type="button" onClick={() => setDocument({ ...document, assessments: [...document.assessments, { id: crypto.randomUUID(), prompt: "", privateCriteria: "", objectiveIds: [] }] })}>Añadir evaluación editorial</button>
    <h3>Prerrequisitos</h3>{document.prerequisites.map((item, index) => <fieldset key={index}><Field title="Concepto"><select required value={item.conceptId} onChange={(event) => setDocument({ ...document, prerequisites: document.prerequisites.map((value, i) => i === index ? { ...value, conceptId: event.target.value } : value) })}><option value="">Selecciona concepto</option>{concepts.map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}</select></Field>
      <Field title="Requiere conocer"><select required value={item.requiresConceptId} onChange={(event) => setDocument({ ...document, prerequisites: document.prerequisites.map((value, i) => i === index ? { ...value, requiresConceptId: event.target.value } : value) })}><option value="">Selecciona prerrequisito</option>{concepts.map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}</select></Field>
      <button type="button" onClick={() => setDocument({ ...document, prerequisites: document.prerequisites.filter((_, i) => i !== index) })}>Quitar prerrequisito</button></fieldset>)}
    <button type="button" onClick={() => setDocument({ ...document, prerequisites: [...document.prerequisites, { conceptId: "", requiresConceptId: "" }] })}>Añadir prerrequisito</button>
    <div className="backend-actions"><button type="submit" disabled={save.isPending}>Guardar borrador</button></div>
    {save.isError ? <Failure error={save.error} /> : null}
  </form>;
}
