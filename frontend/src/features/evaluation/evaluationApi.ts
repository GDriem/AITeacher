import { apiClient, apiError } from "../../api/client";
import type { components } from "../../api/generated/schema";

export type EvaluationResponse = components["schemas"]["EvaluationResponse"];
export type EvaluationRubric = components["schemas"]["EvaluationRubric"];
export type PendingQuiz = components["schemas"]["PendingQuizResponse"];
export type StudentProgress = components["schemas"]["StudentProgress"];

export async function evaluateAnswer(
  studentId: string,
  sessionId: string,
  answer: string,
  signal: AbortSignal,
) {
  const result = await apiClient.POST("/api/evaluate", {
    body: { student_id: studentId, session_id: sessionId, answer },
    signal,
  });

  if (!result.data) throw apiError(result.response, result.error);
  return result.data;
}
