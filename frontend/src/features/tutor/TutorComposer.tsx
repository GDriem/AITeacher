import type { KeyboardEvent, RefObject, SyntheticEvent } from "react";
import styles from "./TutorScreen.module.css";

interface Props {
  draft: string;
  pending: boolean;
  disabled?: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onSend: (message: string) => void;
  onCancel: () => void;
}

export function TutorComposer({
  draft,
  pending,
  disabled = false,
  textareaRef,
  onDraftChange,
  onSend,
  onCancel,
}: Props) {
  const trimmed = draft.trim();
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pending && !disabled && trimmed.length >= 2) onSend(trimmed);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form className={styles.composer} aria-busy={pending} onSubmit={submit}>
      <label htmlFor="tutor-message">Escribe tu mensaje</label>
      <textarea
        ref={textareaRef}
        id="tutor-message"
        rows={2}
        minLength={2}
        maxLength={4000}
        required
        disabled={disabled}
        value={draft}
        aria-describedby="composer-help composer-count"
        placeholder="Pregunta, pide un ejemplo o continúa la explicación…"
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <div className={styles.composerFooter}>
        <span id="composer-help">Ctrl/⌘ + Enter para enviar</span>
        <span id="composer-count">{String(draft.length)}/4000</span>
        {pending ? (
          <button className={styles.cancelButton} type="button" onClick={onCancel}>Cancelar envío</button>
        ) : null}
        <button className={styles.sendButton} type="submit" disabled={pending || disabled || trimmed.length < 2}>
          {pending ? "Coordinando…" : disabled ? "Actividad en curso…" : "Enviar"}
        </button>
      </div>
    </form>
  );
}
