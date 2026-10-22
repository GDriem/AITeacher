import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./TopicCard.module.css";

/**
 * Tarjeta de tema del catálogo, extraída del build Python como componente
 * presentacional: recibe textos ya resueltos y un destino. Toda la tarjeta es
 * clicable, pero el único enlace es el título, que da nombre accesible.
 */
export function TopicCard({ title, to, state, eyebrow, summary, levels = [], note, headingLevel = 3 }: {
  title: string; to: string; state?: unknown; eyebrow?: ReactNode; summary?: ReactNode; levels?: string[]; note?: ReactNode; headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${String(headingLevel)}` as "h2" | "h3" | "h4";
  const details = useId();
  return <li className={styles.card}>
    {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
    <Heading className={styles.title}><Link className={styles.link} to={to} state={state} aria-describedby={details}>{title}</Link></Heading>
    <div id={details} className={styles.details}>
      {summary ? <p className={styles.summary}>{summary}</p> : null}
      {levels.length ? <ul className={styles.levels} aria-label="Niveles disponibles">{levels.map((level) => <li key={level}>{level}</li>)}</ul> : null}
      {note ? <p className={styles.note}>{note}</p> : null}
    </div>
    <span className={styles.arrow} aria-hidden="true">→</span>
  </li>;
}
