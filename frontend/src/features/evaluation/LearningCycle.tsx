import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { ApiError } from "../../api/ApiError";
import { PracticePanel } from "../practice/PracticePanel";
import { startPractice, type PracticeExercise } from "../practice/practiceApi";
import { EvaluationPanel } from "./EvaluationPanel";
import type { EvaluationResponse, PendingQuiz, StudentProgress } from "./evaluationApi";
import styles from "./LearningCycle.module.css";

interface Props {
  studentId: string;
  sessionId: string;
  pendingQuiz: PendingQuiz;
  pendingPractice: PracticeExercise | null;
  tutorBusy: boolean;
  onBusyChange: (busy: boolean) => void;
  onEvaluationCompleted: (result: EvaluationResponse) => Promise<void>;
  onPracticeCompleted: (progress: StudentProgress) => Promise<void>;
  onPracticeStarted: () => Promise<void>;
  onTutorPrompt: (prompt: string) => void;
}

function aborted(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function LearningCycle({
  studentId,
  sessionId,
  pendingQuiz,
  pendingPractice,
  tutorBusy,
  onBusyChange,
  onEvaluationCompleted,
  onPracticeCompleted,
  onPracticeStarted,
  onTutorPrompt,
}: Props) {
  const [exercise, setExercise] = useState<PracticeExercise | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [retryConcept, setRetryConcept] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startMutation = useMutation({
    mutationFn: ({ concept, signal }: { concept: string | null; signal: AbortSignal }) =>
      startPractice(studentId, sessionId, concept, signal),
  });

  useEffect(() => () => {
    abortRef.current?.abort();
    onBusyChange(false);
  }, [onBusyChange]);

  const openPractice = async (concept: string | null) => {
    if (tutorBusy || startMutation.isPending) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRetryConcept(concept);
    setStartError(null);
    onBusyChange(true);
    try {
      const response = await startMutation.mutateAsync({ concept, signal: controller.signal });
      setExercise(response.exercise);
      await onPracticeStarted();
    } catch (caught) {
      if (!aborted(caught)) {
        setStartError(caught instanceof ApiError ? caught.message : "No pudimos preparar la práctica.");
      }
    } finally {
      abortRef.current = null;
      onBusyChange(false);
    }
  };

  if (exercise) {
    return (
      <PracticePanel
        studentId={studentId}
        sessionId={sessionId}
        initialExercise={exercise}
        tutorBusy={tutorBusy}
        onBusyChange={onBusyChange}
        onCompleted={onPracticeCompleted}
        onReturn={() => setExercise(null)}
      />
    );
  }

  return (
    <div className={styles.station}>
      <div className={styles.stationHeader}>
        <span aria-hidden="true">01</span>
        <div>
          <p className={styles.kicker}>Estación de aprendizaje</p>
          <h2>Explica, comprueba y practica</h2>
        </div>
        {pendingPractice ? (
          <button type="button" disabled={tutorBusy} onClick={() => setExercise(pendingPractice)}>
            Reanudar práctica · ronda {String(pendingPractice.round)}
          </button>
        ) : null}
      </div>
      {startError ? (
        <div className={styles.startError} role="alert">
          <p><strong>No pudimos abrir la práctica.</strong> {startError}</p>
          <button type="button" disabled={startMutation.isPending || tutorBusy} onClick={() => void openPractice(retryConcept)}>Reintentar</button>
        </div>
      ) : null}
      <EvaluationPanel
        studentId={studentId}
        sessionId={sessionId}
        pendingQuiz={pendingQuiz}
        tutorBusy={tutorBusy}
        onBusyChange={onBusyChange}
        onCompleted={onEvaluationCompleted}
        onStartPractice={(concept) => void openPractice(concept)}
        onTutorPrompt={onTutorPrompt}
      />
    </div>
  );
}
