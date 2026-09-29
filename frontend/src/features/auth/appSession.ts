import { createContext, useContext } from "react";

import type { AppCapabilities, StudentProfile } from "./authApi";

export interface AppSession {
  authEnabled: boolean;
  capabilities: AppCapabilities;
  profile: StudentProfile | null;
  studentId: string;
  logout: () => Promise<void>;
}

export const AppSessionContext = createContext<AppSession | null>(null);

export function useAppSession() {
  const session = useContext(AppSessionContext);
  if (!session) throw new Error("useAppSession debe usarse dentro de AuthProvider.");
  return session;
}
