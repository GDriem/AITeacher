import { useId } from "react";

import type { LearningLevel, TopicCatalogItem } from "./catalogApi";
import {
  categoryLabel,
  levelLabel,
  prerequisiteLabel,
  statusLabel,
  subjectLabel,
  topicActionLabel,
} from "./catalogLabels";
import styles from "./CatalogScreen.module.css";

interface Props {
  topic: TopicCatalogItem;
  titles: Map<string, string>;
  pending: boolean;
  selectedLevel?: LearningLevel | "";
  onStart: (topic: TopicCatalogItem) => void;
}

export function TopicCard({ topic, titles, pending, selectedLevel, onStart }: Props) {
  const descriptionId = useId();
  const score = topic.progress ? Math.round(topic.progress.best_score) : null;

  return (
    <li className={styles.topicCard} data-status={topic.status}>
      <div className={styles.cardHeading}>
        <span className={styles.category}>
          {subjectLabel(topic.subject)} · {categoryLabel(topic.category)}
        </span>
        <span className={styles.status} data-status={topic.status}>
          {topic.status === "completed" ? <span aria-hidden="true">✓ </span> : null}
          {statusLabel(topic.status)}
        </span>
      </div>
      <h3>{topic.title}</h3>
      <p id={descriptionId} className={styles.prerequisites}>
        {prerequisiteLabel(topic, titles)}
      </p>
      <div className={styles.levels} aria-label="Niveles disponibles">
        {topic.available_levels.map((level) => (
          <span key={level} data-level={level} data-selected={level === selectedLevel}>{levelLabel(level)}</span>
        ))}
      </div>
      {selectedLevel ? <p className={styles.selectedLevel}>Aprenderás en nivel {levelLabel(selectedLevel).toLocaleLowerCase("es")}.</p> : null}
      {topic.progress ? (
        <p className={styles.progressSummary}>
          <strong>{score}/100</strong>
          <span>{levelLabel(topic.progress.level)}</span>
          <span>
            {topic.progress.attempts} {topic.progress.attempts === 1 ? "intento" : "intentos"}
          </span>
        </p>
      ) : null}
      <button type="button" disabled={pending} aria-describedby={descriptionId} onClick={() => onStart(topic)}>
        {pending ? "Preparando…" : topicActionLabel(topic.status)}
        <span aria-hidden="true">→</span>
      </button>
    </li>
  );
}
