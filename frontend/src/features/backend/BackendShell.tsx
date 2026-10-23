import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useOnlineStatus } from "../../app/connectivity";
import { useRouteFocus } from "../../app/useRouteFocus";
import { Button, Toast, ToastRegion } from "../../ui";
import type { Schema } from "./client";
import { feedbackHref } from "./feedback";
import styles from "./BackendShell.module.css";

interface Destination { to: string; label: string; icon: ReactNode; end?: boolean; sections?: string[] }

// Trazos de 24 px; el texto de cada enlace es su nombre accesible.
const icon = (path: string) => <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={path} /></svg>;
const destinations: Destination[] = [
  { to: "/", label: "Inicio", end: true, icon: icon("M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z") },
  // Tema y unidad cuelgan del catálogo: su enlace sigue activo dentro de ellos.
  { to: "/catalogo", label: "Catálogo", sections: ["/temas", "/unidades"], icon: icon("M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z") },
  { to: "/apuntes", label: "Apuntes", icon: icon("M7 4h7l4 4v12H7zM14 4v4h4M10 12h5M10 16h5") },
  { to: "/repasos", label: "Repasos", icon: icon("M19 8a7.5 7.5 0 1 0 .5 6M19 4v4h-4") },
  { to: "/historial", label: "Historial", icon: icon("M12 7v5l3 2M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 5v4h4") },
];
const feedback = feedbackHref(import.meta.env.VITE_BETA_FEEDBACK_URL);
const authoring: Destination = { to: "/autoria", label: "Autoría", icon: icon("M5 19l1-4 9.5-9.5 3 3L9 18zM13.5 7.5l3 3") };

/**
 * Marco del build .NET: enlace para saltar al contenido, perfil, navegación
 * principal (barra superior en escritorio, inferior en móvil) y una región de
 * avisos compartida. El foco pasa al `h1` de cada ruta al navegar.
 */
export function BackendShell({ profile, logout, pending, error, children }: {
  profile: Schema["StudentProfile"]; logout: () => void; pending: boolean; error: string | null; children: ReactNode;
}) {
  const main = useRef<HTMLElement>(null);
  useRouteFocus(main);
  const online = useOnlineStatus();
  const [wasOffline, setWasOffline] = useState(!online);
  const [notice, setNotice] = useState<string | null>(null);
  if (!online && !wasOffline) { setWasOffline(true); setNotice(null); }
  if (online && wasOffline) { setWasOffline(false); setNotice("Conexión recuperada. Actualizando la información."); }
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const { pathname } = useLocation();
  const items = profile.canAuthor ? [...destinations, authoring] : destinations;
  return <div className={styles.app}>
    <a className={styles.skipLink} href="#learning-content">Saltar al contenido</a>
    <header className={styles.header}>
      <NavLink className={styles.brand} to="/" aria-label="AITeacher, inicio">
        <span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>
        <span><strong>AITeacher</strong><small>Tu espacio de aprendizaje</small></span>
      </NavLink>
      <nav className={styles.nav} aria-label="Navegación principal">
        <ul>{items.map((item) => <li key={item.to}>
          {item.sections?.some((section) => pathname.startsWith(`${section}/`))
            // Dentro de una sección hija el enlace no es la página actual, sino su ubicación (aria-current="location").
            ? <Link to={item.to} aria-current="location">{item.icon}<span>{item.label}</span></Link>
            : <NavLink to={item.to} end={item.end}>{item.icon}<span>{item.label}</span></NavLink>}
        </li>)}</ul>
      </nav>
      <div className={styles.account}>
        <span className={styles.avatar} aria-hidden="true">{initial(profile.displayName)}</span>
        <span className={styles.name}>{profile.displayName}</span>
        <Button variant="ghost" size="sm" onClick={logout} disabled={pending}>Cerrar sesión</Button>
      </div>
    </header>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <main id="learning-content" ref={main} className={styles.main} tabIndex={-1}>{children}</main>
    {feedback ? <footer className={styles.footer}>
      <p>¿Algo no funciona o se te ocurre una mejora? <a href={feedback} target="_blank" rel="noreferrer">Enviar comentarios de la beta<span className={styles.external}> (se abre en otra pestaña)</span></a></p>
    </footer> : null}
    <ToastRegion className={styles.toasts}>
      {!online ? <Toast tone="warning">Sin conexión. Reintentaremos cuando vuelva la red.</Toast>
        : notice ? <Toast tone="success" onDismiss={() => setNotice(null)}>{notice}</Toast> : null}
    </ToastRegion>
  </div>;
}

function initial(name: string) {
  return name.trim().charAt(0).toLocaleUpperCase("es") || "?";
}
