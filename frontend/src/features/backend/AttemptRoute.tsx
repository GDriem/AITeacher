import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, PageHeader, type BadgeTone } from "../../ui";
import { backend, required, result, type Schema } from "./client";
import { Busy, Failure, Field } from "./Shared";
import { attemptLabels } from "./labels";
import { panel } from "./panel";
import shared from "./Shared.module.css";
import styles from "./Attempt.module.css";

type Attempt = Schema["AssessmentAttempt"];
type Question = Attempt["questions"][number];
interface Answer { selectedOptionIds: string[]; text?: string }
type Answers = Record<string, Answer>;

const openTypes: readonly Question["type"][] = ["openResponse", "caseAnalysis", "practicalExercise"];
const isOpen = (question: Question) => openTypes.includes(question.type);
const isAnswered = (question: Question, answer: Answer | undefined) =>
  isOpen(question) ? (answer?.text ?? "").trim() !== "" : (answer?.selectedOptionIds.length ?? 0) > 0;
const modeLabels = { assessment: "Evaluación", practice: "Práctica" };
const statusTones: Record<Attempt["status"], BadgeTone> = { inProgress: "info", submitted: "success", expired: "danger", pendingReview: "warning" };

/**
 * Intento de evaluación con URL propia. El paso vive en `?pregunta=` y reemplaza la entrada del historial:
 * recargar o volver con Atrás reabre la misma pregunta, y Atrás sale del intento en lugar de recorrer preguntas.
 */
export function AttemptRoute() {
  const id = required(useParams().attemptId);
  const [search, setSearch] = useSearchParams();
  const step = Math.max(0, Number.parseInt(search.get("pregunta") ?? "1", 10) - 1 || 0);
  return <AttemptView key={id} id={id} variant="page" step={step}
    onStep={(next) => setSearch((previous) => { previous.set("pregunta", String(next + 1)); return previous; }, { replace: true })} />;
}

// El servidor no guarda respuestas parciales: el borrador se conserva en la pestaña para sobrevivir a una recarga.
const draftKey = (id: string) => `aiteacher.intento.${id}`;
function readDraft(id: string): Answers {
  try { return JSON.parse(sessionStorage.getItem(draftKey(id)) ?? "{}") as Answers; } catch { return {}; }
}
function writeDraft(id: string, answers: Answers | null) {
  try { if (answers) sessionStorage.setItem(draftKey(id), JSON.stringify(answers)); else sessionStorage.removeItem(draftKey(id)); }
  catch { /* Sin almacenamiento disponible el borrador sólo vive en memoria. */ }
}

