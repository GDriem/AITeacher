import { useQuery } from "@tanstack/react-query";

import { levelLabel } from "../catalog/catalogLabels";
import { topicCatalogOptions } from "../catalog/catalogQueries";
import type { StudentProgress } from "../evaluation/evaluationApi";
import styles from "./LearningProgressPanel.module.css";

interface Props {
  studentId: string;
  latestProgress: StudentProgress | null;
}

export function LearningProgressPanel({ studentId, latestProgress }: Props) {
  const catalog = useQuery(topicCatalogOptions(studentId));
  const progress = latestProgress ?? catalog.data?.progress ?? null;

  if (catalog.isPending && !progress) {
    return (
      <aside className={styles.panel} aria-busy="true" aria-label="Cargando tu progreso">
        <p className={styles.eyebrow}>Dominio por tema</p>
        <div className={styles.loading}><span /><span /><span /></div>
      </aside>
    );
  }

  if (catalog.isError && !progress) {
    return (
      <aside className={styles.panel} aria-labelledby="progress-error-title">
        <p className={styles.eyebrow}>Dominio por tema</p>
        <h2 id="progress-error-title">No pudimos cargar tu progreso</h2>
        <p>La conversación sigue disponible. Reintenta para recuperar el mapa de dominio.</p>
        <button type="button" onClick={() => void catalog.refetch()}>Reintentar</button>
      </aside>
    );
  }

  if (!progress) return null;
  const topics = progress.topic_progress ?? [];
  const titles = new Map(catalog.data?.topics.map((topic) => [topic.topic, topic.title]) ?? []);
  const completion = catalog.data?.completion_percentage ?? null;

  return (
    <aside className={styles.panel} aria-labelledby="progress-title">
      <p className={styles.eyebrow}>Dominio por tema</p>
      <div className={styles.heading}>
        <h2 id="progress-title">Tu ruta viva</h2>
        <span>{levelLabel(progress.level)}</span>
      </div>
      {completion === null ? (
        <p className={styles.summary}>{String(topics.length)} {topics.length === 1 ? "tema evaluado" : "temas evaluados"}</p>
      ) : (
        <div className={styles.overall}>
          <div><span>Ruta completa</span><strong>{String(Math.round(completion))}%</strong></div>
          <progress aria-label={`Progreso global: ${String(Math.round(completion))}%`} max={100} value={completion} />
          <small>{String(catalog.data?.completed_topics ?? 0)} de {String(catalog.data?.total_topics ?? topics.length)} temas completados</small>
        </div>
      )}

      {topics.length > 0 ? (
        <ol className={styles.topicList}>
          {topics.map((topic) => (
            <li key={topic.topic} data-status={topic.mastery_status}>
              <div className={styles.topicHeading}>
                <div>
                  <strong>{titles.get(topic.topic) ?? topic.topic.replaceAll("-", " ")}</strong>
                  <span>{String(topic.attempts)} {topic.attempts === 1 ? "intento" : "intentos"} · mejor {String(Math.round(topic.best_score))}/100</span>
                </div>
                <em>{topic.mastery_status === "mastered" ? "Dominado" : "En desarrollo"}</em>
              </div>
              {(topic.mastered_concepts ?? []).length > 0 ? (
                <div className={styles.concepts} data-kind="mastered">
                  <small>Dominados</small>
                  <p>{topic.mastered_concepts?.join(" · ")}</p>
                </div>
              ) : null}
              {(topic.pending_concepts ?? []).length > 0 ? (
                <div className={styles.concepts} data-kind="pending">
                  <small>Pendientes</small>
                  <p>{topic.pending_concepts?.join(" · ")}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>Tu primer intento dibujará aquí qué conceptos ya dominas y cuáles conviene practicar.</p>
      )}
      {catalog.isError ? <p className={styles.stale} role="status">Mostramos el último progreso recibido. <button type="button" onClick={() => void catalog.refetch()}>Actualizar</button></p> : null}
    </aside>
  );
}
