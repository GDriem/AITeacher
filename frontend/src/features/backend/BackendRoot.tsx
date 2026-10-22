import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate } from "react-router-dom";
import { subscribeUnauthorized } from "../../api/authEvents";
import { AuthGate } from "../auth/AuthGate";
import { backend, result, message, type Schema } from "./client";
import { Busy, Failure } from "./Shared";
import { BackendShell } from "./BackendShell";
import { ProfileContext } from "./profile";
import styles from "./BackendShell.module.css";

/**
 * Raíz del build .NET: resuelve la sesión antes de montar cualquier ruta. La
 * URL se conserva mientras el alumno inicia sesión, así una sesión vencida
 * vuelve a la misma pantalla; cerrar sesión regresa al inicio.
 */
export function BackendRoot() {
  const queries = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Schema["AuthenticationStatus"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const focus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void backend.GET("/api/auth/status", { signal: controller.signal }).then(result).then(setStatus)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => subscribeUnauthorized(() => {
    void queries.cancelQueries();
    queries.clear();
    setStatus((previous) => previous ? { ...previous, authenticated: false, profile: null } : null);
  }), [queries]);

  const login = async (credential: string) => {
    setPending(true); setError(null);
    try {
      const profile = result(await backend.POST("/api/auth/google", { body: { credential } }));
      await queries.cancelQueries(); queries.clear();
      setStatus((previous) => ({ enabled: true, authenticated: true, googleClientId: previous?.googleClientId ?? null, profile }));
    } catch (cause) { setError(message(cause)); }
    finally { setPending(false); }
  };

  const logout = async () => {
    setPending(true); setError(null);
    try {
      const response = await backend.POST("/api/auth/logout");
      if (!response.response.ok) result(response);
      await queries.cancelQueries(); queries.clear();
      setStatus((previous) => previous ? { ...previous, authenticated: false, profile: null } : null);
      void navigate("/", { replace: true });
      const { disableGoogleAutoSelect } = await import("../auth/googleIdentity");
      disableGoogleAutoSelect();
    } catch (cause) { setError(message(cause)); }
    finally { setPending(false); }
  };

  if (!status) return <main className={styles.boot}><h1>AITeacher</h1>{error
    ? <Failure error={new Error(error)} retry={() => { setError(null); setReload((value) => value + 1); }} /> : <Busy />}</main>;
  if (!status.authenticated || !status.profile) return <AuthGate clientId={status.googleClientId}
    loginError={error} pending={pending} onCredential={login} returnFocusRef={focus} />;

  // La clave por alumno descarta todo el estado de pantalla al cambiar de cuenta.
  return <ProfileContext value={status.profile}>
    <BackendShell key={status.profile.studentId} profile={status.profile} logout={() => void logout()} pending={pending} error={error}><Outlet /></BackendShell>
  </ProfileContext>;
}
