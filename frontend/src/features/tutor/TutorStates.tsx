import styles from "./TutorScreen.module.css";

export function TutorWelcome() {
  return (
    <section className={styles.welcome}>
      <p className={styles.eyebrow}>Nueva conversación</p>
      <h2>Empieza por una pregunta concreta</h2>
      <p>El tutor puede explicar un concepto, comparar ideas o construir un ejemplo paso a paso.</p>
    </section>
  );
}

export function TutorLoading() {
  return (
    <div className={styles.loading} aria-busy="true" aria-label="Cargando conversación">
      <span /><span /><span />
    </div>
  );
}

export function TutorHistoryError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className={styles.historyError} role="alert">
      <strong>No pudimos recuperar la conversación.</strong>
      <p>Tu continuidad sigue guardada. Intenta sincronizarla de nuevo.</p>
      <button type="button" onClick={onRetry}>Reintentar</button>
    </section>
  );
}
