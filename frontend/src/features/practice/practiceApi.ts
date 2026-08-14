import { apiClient, apiError } from "../../api/client";
import type { components } from "../../api/generated/schema";

export type PracticeEvaluationResponse = components["schemas"]["PracticeEvaluationResponse"];
export type PracticeExercise = components["schemas"]["PracticeExercise"];
export type PracticeStartResponse = components["schemas"]["PracticeStartResponse"];

export async function startPractice(
  studentId: string,
  sessionId: string,
  focusConcept: string | null,
  signal: AbortSignal,
) {
  const result = await apiClient.POST("/api/practice/start", {
    body: {
      student_id: studentId,
      session_id: sessionId,
      ...(focusConcept ? { focus_concept: focusConcept } : {}),
    },
    signal,
  });

  if (!result.data) throw apiError(result.response, result.error);
  return result.data;
}

export async function evaluatePractice(
  studentId: string,
  sessionId: string,
  answer: string,
  signal: AbortSignal,
) {
  const result = await apiClient.POST("/api/practice/evaluate", {
    body: { student_id: studentId, session_id: sessionId, answer },
    signal,
  });

  if (!result.data) throw apiError(result.response, result.error);
  return result.data;
}
