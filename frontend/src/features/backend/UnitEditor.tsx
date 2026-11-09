import { useEffect, useId, useRef, useState } from "react";
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
  "use no memo";
  // Cada pulsación cambia el documento controlado. Evita la caché generada para
  // todo el formulario; la vista previa y los controles compartidos mantienen su compilación.
  const queries = useQueryClient();
  const profile = useProfile();
  const owner = profile.studentId;
  const id = unit?.id ?? "nueva";
  const [draft] = useState(() => readUnitDraft(owner, id));
  const initial = unit && "assessments" in unit.revision.document ? unit.revision.document : emptyDocument();
  const [document, updateDocument] = useState(() => draft?.document ?? structuredClone(initial));
  const [topicId, updateTopic] = useState(draft?.topicId ?? unit?.topicId ?? "");
  const [localSaved, setLocalSaved] = useState(true);
  const [discard, setDiscard] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const routeState: unknown = useLocation().state;
  const [notice, setNotice] = useState(() => routeState !== null && typeof routeState === "object" && "savedUnit" in routeState && routeState.savedUnit === id ? "Borrador guardado." : "");
  const fromUnit = () => ({ revisionId: unit?.revision.id ?? null, version: unit?.version ?? null });
  const [base, setBase] = useState(() => draft ? { revisionId: draft.revisionId ?? null, version: draft.version } : fromUnit());
  const [baseline, setBaseline] = useState(JSON.stringify({ document: initial, topicId: unit?.topicId ?? "" }));
  const current = JSON.stringify({ document, topicId });
  const latest = useRef(current);
  useEffect(() => { latest.current = current; }, [current]);
  const dirty = baseline !== current;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  // Sin cambios locales, el editor sigue a la unidad: muestra la revisión concurrente tras recargar y la versión nueva tras publicar o retirar.
  if (!dirty && unit && (unit.revision.id !== base.revisionId || unit.version !== base.version)) {
    if (unit.revision.id !== base.revisionId && "assessments" in unit.revision.document) { updateDocument(structuredClone(unit.revision.document)); setBaseline(JSON.stringify({ document: unit.revision.document, topicId: unit.topicId })); }
    setBase({ revisionId: unit.revision.id, version: unit.version });
  }
  const url = usePersonalUrl();
  const steps = applicableSteps(document);
  const step = steps.find((item) => item === url.search.get("paso")) ?? "datos";
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (Object.keys(errors).length) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [errors]);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    // Tabs owns strip visibility and keyboard focus; next/previous still announce the heading.
    if (window.document.activeElement?.getAttribute("role") !== "tab") heading.current?.focus();
    previousStep.current = step;
  }, [step]);
  const savedNavigation = useRef(false);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { if (!savedNavigation.current) event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !savedNavigation.current && currentLocation.pathname !== nextLocation.pathname);
  const persist = (next: typeof document, topic: string) => { const start = dirty ? base : fromUnit(); if (!dirty) setBase(start); setLocalSaved(writeUnitDraft(owner, id, { document: next, topicId: topic, ...start })); };
  const setDocument = (next: typeof document) => { savedNavigation.current = false; updateDocument(next); persist(next, topicId); };
  const updateItem = <K extends "concepts" | "objectives" | "readings" | "exercises" | "assessments">(key: K, id: string, patch: Partial<typeof document[K][number]>) => setDocument({ ...document, [key]: document[key].map((item) => item.id === id ? { ...item, ...patch } : item) });
  const changeKind = (kind: "reading" | "learningUnit") => setDocument(kind === "reading" ? { ...document, kind, concepts: [], objectives: [], exercises: [], assessments: [], prerequisites: [], readings: document.readings.map((r) => ({ ...r, objectiveIds: [] })) } : { ...document, kind });
  const go = (next: string) => {
    const target = steps.indexOf(next as Step), current = steps.indexOf(step);
    if (target > current) { for (const item of steps.slice(0, target)) { const found = validateStep(document, item, topicId); if (Object.keys(found).length) { setErrors(found); url.set("paso", item); return; } } }
    setErrors({}); url.set("paso", next);
  };
  // Publicar o retirar no cambian la revisión cabeza: la versión actual vale mientras la revisión base coincida. Si otro autor guardó, se envía la versión del borrador y el servidor responde 409.
  const save = useMutation({ mutationFn: async (sent: { document: typeof document; topicId: string }) => unit
    ? result(await backend.POST("/api/units/{unitId}/revisions", { params: { path: { unitId: unit.id } }, body: { version: unit.revision.id === base.revisionId ? unit.version : base.version ?? unit.version, document: sent.document } }))
    : result(await backend.POST("/api/units", { body: sent })),
    onSuccess: (value, sent) => {
      const snapshot = JSON.stringify({ document: sent.document, topicId: sent.topicId }), next = { revisionId: value.revision.id, version: value.version };
      // Lo escrito durante el guardado sigue pendiente y conserva su copia local sobre la revisión recién creada, bajo el id devuelto: una unidad nueva no deja copia en `nueva`.
      savedNavigation.current = snapshot === latest.current || id !== value.id;
      writeUnitDraft(owner, id, null);
      if (snapshot !== latest.current) writeUnitDraft(owner, value.id, { ...(JSON.parse(latest.current) as { document: typeof document; topicId: string }), ...next });
      setBaseline(snapshot); setBase(next); setNotice("Borrador guardado."); saved(value); void queries.invalidateQueries({ queryKey: ["author-units"] }); } });
  const submit = () => { for (const item of steps) { const found = validateStep(document, item, topicId); if (Object.keys(found).length) { setErrors(found); url.set("paso", item); return; } } save.mutate({ document, topicId }); };
  const objectives = document.objectives.map((item) => ({ id: item.id, title: item.description || "Objetivo sin descripción" }));
  const concepts = document.concepts.map((item) => ({ id: item.id, title: item.name || "Concepto sin nombre" }));
  const editorial = step === "evaluaciones";
  const activityKey = editorial ? "assessments" : "exercises";
  const content = <><h2 ref={heading} tabIndex={-1}>{stepLabels[step]}</h2>
    <p className={styles.step}>Paso {steps.indexOf(step) + 1} de {steps.length}</p>
    {step === "datos" ? <Field title="Tema de la nueva unidad" hint={errors.topic}><select aria-invalid={Boolean(errors.topic)} required disabled={Boolean(unit)} value={topicId} onChange={(event) => { updateTopic(event.target.value); persist(document, event.target.value); }}><option value="">Selecciona un tema</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></Field> : null}
{step === "datos" ? <>    <Field title="Tipo de material" hint="Solo lectura conserva las lecturas y elimina conceptos, objetivos, práctica y evaluación del borrador."><select value={document.kind} onChange={(event) => changeKind(event.target.value as "learningUnit" | "reading")}>
      <option value="learningUnit">Unidad con objetivos, práctica y evaluación</option><option value="reading">Solo lectura</option>
    </select></Field>
    <Field title="Título de la unidad" hint={errors.title}><input aria-invalid={Boolean(errors.title)} required maxLength={150} value={document.title} onChange={(event) => setDocument({ ...document, title: event.target.value })} /></Field>
</> : null}
{step === "objetivos" ? <>    <h3>Conceptos</h3>{document.concepts.map((item) => <fieldset key={item.id}><Field title="Nombre del concepto" hint={errors[`${item.id}.name`]}><input aria-invalid={Boolean(errors[`${item.id}.name`])} required maxLength={150} value={item.name} onChange={(event) => updateItem("concepts", item.id, { name: event.target.value })} /></Field><Button onClick={() => setDocument({ ...document, concepts: document.concepts.filter((c) => c.id !== item.id), objectives: document.objectives.map((o) => ({ ...o, conceptIds: o.conceptIds.filter((id) => id !== item.id) })), prerequisites: document.prerequisites.filter((p) => p.conceptId !== item.id && p.requiresConceptId !== item.id) })}>Quitar concepto</Button></fieldset>)}
    <Button onClick={() => setDocument({ ...document, concepts: [...document.concepts, { id: crypto.randomUUID(), name: "" }] })}>Añadir concepto</Button>
    <h3>Objetivos observables</h3>{document.objectives.map((item) => <fieldset key={item.id}><Field title="Descripción del objetivo" hint={errors[`${item.id}.description`]}><textarea aria-invalid={Boolean(errors[`${item.id}.description`])} required maxLength={2000} value={item.description} onChange={(event) => updateItem("objectives", item.id, { description: event.target.value })} /></Field>
      <References title="Conceptos que cubre" error={errors[`${item.id}.references`]} values={concepts} selected={item.conceptIds} change={(conceptIds) => updateItem("objectives", item.id, { conceptIds })} />{orphanObjectives({ ...document, objectives: [item] }).map((message) => <p key={message} className={styles.notice}>{message}</p>)}<Button onClick={() => setDocument({ ...document, objectives: document.objectives.filter((o) => o.id !== item.id), readings: document.readings.map((r) => ({ ...r, objectiveIds: r.objectiveIds.filter((id) => id !== item.id) })), exercises: document.exercises.map((r) => ({ ...r, objectiveIds: r.objectiveIds.filter((id) => id !== item.id) })), assessments: document.assessments.map((r) => ({ ...r, objectiveIds: r.objectiveIds.filter((id) => id !== item.id) })) })}>Quitar objetivo</Button></fieldset>)}
    <Button onClick={() => setDocument({ ...document, objectives: [...document.objectives, { id: crypto.randomUUID(), description: "", conceptIds: [] }] })}>Añadir objetivo</Button>
    <h3>Prerrequisitos</h3>{document.prerequisites.map((item, index) => <fieldset key={index}><p className={styles.error}>{errors[`prerequisite.${String(index)}`]}</p><Field title="Concepto"><select required value={item.conceptId} onChange={(event) => setDocument({ ...document, prerequisites: document.prerequisites.map((value, i) => i === index ? { ...value, conceptId: event.target.value } : value) })}><option value="">Selecciona concepto</option>{concepts.map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}</select></Field>
      <Field title="Requiere conocer"><select required value={item.requiresConceptId} onChange={(event) => setDocument({ ...document, prerequisites: document.prerequisites.map((value, i) => i === index ? { ...value, requiresConceptId: event.target.value } : value) })}><option value="">Selecciona prerrequisito</option>{concepts.map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}</select></Field>
      <Button onClick={() => setDocument({ ...document, prerequisites: document.prerequisites.filter((_, i) => i !== index) })}>Quitar prerrequisito</Button></fieldset>)}
    <Button onClick={() => setDocument({ ...document, prerequisites: [...document.prerequisites, { conceptId: "", requiresConceptId: "" }] })}>Añadir prerrequisito</Button>
</> : null}
{step === "lecturas" ? <>    <h3>Lecturas</h3>{document.readings.map((item) => <fieldset key={item.id}>
      <Field title="Título de lectura" hint={errors[`${item.id}.title`]}><input aria-invalid={Boolean(errors[`${item.id}.title`])} required maxLength={150} value={item.title} onChange={(event) => updateItem("readings", item.id, { title: event.target.value })} /></Field>
      <Field title="Texto de lectura" hint={errors[`${item.id}.text`]}><textarea aria-invalid={Boolean(errors[`${item.id}.text`])} required maxLength={100000} value={item.text} onChange={(event) => updateItem("readings", item.id, { text: event.target.value })} /></Field>
      <Field title="Fuente de lectura" hint={errors[`${item.id}.source`]}><input aria-invalid={Boolean(errors[`${item.id}.source`])} required maxLength={1000} value={item.source} onChange={(event) => updateItem("readings", item.id, { source: event.target.value })} /></Field>
      {document.kind !== "reading" ? <><References title="Objetivos cubiertos" error={errors[`${item.id}.references`]} values={objectives} selected={item.objectiveIds} change={(objectiveIds) => updateItem("readings", item.id, { objectiveIds })} /></> : null}<Button onClick={() => setDocument({ ...document, readings: document.readings.filter((r) => r.id !== item.id) })}>Quitar lectura</Button></fieldset>)}
    <Button onClick={() => setDocument({ ...document, readings: [...document.readings, { id: crypto.randomUUID(), title: "", text: "", source: "", objectiveIds: [] }] })}>Añadir lectura</Button>
</> : null}
{step === "ejercicios" || step === "evaluaciones" ? <><h3>{editorial ? "Evaluación editorial" : "Ejercicios"}</h3>
    {editorial ? <p>Define cómo comprobar cada objetivo al preparar la unidad. Estas consignas no crean una evaluación entregable. Después de publicar, prepara las preguntas y publica la evaluación para alumnos.</p> : null}
    {document[activityKey].map((item) => <fieldset key={item.id}>
      <Field title={editorial ? "Consigna de evaluación" : "Consigna del ejercicio"} hint={errors[`${item.id}.prompt`]}><textarea aria-invalid={Boolean(errors[`${item.id}.prompt`])} required maxLength={20000} value={item.prompt} onChange={(event) => updateItem(activityKey, item.id, { prompt: event.target.value })} /></Field>
      {"privateCriteria" in item ? <Field title="Criterios privados de evaluación" hint={errors[`${item.id}.privateCriteria`] ?? "Solo para autores. No aparecen en la vista del alumno."}><textarea aria-invalid={Boolean(errors[`${item.id}.privateCriteria`])} required maxLength={20000} value={item.privateCriteria} onChange={(event) => updateItem(activityKey, item.id, { privateCriteria: event.target.value })} /></Field> : null}
      <References title="Objetivos cubiertos" error={errors[`${item.id}.references`]} values={objectives} selected={item.objectiveIds} change={(objectiveIds) => updateItem(activityKey, item.id, { objectiveIds })} />
      <Button onClick={() => setDocument({ ...document, [activityKey]: document[activityKey].filter((value) => value.id !== item.id) })}>{editorial ? "Quitar evaluación editorial" : "Quitar ejercicio"}</Button>
    </fieldset>)}
    <Button onClick={() => setDocument(editorial ? { ...document, assessments: [...document.assessments, { id: crypto.randomUUID(), prompt: "", privateCriteria: "", objectiveIds: [] }] } : { ...document, exercises: [...document.exercises, { id: crypto.randomUUID(), prompt: "", objectiveIds: [] }] })}>{editorial ? "Añadir evaluación editorial" : "Añadir ejercicio"}</Button>
  </> : null}
    {errors.readings ? <p role="alert" className={styles.error}>{errors.readings}</p> : null}
    {step === "revision" ? <>{orphanObjectives(document).map((message) => <p key={message} className={styles.notice}>{message}</p>)}<UnitPreview document={document} /></> : null}
    <div className={styles.actions}>
      {steps.indexOf(step) > 0 ? <Button onClick={() => go(steps[steps.indexOf(step) - 1] ?? "datos")}>Anterior</Button> : null}
      {step !== "revision" ? <Button onClick={() => go(steps[steps.indexOf(step) + 1] ?? "revision")}>Siguiente</Button> : null}
      <Button type="submit" variant="primary" disabled={save.isPending}>{save.isPending ? "Guardando borrador…" : "Guardar borrador"}</Button>
    </div></>;
  return <div className={styles.editor}><form ref={form} className={panel} noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <p>{dirty ? "Cambios pendientes de guardar en el servidor." : unit ? `Borrador guardado en el servidor · revisión ${String(unit.revision.number)}.` : "Nueva unidad · aún sin guardar en el servidor."}</p>
    {dirty ? <p role={localSaved ? undefined : "alert"}>{localSaved ? "Copia local en esta pestaña: puedes recuperarla al recargar. No se sincroniza con otros dispositivos." : "No se pudo conservar la copia local. Guarda el borrador en el servidor antes de salir o recargar para no perder tus cambios."}</p> : null}
    {Object.keys(errors).length ? <p role="alert">Revisa los campos indicados en «{stepLabels[step]}» para continuar.</p> : null}
    <Tabs label="Pasos de autoría" selectedId={step} onSelect={go} items={steps.map((item) => ({ id: item, label: stepLabels[item], content }))} />
    {save.isError ? <><Failure error={save.error} />{save.error instanceof ApiError && save.error.status === 409 ? <p>Alguien guardó cambios en esta unidad mientras editabas. Tus cambios siguen en el editor. Copia lo que necesites antes de cargar la versión del servidor. <Button onClick={() => setDiscard(true)}>Descartar cambios y recargar</Button></p> : null}</> : null}
  </form><ToastRegion>{notice ? <Toast tone="success" onDismiss={() => setNotice("")}>{notice}</Toast> : null}</ToastRegion>
    <Dialog open={blocker.state === "blocked"} title="¿Salir con cambios sin guardar?" onClose={() => blocker.reset?.()} actions={<><Button onClick={() => blocker.reset?.()}>Seguir editando</Button><Button onClick={() => blocker.proceed?.()}>{localSaved ? "Salir y conservar borrador" : "Salir sin conservar cambios"}</Button></>}><p>{localSaved ? "La copia local se conserva en esta pestaña hasta guardar o descartar. Cerrar la pestaña puede eliminarla." : "La copia local falló. Si sales, los cambios pendientes pueden perderse. Vuelve al editor para guardarlos."}</p></Dialog>
    <Dialog open={discard} title="¿Descartar tus cambios locales?" onClose={() => setDiscard(false)} actions={<><Button onClick={() => setDiscard(false)}>Seguir editando</Button><Button variant="danger" onClick={() => { if (writeUnitDraft(owner, id, null)) { savedNavigation.current = true; window.location.reload(); } else { setLocalSaved(false); setDiscard(false); } }}>Descartar y cargar versión del servidor</Button></>}><p>Se eliminará la copia local y se abrirá la versión guardada por el otro autor. Copia antes el texto que quieras conservar.</p></Dialog>
  </div>;
}

function References({ title, error, values, selected, change }: { title: string; error?: string; values: { id: string; title: string }[]; selected: string[]; change: (ids: string[]) => void }) {
  const errorId = useId();
  return <fieldset aria-describedby={error ? errorId : undefined}><legend>{title}</legend>{error ? <p id={errorId} className={styles.error}>{error}</p> : null}{values.map((item) => <label className={shared.choice} key={item.id}><input type="checkbox" aria-invalid={Boolean(error)} checked={selected.includes(item.id)} onChange={(event) => change(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />{item.title}</label>)}</fieldset>;
}
