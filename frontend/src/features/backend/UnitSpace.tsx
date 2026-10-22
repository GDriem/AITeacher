import { Link, useLocation, useParams } from "react-router-dom";
import { TutorMarkdown } from "../tutor/TutorMarkdown";
import { PageHeader, buttonClass } from "../../ui";
import { required } from "./client";
import { Busy, Failure } from "./Shared";
import { Assessments } from "./Assessments";
import { catalogPath, tutorPath, useStudyUnit, useTutorAvailability } from "./unitQueries";
import { panel } from "./panel";

export function UnitSpace() {
  const unitId = required(useParams().unitId);
  const state: unknown = useLocation().state;
  const availability = useTutorAvailability();
  const unit = useStudyUnit(unitId);
  const back = catalogPath(state);
  if (unit.isPending) return <Busy />;
  if (unit.isError) return <Failure error={unit.error} retry={() => void unit.refetch()} />;
  const document = unit.data.revision.document;
  return <section>
    <PageHeader title={document.title} breadcrumbs={[{ label: "Catálogo", to: back }, { label: document.title }]}
      actions={<Link className={buttonClass("ghost")} to={back}>Volver al catálogo</Link>} />
    {document.kind === "reading" ? <p>Material de lectura. No incluye prácticas ni evaluaciones y no acredita dominio.</p> : <h2>Qué vas a aprender</h2>}
    <ul>{document.objectives.map((objective) => <li key={objective.id}>{objective.description}</li>)}</ul>
    {document.readings.map((reading) => <article key={reading.id} className={panel}><h2>{reading.title}</h2>
      <TutorMarkdown>{reading.text}</TutorMarkdown><p>Fuente: {reading.source}</p>
      {availability.data?.enabled ? <Link className={buttonClass()} to={tutorPath(unitId, "reading", reading.id)} state={state}>Consultar esta lectura con el tutor</Link> : null}</article>)}
    {document.exercises.length > 0 ? <h2>Practica</h2> : null}{document.exercises.map((exercise) => <article key={exercise.id} className={panel}>
      <TutorMarkdown>{exercise.prompt}</TutorMarkdown>{availability.data?.enabled ? <Link className={buttonClass()} to={tutorPath(unitId, "practice", exercise.id)} state={state}>Practicar con el tutor</Link> : null}</article>)}
    {document.kind !== "reading" ? <Assessments unit={unit.data} /> : null}
    <h2>Tutor de la unidad</h2>
    {availability.isPending ? <Busy /> : availability.isError ? <Failure error={availability.error} retry={() => void availability.refetch()} /> : availability.data.enabled ?
      <Link className={buttonClass()} to={tutorPath(unitId)} state={state}>Abrir conversación</Link> : <p>El tutor de IA todavía no está configurado en esta beta. Puedes leer el material completo.</p>}
  </section>;
}
