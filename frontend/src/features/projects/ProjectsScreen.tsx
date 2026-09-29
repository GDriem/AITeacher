import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { ApiError } from "../../api/ApiError";
import { ProjectCatalog } from "./ProjectCatalog";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { evaluateProject } from "./projectsApi";
import { projectsOptions } from "./projectsQueries";
import styles from "./ProjectsScreen.module.css";

export function ProjectsScreen({ studentId }: { studentId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const projects = useQuery(projectsOptions());
  const evaluation = useMutation({
    mutationFn: ({ projectId, submission }: { projectId: string; submission: string }) =>
      evaluateProject(projectId, studentId, submission),
  });

  if (projects.isPending) return <ProjectsLoading />;
  if (projects.isError) return <ProjectsError error={projects.error} onRetry={() => void projects.refetch()} />;

  const selectedProject = projects.data.projects.find((project) => project.id === selectedId) ?? null;

  const openProject = (projectId: string, trigger: HTMLButtonElement) => {
    returnFocusRef.current = trigger;
    evaluation.reset();
    setSelectedId(projectId);
  };

  const closeProject = () => {
    returnFocusRef.current?.focus();
    evaluation.reset();
    setSelectedId(null);
  };

  return (
    <article className={styles.projects}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Laboratorio integrador</p>
          <h1>Convierte lo aprendido en una propuesta</h1>
          <p>Elige un reto, prepara los entregables y recibe una evaluación criterio por criterio.</p>
        </div>
        <strong aria-live="polite">{String(projects.data.projects.length)} proyectos</strong>
      </header>

      <ProjectCatalog projects={projects.data.projects} selectedId={selectedId} onOpen={openProject} />

      {selectedProject ? (
        <ProjectWorkspace
          key={selectedProject.id}
          project={selectedProject}
          pending={evaluation.isPending}
          error={evaluation.isError ? errorCopy(evaluation.error) : null}
          result={evaluation.isSuccess ? evaluation.data : null}
          onClose={closeProject}
          onSubmit={(submission) => evaluation.mutate({ projectId: selectedProject.id, submission })}
        />
      ) : null}
    </article>
  );
}

function errorCopy(error: Error) {
  return error instanceof ApiError ? error.message : "Intenta nuevamente.";
}

function ProjectsLoading() {
  return (
    <section className={styles.projects} aria-busy="true" aria-label="Cargando proyectos">
      <div className={styles.loadingHeader} />
      <div className={styles.loadingList}>{Array.from({ length: 3 }, (_, index) => <span key={index} />)}</div>
    </section>
  );
}

function ProjectsError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <section className={styles.errorState} role="alert">
      <p className={styles.eyebrow}>Laboratorio temporalmente interrumpido</p>
      <h1>No pudimos cargar los proyectos.</h1>
      <p>{errorCopy(error)}</p>
      <button type="button" onClick={onRetry}>Reintentar</button>
    </section>
  );
}
