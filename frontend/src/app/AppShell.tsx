import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { StudentAccount } from "../features/auth/StudentAccount";
import { useAppSession } from "../features/auth/appSession";
import { SessionDrawer } from "../features/sessions/SessionDrawer";
import { SessionsProvider } from "../features/sessions/SessionsProvider";
import { useOnlineStatus } from "./connectivity";
import { useLiveAnnouncer } from "./useLiveAnnouncer";
import { useRouteFocus } from "./useRouteFocus";
import styles from "./AppShell.module.css";

export function AppShell() {
  const { studentId } = useAppSession();
  return (
    <SessionsProvider key={studentId}>
      <Shell />
    </SessionsProvider>
  );
}

function Shell() {
  const { capabilities } = useAppSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sessionsButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const online = useOnlineStatus();
  const wasOfflineRef = useRef(!online);
  const { message: announcement, announce } = useLiveAnnouncer();
  useRouteFocus(mainRef);

  useEffect(() => {
    if (!online) {
      wasOfflineRef.current = true;
      announce("Sin conexión. Reintentaremos cuando vuelva la red.");
      return;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      announce("Conexión recuperada. Actualizando la información.");
    }
  }, [online, announce]);

  return (
    <>
    {!online ? (
      <p className={styles.connectionStatus} role="status" aria-live="polite">
        Sin conexión. Reintentaremos cuando vuelva la red.
      </p>
    ) : null}
    <div className={styles.app} inert={drawerOpen ? true : undefined} aria-hidden={drawerOpen ? "true" : undefined}>
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
            Temas
          </NavLink>
          <NavLink to="/proyectos">Proyectos</NavLink>
          <NavLink to="/tutor">Tutor</NavLink>
          {capabilities.authoring ? <NavLink to="/autoria">Autoría</NavLink> : null}
        </nav>
        <button
          ref={sessionsButtonRef}
          className={styles.sessionsButton}
          type="button"
          aria-label="Conversaciones"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 6h14M5 12h10M5 18h7" />
          </svg>
          <span>Conversaciones</span>
        </button>
        <div className={styles.accountSlot}><StudentAccount /></div>
      </header>
      <main id="main-content" ref={mainRef} className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <span>AITeacher · Frontend React R9</span>
        <a href="/">Volver a la interfaz completa</a>
      </footer>
    </div>
    <SessionDrawer
      open={drawerOpen}
      returnFocusRef={sessionsButtonRef}
      onClose={() => setDrawerOpen(false)}
    />
    <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </>
  );
}
