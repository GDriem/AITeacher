import styles from "./ErrorBoundary.module.css";

export function NotFoundRoute() {
  return (
    <section className={styles.boundary}>
      <p className={styles.eyebrow}>Ruta no disponible</p>
      <h1>Esta sección todavía no existe.</h1>
      <p>Vuelve al catálogo para continuar con un tema real.</p>
      <a href="/app/">Explorar temas</a>
    </section>
  );
}
