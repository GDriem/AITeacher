import { apiClient, apiError } from "../../api/client";
import type { components } from "../../api/generated/schema";

export type TopicCatalogResponse = components["schemas"]["TopicCatalogResponse"];
export type TopicCatalogItem = components["schemas"]["TopicCatalogItem"];
export type ChatResponse = components["schemas"]["ChatResponse"];

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

export async function startTopic(studentId: string, title: string) {
  const result = await apiClient.POST("/api/chat", {
    body: {
      student_id: studentId,
      message: `Quiero aprender sobre ${title}`,
    },
  });

  if (!result.data) {
    throw apiError(result.response, result.error);
  }

  return result.data;
}
