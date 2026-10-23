import { useEffect, useRef, useState } from "react";
import { useBlocker, useLocation } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { backend, result, type Schema } from "./client";
import { Failure, Field } from "./Shared";
import { Button, Dialog, Tabs, Toast, ToastRegion } from "../../ui";
import { ApiError } from "../../api/ApiError";
import { useProfile } from "./profile";
import { usePersonalUrl } from "./usePersonalUrl";
import { applicableSteps, emptyDocument, orphanObjectives, readUnitDraft, stepLabels, validateStep, writeUnitDraft, type Step } from "./authoringModel";
import { UnitPreview } from "./UnitPreview";
import shared from "./Shared.module.css";
import styles from "./UnitEditor.module.css";
import { panel } from "./panel";

export function UnitEditor({ unit, saved, topics, onDirty }: { unit?: Schema["UnitResponse"]; saved: (unit: Schema["UnitResponse"]) => void; topics: Schema["EntryResponse"][]; onDirty: (dirty: boolean) => void }) {
  const queries = useQueryClient();
  const profile = useProfile();
  const owner = profile.studentId;
  const id = unit?.id ?? "nueva";
  const [draft] = useState(() => readUnitDraft(owner, id));
  const initial = unit && "assessments" in unit.revision.document ? unit.revision.document : emptyDocument();
  const [document, updateDocument] = useState(() => draft?.document ?? structuredClone(initial));
  const [topicId, updateTopic] = useState(draft?.topicId ?? unit?.topicId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const routeState: unknown = useLocation().state;
  const [notice, setNotice] = useState(() => routeState !== null && typeof routeState === "object" && "savedUnit" in routeState && routeState.savedUnit === id ? "Borrador guardado." : "");
  const [version, setVersion] = useState(draft?.version ?? unit?.version ?? null);
  const [baseline, setBaseline] = useState(JSON.stringify({ document: initial, topicId: unit?.topicId ?? "" }));
  const dirty = baseline !== JSON.stringify({ document, topicId });
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  const url = usePersonalUrl();
  const steps = applicableSteps(document);
  const step = steps.find((item) => item === url.search.get("paso")) ?? "datos";
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => { const selected = heading.current?.closest("form")?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]'); if (typeof selected?.scrollIntoView === "function") selected.scrollIntoView({ block: "nearest", inline: "nearest" }); if (previousStep.current !== step) { heading.current?.focus(); previousStep.current = step; } }, [step]);
  const savedNavigation = useRef(false);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { if (!savedNavigation.current) event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !savedNavigation.current && currentLocation.pathname !== nextLocation.pathname);
  const persist = (next: typeof document, topic: string) => { const base = dirty ? version : unit?.version ?? null; if (!dirty) setVersion(base); writeUnitDraft(owner, id, { document: next, topicId: topic, version: base }); };
  const setDocument = (next: typeof document) => { savedNavigation.current = false; updateDocument(next); persist(next, topicId); };
  const changeKind = (kind: "reading" | "learningUnit") => setDocument(kind === "reading" ? { ...document, kind, concepts: [], objectives: [], exercises: [], assessments: [], prerequisites: [], readings: document.readings.map((r) => ({ ...r, objectiveIds: [] })) } : { ...document, kind });
  const go = (next: string) => {
    const target = steps.indexOf(next as Step), current = steps.indexOf(step);
    if (target > current) { for (const item of steps.slice(0, target)) { const found = validateStep(document, item, topicId); if (Object.keys(found).length) { setErrors(found); url.set("paso", item); return; } } }
    setErrors({}); url.set("paso", next);
  };
  const save = useMutation({ mutationFn: async () => unit
    ? result(await backend.POST("/api/units/{unitId}/revisions", { params: { path: { unitId: unit.id } }, body: { version: dirty ? version ?? unit.version : unit.version, document } }))
    : result(await backend.POST("/api/units", { body: { topicId, document } })),
    onSuccess: (value) => { savedNavigation.current = true; writeUnitDraft(owner, id, null); setBaseline(JSON.stringify({ document, topicId })); setVersion(value.version); setNotice("Borrador guardado."); saved(value); void queries.invalidateQueries({ queryKey: ["author-units"] }); } });
  const submit = () => { for (const item of steps) { const found = validateStep(document, item, topicId); if (Object.keys(found).length) { setErrors(found); url.set("paso", item); return; } } save.mutate(); };
  const objectives = document.objectives.map((item) => ({ id: item.id, title: item.description || "Objetivo sin descripción" }));
  const concepts = document.concepts.map((item) => ({ id: item.id, title: item.name || "Concepto sin nombre" }));
  const content = <><h2 ref={heading} tabIndex={-1}>{stepLabels[step]}</h2>
    {step === "datos" ? <Field title="Tema de la nueva unidad" hint={errors.topic}><select aria-invalid={Boolean(errors.topic)} required disabled={Boolean(unit)} value={topicId} onChange={(event) => { updateTopic(event.target.value); persist(document, event.target.value); }}><option value="">Selecciona un tema</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></Field> : null}
{step === "datos" ? <>    <Field title="Tipo de material" hint="Solo lectura conserva las lecturas y elimina conceptos, objetivos, práctica y evaluación del borrador."><select value={document.kind} onChange={(event) => changeKind(event.target.value as "learningUnit" | "reading")}>
      <option value="learningUnit">Unidad con objetivos, práctica y evaluación</option><option value="reading">Solo lectura</option>
    </select></Field>
    <Field title="Título de la unidad" hint={errors.title}><input aria-invalid={Boolean(errors.title)} required maxLength={150} value={document.title} onChange={(event) => setDocument({ ...document, title: event.target.value })} /></Field>
</> : null}
{step === "objetivos" ? <>    <h3>Conceptos</h3>{document.concepts.map((item) => <fieldset key={item.id}><Field title="Nombre del concepto" hint={errors[`${item.id}.name`]}><input aria-invalid={Boolean(errors[`${item.id}.name`])} required maxLength={150} value={item.name} onChange={(event) => setDocument({ ...document, concepts: document.concepts.map((value) => value.id === item.id ? { ...value, name: event.target.value } : value) })} /></Field><Button onClick={() => setDocument({ ...document, concepts: document.concepts.filter((c) => c.id !== item.id), objectives: document.objectives.map((o) => ({ ...o, conceptIds: o.conceptIds.filter((id) => id !== item.id) })), prerequisites: document.prerequisites.filter((p) => p.conceptId !== item.id && p.requiresConceptId !== item.id) })}>Quitar concepto</Button></fieldset>)}
    <Button onClick={() => setDocument({ ...document, concepts: [...document.concepts, { id: crypto.randomUUID(), name: "" }] })}>Añadir concepto</Button>
    <h3>Objetivos observables</h3>{document.objectives.map((item) => <fieldset key={item.id}><Field title="Descripción del objetivo" hint={errors[`${item.id}.description`]}><textarea aria-invalid={Boolean(errors[`${item.id}.description`])} required maxLength={2000} value={item.description} onChange={(event) => setDocument({ ...document, objectives: document.objectives.map((value) => value.id === item.id ? { ...value, description: event.target.value } : value) })} /></Field>
      <p>Conceptos que cubre</p><p className={styles.error}>{errors[`${item.id}.references`]}</p><References values={concepts} selected={item.conceptIds} change={(conceptIds) => setDocument({ ...document, objectives: document.objectives.map((value) => value.id === item.id ? { ...value, conceptIds } : value) })} />{orphanObjectives({ ...document, objectives: [item] }).map((message) => <p key={message} className={styles.notice}>{message}</p>)}<Button onClick={() => setDocument({ ...document, objectives: document.objectives.filter((o) => o.id !== item.id), readings: document.readings.map((r) => ({ ...r, objectiveIds: r.objectiveIds.filter((id) => id !== item.id) })), exercises: document.exercises.map((r) => ({ ...r, objectiveIds: r.objectiveIds.filter((id) => id !== item.id) })), assessments: document.assessments.map((r) => ({ ...r, objectiveIds: r.objectiveIds.filter((id) => id !== item.id) })) })}>Quitar objetivo</Button></fieldset>)}
    <Button onClick={() => setDocument({ ...document, objectives: [...document.objectives, { id: crypto.randomUUID(), description: "", conceptIds: [] }] })}>Añadir objetivo</Button>
    <h3>Prerrequisitos</h3>{document.prerequisites.map((item, index) => <fieldset key={index}><p className={styles.error}>{errors[`prerequisite.${String(index)}`]}</p><Field title="Concepto"><select required value={item.conceptId} onChange={(event) => setDocument({ ...document, prerequisites: document.prerequisites.map((value, i) => i === index ? { ...value, conceptId: event.target.value } : value) })}><option value="">Selecciona concepto</option>{concepts.map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}</select></Field>
      <Field title="Requiere conocer"><select required value={item.requiresConceptId} onChange={(event) => setDocument({ ...document, prerequisites: document.prerequisites.map((value, i) => i === index ? { ...value, requiresConceptId: event.target.value } : value) })}><option value="">Selecciona prerrequisito</option>{concepts.map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}</select></Field>
      <Button onClick={() => setDocument({ ...document, prerequisites: document.prerequisites.filter((_, i) => i !== index) })}>Quitar prerrequisito</Button></fieldset>)}
    <Button onClick={() => setDocument({ ...document, prerequisites: [...document.prerequisites, { conceptId: "", requiresConceptId: "" }] })}>Añadir prerrequisito</Button>
</> : null}
{step === "lecturas" ? <>    <h3>Lecturas</h3>{document.readings.map((item) => <fieldset key={item.id}>
      <Field title="Título de lectura" hint={errors[`${item.id}.title`]}><input aria-invalid={Boolean(errors[`${item.id}.title`])} required maxLength={150} value={item.title} onChange={(event) => setDocument({ ...document, readings: document.readings.map((value) => value.id === item.id ? { ...value, title: event.target.value } : value) })} /></Field>
      <Field title="Texto de lectura" hint={errors[`${item.id}.text`]}><textarea aria-invalid={Boolean(errors[`${item.id}.text`])} required maxLength={100000} value={item.text} onChange={(event) => setDocument({ ...document, readings: document.readings.map((value) => value.id === item.id ? { ...value, text: event.target.value } : value) })} /></Field>
      <Field title="Fuente de lectura" hint={errors[`${item.id}.source`]}><input aria-invalid={Boolean(errors[`${item.id}.source`])} required maxLength={1000} value={item.source} onChange={(event) => setDocument({ ...document, readings: document.readings.map((value) => value.id === item.id ? { ...value, source: event.target.value } : value) })} /></Field>
      {document.kind !== "reading" ? <><p>Objetivos cubiertos</p><p className={styles.error}>{errors[`${item.id}.references`]}</p><References values={objectives} selected={item.objectiveIds} change={(objectiveIds) => setDocument({ ...document, readings: document.readings.map((value) => value.id === item.id ? { ...value, objectiveIds } : value) })} /></> : null}<Button onClick={() => setDocument({ ...document, readings: document.readings.filter((r) => r.id !== item.id) })}>Quitar lectura</Button></fieldset>)}
    <Button onClick={() => setDocument({ ...document, readings: [...document.readings, { id: crypto.randomUUID(), title: "", text: "", source: "", objectiveIds: [] }] })}>Añadir lectura</Button>
</> : null}
{step === "ejercicios" ? <>    <h3>Ejercicios</h3>{document.exercises.map((item) => <fieldset key={item.id}><Field title="Consigna del ejercicio" hint={errors[`${item.id}.prompt`]}><textarea aria-invalid={Boolean(errors[`${item.id}.prompt`])} required maxLength={20000} value={item.prompt} onChange={(event) => setDocument({ ...document, exercises: document.exercises.map((value) => value.id === item.id ? { ...value, prompt: event.target.value } : value) })} /></Field>
      <p>Objetivos cubiertos</p><p className={styles.error}>{errors[`${item.id}.references`]}</p><References values={objectives} selected={item.objectiveIds} change={(objectiveIds) => setDocument({ ...document, exercises: document.exercises.map((value) => value.id === item.id ? { ...value, objectiveIds } : value) })} /><Button onClick={() => setDocument({ ...document, exercises: document.exercises.filter((r) => r.id !== item.id) })}>Quitar ejercicio</Button></fieldset>)}
    <Button onClick={() => setDocument({ ...document, exercises: [...document.exercises, { id: crypto.randomUUID(), prompt: "", objectiveIds: [] }] })}>Añadir ejercicio</Button>
</> : null}
{step === "evaluaciones" ? <>    <h3>Evaluación editorial</h3>{document.assessments.map((item) => <fieldset key={item.id}><Field title="Consigna de evaluación" hint={errors[`${item.id}.prompt`]}><textarea aria-invalid={Boolean(errors[`${item.id}.prompt`])} required maxLength={20000} value={item.prompt} onChange={(event) => setDocument({ ...document, assessments: document.assessments.map((value) => value.id === item.id ? { ...value, prompt: event.target.value } : value) })} /></Field>
      <Field title="Criterios privados de evaluación" hint={errors[`${item.id}.privateCriteria`]}><textarea aria-invalid={Boolean(errors[`${item.id}.privateCriteria`])} required maxLength={20000} value={item.privateCriteria} onChange={(event) => setDocument({ ...document, assessments: document.assessments.map((value) => value.id === item.id ? { ...value, privateCriteria: event.target.value } : value) })} /></Field>
      <p>Objetivos cubiertos</p><p className={styles.error}>{errors[`${item.id}.references`]}</p><References values={objectives} selected={item.objectiveIds} change={(objectiveIds) => setDocument({ ...document, assessments: document.assessments.map((value) => value.id === item.id ? { ...value, objectiveIds } : value) })} /><Button onClick={() => setDocument({ ...document, assessments: document.assessments.filter((r) => r.id !== item.id) })}>Quitar evaluación editorial</Button></fieldset>)}
    <Button onClick={() => setDocument({ ...document, assessments: [...document.assessments, { id: crypto.randomUUID(), prompt: "", privateCriteria: "", objectiveIds: [] }] })}>Añadir evaluación editorial</Button>
</> : null}
    {errors.readings ? <p role="alert" className={styles.error}>{errors.readings}</p> : null}
    {step === "revision" ? <>{orphanObjectives(document).map((message) => <p key={message} className={styles.notice}>{message}</p>)}<UnitPreview document={document} /></> : null}
    <div className={styles.actions}>
      {steps.indexOf(step) > 0 ? <Button onClick={() => go(steps[steps.indexOf(step) - 1] ?? "datos")}>Anterior</Button> : null}
      {step !== "revision" ? <Button onClick={() => go(steps[steps.indexOf(step) + 1] ?? "revision")}>Siguiente</Button> : null}
      <Button type="submit" variant="primary" disabled={save.isPending}>Guardar borrador</Button>
    </div></>;
  return <div className={styles.editor}><form className={panel} noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <p>{dirty ? "Cambios sin guardar. El borrador se conserva en esta pestaña." : "Borrador guardado."}</p>
    <Tabs label="Pasos de autoría" selectedId={step} onSelect={go} items={steps.map((item) => ({ id: item, label: stepLabels[item], content }))} />
    {save.isError ? <><Failure error={save.error} />{save.error instanceof ApiError && save.error.status === 409 ? <p>La versión cambió. Conservamos tu borrador. <Button onClick={() => { savedNavigation.current = true; writeUnitDraft(owner, id, null); window.location.reload(); }}>Descartar cambios y recargar</Button></p> : null}</> : null}
  </form><ToastRegion>{notice ? <Toast tone="success" onDismiss={() => setNotice("")}>{notice}</Toast> : null}</ToastRegion>
    <Dialog open={blocker.state === "blocked"} title="¿Salir con cambios sin guardar?" onClose={() => blocker.reset?.()} actions={<><Button onClick={() => blocker.reset?.()}>Seguir editando</Button><Button onClick={() => blocker.proceed?.()}>Salir y conservar borrador</Button></>}><p>Los cambios se conservan en esta pestaña hasta guardar o descartar.</p></Dialog>
  </div>;
}

function References({ values, selected, change }: { values: { id: string; title: string }[]; selected: string[]; change: (ids: string[]) => void }) {
  return <div>{values.map((item) => <label className={shared.choice} key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => change(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />{item.title}</label>)}</div>;
}
