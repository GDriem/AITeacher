import { apiClient, apiError } from "../../api/client";
import type { components } from "../../api/generated/schema";

export type ChatResponse = components["schemas"]["ChatResponse"];
export type ConversationMessage = components["schemas"]["ConversationMessage"];
export type TraceEvent = components["schemas"]["TraceEvent"];

export interface TutorExchange {
  message: string;
  response: ChatResponse;
}

export async function sendTutorMessage(
  studentId: string,
  message: string,
  sessionId: string | null,
  requestId: string,
  signal: AbortSignal,
) {
  const result = await apiClient.POST("/api/chat", {
    body: {
      student_id: studentId,
      message,
      request_id: requestId,
      ...(sessionId ? { session_id: sessionId } : {}),
    },
    signal,
  });

  if (!result.data) throw apiError(result.response, result.error);
  return result.data;
}
