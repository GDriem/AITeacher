import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../../api/ApiError";
import { subscribeUnauthorized } from "../../api/authEvents";
import { getAnonymousStudentId } from "./anonymousIdentity";
import { loginWithGoogle, logout as logoutRequest } from "./authApi";
import { authStatusKey, authStatusOptions, capabilitiesOptions } from "./authQueries";
import { AuthGate } from "./AuthGate";
import { AppSessionContext, type AppSession } from "./appSession";
import styles from "./Auth.module.css";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [capabilitiesQuery, authQuery] = useQueries({
    queries: [capabilitiesOptions, authStatusOptions],
  });
  const [forcedGate, setForcedGate] = useState(false);
  const [suspendedSession, setSuspendedSession] = useState<Omit<AppSession, "logout"> | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const authStatus = authQuery.data;
  const capabilities = capabilitiesQuery.data;

  const profile = authStatus?.authenticated ? (authStatus.profile ?? null) : null;
  const currentSession = capabilities && authStatus && (!authStatus.enabled || profile)
    ? {
        authEnabled: authStatus.enabled,
        capabilities,
        profile,
        studentId: profile?.student_id ?? getAnonymousStudentId(),
      }
    : null;

  useEffect(() => {
    const rememberFocus = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest("[role='dialog']")) return;
      returnFocusRef.current = event.target;
    };
    document.addEventListener("focusin", rememberFocus);
    return () => document.removeEventListener("focusin", rememberFocus);
  }, []);

  const handleUnauthorized = useEffectEvent(() => {
    if (!authStatus?.enabled) return;
    if (currentSession) setSuspendedSession(currentSession);
    setForcedGate(true);
    void authQuery.refetch();
  });

  useEffect(() => subscribeUnauthorized(handleUnauthorized), []);

  const loginMutation = useMutation({
    mutationFn: loginWithGoogle,
    onSuccess: (nextProfile) => {
      queryClient.setQueryData(authStatusKey, {
        enabled: true,
        authenticated: true,
        google_client_id: authStatus?.google_client_id ?? null,
        profile: nextProfile,
      });
      if (suspendedSession?.studentId !== nextProfile.student_id) {
        queryClient.removeQueries({ queryKey: ["topics"] });
      }
      setForcedGate(false);
      setSuspendedSession(null);
    },
  });

  const logout = async () => {
    await logoutRequest();
    if (currentSession) setSuspendedSession(currentSession);
    queryClient.setQueryData(authStatusKey, {
      enabled: true,
      authenticated: false,
      google_client_id: authStatus?.google_client_id ?? null,
      profile: null,
    });
    queryClient.removeQueries({ queryKey: ["topics"] });
    setForcedGate(true);
    const { disableGoogleAutoSelect } = await import("./googleIdentity");
    disableGoogleAutoSelect();
  };

  if (capabilitiesQuery.isPending || authQuery.isPending) return <BootstrapLoading />;

  if (capabilitiesQuery.isError || authQuery.isError || !capabilities || !authStatus) {
    const error = capabilitiesQuery.error ?? authQuery.error;
    return (
      <BootstrapError
        error={errorCopy(error)}
        retrying={capabilitiesQuery.isFetching || authQuery.isFetching}
        onRetry={() => void Promise.all([capabilitiesQuery.refetch(), authQuery.refetch()])}
      />
    );
  }

  const gateOpen = authStatus.enabled && (forcedGate || !authStatus.authenticated || !authStatus.profile);
  const visibleSession = currentSession ?? suspendedSession;
  const session = visibleSession ? { ...visibleSession, logout } : null;

  return (
    <>
      {session ? (
        <div inert={gateOpen ? true : undefined} aria-hidden={gateOpen ? "true" : undefined}>
          <AppSessionContext value={session}>{children}</AppSessionContext>
        </div>
      ) : null}
      {gateOpen ? (
        <AuthGate
          clientId={authStatus.google_client_id ?? null}
          pending={loginMutation.isPending}
          loginError={loginMutation.isError ? errorCopy(loginMutation.error) : null}
          onCredential={(credential) => loginMutation.mutateAsync(credential)}
          returnFocusRef={returnFocusRef}
        />
      ) : null}
    </>
  );
}

function errorCopy(error: Error | null) {
  return error instanceof ApiError ? error.message : "No pudimos conectar con el servidor. Intenta nuevamente.";
}

function BootstrapLoading() {
  return (
    <main className={styles.bootstrap} aria-busy="true" aria-label="Preparando AITeacher">
      <span className={styles.bootstrapMark} aria-hidden="true" />
      <p>Preparando tu espacio de aprendizaje…</p>
    </main>
  );
}

function BootstrapError({ error, retrying, onRetry }: { error: string; retrying: boolean; onRetry: () => void }) {
  return (
    <main className={styles.bootstrap}>
      <p className={styles.eyebrow}>Inicio interrumpido</p>
      <h1>No pudimos preparar AITeacher.</h1>
      <p>{error}</p>
      <button type="button" disabled={retrying} onClick={onRetry}>
        {retrying ? "Reintentando…" : "Reintentar"}
      </button>
    </main>
  );
}
