import { apiClient, apiError } from "../../api/client";
import type { components } from "../../api/generated/schema";

export type IntegrativeProject = components["schemas"]["IntegrativeProject"];
export type ProjectCatalogResponse = components["schemas"]["ProjectCatalogResponse"];
export type ProjectEvaluationResponse = components["schemas"]["ProjectEvaluationResponse"];

export async function getProjects(signal?: AbortSignal) {
  const result = await apiClient.GET("/api/projects", { signal });

  if (!result.data) {
    throw apiError(result.response, result.error);
  }

  return result.data;
}

export async function evaluateProject(
  projectId: string,
  studentId: string,
  submission: string,
) {
  const result = await apiClient.POST("/api/projects/{project_id}/evaluate", {
    params: { path: { project_id: projectId } },
    body: { student_id: studentId, submission },
  });

  if (!result.data) {
    throw apiError(result.response, result.error);
  }

  return result.data;
}
