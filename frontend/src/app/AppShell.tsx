import { NavLink, Outlet } from "react-router-dom";

import styles from "./AppShell.module.css";

export function AppShell() {
  return (
    <div className={styles.app}>
      <a className={styles.skipLink} href="#main-content">
        Saltar al contenido principal
      </a>
      <header className={styles.header}>
        <a className={styles.brand} href="/app/" aria-label="AITeacher, inicio">
          <span className={styles.brandMark} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>AITeacher</strong>
            <small>Aprende a tu ritmo</small>
          </span>
        </a>
        <nav className={styles.nav} aria-label="Navegación principal">
          <NavLink to="/" end>
            Explorar temas
          </NavLink>
          <a href="/">Tutor actual</a>
        </nav>
      </header>
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <span>AITeacher · Base React R1</span>
        <a href="/">Volver a la interfaz completa</a>
      </footer>
    </div>
  );
}
