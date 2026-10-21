import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TutorMarkdown } from "../tutor/TutorMarkdown";
import { backend, result, type Schema } from "./client";
import { Busy, Failure } from "./Shared";
import { Tutor } from "./Tutor";
import { Assessments } from "./Assessments";

export function UnitSpace({ summary, back }: { summary: Schema["UnitSummary"]; back: () => void }) {
  const [activity, setActivity] = useState<{ mode: "chat" | "reading" | "practice"; id?: string } | null>(null);
  const availability = useQuery({ queryKey: ["tutor-availability"], queryFn: async ({ signal }) => result(await backend.GET("/api/tutor/availability", { signal })) });
  const unit = useQuery({ queryKey: ["unit", summary.id, summary.publishedRevisionId], queryFn: async ({ signal }) => {
    let value = result(await backend.GET("/api/units/{unitId}", { params: { path: { unitId: summary.id } }, signal }));
    // Authors can have a newer draft. Learning always uses the active publication.
    if (value.publishedRevisionId && value.revision.id !== value.publishedRevisionId)
      value = result(await backend.GET("/api/units/{unitId}/revisions/{revisionId}", { params: { path: { unitId: value.id, revisionId: value.publishedRevisionId } }, signal }));
    return value;
  } });
  return <section><button type="button" onClick={back}>Volver al catálogo</button>
    {unit.isPending ? <Busy /> : unit.isError ? <Failure error={unit.error} retry={() => void unit.refetch()} /> : <>
      <h1>{unit.data.revision.document.title}</h1>
      {unit.data.revision.document.kind === "reading" ? <p>Material de lectura. No incluye prácticas ni evaluaciones y no acredita dominio.</p> : <h2>Qué vas a aprender</h2>}
      <ul>{unit.data.revision.document.objectives.map((objective) => <li key={objective.id}>{objective.description}</li>)}</ul>
      {unit.data.revision.document.readings.map((reading) => <article key={reading.id} className="backend-panel"><h2>{reading.title}</h2>
        <TutorMarkdown>{reading.text}</TutorMarkdown><p>Fuente: {reading.source}</p>
        {availability.data?.enabled ? <button type="button" onClick={() => setActivity({ mode: "reading", id: reading.id })}>Consultar esta lectura con el tutor</button> : null}</article>)}
      {unit.data.revision.document.exercises.length > 0 ? <h2>Practica</h2> : null}{unit.data.revision.document.exercises.map((exercise) => <article key={exercise.id} className="backend-panel">
        <TutorMarkdown>{exercise.prompt}</TutorMarkdown>{availability.data?.enabled ? <button type="button" onClick={() => setActivity({ mode: "practice", id: exercise.id })}>Practicar con el tutor</button> : null}</article>)}
      {unit.data.revision.document.kind !== "reading" ? <Assessments unit={unit.data} /> : null}
      <h2>Tutor de la unidad</h2>
      {availability.isPending ? <Busy /> : availability.isError ? <Failure error={availability.error} retry={() => void availability.refetch()} /> : availability.data.enabled ?
        <button type="button" onClick={() => setActivity({ mode: "chat" })}>Abrir conversación</button> : <p>El tutor de IA todavía no está configurado en esta beta. Puedes leer el material completo.</p>}
      {activity ? <Tutor key={`${activity.mode}-${activity.id ?? "chat"}`} unit={unit.data} mode={activity.mode} activityId={activity.id} /> : null}
    </>}
  </section>;
}
