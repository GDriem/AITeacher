import { useRef, useState } from "react";

import { useAppSession } from "./appSession";
import styles from "./Auth.module.css";

export function StudentAccount() {
  const { authEnabled, logout, profile } = useAppSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);

  if (!authEnabled || !profile) {
    return (
      <span className={styles.localAccount} title="Identidad local de este navegador">
        <span aria-hidden="true">I</span>
        <small>Invitado local</small>
      </span>
    );
  }

  const openMenu = () => {
    setError(null);
    setOpen(true);
    requestAnimationFrame(() => logoutRef.current?.focus());
  };

  const closeMenu = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  const handleLogout = async () => {
    closeMenu();
    try {
      await logout();
    } catch {
      setError("No pudimos cerrar la sesión. Intenta nuevamente.");
    }
  };

  const handleEscape = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu();
    }
  };

  return (
    <div className={styles.account}>
      <button
        ref={toggleRef}
        className={styles.accountToggle}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={handleEscape}
      >
        {profile.picture_url ? <img src={profile.picture_url} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{profile.display_name.charAt(0)}</span>}
        <small>{profile.display_name}</small>
      </button>
      {open ? (
        <div className={styles.accountMenu} role="menu" aria-label="Cuenta del estudiante" tabIndex={-1} onKeyDown={handleEscape}>
          <strong>{profile.display_name}</strong>
          <span>{profile.email}</span>
          <button ref={logoutRef} type="button" role="menuitem" onClick={() => void handleLogout()}>
            Cerrar sesión
          </button>
        </div>
      ) : null}
      {error ? <p className={styles.accountError} role="alert">{error}</p> : null}
    </div>
  );
}
