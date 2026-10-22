import { createContext, use } from "react";
import type { Schema } from "./client";

export const ProfileContext = createContext<Schema["StudentProfile"] | null>(null);

/** Perfil del alumno autenticado, publicado por `BackendRoot` a todas las rutas. */
export function useProfile() {
  const profile = use(ProfileContext);
  if (!profile) throw new Error("useProfile requiere una sesión iniciada");
  return profile;
}
