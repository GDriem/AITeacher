import { useEffect, useRef } from "react";

import type { ProjectEvaluationResponse } from "./projectsApi";
import { projectStatusLabel } from "./projectLabels";
import styles from "./ProjectsScreen.module.css";

export function ProjectResult({ result }: { result: ProjectEvaluationResponse }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className={styles.result} aria-labelledby="project-result-title">
      <header className={styles.resultHeader}>
        <div>
          <p className={styles.stepLabel}>Resultado de la rúbrica</p>
          <h3 id="project-result-title" ref={headingRef} tabIndex={-1}>
            {String(Math.round(result.score))}/100 · {projectStatusLabel(result.status)}
          </h3>
        </div>
        <span>{result.evaluation_mode === "model" ? "Evaluación del modelo" : "Evaluación de respaldo"}</span>
      </header>
      <p className={styles.feedback}>{result.feedback}</p>
      <div className={styles.rubricResults}>
        {result.rubric.map((item) => (
          <article key={item.criterion_id}>
            <div>
              <h4>{item.title}</h4>
              <strong aria-label={`${String(item.score)} de 4 puntos`}>{String(item.score)}/4</strong>
            </div>
            <p>{item.explanation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
