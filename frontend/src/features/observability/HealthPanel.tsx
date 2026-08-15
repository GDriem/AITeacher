import { useQuery } from "@tanstack/react-query";

import { ApiError } from "../../api/ApiError";
import { activityLabel, formatCost, formatCount, formatDuration, formatPercentage } from "./observabilityLabels";
import { observabilityOptions } from "./observabilityQueries";
import styles from "./HealthPanel.module.css";

export function HealthPanel() {
  const snapshot = useQuery(observabilityOptions);

  if (snapshot.isPending) {
    return (
      <aside className={styles.panel} aria-busy="true" aria-label="Cargando señales de operación">
        <p className={styles.eyebrow}>Salud y uso agregados</p>
        <div className={styles.loading}><span /><span /><span /></div>
      </aside>
    );
  }

  if (snapshot.isError) {
    const message = snapshot.error instanceof ApiError ? snapshot.error.message : "No pudimos consultar las señales.";
    return (
      <aside className={styles.panel} role="alert" aria-labelledby="health-error-title">
        <p className={styles.eyebrow}>Salud y uso agregados</p>
        <h2 id="health-error-title">No pudimos consultar las señales.</h2>
        <p className={styles.errorMessage}>{message}</p>
        <button type="button" disabled={snapshot.isFetching} onClick={() => void snapshot.refetch()}>
          {snapshot.isFetching ? "Reintentando…" : "Reintentar"}
        </button>
      </aside>
    );
  }

  const data = snapshot.data;

  return (
    <aside className={styles.panel} aria-labelledby="health-title" aria-busy={snapshot.isFetching}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Salud y uso agregados</p>
          <h2 id="health-title">Operación</h2>
        </div>
        <button type="button" disabled={snapshot.isFetching} onClick={() => void snapshot.refetch()}>
          {snapshot.isFetching ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      <div className={styles.state}>
        <span className={styles.dot} aria-hidden="true" />
        <strong>Servicio disponible</strong>
        <small>{formatDuration(data.uptime_seconds)} activo</small>
      </div>

      <dl className={styles.metrics}>
        <div><dt>Peticiones</dt><dd>{formatCount(data.http.requests)}</dd></div>
        <div><dt>Errores</dt><dd>{formatPercentage(data.http.error_rate)}</dd></div>
        <div><dt>Latencia p95</dt><dd>{String(Math.round(data.http.latency_ms.p95))} ms</dd></div>
        <div><dt>Llamadas IA</dt><dd>{formatCount(data.model.calls)}</dd></div>
        <div><dt>Tokens estimados</dt><dd>{formatCount(data.model.input_tokens + data.model.output_tokens)}</dd></div>
        <div><dt>Costo estimado</dt><dd>{formatCost(data.model.estimated_cost_usd, data.model.pricing_configured)}</dd></div>
      </dl>

      <div className={styles.activities}>
        <strong>Actividades completadas</strong>
        {data.activities.length > 0 ? (
          <ul>
            {data.activities.map((activity) => (
              <li key={activity.name}>
                <span>{activityLabel(activity.name)}</span>
                <strong>{String(activity.completed)}/{String(activity.started)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>Aún no hay actividades registradas.</p>
        )}
      </div>
      <p className={styles.note}>Tokens aproximados por longitud. El costo requiere tarifas configuradas por entorno.</p>
    </aside>
  );
}
