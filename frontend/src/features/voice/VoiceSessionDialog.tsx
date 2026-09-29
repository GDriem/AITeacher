import { useEffect, useEffectEvent, useRef } from "react";
import { createPortal } from "react-dom";

import { useVoiceSession } from "./useVoiceSession";
import type { VoicePhase } from "./voiceMachine";
import styles from "./VoiceSessionDialog.module.css";

export interface VoiceSessionDialogProps {
  activeSessionId: string | null;
  studentId: string;
  onClose: () => void;
  onFallback: () => void;
}

const phaseCopy: Record<VoicePhase, { title: string; detail: string }> = {
  disconnected: { title: "Conversación finalizada", detail: "Puedes continuar en el chat de texto." },
  connecting: { title: "Preparando el micrófono…", detail: "La conversación comenzará en un momento." },
  listening: { title: "Te escucho", detail: "Habla cuando quieras. No necesitas pulsar nada más." },
  responding: { title: "El tutor está respondiendo", detail: "Puedes interrumpir el audio y hablar de inmediato." },
  error: { title: "La voz no está disponible", detail: "Reintenta o vuelve al chat sin perder el contexto." },
};

export function VoiceSessionDialog({ activeSessionId, studentId, onClose, onFallback }: VoiceSessionDialogProps) {
  const voice = useVoiceSession(studentId, activeSessionId);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const copy = phaseCopy[voice.state.phase];
  const finishFromKeyboard = useEffectEvent(() => {
    voice.end();
    onClose();
  });

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("#root");
    const voiceOpenClass = styles.voiceOpen;
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-hidden", "true");
    if (voiceOpenClass) document.body.classList.add(voiceOpenClass);
    closeRef.current?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finishFromKeyboard();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!controls?.length) return;
      const first = controls.item(0);
      const last = controls.item(controls.length - 1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      root?.removeAttribute("inert");
      root?.removeAttribute("aria-hidden");
      if (voiceOpenClass) document.body.classList.remove(voiceOpenClass);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const finish = () => {
    voice.end();
    onClose();
  };
  const fallback = () => {
    voice.end();
    onFallback();
  };
  return createPortal(
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="voice-title"
        aria-describedby="voice-detail voice-privacy"
      >
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}><span aria-hidden="true" /> Conversación en vivo</p>
            <h2 id="voice-title">Habla con tu tutor</h2>
          </div>
          <button ref={closeRef} className={styles.close} type="button" aria-label="Finalizar conversación por voz" onClick={finish}>×</button>
        </header>

        <div className={styles.stage}>
          <div className={styles.signal} data-state={voice.state.phase} aria-hidden="true">
            <i /><i /><span><b /><b /><b /><b /><b /></span>
          </div>
          <div className={styles.stateCopy} role="status" aria-live="polite" aria-atomic="true">
            <strong>{copy.title}</strong>
            <span id="voice-detail">{voice.state.error ?? copy.detail}</span>
          </div>
        </div>

        <section className={styles.transcript} aria-label="Transcripción reciente" aria-live="polite">
          {voice.state.transcript.user ? <p><span>Tú</span><q>{voice.state.transcript.user}</q></p> : null}
          {voice.state.transcript.tutor ? <p><span>Tutor</span><q>{voice.state.transcript.tutor}</q></p> : null}
          {!voice.state.transcript.user && !voice.state.transcript.tutor ? (
            <p className={styles.helper}>Habla cuando quieras. El micrófono sólo permanece activo mientras este diálogo está abierto.</p>
          ) : null}
        </section>

        {voice.state.phase === "error" ? (
          <div className={styles.recovery}>
            <button type="button" onClick={() => void voice.reconnect()}>Reconectar voz</button>
            <button type="button" onClick={fallback}>Continuar por texto</button>
          </div>
        ) : (
          <div className={styles.controls} aria-label="Controles de voz">
            <button
              type="button"
              aria-pressed={voice.state.muted}
              disabled={voice.state.phase === "connecting" || voice.state.phase === "disconnected"}
              onClick={voice.toggleMute}
            >
              <span aria-hidden="true">{voice.state.muted ? "◌" : "●"}</span>
              {voice.state.muted ? "Activar micrófono" : "Silenciar micrófono"}
            </button>
            <button type="button" disabled={voice.state.phase !== "responding"} onClick={voice.interrupt}>
              <span aria-hidden="true">Ⅱ</span>
              Interrumpir audio
            </button>
            <button className={styles.end} type="button" onClick={finish}>
              <span aria-hidden="true">×</span>
              Finalizar
            </button>
          </div>
        )}
        <p id="voice-privacy" className={styles.privacy}>El audio se procesa durante esta conversación y no reemplaza la evaluación del chat.</p>
      </div>
    </div>,
    document.body,
  );
}
