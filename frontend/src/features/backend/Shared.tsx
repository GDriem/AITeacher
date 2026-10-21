import { cloneElement, useId, type ReactElement } from "react";
import { message } from "./client";

export function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div role="alert"><p>{message(error)}</p>{retry ? <button type="button" onClick={retry}>Reintentar</button> : null}</div>;
}

export function Busy() { return <p role="status" aria-live="polite">Cargando…</p>; }

export function Pages({ offset, total, size = 20, change }: { offset: number; total: number; size?: number; change: (offset: number) => void }) {
  return <nav aria-label="Paginación" className="backend-actions">
    <button type="button" disabled={offset === 0} onClick={() => change(Math.max(0, offset - size))}>Anterior</button>
    <span>{total === 0 ? "Sin resultados" : `${String(offset + 1)}–${String(Math.min(total, offset + size))} de ${String(total)}`}</span>
    <button type="button" disabled={offset + size >= total} onClick={() => change(offset + size)}>Siguiente</button>
  </nav>;
}

export function Field({ title, children }: { title: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return <div className="backend-field"><label htmlFor={id}>{title}</label>{cloneElement(children, { id })}</div>;
}
