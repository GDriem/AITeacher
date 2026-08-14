import type { ConversationMessage, TutorExchange } from "./tutorApi";

export interface LocalExchange extends TutorExchange { createdAt: string }
export interface OutgoingMessage { id: number; message: string; createdAt: string }

export function navigationExchange(value: unknown): LocalExchange | null {
  if (typeof value !== "object" || value === null || !("tutorExchange" in value)) return null;
  const exchange = value.tutorExchange;
  if (typeof exchange !== "object" || exchange === null || !("message" in exchange) || !("response" in exchange)) return null;
  if (typeof exchange.message !== "string" || typeof exchange.response !== "object" || exchange.response === null) return null;
  return { ...(exchange as TutorExchange), createdAt: new Date().toISOString() };
}

export function exchangeMessages(exchange: LocalExchange): ConversationMessage[] {
  return [
    { id: `local-user-${exchange.response.correlation_id}`, role: "user", label: "Tú", content: exchange.message, sources: [], note: "", created_at: exchange.createdAt },
    { id: `local-tutor-${exchange.response.correlation_id}`, role: "assistant", label: "Tutor Agent", content: exchange.response.answer, sources: exchange.response.sources, note: "", created_at: exchange.createdAt },
  ];
}

export function exchangePersisted(messages: ConversationMessage[], exchange: LocalExchange) {
  const user = messages.at(-2);
  const tutor = messages.at(-1);
  return user?.role === "user" && user.content === exchange.message
    && tutor?.role === "assistant" && tutor.content === exchange.response.answer;
}

export function pendingMessage(outgoing: OutgoingMessage | null): ConversationMessage[] {
  return outgoing ? [{
    id: `local-pending-${String(outgoing.id)}`,
    role: "user",
    label: "Tú",
    content: outgoing.message,
    sources: [],
    note: "Enviando…",
    created_at: outgoing.createdAt,
  }] : [];
}

export function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
