import createClient from "openapi-fetch";

import { ApiError, errorMessage } from "../../api/ApiError";
import type { components, paths } from "../../api/generated/schema";

export type AuthoredLesson = components["schemas"]["AuthoredLesson"];
export type ContentRevision = components["schemas"]["ContentRevision"];
export type LearningContent = components["schemas"]["LearningContent"];
export type LearningLevel = components["schemas"]["LearningLevel"];
export type Topic = components["schemas"]["Topic"];

const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;

// Authoring uses its own client because a 401 here means an invalid authoring
// credential, not an expired student session.
const authoringClient = createClient<paths>({
  baseUrl: origin,
  credentials: "same-origin",
  headers: { Accept: "application/json" },
});

function requestError(response: Response, error: unknown) {
  return new ApiError(errorMessage(error, response.status), {
    status: response.status,
    correlationId: response.headers.get("x-correlation-id"),
    details: error,
  });
}

function tokenHeader(token: string) {
  return { "x-authoring-token": token };
}

export async function listAuthoredLessons(token: string, signal?: AbortSignal) {
  const result = await authoringClient.GET("/api/authoring/lessons", {
    params: { header: tokenHeader(token) },
    signal,
  });
  if (!result.data) throw requestError(result.response, result.error);
  return result.data;
}

export async function createAuthoredLesson(
  token: string,
  author: string,
  content: LearningContent,
) {
  const result = await authoringClient.POST("/api/authoring/lessons", {
    params: { header: tokenHeader(token) },
    body: { author, content },
  });
  if (!result.data) throw requestError(result.response, result.error);
  return result.data;
}

export async function updateAuthoredLesson(
  token: string,
  author: string,
  lessonId: string,
  content: LearningContent,
) {
  const result = await authoringClient.PUT("/api/authoring/lessons/{lesson_id}", {
    params: { header: tokenHeader(token), path: { lesson_id: lessonId } },
    body: { author, content },
  });
  if (!result.data) throw requestError(result.response, result.error);
  return result.data;
}

export async function publishAuthoredLesson(token: string, author: string, lessonId: string) {
  const result = await authoringClient.POST("/api/authoring/lessons/{lesson_id}/publish", {
    params: { header: tokenHeader(token), path: { lesson_id: lessonId } },
    body: { author },
  });
  if (!result.data) throw requestError(result.response, result.error);
  return result.data;
}

export async function unpublishAuthoredLesson(token: string, author: string, lessonId: string) {
  const result = await authoringClient.POST("/api/authoring/lessons/{lesson_id}/unpublish", {
    params: { header: tokenHeader(token), path: { lesson_id: lessonId } },
    body: { author },
  });
  if (!result.data) throw requestError(result.response, result.error);
  return result.data;
}

export async function revertAuthoredLesson(
  token: string,
  author: string,
  lessonId: string,
  version: number,
) {
  const result = await authoringClient.POST("/api/authoring/lessons/{lesson_id}/revert", {
    params: { header: tokenHeader(token), path: { lesson_id: lessonId } },
    body: { author, version },
  });
  if (!result.data) throw requestError(result.response, result.error);
  return result.data;
}
