import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

/** Estado vacío con el siguiente paso explícito, en lugar de una pantalla en blanco. */
export function EmptyState({ title, description, action, headingLevel = 2 }: {
  title: string; description?: ReactNode; action?: ReactNode; headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <div className={styles.empty}>
    <Heading className={styles.title}>{title}</Heading>
    {description ? <p className={styles.description}>{description}</p> : null}
    {action ? <div className={styles.actions}>{action}</div> : null}
  </div>;
}
