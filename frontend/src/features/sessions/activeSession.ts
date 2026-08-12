const ACTIVE_SESSION_KEY = "ait.activeSession:v1";

interface StoredActiveSession {
  version: 1;
  studentId: string;
  sessionId: string;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function legacyKey(studentId: string) {
  return `activeSession:${studentId}`;
}

export function readActiveSession(studentId: string): string | null {
  try {
    const local = storage();
    if (!local) return null;
    const serialized = local.getItem(ACTIVE_SESSION_KEY);
    if (serialized) {
      const value = JSON.parse(serialized) as Partial<StoredActiveSession>;
      if (
        value.version === 1
        && value.studentId === studentId
        && typeof value.sessionId === "string"
        && value.sessionId.length > 0
      ) {
        return value.sessionId;
      }
    }
    return local.getItem(legacyKey(studentId));
  } catch {
    return null;
  }
}

export function rememberActiveSession(studentId: string, sessionId: string) {
  try {
    const local = storage();
    if (!local) return;
    local.setItem(legacyKey(studentId), sessionId);
    local.setItem(
      ACTIVE_SESSION_KEY,
      JSON.stringify({ version: 1, studentId, sessionId } satisfies StoredActiveSession),
    );
  } catch {
    // Continuity is best-effort when storage is unavailable or full.
  }
}

export function clearActiveSession(studentId: string) {
  try {
    const local = storage();
    if (!local) return;
    local.removeItem(legacyKey(studentId));
    const serialized = local.getItem(ACTIVE_SESSION_KEY);
    if (!serialized) return;
    const value = JSON.parse(serialized) as Partial<StoredActiveSession>;
    if (value.studentId === studentId) local.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // A failed cleanup must not block starting another conversation.
  }
}

export function legacySessionUrl(sessionId: string) {
  const params = new URLSearchParams({ session: sessionId });
  return `/?${params.toString()}#tutor`;
}
