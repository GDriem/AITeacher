import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend, result, required, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";
import { AttemptView, OwnAttempts } from "./Assessments";

export function LearningReviews() {
  const queries = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [evidenceOffset, setEvidenceOffset] = useState(0);
  const [definitionOffset, setDefinitionOffset] = useState(0);
  const [evidenceId, setEvidenceId] = useState("");
  const [definitionId, setDefinitionId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const request = useRef<{ requestId: string; evidenceId: string; definitionRevisionId: string; dueAt: string } | null>(null);
  const evidence = useQuery({ queryKey: ["evidence", evidenceOffset], queryFn: async ({ signal }) => result(await backend.GET("/api/learning/evidence", { signal, params: { query: { offset: evidenceOffset, limit: 20 } } })) });
  const definitions = useQuery({ queryKey: ["definitions", definitionOffset], queryFn: async ({ signal }) => result(await backend.GET("/api/assessments/definitions", { signal, params: { query: { offset: definitionOffset, limit: 20 } } })) });
  const reviews = useQuery({ queryKey: ["reviews", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/learning/reviews", { signal, params: { query: { offset, limit: 20 } } })) });
  const schedule = useMutation({ mutationFn: async () => {
    request.current ??= { requestId: crypto.randomUUID(), evidenceId, definitionRevisionId: definitionId, dueAt: new Date(dueAt).toISOString() };
    return result(await backend.POST("/api/learning/reviews", { body: request.current }));
  }, onSuccess: () => { request.current = null; setDueAt(""); void queries.invalidateQueries({ queryKey: ["reviews"] }); } });
  const complete = useMutation({ mutationFn: async (id: string) => result(await backend.POST("/api/learning/reviews/{id}/complete", { params: { path: { id } }, body: { attemptId: required(attemptId) } })),
    onSuccess: () => { void queries.invalidateQueries({ queryKey: ["reviews"] }); } });
  const selectedEvidence = evidence.data?.items.find((item) => item.id === evidenceId);
  return <section><h1>Repasos y evidencias</h1><p>En esta beta tu progreso conserva evidencias y fechas. El dominio todavía no está calibrado.</p>
    {evidence.isPending || definitions.isPending ? <Busy /> : evidence.isError || definitions.isError ? <Failure error={evidence.error ?? definitions.error} retry={() => { void evidence.refetch(); void definitions.refetch(); }} /> : <form onSubmit={(event) => { event.preventDefault(); schedule.mutate(); }}>
      <Field title="Evidencia para repasar"><select required value={evidenceId} onChange={(event) => { setEvidenceId(event.target.value); setDefinitionId(""); request.current = null; }}><option value="">Selecciona una evidencia</option>{evidence.data.items.map((item, index) => <option key={item.id} value={item.id}>Evidencia {evidenceOffset + index + 1} · {new Date(item.observedAt).toLocaleString()}</option>)}</select></Field>
      <Pages offset={evidenceOffset} total={evidence.data.total} change={setEvidenceOffset} />
      <Field title="Evaluación para el repaso"><select required value={definitionId} onChange={(event) => { setDefinitionId(event.target.value); request.current = null; }}><option value="">Selecciona una evaluación</option>{definitions.data.items.filter((item) => item.unitRevisionId === selectedEvidence?.unitRevisionId).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      <Pages offset={definitionOffset} total={definitions.data.total} change={setDefinitionOffset} />
      <Field title="Fecha y hora del repaso"><input required type="datetime-local" value={dueAt} onChange={(event) => { setDueAt(event.target.value); request.current = null; }} /></Field>
      <button type="submit" disabled={schedule.isPending}>Programar repaso</button></form>}
    {schedule.isError ? <Failure error={schedule.error} /> : null}{schedule.isSuccess ? <p role="status">Repaso programado.</p> : null}
    <h2>Repasos programados</h2>{reviews.isPending ? <Busy /> : reviews.isError ? <Failure error={reviews.error} retry={() => void reviews.refetch()} /> : <>
      {reviews.data.items.length === 0 ? <p>Todavía no tienes repasos programados.</p> : reviews.data.items.map((item) => <article className="backend-panel" key={item.id}><h3>{new Date(item.dueAt).toLocaleString()}</h3><p>{item.completedAt ? "Completado con un intento corregido" : "Pendiente"}</p>
        {!item.completedAt ? <StartReviewAttempt review={item} select={setAttemptId} /> : null}
        {!item.completedAt ? <button type="button" disabled={!attemptId || complete.isPending} onClick={() => complete.mutate(item.id)}>Completar con el intento seleccionado</button> : null}</article>)}
      <Pages offset={offset} total={reviews.data.total} change={setOffset} /></>}
    {complete.isError ? <Failure error={complete.error} /> : null}
    <p>Para completar un repaso, selecciona un intento nuevo de su evaluación, iniciado después de la fecha prevista y completamente corregido.</p>
    <OwnAttempts select={setAttemptId} />{attemptId ? <AttemptView key={attemptId} id={attemptId} /> : null}
  </section>;
}

function StartReviewAttempt({ review, select }: { review: Schema["LearningReview"]; select: (id: string) => void }) {
  const queries = useQueryClient();
  const requestId = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const due = new Date(review.dueAt).getTime();
  useEffect(() => {
    if (now >= due) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(due - now, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [due, now]);
  const start = useMutation({ mutationFn: async () => {
    requestId.current ??= crypto.randomUUID();
    return result(await backend.POST("/api/assessments/attempts", { body: { definitionRevisionId: review.definitionRevisionId, requestId: requestId.current } }));
  }, onSuccess: (attempt) => {
    requestId.current = null;
    select(attempt.id);
    void queries.invalidateQueries({ queryKey: ["attempts"] });
  } });
  return <><button type="button" disabled={now < due || start.isPending} onClick={() => start.mutate()}>Iniciar intento del repaso</button>
    {now < due ? <p>Podrás iniciar el intento cuando llegue la fecha prevista.</p> : null}
    {start.isError ? <Failure error={start.error} retry={() => start.mutate()} /> : null}</>;
}
