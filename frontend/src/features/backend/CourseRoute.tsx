import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, PageHeader, buttonClass } from "../../ui";
import { formatDateTime } from "./labels";
import { Busy, Failure } from "./Shared";
import { CourseCover, CourseProgress, CourseStatus, EnrollButton } from "./CourseCard";
import { diplomaPath, unitStatusLabel, unitStepPath, useCourse, useIssueCertificate } from "./courseQueries";
import styles from "./CourseRoute.module.css";

const tone = { notStarted: "neutral", inProgress: "warning", completed: "success" } as const;

export function CourseRoute() {
  const subjectId = useParams().subjectId ?? "";
  const query = useCourse(subjectId);
  const issue = useIssueCertificate(subjectId);
  if (query.isPending) return <Busy />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const { course, sections, nextUnitId, passingPercent } = query.data;
  const units = sections.flatMap((section) => section.units);
  const next = units.find((unit) => unit.unitId === nextUnitId);
  const complete = course.unitCount > 0 && course.completedCount === course.unitCount;
  return <section className={styles.screen}>
    <div className={styles.hero}>
      <PageHeader title={course.name} breadcrumbs={[{ label: "Catálogo", to: "/catalogo" }, { label: course.name }]}
      description={`Cada unidad se completa al aprobar uno de sus quizzes con al menos ${String(passingPercent)} %. Al completar todas obtienes tu diploma.`}
      actions={<EnrollButton course={course} />} />
      <CourseCover slug={course.slug} className={styles.cover} loading="eager" />
    </div>
    <Card className={styles.summary}>
      <div className={styles.status}><h2>Tu avance</h2><CourseStatus course={course} /></div>
      <CourseProgress course={course} />
      {course.certificate ? <>
        <p>Obtuviste tu diploma el {formatDateTime(course.certificate.issuedAt)}.</p>
        <Link className={buttonClass("primary")} to={diplomaPath(course.certificate.code)}>Ver diploma</Link>
      </> : complete ? <>
        <p>Completaste todas las unidades. Ya puedes generar tu diploma.</p>
        <Button variant="primary" disabled={issue.isPending} onClick={() => issue.mutate()}>Obtener diploma</Button>
        {issue.isSuccess ? <Link to={diplomaPath(issue.data.code)}>Abrir el diploma</Link> : null}
        {issue.isError ? <Failure error={issue.error} /> : null}
      </> : next ? <>
        <p>Siguiente paso: <strong>{next.title}</strong>{next.status === "inProgress" && next.bestPercent != null
          ? `. Tu mejor resultado es ${String(next.bestPercent)} %; aprueba un quiz con ${String(passingPercent)} % para completarla.` : "."}</p>
        <Link className={buttonClass("primary")} to={unitStepPath(next)}>{next.status === "inProgress" ? "Ir a los quizzes" : "Empezar unidad"}</Link>
      </> : null}
    </Card>
    {sections.map((section) => <section key={section.categoryId} aria-labelledby={`section-${section.categoryId}`}>
      <h2 id={`section-${section.categoryId}`} className={styles.sectionTitle}>
        {section.name} <span className={styles.sectionCount}>{section.units.filter((unit) => unit.status === "completed").length}/{section.units.length}</span>
      </h2>
      <ol className={styles.units}>{section.units.map((unit) => <li key={unit.unitId} className={styles.unit}>
        <div className={styles.unitText}>
          <Link to={unitStepPath(unit)} className={styles.unitTitle}>{unit.title}</Link>
          <span className={styles.meta}>{unit.bestPercent != null ? `Mejor resultado: ${String(unit.bestPercent)} %` : unit.topicName}</span>
        </div>
        <Badge tone={tone[unit.status]}>{unitStatusLabel[unit.status]}</Badge>
      </li>)}</ol>
    </section>)}
  </section>;
}
