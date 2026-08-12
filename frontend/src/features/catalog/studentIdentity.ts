const ACTIVE_SESSION_KEY = "ait.activeSession:v1";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}


export function rememberStartedSession(studentId: string, sessionId: string) {
  const local = storage();
  local?.setItem(`activeSession:${studentId}`, sessionId);
  local?.setItem(
    ACTIVE_SESSION_KEY,
    JSON.stringify({ version: 1, studentId, sessionId }),
  );
}

export function legacySessionUrl(sessionId: string) {
  const params = new URLSearchParams({ session: sessionId });
  return `/?${params.toString()}#tutor`;
}
