import type { ReactNode } from "react";
import { Button } from "./Button";
import styles from "./ErrorState.module.css";

/**
 * Error recuperable. Muestra el identificador de traza del servidor para que el
 * alumno pueda citarlo al reportar el problema; nunca muestra detalles internos.
 */
export function ErrorState({ message, title, traceId, onRetry, action }: {
  message: string; title?: string; traceId?: string | null; onRetry?: () => void; action?: ReactNode;
}) {
  return <div className={styles.error} role="alert">
    {title ? <p className={styles.title}>{title}</p> : null}
    <p className={styles.message}>{message}</p>
    {traceId ? <p className={styles.trace}>Código de seguimiento: <code>{traceId}</code></p> : null}
    {onRetry || action ? <div className={styles.actions}>
      {onRetry ? <Button size="sm" onClick={onRetry}>Reintentar</Button> : null}{action}
    </div> : null}
  </div>;
}
