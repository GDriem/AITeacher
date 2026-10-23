import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import styles from "./BackendShell.module.css";
import { EmptyState, ErrorState, PageHeader, Skeleton, buttonClass } from "../../ui";

export function NotFound() {
  return <section>
    <PageHeader title="Esta página no existe" />
    <EmptyState title="Revisa la dirección" description="Es posible que el enlace esté incompleto o que la unidad ya no esté publicada."
      action={<Link className={buttonClass("primary")} to="/">Volver al inicio</Link>} />
  </section>;
}

/** Error no previsto al pintar una ruta. Conserva la navegación para salir sin recargar. */
export function RouteError() {
  const error = useRouteError();
  return <section>
    <PageHeader title="No pudimos abrir esta sección" />
    <ErrorState message={isRouteErrorResponse(error) && error.status === 404 ? "Esta página no existe o ya no está disponible." : "No pudimos cargar esta pantalla. Recarga la página o vuelve al inicio."}
      action={<Link className={buttonClass("ghost", "sm")} to="/">Volver al inicio</Link>} onRetry={() => window.location.reload()} />
  </section>;
}

/** Primera carga de una ruta diferida (por ejemplo, al recargar dentro de Autoría). */
export function RouteLoading() {
  return <main className={styles.boot}><Skeleton label="Preparando tu espacio de aprendizaje…" /></main>;
}
