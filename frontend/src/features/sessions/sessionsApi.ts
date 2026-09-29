import { apiClient, apiError } from "../../api/client";
import type { components } from "../../api/generated/schema";

export type ConversationDetail = components["schemas"]["ConversationDetail"];
export type ConversationListResponse = components["schemas"]["ConversationListResponse"];
export type ConversationSummary = components["schemas"]["ConversationSummary"];

export async function getSessions(studentId: string, signal?: AbortSignal) {
  const result = await apiClient.GET("/api/sessions", {
    params: { query: { student_id: studentId, include_archived: true } },
    signal,
  });

  if (!result.data) throw apiError(result.response, result.error);
  return result.data;
}

export async function getSession(studentId: string, sessionId: string, signal?: AbortSignal) {
  const result = await apiClient.GET("/api/sessions/{session_id}", {
    params: { path: { session_id: sessionId }, query: { student_id: studentId } },
    signal,
  });

  if (!result.data) throw apiError(result.response, result.error);
  return result.data;
}

export async function updateSession(
  studentId: string,
  sessionId: string,
  update: { title?: string; archived?: boolean },
) {
  const result = await apiClient.PATCH("/api/sessions/{session_id}", {
    params: { path: { session_id: sessionId } },
    body: { student_id: studentId, ...update },
  });

  if (!result.data) throw apiError(result.response, result.error);
  return result.data;
}

export async function deleteSession(studentId: string, sessionId: string) {
  const result = await apiClient.DELETE("/api/sessions/{session_id}", {
    params: { path: { session_id: sessionId }, query: { student_id: studentId } },
  });

  if (!result.response.ok) throw apiError(result.response, result.error);
}
