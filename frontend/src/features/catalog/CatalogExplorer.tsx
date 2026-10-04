import type { LearningLevel, TopicCatalogItem } from "./catalogApi";
import { catalogOptions, learningLevels } from "./catalogFilterState";
import { levelLabel, subjectLabel } from "./catalogLabels";
import styles from "./CatalogScreen.module.css";

interface Props {
  topics: TopicCatalogItem[];
  subject: string;
  level: LearningLevel | "";
  onSubject: (subject: string) => void;
  onCategory: (category: string) => void;
}

export function CatalogExplorer({ topics, subject, level, onSubject, onCategory }: Props) {
  const options = catalogOptions(topics, subject);

  if (!topics.length) {
    return <p className={styles.emptyState} role="status">Aún no hay temas publicados. Las materias aparecerán aquí cuando haya contenido.</p>;
  }

  if (!subject) {
    return (
      <section className={styles.explorer} aria-labelledby="subjects-title">
        <h2 id="subjects-title">Tus materias</h2>
        <div className={styles.subjects}>
          {options.subjects.map((option) => {
            const lessons = topics.filter((topic) => topic.subject === option.value);
            const categories = new Set(lessons.map((topic) => topic.category)).size;
            return (
              <button type="button" className={styles.subjectBadge} key={option.value}
                data-subject={option.value} onClick={() => onSubject(option.value)}>
                <span className={styles.badgeEmblem}><SubjectIcon subject={option.value} /></span>
                <strong>{option.label}</strong>
                <span>{categories} {categories === 1 ? "categoría" : "categorías"} · {lessons.length} temas</span>
                <span className={styles.badgeAction}>Explorar materia <span aria-hidden="true">→</span></span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.explorer} aria-labelledby="categories-title">
      <div className={styles.explorerHeading}>
        <div>
          <p className={styles.eyebrow}>{subjectLabel(subject)}</p>
          <h2 id="categories-title">Elige una categoría</h2>
        </div>
        <p>Cada hexágono abre una parte de tu materia.</p>
      </div>
      <p className={styles.levelLegend}>Niveles disponibles: {learningLevels.map((value) => (
        <span key={value} data-level={value}><i aria-hidden="true" />{levelLabel(value)}</span>
      ))}</p>
      {options.categories.length ? (
        <div className={styles.honeycomb}>
          {options.categories.map((option) => {
            const categoryTopics = topics.filter((topic) => topic.subject === subject && topic.category === option.value);
            const levels = learningLevels.filter((value) => categoryTopics.some((topic) => topic.available_levels.includes(value)));
            const lessons = level ? categoryTopics.filter((topic) => topic.available_levels.includes(level)) : categoryTopics;
            const completed = lessons.filter((topic) => topic.status === "completed").length;
            return (
              <button type="button" key={option.value} className={styles.hexagon}
                data-levels={(level && lessons.length ? [level] : levels).join(" ")}
                disabled={!lessons.length} onClick={() => onCategory(option.value)}>
                <span className={styles.hexagonFace} aria-hidden="true" />
                <span className={styles.hexagonContent}>
                  <svg viewBox="0 0 32 32" aria-hidden="true"><path d="m16 3 11 6.5v13L16 29 5 22.5v-13Z M5 9.5 16 16l11-6.5 M16 16v13" /></svg>
                  <strong>{option.label}</strong>
                  <span>{lessons.length} {lessons.length === 1 ? "tema" : "temas"}</span>
                  <small>{!lessons.length ? "Sin temas en este nivel" : (level ? [level] : levels).map(levelLabel).join(" · ")}</small>
                  {completed ? <small>{completed} de {lessons.length} completados</small> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : <p className={styles.emptyState} role="status">No hay categorías para esta materia. Vuelve a materias para elegir otra.</p>}
    </section>
  );
}

function SubjectIcon({ subject }: { subject: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {subject === "english" ? (
        <><path d="M8 10h32v23H23l-9 7v-7H8Z" /><path d="m17 27 7-12 7 12 M20 23h8" /></>
      ) : subject === "artificial-intelligence" ? (
        <><rect x="14" y="14" width="20" height="20" rx="4" /><path d="M20 6v8 M28 6v8 M20 34v8 M28 34v8 M6 20h8 M6 28h8 M34 20h8 M34 28h8 M20 20h8v8h-8Z" /></>
      ) : <><path d="M24 10v29 M7 9c7-2 12 0 17 4 5-4 10-6 17-4v27c-7-2-12 0-17 4-5-4-10-6-17-4Z" /></>}
    </svg>
  );
}
