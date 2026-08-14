import type { EvaluationRubric as EvaluationRubricData } from "./evaluationApi";
import styles from "./LearningCycle.module.css";

const criteria = [
  ["precision", "Precisión"],
  ["comprehension", "Comprensión"],
  ["application", "Aplicación"],
  ["clarity", "Claridad"],
] as const;

const modeLabels: Record<EvaluationRubricData["evaluation_mode"], string> = {
  hybrid_model: "Modelo + conceptos",
  deterministic_fallback: "Fallback determinista",
};

export function EvaluationRubric({ rubric, compact = false }: { rubric: EvaluationRubricData; compact?: boolean }) {
  return (
    <section className={styles.rubric} aria-labelledby={compact ? "practice-rubric-title" : "evaluation-rubric-title"}>
      <div className={styles.rubricHeading}>
        <h4 id={compact ? "practice-rubric-title" : "evaluation-rubric-title"}>Rúbrica de comprensión</h4>
        <span>{modeLabels[rubric.evaluation_mode]}</span>
      </div>
      <ul className={styles.rubricList}>
        {criteria.map(([key, label]) => {
          const criterion = rubric[key];
          return (
            <li key={key}>
              <div className={styles.rubricScore}>
                <strong>{label}</strong>
                <span>{String(criterion.score)}/4</span>
              </div>
              <meter aria-label={`${label}: ${String(criterion.score)} de 4`} min={0} max={4} value={criterion.score} />
              <p>{criterion.explanation}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
