import type { AuthoredLesson } from "./authoringApi";
import { revisionActionLabel, revisionDate } from "./authoringLabels";
import styles from "./AuthoringScreen.module.css";

export function LessonHistory({
  lesson,
  disabled,
  onRequestRevert,
}: {
  lesson: AuthoredLesson;
  disabled: boolean;
  onRequestRevert: (version: number, trigger: HTMLButtonElement) => void;
}) {
  return (
    <section className={styles.history} aria-labelledby="lesson-history-title">
      <header>
        <div>
          <p className={styles.eyebrow}>Registro inmutable</p>
          <h3 id="lesson-history-title">Historial y reversión</h3>
        </div>
        <span>Versión actual: {lesson.version}</span>
      </header>
      <ol className={styles.historyList} reversed>
        {[...lesson.revisions].reverse().map((revision) => (
          <li key={revision.version}>
            <div>
              <strong>v{revision.version} · {revisionActionLabel(revision.action)}</strong>
              <span>{revision.author} · {revisionDate(revision.created_at)}</span>
              {revision.reverted_from ? <small>Recuperó la versión {revision.reverted_from}</small> : null}
            </div>
            <button
              type="button"
              disabled={disabled || revision.version === lesson.version}
              aria-label={`Revertir a la versión ${String(revision.version)}`}
              onClick={(event) => onRequestRevert(revision.version, event.currentTarget)}
            >
              Revertir
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
