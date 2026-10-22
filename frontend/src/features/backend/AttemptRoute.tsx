import { useParams } from "react-router-dom";
import { PageHeader } from "../../ui";
import { required } from "./client";
import { AttemptView } from "./Assessments";

/** Intento de evaluación con URL propia: recargar o volver atrás no pierde las respuestas entregadas. */
export function AttemptRoute() {
  const id = required(useParams().attemptId);
  return <section>
    <PageHeader title="Intento de evaluación" breadcrumbs={[{ label: "Inicio", to: "/" }, { label: "Evaluación" }]}
      description="Las respuestas se registran al entregarlas; antes de eso sólo existen en esta pantalla." />
    <AttemptView key={id} id={id} headingLevel={2} />
  </section>;
}
