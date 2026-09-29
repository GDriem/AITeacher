import styles from "./ErrorBoundary.module.css";

export function RouteLoading() {
  return (
    <main className={styles.page} aria-busy="true">
      <p>Cargando tu ruta de aprendizaje…</p>
    </main>
  );
}
