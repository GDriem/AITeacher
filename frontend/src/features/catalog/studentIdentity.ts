const IDENTITY_KEY = "ait.browserStudent:v1";
const ACTIVE_SESSION_KEY = "ait.activeSession:v1";

interface StoredIdentity {
  version: 1;
  id: string;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredIdentity(value: string | null): StoredIdentity | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      parsed.version === 1 &&
      "id" in parsed &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0
    ) {
      return parsed as StoredIdentity;
    }
  } catch {
    return null;
  }
  return null;
}

function createAnonymousId() {
  const suffix = globalThis.crypto.randomUUID();
  return `alumno-${suffix}`;
}

export function getBrowserStudentId() {
  const local = storage();
  const namedStudent = local?.getItem("studentName")?.trim();
  if (namedStudent) return namedStudent;

  const stored = readStoredIdentity(local?.getItem(IDENTITY_KEY) ?? null);
  const legacyId = local?.getItem("studentAutoId")?.trim();
  const id = stored?.id ?? legacyId ?? createAnonymousId();

  local?.setItem(IDENTITY_KEY, JSON.stringify({ version: 1, id } satisfies StoredIdentity));
  local?.setItem("studentAutoId", id);
  return id;
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
