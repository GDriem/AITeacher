import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { useMutation } from "@tanstack/react-query";

import { ApiError } from "../../api/ApiError";
import { EvaluationResult } from "./EvaluationResult";
import { evaluateAnswer, type EvaluationResponse, type PendingQuiz } from "./evaluationApi";
import styles from "./LearningCycle.module.css";

interface Props {
  studentId: string;
  sessionId: string;
  pendingQuiz: PendingQuiz;
  tutorBusy: boolean;
  onBusyChange: (busy: boolean) => void;
  onCompleted: (result: EvaluationResponse) => Promise<void>;
  onStartPractice: (concept: string | null) => void;
  onTutorPrompt: (prompt: string) => void;
}

function aborted(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function EvaluationPanel({
  studentId,
  sessionId,
  pendingQuiz,
  tutorBusy,
  onBusyChange,
  onCompleted,
  onStartPractice,
  onTutorPrompt,
}: Props) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [quizOverride, setQuizOverride] = useState<PendingQuiz | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mutation = useMutation({
    mutationFn: ({ value, signal }: { value: string; signal: AbortSignal }) =>
      evaluateAnswer(studentId, sessionId, value, signal),
  });
  const quiz = quizOverride ?? pendingQuiz;

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

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
      setAnswer("");
      setResult(response);
      await onCompleted(response);
    } catch (caught) {
      if (!aborted(caught)) {
        setError(caught instanceof ApiError ? caught.message : "La evaluación no está disponible en este momento.");
        textareaRef.current?.focus();
      }
    } finally {
      abortRef.current = null;
      onBusyChange(false);
    }
  };

  if (result) {
    return (
      <EvaluationResult
        result={result}
        tutorBusy={tutorBusy}
        onContinue={() => {
          setQuizOverride({ question: result.next_quiz.question, attempt: result.attempt + 1 });
          setResult(null);
          setError(null);
        }}
        onStartPractice={onStartPractice}
        onTutorPrompt={onTutorPrompt}
      />
    );
  }

  return (
    <section className={styles.quiz} aria-labelledby="pending-quiz-title">
      <header>
        <div>
          <p className={styles.kicker}>Comprueba tu comprensión</p>
          <h3 id="pending-quiz-title">Pregunta pendiente</h3>
        </div>
        <span>Ronda {String(quiz.attempt)}</span>
      </header>
      <p className={styles.question}>{quiz.question}</p>
      <form aria-busy={mutation.isPending} onSubmit={(event) => void submit(event)}>
        <label htmlFor="evaluation-answer">Explícalo con tus propias palabras</label>
        <textarea
          ref={textareaRef}
          id="evaluation-answer"
          rows={4}
          maxLength={2000}
          required
          value={answer}
          aria-describedby="evaluation-help evaluation-count"
          placeholder="Responde a la pregunta con tus propias palabras…"
          onChange={(event) => setAnswer(event.currentTarget.value)}
        />
        {error ? (
          <div className={styles.formError} role="alert">
            <p><strong>No pudimos evaluar tu respuesta.</strong> {error}</p>
            <button type="submit" disabled={mutation.isPending || tutorBusy}>Reintentar</button>
          </div>
        ) : null}
        <div className={styles.formFooter}>
          <span id="evaluation-help">Tomamos en cuenta tus respuestas anteriores del mismo tema.</span>
          <span id="evaluation-count">{String(answer.length)}/2000</span>
          <button className={styles.primaryAction} type="submit" disabled={!answer.trim() || mutation.isPending || tutorBusy}>
            {mutation.isPending ? "Analizando…" : "Recibir feedback"}
          </button>
        </div>
      </form>
    </section>
  );
}
