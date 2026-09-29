export type VoiceTranscriptRole = "user" | "tutor";

export type VoiceServerMessage =
  | { type: "ready"; sampleRate: number; supportsInterruption: boolean }
  | { type: "transcript"; role: VoiceTranscriptRole; text: string }
  | { type: "interrupted" }
  | { type: "turn_complete" }
  | { type: "unavailable" | "error"; message: string };

export function parseVoiceServerMessage(raw: string): VoiceServerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "ready") {
    return {
      type: "ready",
      sampleRate: positiveNumber(value.sample_rate, 24_000),
      supportsInterruption: value.supports_interruption === true,
    };
  }
  if (value.type === "transcript") {
    if ((value.role !== "user" && value.role !== "tutor") || typeof value.text !== "string") return null;
    const text = value.text.trim();
    return text ? { type: "transcript", role: value.role, text } : null;
  }
  if (value.type === "interrupted" || value.type === "turn_complete") return { type: value.type };
  if (value.type === "unavailable" || value.type === "error") {
    return {
      type: value.type,
      message: typeof value.message === "string" && value.message.trim()
        ? value.message.trim()
        : "La conversación por voz se interrumpió.",
    };
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function positiveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
