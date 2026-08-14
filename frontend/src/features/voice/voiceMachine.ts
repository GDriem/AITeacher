import type { VoiceTranscriptRole } from "./voiceProtocol";

export type VoicePhase = "disconnected" | "connecting" | "listening" | "responding" | "error";

export interface VoiceState {
  phase: VoicePhase;
  muted: boolean;
  error: string | null;
  transcript: Record<VoiceTranscriptRole, string>;
}

export type VoiceAction =
  | { type: "connect" }
  | { type: "listen" }
  | { type: "respond" }
  | { type: "mute"; muted: boolean }
  | { type: "transcript"; role: VoiceTranscriptRole; text: string }
  | { type: "fail"; message: string }
  | { type: "disconnect" };

export const initialVoiceState: VoiceState = {
  phase: "disconnected",
  muted: false,
  error: null,
  transcript: { user: "", tutor: "" },
};

export function voiceReducer(state: VoiceState, action: VoiceAction): VoiceState {
  switch (action.type) {
    case "connect":
      return { ...initialVoiceState, phase: "connecting" };
    case "listen":
      return { ...state, phase: "listening", error: null };
    case "respond":
      return { ...state, phase: "responding", error: null };
    case "mute":
      return { ...state, muted: action.muted };
    case "transcript":
      return {
        ...state,
        transcript: { ...state.transcript, [action.role]: mergeTranscript(state.transcript[action.role], action.text) },
      };
    case "fail":
      return { ...state, phase: "error", muted: false, error: action.message };
    case "disconnect":
      return initialVoiceState;
  }
}

function mergeTranscript(current: string, next: string) {
  if (!current || next.startsWith(current)) return next;
  return `${current}${/^[,.;:!?)]/.test(next) ? "" : " "}${next}`;
}
