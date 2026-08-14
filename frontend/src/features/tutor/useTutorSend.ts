import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../../api/ApiError";
import type { StudentProgress } from "../evaluation/evaluationApi";
import { rememberActiveSession } from "../sessions/activeSession";
import { subscribeToSessionSelection } from "../sessions/sessionSelectionEvents";
import { sessionDetailKey, sessionListKey } from "../sessions/sessionsQueries";
import type { LocalExchange, OutgoingMessage } from "./tutorExchange";
import { isAbortError } from "./tutorExchange";
import { sendTutorMessage, type TraceEvent } from "./tutorApi";

interface Options {
  studentId: string;
  activeSessionId: string | null;
  initialExchange: LocalExchange | null;
  learningBusy: boolean;
  activateSession: (sessionId: string) => void;
  onTrace: Dispatch<SetStateAction<TraceEvent[]>>;
  setLearningBusy: Dispatch<SetStateAction<boolean>>;
  setLatestProgress: Dispatch<SetStateAction<StudentProgress | null>>;
}

export function useTutorSend({
  studentId,
  activeSessionId,
  initialExchange,
  learningBusy,
  activateSession,
  onTrace,
  setLearningBusy,
  setLatestProgress,
}: Options) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [exchange, setExchange] = useState<LocalExchange | null>(initialExchange);
  const [outgoing, setOutgoing] = useState<OutgoingMessage | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const sendingRef = useRef(false);
  const traceSessionRef = useRef(initialExchange?.response.session_id ?? activeSessionId);
  const mutation = useMutation({
    mutationFn: ({ message, sessionId, signal }: { message: string; sessionId: string | null; signal: AbortSignal }) =>
      sendTutorMessage(studentId, message, sessionId, signal),
  });

  useEffect(() => subscribeToSessionSelection((nextSessionId) => {
    if (traceSessionRef.current === nextSessionId) return;
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    sendingRef.current = false;
    if (outgoing) {
      setDraft((current) => current || outgoing.message);
      setStatus("Envío cancelado al cambiar de conversación. Tu mensaje sigue en el editor.");
    }
    traceSessionRef.current = nextSessionId;
    onTrace([]);
    setExchange(null);
    setOutgoing(null);
    setSendError(null);
    setFailedMessage(null);
    setLearningBusy(false);
    setLatestProgress(null);
  }), [onTrace, outgoing, setLatestProgress, setLearningBusy]);

  useEffect(() => () => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
  }, []);

  const send = async (message: string) => {
    if (sendingRef.current || learningBusy) return;
    sendingRef.current = true;
    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setDraft("");
    setSendError(null);
    setFailedMessage(null);
    setStatus("Preparando respuesta…");
    setExchange(null);
    setOutgoing({ id: requestId, message, createdAt: new Date().toISOString() });
    try {
      const response = await mutation.mutateAsync({ message, sessionId: activeSessionId, signal: controller.signal });
      if (requestId !== requestIdRef.current) return;
      traceSessionRef.current = response.session_id;
      setOutgoing(null);
      setExchange({ message, response, createdAt: new Date().toISOString() });
      onTrace(response.trace);
      setLatestProgress(response.progress);
      rememberActiveSession(studentId, response.session_id);
      activateSession(response.session_id);
      setStatus("Respuesta lista.");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionListKey(studentId) }),
        queryClient.invalidateQueries({ queryKey: sessionDetailKey(studentId, response.session_id) }),
      ]);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setOutgoing(null);
      setDraft((current) => current || message);
      setFailedMessage(message);
      setStatus(isAbortError(error) ? "Envío cancelado. Tu mensaje sigue en el editor." : "No se pudo enviar el mensaje.");
      if (!isAbortError(error)) {
        setSendError(error instanceof ApiError ? error.message : "El tutor no está disponible en este momento.");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        sendingRef.current = false;
        abortRef.current = null;
        textareaRef.current?.focus();
      }
    }
  };

  return {
    draft,
    exchange,
    outgoing,
    sendError,
    failedMessage,
    status,
    textareaRef,
    sendPending: mutation.isPending,
    setDraft,
    send,
    cancel: () => abortRef.current?.abort(),
  };
}
