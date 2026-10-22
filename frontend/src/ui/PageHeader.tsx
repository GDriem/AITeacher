import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./PageHeader.module.css";

export interface Breadcrumb { label: string; to?: string; state?: unknown }

/**
 * Cabecera de pantalla con migas de pan, un único `h1` y acciones. La última
 * miga representa la página actual y no es un enlace.
 */
export function PageHeader({ title, eyebrow, description, breadcrumbs = [], actions }: {
  title: ReactNode; eyebrow?: ReactNode; description?: ReactNode; breadcrumbs?: Breadcrumb[]; actions?: ReactNode;
}) {
  return <header className={styles.header}>
    {breadcrumbs.length > 0 ? <nav className={styles.crumbs} aria-label="Migas de pan"><ol>
      {breadcrumbs.map((crumb, index) => <li key={`${crumb.label}-${String(index)}`}>
        {crumb.to && index < breadcrumbs.length - 1 ? <Link to={crumb.to} state={crumb.state}>{crumb.label}</Link>
          : <span aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>}
      </li>)}
    </ol></nav> : null}
    {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
    <div className={styles.row}>
      <h1 className={styles.title}>{title}</h1>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
    {description ? <p className={styles.description}>{description}</p> : null}
  </header>;
}
