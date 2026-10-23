import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";
import { buttonClass, cardClass, Skeleton } from "../../ui";
import type { Schema } from "./client";
import { tutorPath } from "./unitQueries";
import { useMedia } from "./useMedia";
import styles from "./UnitSpace.module.css";
type UnitDocument = Schema["UnitResponse"]["revision"]["document"];
const readingAnchor = (id: string) => `lectura-${id}`;
const article = cardClass(false, styles.item);
// El catálogo y Datos no necesitan descargar el renderer Markdown.
const TutorMarkdown = lazy(async () => ({ default: (await import("../tutor/TutorMarkdown")).TutorMarkdown }));
function UnitText({ children }: { children: string }) {
  return <Suspense fallback={<Skeleton />}><TutorMarkdown>{children}</TutorMarkdown></Suspense>;
}
/**
 * Salta a una lectura sin sumar el ancla al historial: Atrás sigue volviendo a la
 * pantalla anterior. La lectura elegida pasa a ser la actual aunque el scroll no
 * pueda subirla hasta arriba (una última lectura corta).
 */
function jump(id: string, choose: (id: string) => void) {
  const target = document.getElementById(readingAnchor(id));
  target?.scrollIntoView({ block: "start" });
  target?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  choose(id);
}

export function Learn({ document, current, choose }: { document: UnitDocument; current: string | null; choose: (id: string) => void }) {
  const items = document.readings;
  const wide = useMedia("(min-width: 64rem)");
  // El índice solo orienta cuando hay más de una lectura.
  const index = items.length > 1 ? <ol className={styles.indexList}>{items.map((item) => <li key={item.id}>
    <a href={`#${readingAnchor(item.id)}`} aria-current={current === item.id ? "true" : undefined} onClick={(event) => { event.preventDefault(); jump(item.id, choose); }}>{item.title}</a>
  </li>)}</ol> : null;
  return <div className={index ? styles.withIndex : undefined}>
    {index ? wide
      ? <nav className={styles.index} aria-label="Lecturas de la unidad"><h2 className={styles.indexTitle}>Lecturas</h2>{index}</nav>
      : <nav className={styles.index} aria-label="Lecturas de la unidad"><details><summary>Lecturas ({items.length})</summary>{index}</details></nav>
      : null}
    <div className={styles.content}>
      {document.objectives.length ? <section aria-labelledby="unit-objectives">
        <h2 id="unit-objectives">Qué vas a aprender</h2>
        <ul>{document.objectives.map((objective) => <li key={objective.id}>{objective.description}</li>)}</ul>
      </section> : null}
      {document.readings.map((reading) => <article key={reading.id} id={readingAnchor(reading.id)} data-visible={reading.id} className={article}>
        <h2 tabIndex={-1}>{reading.title}</h2>
        <UnitText>{reading.text}</UnitText>
        <p className={styles.source}>Fuente: {reading.source}</p>
      </article>)}
    </div>
  </div>;
}

export function Practice({ document, unitId, state, tutorEnabled }: { document: UnitDocument; unitId: string; state: unknown; tutorEnabled: boolean }) {
  return <div className={styles.content}>
    {document.exercises.map((exercise, index) => <article key={exercise.id} data-visible={exercise.id} className={article} aria-labelledby={`exercise-${exercise.id}`}>
      <h2 id={`exercise-${exercise.id}`}>Ejercicio {index + 1}</h2>
      <UnitText>{exercise.prompt}</UnitText>
      {tutorEnabled ? <Link className={buttonClass()} to={tutorPath(unitId, "practice", exercise.id)} state={state}>Practicar con el tutor</Link> : null}
    </article>)}
  </div>;
}