/** `page` es la pantalla dedicada (con `h1`); `inline` se incrusta en Repasos bajo un `h2`. */
export function AttemptView({ id, variant = "inline", step: controlledStep, onStep }: {
  id: string; variant?: "page" | "inline"; step?: number; onStep?: (step: number) => void;
}) {
  const queries = useQueryClient();
  const [ownStep, setOwnStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(() => readDraft(id));
  const [confirming, setConfirming] = useState(false);
  const submission = useRef<Schema["SubmitAssessmentAttempt"] | null>(null);
  const attempt = useQuery({ queryKey: ["attempt", id], queryFn: async ({ signal }) => result(await backend.GET("/api/assessments/attempts/{id}", { signal, params: { path: { id } } })) });
  const submit = useMutation({ mutationFn: async (body: Schema["SubmitAssessmentAttempt"]) => result(await backend.POST("/api/assessments/attempts/{id}/submit", { params: { path: { id } }, body })),
    onSuccess: (value) => { writeDraft(id, null); queries.setQueryData(["attempt", id], value); void queries.invalidateQueries({ queryKey: ["attempts"] }); },
    onSettled: () => setConfirming(false) });
  const page = variant === "page";
  if (attempt.isPending) return <Busy />;
  if (attempt.isError) return <Failure error={attempt.error} retry={() => void attempt.refetch()} />;
  const value = attempt.data;
  const total = value.questions.length;
  const header = page
    ? <PageHeader title={value.title} eyebrow={`${modeLabels[value.mode]} · ${String(total)} ${total === 1 ? "pregunta" : "preguntas"}`}
      breadcrumbs={[{ label: "Inicio", to: "/" }, { label: modeLabels[value.mode] }]}
      description={value.status === "inProgress" ? "Sin ayudas durante el intento. Tus respuestas se guardan en esta pestaña hasta entregarlas." : undefined} />
    : <h2>{value.title}</h2>;
  if (value.status !== "inProgress") return <article className={page ? styles.screen : panel}>{header}<AttemptResult value={value} page={page} focus={submit.isSuccess} /></article>;
  const step = Math.min(controlledStep ?? ownStep, Math.max(0, total - 1));
  const go = (next: number) => { if (onStep) onStep(next); else setOwnStep(next); };
  const update = (question: Question, answer: Answer) => setAnswers((previous) => {
    const next = { ...previous, [question.revisionId]: answer };
    writeDraft(id, next);
    return next;
  });
  const send = () => {
    submission.current ??= { answers: value.questions.map((question) => ({ questionRevisionId: question.revisionId, ...(answers[question.revisionId] ?? { selectedOptionIds: [] }) })) };
    submit.mutate(submission.current);
  };
  return <article className={page ? styles.screen : panel}>{header}
    <AttemptRunner value={value} answers={answers} step={step} go={go} update={update} page={page}
      locked={submit.isPending || submit.isError} expired={attempt.refetch} confirm={() => setConfirming(true)} />
    {submit.isError ? <Failure title="No se pudo entregar" error={submit.error} retry={send} /> : null}
    <SubmitDialog open={confirming} value={value} answers={answers} pending={submit.isPending} close={() => setConfirming(false)} send={send} />
  </article>;
}

function AttemptRunner({ value, answers, step, go, update, page, locked, expired, confirm }: {
  value: Attempt; answers: Answers; step: number; go: (step: number) => void; update: (question: Question, answer: Answer) => void;
  page: boolean; locked: boolean; expired: () => Promise<unknown>; confirm: () => void;
}) {
  const remaining = useRemaining(value.expiresAt);
  const outOfTime = remaining === 0;
  // El reloj local puede estar adelantado: sólo el servidor cierra el intento.
  // Si aún sigue abierto, consultar hasta confirmar el vencimiento sin impedir la entrega.
  useEffect(() => {
    if (!outOfTime) return;
    void expired();
    const timer = window.setInterval(() => void expired(), 5000);
    return () => window.clearInterval(timer);
  }, [outOfTime, expired]);
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef(step);
  // Al cambiar de pregunta el foco va a su título para que el lector de pantalla la anuncie; no al abrir el intento.
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    heading.current?.focus({ preventScroll: true });
    if (typeof heading.current?.scrollIntoView === "function") heading.current.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [step]);
  const total = value.questions.length;
  const answered = value.questions.filter((question) => isAnswered(question, answers[question.revisionId])).length;
  const question = value.questions[step];
  const last = step >= total - 1;
  const disabled = locked;
  const Heading = page ? "h2" : "h3";
  return <>
    <div className={styles.status}>
      <div className={styles.progress}>
        <p className={styles.progressLabel} id={`progreso-${value.id}`}>{answered} de {total} respondidas</p>
        <div className={styles.bar} role="progressbar" aria-labelledby={`progreso-${value.id}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}>
          <span style={{ inlineSize: `${String(total === 0 ? 100 : (answered / total) * 100)}%` }} />
        </div>
      </div>
      <p className={[styles.clock, remaining <= 60_000 ? styles.urgent : ""].join(" ")}>
        <span className={styles.clockLabel}>Tiempo restante</span> <time dateTime={`PT${String(Math.ceil(remaining / 1000))}S`}>{clock(remaining)}</time>
      </p>
      <p className={styles.visuallyHidden} role="status">{outOfTime ? "Comprobando el tiempo disponible." : remaining <= 60_000 ? "Queda un minuto." : remaining <= 300_000 ? "Quedan cinco minutos." : ""}</p>
    </div>
    {outOfTime ? <p className={styles.notice}>Estamos comprobando el tiempo disponible. Puedes seguir respondiendo y entregar mientras la evaluación siga abierta.</p> : null}
    {total > 1 ? <nav aria-label="Preguntas" className={styles.steps}><ol>{value.questions.map((item, index) => {
      const done = isAnswered(item, answers[item.revisionId]);
      return <li key={item.revisionId}><button type="button" className={[styles.stepButton, done ? styles.done : ""].join(" ")} aria-current={index === step ? "step" : undefined}
        aria-label={`Pregunta ${String(index + 1)}, ${done ? "respondida" : "sin responder"}`} onClick={() => go(index)}>{index + 1}</button></li>;
    })}</ol></nav> : null}
    <form className={styles.question} onSubmit={(event) => { event.preventDefault(); if (!last) go(step + 1); else if (!disabled) confirm(); }}>
      {question ? <>
        <Heading ref={heading} tabIndex={-1} className={styles.stepTitle}>Pregunta {step + 1} de {total}</Heading>
        <QuestionStep key={question.revisionId} question={question} answer={answers[question.revisionId]} disabled={disabled} change={(answer) => update(question, answer)} />
      </> : <p>Esta evaluación no tiene preguntas.</p>}
      <div className={styles.actions}>
        {step > 0 ? <Button onClick={() => go(step - 1)}>Anterior</Button> : null}
        {!last ? <Button type="submit" variant="primary">Siguiente</Button> : null}
        <Button type={last ? "submit" : "button"} variant={last ? "primary" : "ghost"} disabled={disabled} onClick={last ? undefined : confirm}>Entregar respuestas</Button>
      </div>
    </form>
  </>;
}

function QuestionStep({ question, answer, disabled, change }: { question: Question; answer: Answer | undefined; disabled: boolean; change: (answer: Answer) => void }) {
  const selected = answer?.selectedOptionIds ?? [];
  if (isOpen(question)) return <fieldset disabled={disabled} className={styles.fieldset}><legend className={styles.prompt}>{question.prompt}</legend>
    <Field title="Tu respuesta" hint="Tu docente la corregirá con una rúbrica."><textarea maxLength={20000} rows={8} value={answer?.text ?? ""} onChange={(event) => change({ selectedOptionIds: [], text: event.target.value })} /></Field>
  </fieldset>;
  const multiple = question.type === "multipleChoice";
  return <fieldset disabled={disabled} className={styles.fieldset}><legend className={styles.prompt}>{question.prompt}</legend>
    {multiple ? <p className={shared.hint}>Puedes elegir varias opciones.</p> : null}
    <div className={styles.options}>{question.options.map((option) => <label className={[shared.choice, styles.option].join(" ")} key={option.id}>
      <input type={multiple ? "checkbox" : "radio"} name={`pregunta-${question.revisionId}`} checked={selected.includes(option.id)} onChange={(event) => change({
        selectedOptionIds: !multiple ? [option.id] : event.target.checked ? [...selected, option.id] : selected.filter((item) => item !== option.id) })} />{option.text}</label>)}</div>
  </fieldset>;
}

function SubmitDialog({ open, value, answers, pending, close, send }: { open: boolean; value: Attempt; answers: Answers; pending: boolean; close: () => void; send: () => void }) {
  const missing = value.questions.filter((question) => !isAnswered(question, answers[question.revisionId])).length;
  const rubric = value.questions.some((question) => question.scoringPolicy === "rubric");
  return <Dialog open={open} title="¿Entregar la evaluación?" onClose={close} actions={<>
    <Button onClick={close} disabled={pending}>Seguir respondiendo</Button>
    <Button variant="primary" onClick={send} disabled={pending}>{pending ? "Entregando…" : "Sí, entregar"}</Button>
  </>}>
    <p>Respondiste {value.questions.length - missing} de {value.questions.length} preguntas.{missing > 0 ? ` ${missing === 1 ? "La pregunta sin responder cuenta" : "Las preguntas sin responder cuentan"} como cero.` : ""}</p>
    {rubric ? <p>Las respuestas abiertas quedarán pendientes de corrección docente.</p> : null}
    <p>Después de entregar no podrás cambiar tus respuestas.</p>
  </Dialog>;
}

/**
 * Resultado según la política del contrato: `afterSubmission` muestra la nota al entregar (inmediato) o, si hay
 * rúbrica, después de la corrección docente (posterior); `never` no muestra nota ni aciertos.
 */
function AttemptResult({ value, page, focus }: { value: Attempt; page: boolean; focus: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Tras entregar, el formulario desaparece: el foco pasa al resultado.
  useEffect(() => { if (focus) heading.current?.focus(); }, [focus]);
  const Heading = page ? "h2" : "h3";
  const scores = new Map(value.scores?.map((score) => [score.questionRevisionId, score]));
  const answers = new Map(value.answers?.map((answer) => [answer.questionRevisionId, answer]));
  const summary = value.status === "expired" ? "El tiempo terminó antes de entregar. Las respuestas no se registraron."
    : value.status === "pendingReview" ? value.feedback === "never" ? "Tu docente revisará las respuestas con la rúbrica fijada al iniciar. Esta evaluación no muestra la nota."
      : "Tu docente revisará las respuestas con la rúbrica fijada al iniciar. La nota y los comentarios aparecerán aquí al terminar la corrección."
      : value.feedback === "never" ? "Entrega registrada. Esta evaluación no muestra la nota ni los aciertos." : null;
  return <section className={styles.result} aria-labelledby={`resultado-${value.id}`}>
    <Heading id={`resultado-${value.id}`} ref={heading} tabIndex={-1}>Tu entrega</Heading>
    <p role="status"><Badge tone={statusTones[value.status]}>{attemptLabels[value.status]}</Badge></p>
    {value.fraction !== null ? <p className={styles.score}>Resultado: {Math.round(value.fraction * 100)} %</p> : null}
    {summary ? <p>{summary}</p> : null}
    {value.submittedAt ? <p className={shared.hint}>Entregada el {new Date(value.submittedAt).toLocaleString()}.</p> : null}
    {value.answers ? <ol className={styles.review}>{value.questions.map((question, index) => {
      const score = scores.get(question.revisionId);
      const answer = answers.get(question.revisionId);
      const chosen = question.options.filter((option) => answer?.selectedOptionIds.includes(option.id)).map((option) => option.text);
      const given = (isOpen(question) ? answer?.text?.trim() : chosen.join(", ")) ?? "";
      return <li key={question.revisionId} className={styles.reviewItem}>
        <p className={styles.reviewPrompt}>{index + 1}. {question.prompt}</p>
        <p className={styles.answer}><span className={shared.hint}>Tu respuesta:</span> {given === "" ? "Sin responder" : given}</p>
        {score ? <p><Badge tone={score.isCorrect ? "success" : score.fraction > 0 ? "warning" : "danger"}>
          {score.isCorrect ? "Correcta" : score.fraction > 0 ? `Parcial · ${String(Math.round(score.fraction * 100))} %` : "Incorrecta"}</Badge></p> : null}
        {score?.feedback ? <p className={shared.feedback}>{score.feedback}</p> : null}
      </li>;
    })}</ol> : null}
  </section>;
}

/** Milisegundos hasta el vencimiento que fija el servidor; se actualiza cada segundo y se detiene en cero. */
function useRemaining(expiresAt: string) {
  const end = new Date(expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const done = now >= end;
  useEffect(() => {
    if (done) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [done]);
  return Math.max(0, end - now);
}

function clock(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), rest = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${String(hours)}:${pad(minutes)}:${pad(rest)}` : `${String(minutes)}:${pad(rest)}`;
}
