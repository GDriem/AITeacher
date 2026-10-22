import styles from "./Card.module.css";

/** Clases de `Card` para elementos que no pueden ser el componente (p. ej. con `aria-*` propios). */
export function cardClass(compact = false, extra?: string) {
  return [styles.card, compact ? styles.compact : null, extra].filter(Boolean).join(" ");
}
