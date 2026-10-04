import { useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./TutorScreen.module.css";

interface Props {
  busy: boolean;
  responseId: string | null;
  /** Cambia cuando el alumno vuelve al texto desde la voz; abre la conversación escrita. */
  textRequest: number;
  conversation: ReactNode;
  evaluation: ReactNode;
}

export function TutorLearningOptions({ busy, responseId, textRequest, conversation, evaluation }: Props) {
  const [mode, setMode] = useState<"choice" | "conversation" | "evaluation">("choice");
  // Una respuesta recién recibida enfoca la elección aunque monte este componente.
  const lastResponseRef = useRef<string | null>(null);
  const choiceRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastModeRef = useRef(mode);
  const lastTextRequestRef = useRef(textRequest);

  useEffect(() => {
    if (responseId && responseId !== lastResponseRef.current) {
      lastResponseRef.current = responseId;
      setMode("choice");
      choiceRef.current?.focus();
    }
  }, [responseId]);

  useEffect(() => {
    if (textRequest !== lastTextRequestRef.current) {
      lastTextRequestRef.current = textRequest;
      setMode("conversation");
    }
  }, [textRequest]);

  useEffect(() => {
    // Al montar (por ejemplo, al abrir una conversación guardada) el foco queda en el encabezado.
    if (mode === lastModeRef.current) return;
    lastModeRef.current = mode;
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
