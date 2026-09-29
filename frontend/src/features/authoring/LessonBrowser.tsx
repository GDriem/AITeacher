import type { AuthoredLesson } from "./authoringApi";
import styles from "./AuthoringScreen.module.css";

export function LessonBrowser({
  lessons,
  total,
  query,
  selectedId,
  onQueryChange,
  onCreate,
  onSelect,
}: {
  lessons: AuthoredLesson[];
  total: number;
  query: string;
  selectedId: string | null;
  onQueryChange: (value: string) => void;
  onCreate: () => void;
  onSelect: (lessonId: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <aside className={styles.browser} aria-labelledby="lesson-browser-title">
      <div className={styles.browserHeading}>
        <div>
          <p className={styles.eyebrow}>Archivo curricular</p>
          <h2 id="lesson-browser-title">Lecciones</h2>
        </div>
        <button type="button" onClick={onCreate}>Nueva lección</button>
      </div>
      <label className={styles.search}>
        <span>Buscar por título o identificador</span>
        <input
          type="search"
          placeholder="Título o ID…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      <p className={styles.resultCount} aria-live="polite">
        {lessons.length === total
          ? `${String(total)} ${total === 1 ? "lección" : "lecciones"}`
          : `${String(lessons.length)} de ${String(total)} lecciones`}
      </p>
      {lessons.length ? (
        <ul className={styles.lessonList} aria-label="Lecciones disponibles">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <button
                type="button"
                aria-current={selectedId === lesson.id ? "true" : undefined}
                onClick={(event) => onSelect(lesson.id, event.currentTarget)}
              >
                <span>{lesson.draft.title}</span>
                <small>
                  <i data-published={lesson.published} aria-hidden="true" />
                  {lesson.published ? "Publicada" : "Borrador"} · v{lesson.version}
                </small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.emptyList} role="status">
          <strong>{total ? "No hay coincidencias" : "El archivo está vacío"}</strong>
          <span>{total ? "Prueba otra búsqueda." : "Crea la primera lección para iniciar el historial."}</span>
        </div>
      )}
    </aside>
  );
}
