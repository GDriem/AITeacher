import { apiClient, apiError } from "../../api/client";
import type { components } from "../../api/generated/schema";

export type TopicCatalogResponse = components["schemas"]["TopicCatalogResponse"];
export type TopicCatalogItem = components["schemas"]["TopicCatalogItem"];
export type ChatResponse = components["schemas"]["ChatResponse"];
export type LearningLevel = components["schemas"]["LearningLevel"];

export async function getTopicCatalog(studentId: string, signal?: AbortSignal) {
  const result = await apiClient.GET("/api/topics", {
    params: { query: { student_id: studentId } },
    signal,
  });

  if (!result.data) {
    throw apiError(result.response, result.error);
  }

  return result.data;
}

export async function startTopic(studentId: string, title: string, level?: LearningLevel) {
  const result = await apiClient.POST("/api/chat", {
    body: {
      student_id: studentId,
      message: `Quiero aprender sobre ${title}`,
      ...(level ? { level } : {}),
    },
  });

  if (!result.data) {
    throw apiError(result.response, result.error);
  }

  return result.data;
}
