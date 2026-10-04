import { useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./TutorScreen.module.css";

interface Props {
  busy: boolean;
  responseId: string | null;
  conversation: ReactNode;
  evaluation: ReactNode;
}

export function TutorLearningOptions({ busy, responseId, conversation, evaluation }: Props) {
  const [mode, setMode] = useState<"choice" | "conversation" | "evaluation">("choice");
  const lastResponseRef = useRef(responseId);
  const choiceRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (responseId && responseId !== lastResponseRef.current) {
      lastResponseRef.current = responseId;
      setMode("choice");
      choiceRef.current?.focus();
    }
  }, [responseId]);

  useEffect(() => {
    if (mode === "choice") choiceRef.current?.focus();
    else contentRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }, [mode]);

  return (
    <div className={styles.learningOptions}>
      <p>¿Quieres profundizar en el tema o tomar la prueba?</p>
      <div className={styles.learningActions}>
        <button ref={choiceRef} className={styles.voiceButton} type="button" disabled={busy} aria-pressed={mode === "conversation"} onClick={() => setMode("conversation")}>
          Profundizar en el tema
        </button>
        <button className={styles.voiceButton} type="button" disabled={busy} aria-pressed={mode === "evaluation"} onClick={() => setMode("evaluation")}>
          Tomar la prueba
        </button>
      </div>
      <div ref={contentRef}>
        {mode === "conversation" ? conversation : mode === "evaluation" ? evaluation : null}
      </div>
    </div>
  );
}
