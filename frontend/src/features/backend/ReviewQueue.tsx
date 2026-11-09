import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend, result, required, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";
import { attemptLabels, formatDateTime } from "./labels";
import { Button, Dialog, EmptyState } from "../../ui";
import { panel } from "./panel";
import { useNavigate, useParams } from "react-router-dom";
import { usePersonalUrl } from "./usePersonalUrl";
import { authorPages } from "./authorQueries";
import styles from "./ReviewQueue.module.css";

export function ReviewQueue() {
  const url = usePersonalUrl();
  const requestedOffset = url.page("pagina");
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const submissions = useQuery({ queryKey: ["submissions", "all"], queryFn: ({ signal }) => authorPages((offset) => backend.GET("/api/assessments/submissions", { signal, params: { query: { offset, limit: 100 } } }).then(result)), select: (items) => items.filter((item) => item.status === "pendingReview") });
  const offset = Math.min(requestedOffset, Math.max(0, Math.floor(((submissions.data?.length ?? 1) - 1) / 20) * 20));
  const open = (id: string) => void navigate(`/autoria/correcciones/${encodeURIComponent(id)}${url.search.size ? `?${url.search.toString()}` : ""}`);
  return <section className={styles.screen}><h2>Entregas pendientes de corrección</h2>{submissions.isPending ? <Busy /> : submissions.isError ? <Failure error={submissions.error} retry={() => void submissions.refetch()} /> : <>
    {submissions.data.length === 0 ? <EmptyState title="No hay entregas pendientes" description="Las respuestas con rúbrica aparecerán aquí cuando los alumnos entreguen su evaluación." /> : <ul className={styles.queue}>{submissions.data.slice(offset, offset + 20).map((item) => <li key={item.id}><p><strong>{item.title}</strong> · {attemptLabels[item.status]}</p><p>{item.submittedAt ? `Entregada el ${formatDateTime(item.submittedAt)}` : `Iniciada el ${formatDateTime(item.startedAt)}`}</p>
      <Button aria-current={attemptId === item.id ? "true" : undefined} onClick={() => open(item.id)}>Consultar entrega</Button></li>)}</ul>}
    <Pages offset={offset} total={submissions.data.length} change={(next) => url.set("pagina", next)} /></>}
    {attemptId ? <ReviewEditor key={attemptId} id={attemptId} next={() => { const following = submissions.data?.find((item) => item.id !== attemptId); if (following) open(following.id); }} /> : null}
  </section>;
}

