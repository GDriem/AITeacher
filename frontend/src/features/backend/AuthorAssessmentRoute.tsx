import { Link, useParams } from "react-router-dom";
import { Busy, Failure } from "./Shared";
import { EmptyState, buttonClass } from "../../ui";
import { AssessmentAuthor } from "./AssessmentAuthor";
import { authorPath, useAuthorUnit } from "./authorQueries";
export function AuthorAssessmentRoute() {
  const { unitId } = useParams();
  const unit = useAuthorUnit(unitId);
  if (unit.isPending) return <Busy />;
  if (unit.isError) return <Failure error={unit.error} retry={() => void unit.refetch()} />;
  return <><Link to={authorPath(unit.data.id)}>Volver al editor de unidad</Link>{unit.data.publishedRevisionId && unit.data.revision.document.kind !== "reading" ? <AssessmentAuthor unitId={unit.data.id} revisionId={unit.data.publishedRevisionId} topicId={unit.data.topicId} /> : <EmptyState title="Publica primero la unidad" description="Las preguntas y evaluaciones se crean sobre la versión publicada de la unidad. Publícala desde el editor y vuelve aquí." action={<Link className={buttonClass()} to={authorPath(unit.data.id)}>Ir al editor de la unidad</Link>} />}</>;
}
