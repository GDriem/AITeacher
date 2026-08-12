import { isRouteErrorResponse, useRouteError } from "react-router-dom";

import styles from "./ErrorBoundary.module.css";

export function RouteErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${String(error.status)}: ${error.statusText}`
    : "La pantalla no pudo cargarse.";

  return (
    <main className={styles.page}>
      <section className={styles.boundary} role="alert">
        <p className={styles.eyebrow}>Interrupción de ruta</p>
        <h1>No pudimos abrir esta sección.</h1>
        <p>{message}</p>
        <a href="/app/">Volver al catálogo</a>
      </section>
    </main>
  );
}