function ReviewEditor({ id, next }: { id: string; next: () => void }) {
  const queries = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [grades, setGrades] = useState<Record<string, { criteria: Record<string, number>; feedback: string }>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef<Schema["AssessmentReviewRequest"] | null>(null);
  const review = useQuery({ queryKey: ["review", id], queryFn: async ({ signal }) => result(await backend.GET("/api/assessments/attempts/{id}/review", { signal, params: { path: { id } } })) });
  useEffect(() => { if (review.isSuccess) heading.current?.focus(); }, [id, review.isSuccess]);
  const submit = useMutation({ mutationFn: async () => {
    request.current ??= { requestId: crypto.randomUUID(), grades: required(review.data).questions.filter((item) => item.document.rubric).map((item) => ({ questionRevisionId: item.revisionId,
      criteria: required(item.document.rubric).criteria.map((criterion) => ({ criterionId: criterion.id, points: grades[item.revisionId]?.criteria[criterion.id] ?? 0 })), feedback: grades[item.revisionId]?.feedback ?? "" })) };
    return result(await backend.POST("/api/assessments/attempts/{id}/review", { params: { path: { id } }, body: request.current }));
  }, onSuccess: () => { void queries.invalidateQueries({ queryKey: ["review", id] }); void queries.invalidateQueries({ queryKey: ["submissions"] }); setConfirm(false); next(); } });
  if (review.isPending) return <Busy />;
  if (review.isError) return <Failure error={review.error} retry={() => void review.refetch()} />;
  let finalGrades: Schema["AssessmentReviewRequest"]["grades"] = [];
  try { finalGrades = JSON.parse(review.data.review?.gradesJson ?? "[]") as typeof finalGrades; } catch { /* El registro final sigue visible aunque no se pueda representar. */ }
  return <form className={panel} onSubmit={(event) => { event.preventDefault(); setConfirm(true); }}><h3 ref={heading} tabIndex={-1}>Revisión de respuestas</h3><p>Entrega del {formatDateTime(review.data.submittedAt)}. La respuesta y la rúbrica corresponden a la revisión que recibió el alumno.</p>{!review.data.review ? <p>Asigna puntos a cada criterio y escribe comentarios para el alumno. Los cambios se registran al confirmar; no se conservan al salir o recargar.</p> : null}
    {review.data.questions.map((question) => { const grade = grades[question.revisionId] ?? { criteria: {}, feedback: "" }; const answer = review.data.answers.find((item) => item.questionRevisionId === question.revisionId); const given = answer?.text ?? question.document.options.filter((option) => answer?.selectedOptionIds.includes(option.id)).map((option) => option.text).join(", "); return <fieldset key={question.revisionId} disabled={Boolean(review.data.review) || submit.isPending || submit.isError}>
      <legend>{question.document.prompt}</legend><div className={styles.columns}><div><h4>Respuesta del alumno</h4><p className={styles.answer}>{given.trim() ? given : "Sin responder"}</p></div><div><h4>Rúbrica de corrección</h4>
      {question.document.rubric ? <><details><summary>Guía privada de corrección · solo autores</summary><p className={styles.answer}>{question.document.rubric.privateGuidance}</p></details>{question.document.rubric.criteria.map((criterion) => <Field key={criterion.id} title={`${criterion.description} · máximo ${String(criterion.maxPoints)}`}>
        <input required type="number" min="0" max={criterion.maxPoints} step="0.01" value={grade.criteria[criterion.id] ?? finalGrades.find((g) => g.questionRevisionId === question.revisionId)?.criteria.find((c) => c.criterionId === criterion.id)?.points ?? ""} onChange={(event) => { const criteria = Object.fromEntries(Object.entries(grade.criteria).filter(([id]) => id !== criterion.id)); if (event.target.value !== "") criteria[criterion.id] = Number(event.target.value); setGrades({ ...grades, [question.revisionId]: { ...grade, criteria } }); }} /></Field>)}
        <Field title="Comentarios para el alumno"><textarea required maxLength={4000} value={grades[question.revisionId]?.feedback ?? finalGrades.find((g) => g.questionRevisionId === question.revisionId)?.feedback ?? ""} onChange={(event) => setGrades({ ...grades, [question.revisionId]: { ...grade, feedback: event.target.value } })} /></Field></> : <p>Esta pregunta se corrige automáticamente.</p>}</div></div>
    </fieldset>; })}
    <p>Resumen: {review.data.questions.reduce((sum, question) => sum + (question.document.rubric?.criteria.reduce((total, criterion) => total + (grades[question.revisionId]?.criteria[criterion.id] ?? finalGrades.find((g) => g.questionRevisionId === question.revisionId)?.criteria.find((c) => c.criterionId === criterion.id)?.points ?? 0), 0) ?? 0), 0)} puntos asignados de {review.data.questions.reduce((sum, question) => sum + (question.document.rubric?.criteria.reduce((total, c) => total + c.maxPoints, 0) ?? 0), 0)} posibles con rúbrica.</p>
    <Dialog open={confirm} title="¿Confirmar la corrección final?" onClose={() => { if (!submit.isPending) setConfirm(false); }} actions={<><Button disabled={submit.isPending} onClick={() => setConfirm(false)}>{submit.isError ? "Cerrar" : "Seguir corrigiendo"}</Button><Button variant="primary" disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Registrando corrección…" : "Sí, confirmar corrección"}</Button></>}><p>Después de confirmar no podrás modificar la corrección. El alumno verá la nota y los comentarios según cómo se configuró la evaluación. Si hay otra entrega pendiente, se abrirá al terminar.</p>{submit.isError ? <><p>La confirmación no se pudo verificar. Los campos quedan bloqueados; reintenta para registrar la misma corrección sin duplicarla.</p><Failure error={submit.error} retry={() => submit.mutate()} /></> : null}</Dialog>
    {review.data.review ? <p>Corrección final registrada el {formatDateTime(review.data.review.createdAt)}. Ya no se puede modificar.</p> : <Button type="submit" variant="primary" disabled={submit.isPending || submit.isError}>Confirmar corrección final</Button>}
    {submit.isError && !confirm ? <><p>La corrección sigue pendiente de confirmación. Se conserva el envío original; reintentar no cambia los puntos ni duplica la corrección.</p><Failure error={submit.error} retry={() => submit.mutate()} /></> : null}
  </form>;
}
