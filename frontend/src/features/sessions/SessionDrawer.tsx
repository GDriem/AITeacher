import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../../api/ApiError";
import { SessionItem } from "./SessionItem";
import { SessionsEmptyState, SessionsErrorState, SessionsLoadingState } from "./SessionStates";
import { useSessions } from "./sessionsContext";
import styles from "./Sessions.module.css";

interface Props {
  open: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}

export function SessionDrawer({
  open,
  returnFocusRef,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const drawerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const {
    activeSessionId,
    openingSessionId,
    sessionsData,
    sessionsError,
    sessionsFetching,
    sessionsPending,
    sessionsStatus,
    refetchSessions,
    startNewSession,
    openSession,
    renameSession,
    setArchived,
    deleteSession,
  } = useSessions();

  const close = () => {
    onClose();
    requestAnimationFrame(() => requestAnimationFrame(() => returnFocusRef.current?.focus()));
  };
  const closeFromEffect = useEffectEvent(close);

  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFromEffect();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) return;
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  const sessions = sessionsData?.sessions ?? [];
  const normalizedQuery = normalize(query);
  const visibleSessions = sessions.filter((session) => {
    const matchesView = view === "archived" ? Boolean(session.archived_at) : !session.archived_at;
    if (!matchesView) return false;
    return !normalizedQuery || normalize(`${session.title} ${session.topic}`).includes(normalizedQuery);
  });
  const activeCount = sessions.filter((session) => !session.archived_at).length;
  const archivedCount = sessions.length - activeCount;

  const handleNew = () => {
    startNewSession();
    void navigate("/tutor");
    onClose();
  };

  const handleOpen = async (sessionId: string) => {
    const isCurrent = await openSession(sessionId);
    if (!isCurrent) return;
    onClose();
    void navigate("/tutor");
  };

  return (
    <>
      <button className={styles.scrim} type="button" tabIndex={-1} aria-label="Cerrar conversaciones" onClick={close} />
      <div ref={drawerRef} className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="sessions-title">
        <header className={styles.drawerHeader}>
          <div>
            <p>Tu bitácora</p>
            <h2 ref={headingRef} id="sessions-title" tabIndex={-1}>Conversaciones</h2>
          </div>
          <button className={styles.closeButton} type="button" aria-label="Cerrar conversaciones" onClick={close}>×</button>
        </header>

        <button className={styles.newSession} type="button" onClick={handleNew}>
          <span aria-hidden="true">＋</span>
          Nueva conversación
        </button>

        <label className={styles.search} htmlFor="session-search">
          <span>Buscar por título o tema</span>
          <input
            id="session-search"
            type="search"
            value={query}
            autoComplete="off"
            aria-describedby="session-search-status"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>

        <div className={styles.viewSwitch} aria-label="Estado de las conversaciones">
          <button type="button" aria-pressed={view === "active"} onClick={() => setView("active")}>
            Activas <span>{activeCount}</span>
          </button>
          <button type="button" aria-pressed={view === "archived"} onClick={() => setView("archived")}>
            Archivadas <span>{archivedCount}</span>
          </button>
        </div>

        <p id="session-search-status" className={styles.searchStatus} aria-live="polite">
          {normalizedQuery ? `${String(visibleSessions.length)} ${visibleSessions.length === 1 ? "coincidencia" : "coincidencias"}` : ""}
        </p>

        <div className={styles.drawerBody}>
          {sessionsPending ? <SessionsLoadingState /> : null}
          {sessionsStatus === "error" ? (
            <SessionsErrorState
              message={sessionsError instanceof ApiError
                ? sessionsError.message
                : "No pudimos sincronizar tus conversaciones."}
              retrying={sessionsFetching}
              onRetry={() => void refetchSessions()}
            />
          ) : null}
          {sessionsStatus === "success" && visibleSessions.length === 0 ? (
            <SessionsEmptyState archived={view === "archived"} searching={Boolean(normalizedQuery)} />
          ) : null}
          {visibleSessions.length > 0 ? (
            <ol className={styles.sessionList} aria-label={view === "archived" ? "Conversaciones archivadas" : "Conversaciones activas"}>
              {visibleSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeSessionId}
                  opening={session.id === openingSessionId}
                  onOpen={handleOpen}
                  onRename={renameSession}
                  onSetArchived={setArchived}
                  onDelete={deleteSession}
                />
              ))}
            </ol>
          ) : null}
        </div>
        {sessionsData ? (
          <p className={styles.retention}>Las conversaciones se conservan {sessionsData.retention_days} días.</p>
        ) : null}
      </div>
    </>
  );
}
