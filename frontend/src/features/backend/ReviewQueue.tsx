import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend, result, required, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";
import { attemptLabels } from "./labels";

export function ReviewQueue() {
  const [offset, setOffset] = useState(0); const [selected, setSelected] = useState<string | null>(null);
  const submissions = useQuery({ queryKey: ["submissions", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/assessments/submissions", { signal, params: { query: { offset, limit: 20 } } })) });
  return <section><h2>Entregas y corrección docente</h2>{submissions.isPending ? <Busy /> : submissions.isError ? <Failure error={submissions.error} retry={() => void submissions.refetch()} /> : <>
    {submissions.data.items.length === 0 ? <p>No hay entregas todavía.</p> : <ul>{submissions.data.items.map((item) => <li key={item.id}><p>{item.title} · {attemptLabels[item.status]}</p>
      <button type="button" onClick={() => setSelected(item.id)}>Consultar entrega</button></li>)}</ul>}
    <Pages offset={offset} total={submissions.data.total} change={setOffset} /></>}
    {selected ? <ReviewEditor key={selected} id={selected} /> : null}
  </section>;
}

function ReviewEditor({ id }: { id: string }) {
  const queries = useQueryClient();
  const [grades, setGrades] = useState<Record<string, { criteria: Record<string, number>; feedback: string }>>({});
  const request = useRef<Schema["AssessmentReviewRequest"] | null>(null);
  const review = useQuery({ queryKey: ["review", id], queryFn: async ({ signal }) => result(await backend.GET("/api/assessments/attempts/{id}/review", { signal, params: { path: { id } } })) });
  const submit = useMutation({ mutationFn: async () => {
    request.current ??= { requestId: crypto.randomUUID(), grades: required(review.data).questions.filter((item) => item.document.rubric).map((item) => ({ questionRevisionId: item.revisionId,
      criteria: required(item.document.rubric).criteria.map((criterion) => ({ criterionId: criterion.id, points: grades[item.revisionId]?.criteria[criterion.id] ?? 0 })), feedback: grades[item.revisionId]?.feedback ?? "" })) };
    return result(await backend.POST("/api/assessments/attempts/{id}/review", { params: { path: { id } }, body: request.current }));
  }, onSuccess: () => { void queries.invalidateQueries({ queryKey: ["review", id] }); void queries.invalidateQueries({ queryKey: ["submissions"] }); } });
  if (review.isPending) return <Busy />;
  if (review.isError) return <Failure error={review.error} retry={() => void review.refetch()} />;
  return <form className="backend-panel" onSubmit={(event) => { event.preventDefault(); submit.mutate(); }}><h3>Revisión de respuestas</h3>
    {review.data.questions.map((question) => { const grade = grades[question.revisionId] ?? { criteria: {}, feedback: "" }; return <fieldset key={question.revisionId} disabled={Boolean(review.data.review) || submit.isPending || submit.isError}>
      <legend>{question.document.prompt}</legend><p>Respuesta del alumno: {review.data.answers.find((answer) => answer.questionRevisionId === question.revisionId)?.text ?? "Sin respuesta textual"}</p>
      {question.document.rubric ? <><p>Guía privada: {question.document.rubric.privateGuidance}</p>{question.document.rubric.criteria.map((criterion) => <Field key={criterion.id} title={`${criterion.description} · máximo ${String(criterion.maxPoints)}`}>
        <input required type="number" min="0" max={criterion.maxPoints} step="0.01" value={grade.criteria[criterion.id] ?? ""} onChange={(event) => setGrades({ ...grades, [question.revisionId]: { ...grade, criteria: { ...grade.criteria, [criterion.id]: Number(event.target.value) } } })} /></Field>)}
        <Field title="Feedback al alumno"><textarea required maxLength={4000} value={grade.feedback} onChange={(event) => setGrades({ ...grades, [question.revisionId]: { ...grade, feedback: event.target.value } })} /></Field></> : <p>Pregunta de corrección determinista.</p>}
    </fieldset>; })}
    {review.data.review ? <p>Corrección final registrada el {new Date(review.data.review.createdAt).toLocaleString()}. La corrección es inmutable.</p> : <button type="submit" disabled={submit.isPending || submit.isError}>Confirmar corrección final</button>}
    {submit.isError ? <Failure error={submit.error} retry={() => submit.mutate()} /> : null}
  </form>;
}
