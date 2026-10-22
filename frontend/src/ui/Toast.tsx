import type { ReactNode } from "react";
import { Button } from "./Button";
import styles from "./Toast.module.css";

export type ToastTone = "info" | "success" | "warning" | "danger";

/**
 * Región `aria-live` para avisos breves. Debe montarse una sola vez y antes de
 * que llegue el primer aviso: los lectores de pantalla sólo anuncian cambios
 * dentro de una región que ya existía. `className` permite elevarla sobre barras fijas.
 */
export function ToastRegion({ children, label = "Avisos", className }: { children?: ReactNode; label?: string; className?: string }) {
  return <div className={[styles.region, className].filter(Boolean).join(" ")} role="status" aria-live="polite" aria-label={label}>{children}</div>;
}

export function Toast({ tone = "info", children, onDismiss }: { tone?: ToastTone; children: ReactNode; onDismiss?: () => void }) {
  return <div className={[styles.toast, tone === "info" ? null : styles[tone]].filter(Boolean).join(" ")}>
    <p>{children}</p>
    {onDismiss ? <Button variant="ghost" size="sm" onClick={onDismiss}>Cerrar aviso</Button> : null}
  </div>;
}
