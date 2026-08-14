import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { useMutation } from "@tanstack/react-query";

import { ApiError } from "../../api/ApiError";
import { EvaluationRubric } from "../evaluation/EvaluationRubric";
import type { StudentProgress } from "../evaluation/evaluationApi";
import styles from "../evaluation/LearningCycle.module.css";
import { evaluatePractice, type PracticeEvaluationResponse, type PracticeExercise } from "./practiceApi";

const difficultyLabels: Record<PracticeExercise["difficulty"], string> = {
  foundation: "Fundamentos",
  application: "Aplicación",
  challenge: "Desafío",
};

interface Props {
  studentId: string;
  sessionId: string;
  initialExercise: PracticeExercise;
  tutorBusy: boolean;
  onBusyChange: (busy: boolean) => void;
  onCompleted: (progress: StudentProgress) => Promise<void>;
  onReturn: () => void;
}

function aborted(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function PracticePanel({ studentId, sessionId, initialExercise, tutorBusy, onBusyChange, onCompleted, onReturn }: Props) {
  const [exercise, setExercise] = useState(initialExercise);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PracticeEvaluationResponse | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mutation = useMutation({
    mutationFn: ({ value, signal }: { value: string; signal: AbortSignal }) =>
      evaluatePractice(studentId, sessionId, value, signal),
  });

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = answer.trim();
    if (!value || mutation.isPending || tutorBusy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    onBusyChange(true);
    try {
      const response = await mutation.mutateAsync({ value, signal: controller.signal });
      setResult(response);
      await onCompleted(response.progress);
    } catch (caught) {
      if (!aborted(caught)) {
        setError(caught instanceof ApiError ? caught.message : "La práctica no está disponible en este momento.");
        textareaRef.current?.focus();
      }
    } finally {
      abortRef.current = null;
      onBusyChange(false);
    }
  };

  const nextExercise = () => {
    if (!result) return;
    setExercise(result.next_exercise);
    setAnswer("");
    setError(null);
    setResult(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <section className={styles.practice} aria-labelledby="practice-title">
      <header className={styles.practiceHeading}>
        <div>
          <p className={styles.kicker}>Práctica adaptativa</p>
          <h3 id="practice-title">{exercise.title}</h3>
        </div>
        <span>{difficultyLabels[exercise.difficulty]} · ronda {String(exercise.round)}</span>
      </header>
      <div className={styles.practicePrompt}>
        <p>{exercise.prompt}</p>
        <p><strong>Pista:</strong> {exercise.hint}</p>
        <ul aria-label="Conceptos de esta práctica">
          {exercise.focus_concepts.map((concept) => <li key={concept}>{concept}</li>)}
        </ul>
      </div>

      {result ? (
        <section className={styles.practiceResult} data-status={result.status} aria-labelledby="practice-result-title">
          <h4 ref={resultRef} id="practice-result-title" tabIndex={-1}>{String(Math.round(result.score))}/100 · Resultado de práctica</h4>
          <p>{result.feedback}</p>
          <EvaluationRubric rubric={result.rubric} compact />
          <div className={styles.resultActions}>
            <button className={styles.primaryAction} type="button" onClick={nextExercise}>Siguiente ejercicio</button>
            <button type="button" onClick={onReturn}>Volver a la evaluación</button>
          </div>
        </section>
      ) : (
        <form aria-busy={mutation.isPending} onSubmit={(event) => void submit(event)}>
          <label htmlFor="practice-answer">Tu resolución</label>
          <textarea
            ref={textareaRef}
            id="practice-answer"
            rows={4}
            maxLength={2000}
            required
            value={answer}
            aria-describedby="practice-count"
            placeholder="Resuelve el ejercicio con tus propias palabras…"
            onChange={(event) => setAnswer(event.currentTarget.value)}
          />
          {error ? <p className={styles.formError} role="alert"><strong>No pudimos comprobar la práctica.</strong> {error}</p> : null}
          <div className={styles.formFooter}>
            <span>El siguiente ejercicio se ajustará a este intento.</span>
            <span id="practice-count">{String(answer.length)}/2000</span>
            <button className={styles.primaryAction} type="submit" disabled={!answer.trim() || mutation.isPending || tutorBusy}>
              {mutation.isPending ? "Analizando…" : "Comprobar práctica"}
            </button>
          </div>
          <button className={styles.returnAction} type="button" onClick={onReturn}>Volver a la pregunta principal</button>
        </form>
      )}
    </section>
  );
}
