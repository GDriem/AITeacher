import { apiClient, apiError } from "../../api/client";
import type { components } from "../../api/generated/schema";

export type AppCapabilities = components["schemas"]["AppCapabilities"];
export type AuthStatus = components["schemas"]["AuthStatus"];
export type StudentProfile = components["schemas"]["PublicStudentProfile"];

export async function getCapabilities(signal?: AbortSignal) {
  const result = await apiClient.GET("/api/capabilities", { signal });
  if (!result.data) throw apiError(result.response, result.error);
  return result.data;
}

export async function getAuthStatus(signal?: AbortSignal) {
  const result = await apiClient.GET("/api/auth/status", { signal });
  if (!result.data) throw apiError(result.response, result.error);
  return result.data;
}

export async function loginWithGoogle(credential: string) {
  const result = await apiClient.POST("/api/auth/google", {
    body: { credential },
  });
  if (!result.data) throw apiError(result.response, result.error);
  return result.data;
}

export async function logout() {
  const result = await apiClient.POST("/api/auth/logout");
  if (!result.response.ok) throw apiError(result.response, result.error);
}
