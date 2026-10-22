import { cloneElement, useId, type ReactElement } from "react";
import { ApiError } from "../../api/ApiError";
import { Button, ErrorState, Skeleton } from "../../ui";
import { message } from "./client";
import styles from "./Shared.module.css";

export function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  return <ErrorState message={message(error)} traceId={error instanceof ApiError ? error.correlationId : null} onRetry={retry} />;
}

export function Busy() { return <Skeleton />; }

export function Pages({ offset, total, size = 20, change }: { offset: number; total: number; size?: number; change: (offset: number) => void }) {
  return <nav aria-label="Paginación" className={styles.actions}>
    <Button size="sm" disabled={offset === 0} onClick={() => change(Math.max(0, offset - size))}>Anterior</Button>
    <span>{total === 0 ? "Sin resultados" : `${String(offset + 1)}–${String(Math.min(total, offset + size))} de ${String(total)}`}</span>
    <Button size="sm" disabled={offset + size >= total} onClick={() => change(offset + size)}>Siguiente</Button>
  </nav>;
}

export function Field({ title, children }: { title: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return <div className={styles.field}><label htmlFor={id}>{title}</label>{cloneElement(children, { id })}</div>;
}
