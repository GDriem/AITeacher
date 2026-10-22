import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

/** Clases del botón para aplicarlas también a enlaces que navegan (`<Link>`). */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string) {
  return [styles.button, styles[variant], size === "sm" ? styles.small : null, extra].filter(Boolean).join(" ");
}
