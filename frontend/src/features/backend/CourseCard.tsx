import azureCover from "../../assets/courses/az-900.jpg";
import defaultCover from "../../assets/courses/default.jpg";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, cardClass } from "../../ui";
import { Failure } from "./Shared";
import { coursePath, useEnrollment, type CourseSummary } from "./courseQueries";
import styles from "./CourseCard.module.css";

export function CourseCover({ slug, className, loading = "lazy" }: {
  slug: string;
  className: string | undefined;
  loading?: "lazy" | "eager";
}) {
  const src = slug === "azure-fundamentals" || slug === "az-900" ? azureCover : defaultCover;
  return <img src={src} alt="" width={768} height={320} loading={loading} decoding="async" className={className} />;
}

/** Barra de avance: el texto «3 de 12 unidades» transmite el dato; la barra sólo lo refuerza. */
export function CourseProgress({ course }: { course: CourseSummary }) {
  return <div className={styles.progress}>
    <div className={styles.track} role="progressbar" aria-label={`Avance en ${course.name}`}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={course.percent} aria-valuetext={`${String(course.percent)} %`}>
      <span className={styles.fill} style={{ inlineSize: `${String(course.percent)}%` }} />
    </div>
    <p className={styles.count}>{course.completedCount} de {course.unitCount} {course.unitCount === 1 ? "unidad completada" : "unidades completadas"} · {course.percent} %</p>
  </div>;
}

export function CourseStatus({ course }: { course: CourseSummary }) {
  return course.certificate ? <Badge tone="success">Diploma obtenido</Badge>
    : course.enrolledAt ? <Badge tone="info">Inscrito</Badge> : null;
}

export function EnrollButton({ course, size }: { course: CourseSummary; size?: "sm" }) {
  const enrollment = useEnrollment(course.subjectId);
  return <>
    <Button size={size} variant={course.enrolledAt ? "ghost" : "primary"} disabled={enrollment.isPending}
      onClick={() => enrollment.mutate(!course.enrolledAt)}>
      {course.enrolledAt ? "Salir del curso" : "Inscribirme"}
    </Button>
    {enrollment.isError ? <Failure error={enrollment.error} /> : null}
  </>;
}

export function CourseCard({ course, headingLevel = 3, actions }: { course: CourseSummary; headingLevel?: 2 | 3; actions?: ReactNode }) {
  const Heading = `h${String(headingLevel)}` as "h2" | "h3";
  return <li className={cardClass(false, styles.card)}>
    <CourseCover slug={course.slug} className={styles.cover} />
    <div className={styles.head}>
      <Heading className={styles.title}><Link to={coursePath(course.subjectId)}>{course.name}</Link></Heading>
      <CourseStatus course={course} />
    </div>
    <CourseProgress course={course} />
    {actions ? <div className={styles.actions}>{actions}</div> : null}
  </li>;
}
