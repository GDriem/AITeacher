import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";

import styles from "./Auth.module.css";

interface Props {
  clientId: string | null;
  loginError: string | null;
  pending: boolean;
  onCredential: (credential: string) => Promise<unknown>;
  returnFocusRef: RefObject<HTMLElement | null>;
}

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AuthGate({ clientId, loginError, pending, onCredential, returnFocusRef }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const handleCredential = useEffectEvent((credential: string) => {
    void onCredential(credential);
  });

  useEffect(() => {
    const returnFocus = returnFocusRef.current;
    headingRef.current?.focus();
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [returnFocusRef]);

  useEffect(() => {
    const container = googleButtonRef.current;
    if (!clientId || !container) return;
    let active = true;
    setScriptError(null);
    container.textContent = "Cargando acceso seguro…";

    void import("./googleIdentity")
      .then(({ renderGoogleSignIn }) =>
        renderGoogleSignIn(container, clientId, handleCredential),
      )
      .catch((error: unknown) => {
        if (!active) return;
        container.replaceChildren();
        setScriptError(error instanceof Error ? error.message : "No se pudo cargar el acceso con Google.");
      });

    return () => {
      active = false;
    };
  }, [attempt, clientId]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const containFocus = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        headingRef.current?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", containFocus);
    return () => panel.removeEventListener("keydown", containFocus);
  }, []);

  const error = loginError ?? scriptError;

  return (
    <div className={styles.gateBackdrop}>
      <div
        ref={panelRef}
        className={styles.gate}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-gate-title"
        aria-describedby="auth-gate-description"
        aria-busy={pending}
      >
        <p className={styles.eyebrow}>Tu ruta, en un solo lugar</p>
        <h1 id="auth-gate-title" ref={headingRef} tabIndex={-1}>Continúa con tu cuenta</h1>
        <p id="auth-gate-description">
          Inicia sesión para conservar tu progreso y usar la misma identidad en cada actividad.
        </p>
        <div className={styles.identityRule} aria-hidden="true"><i /><i /><i /></div>

        {clientId ? (
          <div ref={googleButtonRef} className={styles.googleButton} aria-live="polite" />
        ) : (
          <p className={styles.error} role="alert">Falta la configuración pública de Google en el servidor.</p>
        )}

        {pending ? <p className={styles.status} role="status">Verificando tu cuenta…</p> : null}
        {error ? (
          <div className={styles.error} role="alert">
            <p>{error}</p>
            {scriptError ? (
              <button type="button" onClick={() => setAttempt((current) => current + 1)}>
                Reintentar carga de Google
              </button>
            ) : null}
          </div>
        ) : null}
        <small>No guardamos tokens ni datos de tu perfil en este navegador.</small>
      </div>
    </div>
  );
}
