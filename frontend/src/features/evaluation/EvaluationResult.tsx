import { useEffect, useRef } from "react";

import type { EvaluationResponse } from "./evaluationApi";
import { EvaluationRubric } from "./EvaluationRubric";
import styles from "./LearningCycle.module.css";

const statusCopy: Record<EvaluationResponse["status"], { kicker: string; title: string }> = {
  reinforce: { kicker: "Vamos a reforzar", title: "Una base más clara" },
  progressing: { kicker: "Vas progresando", title: "Conecta una idea más" },
  mastered: { kicker: "Concepto comprendido", title: "Listo para aplicarlo" },
};

interface Props {
  result: EvaluationResponse;
  tutorBusy: boolean;
  onContinue: () => void;
  onStartPractice: (concept: string | null) => void;
  onTutorPrompt: (prompt: string) => void;
}

export function EvaluationResult({ result, tutorBusy, onContinue, onStartPractice, onTutorPrompt }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = statusCopy[result.status];

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className={styles.result} data-status={result.status} aria-labelledby="evaluation-result-title">
      <header className={styles.resultHeader}>
        <div className={styles.score} aria-label={`Puntuación ${String(Math.round(result.score))} de 100`}>
          <strong>{String(Math.round(result.score))}</strong>
          <span>/100</span>
        </div>
        <div>
          <p className={styles.kicker}>{copy.kicker}</p>
          <h3 ref={headingRef} id="evaluation-result-title" tabIndex={-1}>{copy.title}</h3>
          <p>{result.feedback}</p>
        </div>
      </header>

      <div className={styles.feedbackColumns}>
        <section>
          <h4>Lo que ya sostienes</h4>
          {result.strengths.length > 0 ? <ul>{result.strengths.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Aún no hay fortalezas registradas.</p>}
        </section>
        <section>
          <h4>Tu siguiente mejora</h4>
          {result.improvements.length > 0 ? (
            <ul>
              {result.improvements.map((item, index) => {
                const concept = result.practice_concepts[index] ?? null;
                return (
                  <li key={`${item}-${String(index)}`}>
                    <span>{item}</span>
                    <button type="button" disabled={tutorBusy} onClick={() => onStartPractice(concept)}>
                      {concept ? `Practicar ${concept}` : "Practicar esto"}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p>No hay mejoras pendientes en este intento.</p>}
        </section>
      </div>

      <EvaluationRubric rubric={result.rubric} />
      <p className={styles.learningContext}><strong>Cómo seguir:</strong> {result.learning_context}</p>
      <div className={styles.resultActions} aria-label="Acciones para seguir aprendiendo">
        <button type="button" disabled={tutorBusy} onClick={() => onTutorPrompt("Muéstrame otro ejemplo práctico del mismo tema.")}>Ver otro ejemplo</button>
        <button type="button" disabled={tutorBusy} onClick={() => onTutorPrompt("Explícamelo más fácil usando una analogía.")}>Explicación más simple</button>
        <button type="button" disabled={tutorBusy} onClick={() => onStartPractice(null)}>Practicar conceptos pendientes</button>
        <button className={styles.primaryAction} type="button" onClick={onContinue}>Continuar con la pregunta</button>
      </div>
    </section>
  );
}
