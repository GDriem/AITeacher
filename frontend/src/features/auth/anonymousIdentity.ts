const IDENTITY_KEY = "ait.browserStudent:v1";

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

export function getAnonymousStudentId() {
  const local = storage();
  const legacyNamedStudent = local?.getItem("studentName")?.trim();
  if (legacyNamedStudent) return legacyNamedStudent;

  const stored = readStoredIdentity(local?.getItem(IDENTITY_KEY) ?? null);
  const legacyId = local?.getItem("studentAutoId")?.trim();
  const id = stored?.id ?? legacyId ?? `alumno-${globalThis.crypto.randomUUID()}`;

  local?.setItem(IDENTITY_KEY, JSON.stringify({ version: 1, id } satisfies StoredIdentity));
  local?.setItem("studentAutoId", id);
  return id;
}
