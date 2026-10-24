import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { formatDateTime } from "./labels";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend, result, required, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";
import { OwnAttempts } from "./Assessments";
import { Button, EmptyState, PageHeader } from "../../ui";
import { Link } from "react-router-dom";
import { usePersonalUrl } from "./usePersonalUrl";
import { attemptPath, useAttemptUnit, usePersonalReviews } from "./personalQueries";
import styles from "./LearningReviews.module.css";

// Comparte el chunk diferido de /evaluaciones/:attemptId.
const AttemptView = lazy(async () => ({ default: (await import("./AttemptRoute")).AttemptView }));

export function LearningReviews() {
  const queries = useQueryClient();
  const url = usePersonalUrl();
  const offset = url.page("pagina");
  const setOffset = (value: number) => url.set("pagina", value);
  const evidenceOffset = url.page("evidencias");
  const setEvidenceOffset = (value: number) => url.setSearch((previous) => {
    const next = new URLSearchParams(previous); next.set("evidencias", String(value)); next.delete("evidencia"); next.delete("definicion"); return next;
  });
  const definitionOffset = url.page("evaluaciones");
  const setDefinitionOffset = (value: number) => url.setSearch((previous) => {
    const next = new URLSearchParams(previous); next.set("evaluaciones", String(value)); next.delete("definicion"); return next;
  });
  const evidenceId = url.search.get("evidencia") ?? "";
  const definitionId = url.search.get("definicion") ?? "";
  const setDefinitionId = (value: string) => url.set("definicion", value);
  const [dueAt, setDueAt] = useState("");
  const attemptId = url.search.get("intento");
  const setAttemptId = (value: string) => url.setSearch((previous) => { const next = new URLSearchParams(previous); next.set("intento", value); next.delete("pregunta"); return next; });
  const step = Math.max(0, Number.parseInt(url.search.get("pregunta") ?? "1", 10) - 1 || 0);
  const request = useRef<{ requestId: string; evidenceId: string; definitionRevisionId: string; dueAt: string } | null>(null);
  const evidence = useQuery({ queryKey: ["evidence", evidenceOffset], queryFn: async ({ signal }) => result(await backend.GET("/api/learning/evidence", { signal, params: { query: { offset: evidenceOffset, limit: 20 } } })) });
  const definitions = useQuery({ queryKey: ["definitions", definitionOffset], queryFn: async ({ signal }) => result(await backend.GET("/api/assessments/definitions", { signal, params: { query: { offset: definitionOffset, limit: 20 } } })) });
  const reviews = usePersonalReviews();
  const selectedReview = url.search.get("repaso");
  const shownReviews = reviews.data?.filter((item) => !selectedReview || item.id === selectedReview) ?? [];
  const schedule = useMutation({ mutationFn: async () => {
    if (request.current && (request.current.evidenceId !== evidenceId || request.current.definitionRevisionId !== definitionId || request.current.dueAt !== new Date(dueAt).toISOString())) request.current = null;
    request.current ??= { requestId: crypto.randomUUID(), evidenceId, definitionRevisionId: definitionId, dueAt: new Date(dueAt).toISOString() };
    return result(await backend.POST("/api/learning/reviews", { body: request.current }));
  }, onSuccess: () => { request.current = null; setDueAt(""); void queries.invalidateQueries({ queryKey: ["reviews"] }); } });
  const complete = useMutation({ mutationFn: async (id: string) => result(await backend.POST("/api/learning/reviews/{id}/complete", { params: { path: { id } }, body: { attemptId: required(attemptId) } })),
    onSuccess: () => { void queries.invalidateQueries({ queryKey: ["reviews"] }); } });
  const selectedEvidence = evidence.data?.items.find((item) => item.id === evidenceId);
  return <section className={styles.screen}><PageHeader title="Repasos y evidencias" description="En esta beta tu progreso conserva evidencias y fechas. El dominio todavía no está calibrado." />
    {evidence.isPending || definitions.isPending ? <Busy /> : evidence.isError || definitions.isError ? <Failure error={evidence.error ?? definitions.error} retry={() => { void evidence.refetch(); void definitions.refetch(); }} /> : evidence.data.total === 0 ? <EmptyState title="Todavía no tienes evidencias" description="Completa una evaluación y espera su corrección. Después podrás programar un repaso." action={<Link to="/catalogo">Buscar una evaluación en una unidad</Link>} /> : <form className={styles.form} onSubmit={(event) => { event.preventDefault(); schedule.mutate(); }}>
      <Field title="Evidencia para repasar"><select required value={evidenceId} onChange={(event) => { const value = event.target.value; url.setSearch((previous) => { const next = new URLSearchParams(previous); next.set("evidencia", value); next.delete("definicion"); return next; }); request.current = null; }}><option value="">Selecciona una evidencia</option>{evidence.data.items.map((item, index) => <option key={item.id} value={item.id}>Evidencia {evidenceOffset + index + 1} · {formatDateTime(item.observedAt)}</option>)}</select></Field>
      {selectedEvidence ? <Link to={attemptPath(selectedEvidence.attemptId)}>Consultar evaluación de origen de la evidencia</Link> : null}
      <Pages offset={evidenceOffset} total={evidence.data.total} change={setEvidenceOffset} />
      <Field title="Evaluación para el repaso"><select required value={definitionId} onChange={(event) => { setDefinitionId(event.target.value); request.current = null; }}><option value="">Selecciona una evaluación</option>{definitions.data.items.filter((item) => item.unitRevisionId === selectedEvidence?.unitRevisionId).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      <Pages offset={definitionOffset} total={definitions.data.total} change={setDefinitionOffset} />
      <Field title="Fecha y hora del repaso"><input required type="datetime-local" value={dueAt} onChange={(event) => { setDueAt(event.target.value); request.current = null; }} /></Field>
      <Button type="submit" variant="primary" disabled={schedule.isPending}>Programar repaso</Button></form>}
    {schedule.isError ? <Failure error={schedule.error} /> : null}{schedule.isSuccess ? <p role="status">Repaso programado.</p> : null}
    <h2>Repasos programados</h2>{selectedReview ? <Link to="/repasos">Ver todos los repasos</Link> : null}{reviews.isPending ? <Busy /> : reviews.isError ? <Failure error={reviews.error} retry={() => void reviews.refetch()} /> : <>
      {shownReviews.length === 0 ? <EmptyState headingLevel={3} title={selectedReview ? "No encontramos este repaso" : "Todavía no tienes repasos programados"} description="Elige una evidencia y una fecha en el formulario para volver a practicar." action={selectedReview ? <Link to="/repasos">Consultar tus repasos</Link> : <Link to="/catalogo">Seguir estudiando</Link>} /> : <ul className={styles.list}>{shownReviews.slice(offset, offset + 20).map((item) => <li key={item.id}><article className={styles.review} id={`repaso-${item.id}`}><h3>{formatDateTime(item.dueAt)}</h3><p>{item.completedAt ? "Completado con un intento corregido" : "Pendiente"}</p><ReviewOrigin review={item} />
        {!item.completedAt ? <StartReviewAttempt review={item} select={setAttemptId} /> : null}
        {!item.completedAt ? <Button disabled={!attemptId || complete.isPending} onClick={() => complete.mutate(item.id)}>Completar con el intento seleccionado</Button> : null}</article></li>)}</ul>}
      <Pages offset={offset} total={shownReviews.length} change={setOffset} /></>}
    {complete.isError ? <Failure error={complete.error} /> : null}
    <p>Para completar un repaso, haz un intento nuevo de su evaluación a partir de la fecha prevista. Cuando esté corregido, selecciónalo aquí.</p>
    <OwnAttempts select={setAttemptId} />{attemptId ? <><Link to={attemptPath(attemptId)}>Abrir evaluación a pantalla completa</Link><Suspense fallback={<Busy />}><AttemptView key={attemptId} id={attemptId} step={step} onStep={(next) => url.set("pregunta", next + 1, true)} /></Suspense></> : null}
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
  return <><Button disabled={now < due || start.isPending} onClick={() => start.mutate()}>Iniciar intento del repaso</Button>
    {now < due ? <p>Podrás iniciar el intento cuando llegue la fecha prevista.</p> : null}
    {start.isError ? <Failure error={start.error} retry={() => start.mutate()} /> : null}</>;
}

function ReviewOrigin({ review }: { review: Schema["LearningReview"] }) {
  const definition = useAttemptUnit(review.definitionRevisionId);
  return <>{definition.isPending ? <Busy /> : definition.isError ? <Failure error={definition.error} retry={() => void definition.refetch()} /> : <p><Link to={`/unidades/${encodeURIComponent(definition.data.unitId)}?pestana=evaluar`}>Volver a la unidad del repaso</Link></p>}
    {review.completedAttemptId ? <p><Link to={attemptPath(review.completedAttemptId)}>Consultar intento del repaso</Link></p> : null}</>;
}
