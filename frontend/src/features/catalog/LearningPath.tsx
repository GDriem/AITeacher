import type { components } from "../../api/generated/schema";
import styles from "./CatalogScreen.module.css";

type Recommendation = components["schemas"]["LearningRecommendation"];

interface Props {
  recommendation: Recommendation | null;
  pending: boolean;
  onStart: (topic: string) => void;
}

export function LearningPath({ recommendation, pending, onStart }: Props) {
  if (!recommendation) return null;

  return (
    <section className={styles.learningPath} aria-labelledby="learning-path-title">
      <div className={styles.pathRail} aria-hidden="true">
        <span />
        <i />
        <span />
      </div>
      <div className={styles.pathCopy}>
        <p className={styles.eyebrow}>Siguiente paso de tu ruta</p>
        <h2 id="learning-path-title">{recommendation.title}</h2>
        <p>{recommendation.reason}</p>
      </div>
      <button type="button" disabled={pending} onClick={() => onStart(recommendation.topic)}>
        {pending ? "Preparando…" : "Continuar"}
        <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
