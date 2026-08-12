import { useRef, useState } from "react";

import type { ConversationSummary } from "./sessionsApi";
import styles from "./Sessions.module.css";

interface Props {
  active: boolean;
  opening: boolean;
  session: ConversationSummary;
  onDelete: (sessionId: string) => Promise<void>;
  onOpen: (sessionId: string) => Promise<void>;
  onRename: (sessionId: string, title: string) => Promise<void>;
  onSetArchived: (sessionId: string, archived: boolean) => Promise<void>;
}

const dateFormatter = new Intl.DateTimeFormat("es-GT", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function topicLabel(value: string) {
  const text = value.replaceAll("-", " ");
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}

export function SessionItem({
  active,
  opening,
  session,
  onDelete,
  onOpen,
  onRename,
  onSetArchived,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const archived = Boolean(session.archived_at);

  const run = async (operation: () => Promise<void>) => {
    setError(null);
    setPending(true);
    try {
      await operation();
    } catch (operationError) {
      setError(operationError instanceof Error
        ? operationError.message
        : "No pudimos actualizar la conversación.");
    } finally {
      setPending(false);
    }
  };

  const beginRename = () => {
    setEditing(true);
    requestAnimationFrame(() => renameRef.current?.select());
  };

  const submitRename = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rawTitle = form.get("title");
    const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
    if (!title || title === session.title) {
      setEditing(false);
      return;
    }
    void run(async () => {
      await onRename(session.id, title);
      setEditing(false);
    });
  };

  return (
    <li className={styles.sessionItem} data-active={active || undefined}>
      <div className={styles.sessionHeading}>
        <div>
          <strong>{session.title}</strong>
          <span>{topicLabel(session.topic)}</span>
        </div>
        {active ? <span className={styles.activeBadge}>Activa</span> : null}
      </div>
      <p className={styles.sessionMeta}>
        <span>Actualizada {dateFormatter.format(new Date(session.updated_at))}</span>
        <span>{session.message_count} {session.message_count === 1 ? "mensaje" : "mensajes"}</span>
      </p>

      {editing ? (
        <form className={styles.inlineForm} onSubmit={submitRename}>
          <label htmlFor={`session-title-${session.id}`}>Nuevo nombre</label>
          <input
            ref={renameRef}
            id={`session-title-${session.id}`}
            name="title"
            defaultValue={session.title}
            maxLength={100}
            required
          />
          <div>
            <button type="submit" disabled={pending}>Guardar</button>
            <button type="button" disabled={pending} onClick={() => setEditing(false)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {confirmingDelete ? (
        <div className={styles.confirmation} role="group" aria-label={`Eliminar ${session.title}`}>
          <p>Se eliminará definitivamente esta conversación.</p>
          <div>
            <button type="button" disabled={pending} onClick={() => void run(() => onDelete(session.id))}>
              {pending ? "Eliminando…" : "Eliminar definitivamente"}
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirmingDelete(false)}>Cancelar</button>
          </div>
        </div>
      ) : null}

      {!editing && !confirmingDelete ? (
        <div className={styles.sessionActions}>
          {!archived ? (
            <button type="button" disabled={pending || opening} onClick={() => void run(() => onOpen(session.id))}>
              {opening ? "Abriendo…" : active ? "Continuar" : "Abrir"}
            </button>
          ) : null}
          <button type="button" disabled={pending} onClick={beginRename}>Renombrar</button>
          <button type="button" disabled={pending} onClick={() => void run(() => onSetArchived(session.id, !archived))}>
            {archived ? "Restaurar" : "Archivar"}
          </button>
          <button className={styles.deleteAction} type="button" disabled={pending} onClick={() => setConfirmingDelete(true)}>
            Eliminar
          </button>
        </div>
      ) : null}
      {error ? <p className={styles.itemError} role="alert">{error}</p> : null}
    </li>
  );
}
