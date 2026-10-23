import { cloneElement, useId, type ReactElement } from "react";
import { ApiError } from "../../api/ApiError";
import { Button, ErrorState, Skeleton } from "../../ui";
import { message } from "./client";
import styles from "./Shared.module.css";

export function Failure({ error, retry, title }: { error: unknown; retry?: () => void; title?: string }) {
  return <ErrorState title={title} message={message(error)} traceId={error instanceof ApiError ? error.correlationId : null} onRetry={retry} />;
}

export function Busy() { return <Skeleton />; }

export function Pages({ offset, total, size = 20, change }: { offset: number; total: number; size?: number; change: (offset: number) => void }) {
  return <nav aria-label="Paginación" className={styles.actions}>
    <Button size="sm" disabled={offset === 0} onClick={() => change(Math.max(0, offset - size))}>Anterior</Button>
    <span>{total === 0 ? "Sin resultados" : `${String(offset + 1)}–${String(Math.min(total, offset + size))} de ${String(total)}`}</span>
    <Button size="sm" disabled={offset + size >= total} onClick={() => change(offset + size)}>Siguiente</Button>
  </nav>;
}

/** Etiqueta un control; `hint` (p. ej. un contador de caracteres) queda asociado con `aria-describedby`. */
export function Field({ title, hint, children }: { title: string; hint?: string; children: ReactElement<{ id?: string; "aria-describedby"?: string }> }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return <div className={styles.field}><label htmlFor={id}>{title}</label>{cloneElement(children, { id, ...(hint ? { "aria-describedby": hintId } : {}) })}
    {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}</div>;
}
