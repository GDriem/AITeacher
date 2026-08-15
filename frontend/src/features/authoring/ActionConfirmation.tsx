import { useEffect, useRef } from "react";

import styles from "./AuthoringScreen.module.css";

export function ActionConfirmation({
  title,
  detail,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  detail: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div className={styles.confirmation} role="alertdialog" aria-labelledby="action-confirm-title" aria-describedby="action-confirm-detail">
      <div>
        <strong id="action-confirm-title">{title}</strong>
        <p id="action-confirm-detail">{detail}</p>
      </div>
      <div>
        <button ref={confirmRef} className={styles.dangerButton} type="button" disabled={pending} onClick={onConfirm}>
          {pending ? "Aplicando cambio…" : confirmLabel}
        </button>
        <button type="button" disabled={pending} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
