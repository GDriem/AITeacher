import styles from "./Sessions.module.css";

export function SessionsLoadingState() {
  return (
    <div className={styles.loading} aria-busy="true" aria-label="Cargando conversaciones">
      <span /><span /><span />
    </div>
  );
}

export function SessionsErrorState({
  message,
  retrying,
  onRetry,
}: {
  message: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className={styles.message} role="alert">
      <strong>No pudimos cargar las conversaciones.</strong>
      <span>{message}</span>
      <button type="button" disabled={retrying} onClick={onRetry}>
        {retrying ? "Reintentando…" : "Reintentar"}
      </button>
    </div>
  );
}

export function SessionsEmptyState({ archived, searching }: { archived: boolean; searching: boolean }) {
  const heading = searching
    ? "Sin coincidencias"
    : archived
      ? "No hay conversaciones archivadas"
      : "Aún no hay conversaciones";
  const copy = searching
    ? "Prueba con otro título o tema."
    : archived
      ? "Las conversaciones archivadas aparecerán aquí."
      : "Comienza un tema para guardar tu primera conversación.";

  return (
    <div className={styles.message} role="status">
      <strong>{heading}</strong>
      <span>{copy}</span>
    </div>
  );
}
