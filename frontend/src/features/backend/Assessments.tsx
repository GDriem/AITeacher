import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend, result, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";
import { attemptLabels } from "./labels";

export function Assessments({ unit }: { unit: Schema["UnitResponse"] }) {
  const [offset, setOffset] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const definitions = useQuery({ queryKey: ["definitions", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/assessments/definitions", { signal, params: { query: { offset, limit: 20 } } })) });
  const start = useMutation({ mutationFn: async (definitionRevisionId: string) => {
    const requestId = requestIds.current.get(definitionRevisionId) ?? crypto.randomUUID();
    requestIds.current.set(definitionRevisionId, requestId);
    return result(await backend.POST("/api/assessments/attempts", { body: { definitionRevisionId, requestId } }));
  }, onSuccess: (attempt) => { requestIds.current.delete(attempt.definitionRevisionId); setAttemptId(attempt.id); } });
  return <section><h2>Prácticas y evaluaciones</h2>
    {definitions.isPending ? <Busy /> : definitions.isError ? <Failure error={definitions.error} retry={() => void definitions.refetch()} /> : <>
      <ul>{definitions.data.items.filter((item) => item.unitId === unit.id && item.unitRevisionId === unit.revision.id).map((item) => <li key={item.id}>
        <p>{item.title} · {item.mode === "practice" ? "Práctica" : "Evaluación"} · {item.timeLimitMinutes} minutos · hasta {item.maxAttempts} intentos</p>
        <button type="button" disabled={start.isPending} onClick={() => start.mutate(item.id)}>Iniciar {item.title}</button></li>)}</ul>
      <Pages offset={offset} total={definitions.data.total} change={setOffset} />
    </>}
    {start.isError ? <Failure error={start.error} /> : null}
    {attemptId ? <AttemptView key={attemptId} id={attemptId} /> : null}
    <OwnAttempts select={setAttemptId} />
  </section>;
}

export function OwnAttempts({ select }: { select: (id: string) => void }) {
  const [offset, setOffset] = useState(0);
  const attempts = useQuery({ queryKey: ["attempts", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/assessments/attempts", { signal, params: { query: { offset, limit: 20 } } })) });
  return <details><summary>Mis intentos anteriores</summary>
    {attempts.isPending ? <Busy /> : attempts.isError ? <Failure error={attempts.error} retry={() => void attempts.refetch()} /> : <>
      {attempts.data.items.length === 0 ? <p>Aún no has iniciado evaluaciones.</p> : <ul>{attempts.data.items.map((item) => <li key={item.id}><p>{item.title} · {attemptLabels[item.status]} · {new Date(item.startedAt).toLocaleString()}</p>
        <button type="button" onClick={() => select(item.id)}>{item.status === "inProgress" ? "Retomar" : "Consultar"}</button></li>)}</ul>}
      <Pages offset={offset} total={attempts.data.total} change={setOffset} /></>}
  </details>;
}

export function AttemptView({ id }: { id: string }) {
  const queries = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, { selectedOptionIds: string[]; text?: string }>>({});
  const submission = useRef<Schema["SubmitAssessmentAttempt"] | null>(null);
  const attempt = useQuery({ queryKey: ["attempt", id], queryFn: async ({ signal }) => result(await backend.GET("/api/assessments/attempts/{id}", { signal, params: { path: { id } } })) });
  const submit = useMutation({ mutationFn: async (body: Schema["SubmitAssessmentAttempt"]) => result(await backend.POST("/api/assessments/attempts/{id}/submit", { params: { path: { id } }, body })),
    onSuccess: (value) => { queries.setQueryData(["attempt", id], value); void queries.invalidateQueries({ queryKey: ["attempts"] }); } });
  if (attempt.isPending) return <Busy />;
  if (attempt.isError) return <Failure error={attempt.error} retry={() => void attempt.refetch()} />;
  const value = attempt.data;
  const locked = value.status !== "inProgress" || submit.isPending || submit.isError;
  const send = () => {
    submission.current ??= { answers: value.questions.map((question) => ({ questionRevisionId: question.revisionId, ...(answers[question.revisionId] ?? { selectedOptionIds: [] }) })) };
    submit.mutate(submission.current);
  };
  return <article className="backend-panel"><h3>{value.title}</h3><p role="status">{attemptLabels[value.status]}</p>
    <p>Vence: {new Date(value.expiresAt).toLocaleString()}. Ayudas durante la evaluación: ninguna.</p>
    <form onSubmit={(event) => { event.preventDefault(); send(); }}>{value.questions.map((question, index) => {
      const answer = answers[question.revisionId] ?? value.answers?.find((item) => item.questionRevisionId === question.revisionId) ?? { selectedOptionIds: [] };
      const open = ["openResponse", "caseAnalysis", "practicalExercise"].includes(question.type);
      return <fieldset key={question.revisionId} disabled={locked}><legend>{index + 1}. {question.prompt}</legend>
        {open ? <Field title="Tu respuesta"><textarea maxLength={20000} value={answer.text ?? ""} onChange={(event) => setAnswers((previous) => ({ ...previous, [question.revisionId]: { selectedOptionIds: [], text: event.target.value } }))} /></Field>
          : question.options.map((option) => <label className="backend-choice" key={option.id}><input type={question.type === "multipleChoice" ? "checkbox" : "radio"}
            name={`question-${question.revisionId}`} checked={answer.selectedOptionIds.includes(option.id)} onChange={(event) => {
              const selectedOptionIds = question.type !== "multipleChoice" ? [option.id] : event.target.checked ? [...answer.selectedOptionIds, option.id] : answer.selectedOptionIds.filter((item) => item !== option.id);
              setAnswers((previous) => ({ ...previous, [question.revisionId]: { selectedOptionIds } }));
            }} />{option.text}</label>)}
      </fieldset>;
    })}
      {value.status === "inProgress" ? <button type="submit" disabled={locked}>Entregar respuestas</button> : null}</form>
    {submit.isError ? <Failure error={submit.error} retry={send} /> : null}
    {value.status === "pendingReview" ? <p>Tu docente revisará las respuestas con la rúbrica fijada al iniciar.</p> : null}
    {value.fraction !== null ? <p className="backend-feedback">Resultado: {Math.round(value.fraction * 100)} %</p> : value.submittedAt ? <p>El resultado se mostrará según la política de esta evaluación.</p> : null}
    {value.scores?.map((score) => <p key={score.questionRevisionId}>{score.feedback}</p>)}
  </article>;
}
