import styles from "./Skeleton.module.css";

/** Marcador de carga con la forma aproximada del contenido; anuncia la espera una sola vez. */
export function Skeleton({ lines = 3, label = "Cargando…" }: { lines?: number; label?: string }) {
  return <div className={styles.skeleton} role="status" aria-live="polite" aria-busy="true">
    <span className={styles.srOnly}>{label}</span>
    {Array.from({ length: lines }, (_, index) => <span key={index} className={styles.line} aria-hidden="true" />)}
  </div>;
}
