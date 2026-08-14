import type { TraceEvent } from "./tutorApi";
import styles from "./TutorScreen.module.css";

const kindLabels: Record<TraceEvent["kind"], string> = {
  user_message: "Entrada",
  decision: "Decisión",
  delegation: "Coordinación",
  tool_call: "Herramienta",
  model_call: "Modelo",
  response: "Respuesta",
  error: "Error",
};

export function TutorTrace({ events }: { events: TraceEvent[] }) {
  return (
    <aside className={styles.tracePanel} aria-labelledby="trace-title">
      <p className={styles.eyebrow}>Actividad pública</p>
      <h2 id="trace-title">Cómo se coordinó tu respuesta</h2>
      <p className={styles.traceNotice}>Muestra acciones y tiempos del sistema, nunca razonamiento interno.</p>
      {events.length > 0 ? (
        <ol className={styles.traceList}>
          {events.map((event, index) => (
            <li key={[event.timestamp ?? "", event.actor, event.action, String(index)].join("-")}>
              <span className={styles.traceMarker} aria-hidden="true" />
              <div>
                <small>{kindLabels[event.kind]}</small>
                <strong>{event.actor} · {event.action}</strong>
                <p>{event.summary}</p>
              </div>
              <span>{event.duration_ms > 0 ? `${String(Math.round(event.duration_ms))} ms` : ""}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.traceEmpty}>La actividad de la próxima respuesta aparecerá aquí.</p>
      )}
    </aside>
  );
}
