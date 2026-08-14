import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppSession } from "../auth/appSession";
import {
  clearActiveSession,
  readActiveSession,
  rememberActiveSession,
} from "./activeSession";
import { deleteSession as deleteSessionRequest, updateSession } from "./sessionsApi";
import { notifySessionSelection } from "./sessionSelectionEvents";
import { SessionsContext } from "./sessionsContext";
import {
  sessionDetailKey,
  sessionDetailOptions,
  sessionListKey,
  sessionListOptions,
  sessionsKey,
} from "./sessionsQueries";

export function SessionsProvider({ children }: { children: ReactNode }) {
  const { studentId } = useAppSession();
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery(sessionListOptions(studentId));
  const [activeSessionId, setActiveSessionId] = useState(() => readActiveSession(studentId));
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  const openRequestRef = useRef(0);
  const [pendingActivation, setPendingActivation] = useState<{ id: string; dataUpdatedAt: number } | null>(null);
  const activeSession = activeSessionId
    ? sessionsQuery.data?.sessions.find((item) => item.id === activeSessionId)
    : null;
  const awaitingActivatedSession = pendingActivation?.id === activeSessionId
    && sessionsQuery.dataUpdatedAt <= pendingActivation.dataUpdatedAt;
  const resolvedActiveSessionId = !sessionsQuery.data
    || (activeSession && !activeSession.archived_at)
    || awaitingActivatedSession
    ? activeSessionId
    : null;

  useEffect(() => {
    if (activeSessionId && sessionsQuery.data && !resolvedActiveSessionId) {
      clearActiveSession(studentId);
    }
  }, [activeSessionId, resolvedActiveSessionId, sessionsQuery.data, studentId]);

  const updateMutation = useMutation({
    mutationFn: ({ sessionId, update }: {
      sessionId: string;
      update: { title?: string; archived?: boolean };
    }) => updateSession(studentId, sessionId, update),
    onSuccess: async (session, { sessionId }) => {
      queryClient.setQueryData(sessionDetailKey(studentId, sessionId), session);
      await queryClient.invalidateQueries({ queryKey: sessionListKey(studentId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => deleteSessionRequest(studentId, sessionId),
    onSuccess: async (_result, sessionId) => {
      queryClient.removeQueries({ queryKey: sessionDetailKey(studentId, sessionId) });
      await queryClient.invalidateQueries({ queryKey: sessionListKey(studentId) });
    },
  });

  const startNewSession = () => {
    openRequestRef.current += 1;
    setPendingActivation(null);
    void queryClient.cancelQueries({ queryKey: [...sessionsKey(studentId), "detail"] });
    clearActiveSession(studentId);
    notifySessionSelection(null);
    setOpeningSessionId(null);
    setActiveSessionId(null);
  };

  const activateSession = (sessionId: string) => {
    openRequestRef.current += 1;
    setPendingActivation({ id: sessionId, dataUpdatedAt: sessionsQuery.dataUpdatedAt });
    rememberActiveSession(studentId, sessionId);
    notifySessionSelection(sessionId);
    setOpeningSessionId(null);
    setActiveSessionId(sessionId);
  };

  const openSession = async (sessionId: string) => {
    const requestId = ++openRequestRef.current;
    setOpeningSessionId(sessionId);
    try {
      const session = await queryClient.fetchQuery(sessionDetailOptions(studentId, sessionId));
      if (requestId !== openRequestRef.current) return false;
      if (session.archived_at) throw new Error("Restaura la conversación antes de continuar.");
      rememberActiveSession(studentId, session.id);
      notifySessionSelection(session.id);
      setActiveSessionId(session.id);
      return true;
    } finally {
      if (requestId === openRequestRef.current) setOpeningSessionId(null);
    }
  };

  const renameSession = async (sessionId: string, title: string) => {
    await updateMutation.mutateAsync({ sessionId, update: { title } });
  };

  const setArchived = async (sessionId: string, archived: boolean) => {
    await updateMutation.mutateAsync({ sessionId, update: { archived } });
    if (archived && sessionId === activeSessionId) startNewSession();
  };

  const deleteSession = async (sessionId: string) => {
    await deleteMutation.mutateAsync(sessionId);
    if (sessionId === activeSessionId) startNewSession();
  };

  return (
    <SessionsContext value={{
      activeSessionId: resolvedActiveSessionId,
      openingSessionId,
      sessionsData: sessionsQuery.data,
      sessionsError: sessionsQuery.error,
      sessionsFetching: sessionsQuery.isFetching,
      sessionsPending: sessionsQuery.isPending,
      sessionsStatus: sessionsQuery.status,
      refetchSessions: sessionsQuery.refetch,
      startNewSession,
      activateSession,
      openSession,
      renameSession,
      setArchived,
      deleteSession,
    }}>
      {children}
    </SessionsContext>
  );
}
