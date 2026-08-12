import { createContext, useContext } from "react";
import type { ConversationListResponse } from "./sessionsApi";

export interface SessionsContextValue {
  activeSessionId: string | null;
  openingSessionId: string | null;
  sessionsData: ConversationListResponse | undefined;
  sessionsError: Error | null;
  sessionsFetching: boolean;
  sessionsPending: boolean;
  sessionsStatus: "error" | "success" | "pending";
  refetchSessions: () => Promise<unknown>;
  startNewSession: () => void;
  openSession: (sessionId: string) => Promise<boolean>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  setArchived: (sessionId: string, archived: boolean) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}

export const SessionsContext = createContext<SessionsContextValue | null>(null);

export function useSessions() {
  const context = useContext(SessionsContext);
  if (!context) throw new Error("useSessions debe usarse dentro de SessionsProvider.");
  return context;
}
