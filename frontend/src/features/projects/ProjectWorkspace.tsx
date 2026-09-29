import { useEffect, useRef, useState } from "react";

import type { IntegrativeProject, ProjectEvaluationResponse } from "./projectsApi";
import { ProjectResult } from "./ProjectResult";
import styles from "./ProjectsScreen.module.css";

interface Props {
  project: IntegrativeProject;
  pending: boolean;
  error: string | null;
  result: ProjectEvaluationResponse | null;
  onClose: () => void;
  onSubmit: (submission: string) => void;
}

export function ProjectWorkspace({ project, pending, error, result, onClose, onSubmit }: Props) {
  const [submission, setSubmission] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className={styles.workspace} aria-labelledby="project-workspace-title">
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.stepLabel}>Mesa de proyecto · reto activo</p>
          <h2 id="project-workspace-title" ref={headingRef} tabIndex={-1}>{project.title}</h2>
        </div>
        <button className={styles.closeButton} type="button" onClick={onClose}>Cerrar proyecto</button>
      </header>

      <p className={styles.challenge}>{project.challenge}</p>
      <div className={styles.briefGrid}>
        <section>
          <h3>Entregables</h3>
          <ol>{project.deliverables.map((item) => <li key={item}>{item}</li>)}</ol>
        </section>
        <section>
          <h3>Rúbrica</h3>
          <ul>{project.rubric.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.description}</span></li>)}</ul>
        </section>
      </div>

      <form className={styles.submissionForm} onSubmit={(event) => { event.preventDefault(); onSubmit(submission); }}>
        <label htmlFor="project-submission">Tu propuesta</label>
        <p id="project-submission-help">Describe arquitectura, decisiones, riesgos y cómo validarías el resultado.</p>
        <textarea
          id="project-submission"
          aria-describedby="project-submission-help"
          rows={8}
          maxLength={8000}
          required
          value={submission}
          onChange={(event) => setSubmission(event.target.value)}
        />
        <div className={styles.formActions}>
          <span aria-live="polite">{String(submission.length)} de 8000 caracteres</span>
          <button type="submit" disabled={pending}>
            {pending ? "Evaluando propuesta…" : "Evaluar proyecto"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>

      {error ? <p className={styles.evaluationError} role="alert"><strong>No pudimos evaluar el proyecto.</strong> {error}</p> : null}
      {result ? <ProjectResult result={result} /> : null}
    </section>
  );
}
