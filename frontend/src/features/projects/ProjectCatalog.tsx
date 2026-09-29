import type { IntegrativeProject } from "./projectsApi";
import { projectTopicLabel } from "./projectLabels";
import styles from "./ProjectsScreen.module.css";

interface Props {
  projects: IntegrativeProject[];
  selectedId: string | null;
  onOpen: (projectId: string, trigger: HTMLButtonElement) => void;
}

export function ProjectCatalog({ projects, selectedId, onOpen }: Props) {
  if (projects.length === 0) {
    return (
      <section className={styles.emptyState} role="status">
        <h2>Aún no hay proyectos disponibles</h2>
        <p>Vuelve más tarde para combinar lo aprendido en un reto integrador.</p>
      </section>
    );
  }

  return (
    <ul className={styles.projectList} aria-label="Proyectos disponibles">
      {projects.map((project, index) => (
        <li key={project.id}>
          <article className={styles.projectCard} data-selected={project.id === selectedId || undefined}>
            <div className={styles.cardMeta}>
              <span>Proyecto {String(index + 1).padStart(2, "0")}</span>
              <span>{String(project.estimated_minutes)} min</span>
            </div>
            <h2>{project.title}</h2>
            <p>{project.summary}</p>
            <ul className={styles.topicList} aria-label={`Temas de ${project.title}`}>
              {project.topics.map((topic) => <li key={topic}>{projectTopicLabel(topic)}</li>)}
            </ul>
            <button
              type="button"
              aria-label={`${project.id === selectedId ? "Proyecto abierto" : "Abrir proyecto"}: ${project.title}`}
              aria-pressed={project.id === selectedId}
              onClick={(event) => onOpen(project.id, event.currentTarget)}
            >
              {project.id === selectedId ? "Proyecto abierto" : "Abrir proyecto"}
              <span aria-hidden="true">→</span>
            </button>
          </article>
        </li>
      ))}
    </ul>
  );
}
