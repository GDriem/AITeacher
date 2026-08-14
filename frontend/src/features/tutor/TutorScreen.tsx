import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

import { useAppSession } from "../auth/appSession";
import { useSessions } from "../sessions/sessionsContext";
import { sessionDetailOptions } from "../sessions/sessionsQueries";
import { LearningCycle } from "../evaluation/LearningCycle";
import { LearningProgressPanel } from "../progress/LearningProgressPanel";
import { TutorComposer } from "./TutorComposer";
import { TutorConversation } from "./TutorConversation";
import { TutorTrace } from "./TutorTrace";
import { exchangeMessages, exchangePersisted, navigationExchange, pendingMessage } from "./tutorExchange";
import { useTutorLearning } from "./useTutorLearning";
import { useTutorSend } from "./useTutorSend";
import styles from "./TutorScreen.module.css";
import type { VoiceSessionDialogProps } from "../voice/VoiceSessionDialog";

interface Props { studentId: string }

export function TutorScreen({ studentId }: Props) {
  const location = useLocation();
  const { capabilities } = useAppSession();
  const { activeSessionId, activateSession } = useSessions();
  const initialExchange = navigationExchange(location.state);
  const [trace, setTrace] = useState(() => initialExchange?.response.trace ?? []);
  const {
    learningBusy,
    latestProgress,
    setLearningBusy,
    setLatestProgress,
    refreshLearningData,
    completeEvaluation,
    completePractice,
  } = useTutorLearning({
    studentId,
    activeSessionId,
    initialProgress: initialExchange?.response.progress ?? null,
    onTrace: setTrace,
  });
  const {
    draft,
    exchange,
    outgoing,
    sendError,
    failedMessage,
    status,
    textareaRef,
    sendPending,
    setDraft,
    send,
    cancel,
  } = useTutorSend({
    studentId,
    activeSessionId,
    initialExchange,
    learningBusy,
    activateSession,
    onTrace: setTrace,
    setLearningBusy,
    setLatestProgress,
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const followTailRef = useRef(true);
  const voiceButtonRef = useRef<HTMLButtonElement>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceLoadError, setVoiceLoadError] = useState<string | null>(null);
  const [VoiceDialog, setVoiceDialog] = useState<ComponentType<VoiceSessionDialogProps> | null>(null);
  const detail = useQuery({
    ...sessionDetailOptions(studentId, activeSessionId ?? "new"),
    enabled: Boolean(activeSessionId),
  });
  const persistedMessages = detail.data?.messages ?? [];
  const localMessages = exchange && !exchangePersisted(persistedMessages, exchange)
    ? exchangeMessages(exchange)
    : [];
  const localExchangePending = Boolean(exchange && !exchangePersisted(persistedMessages, exchange));
  const messages = [...persistedMessages, ...localMessages, ...pendingMessage(outgoing)];
  const pendingQuiz = localExchangePending && exchange
    ? { question: exchange.response.quiz.question, attempt: exchange.response.quiz_attempt }
    : detail.data?.pending_quiz ?? (exchange ? { question: exchange.response.quiz.question, attempt: exchange.response.quiz_attempt } : null);
  const cycleKey = `${activeSessionId ?? "new"}:${exchange?.response.correlation_id ?? "persisted"}`;

  useEffect(() => {
    headingRef.current?.focus();
  }, [location.key]);

  useLayoutEffect(() => {
    if (!followTailRef.current || typeof endRef.current?.scrollIntoView !== "function") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current.scrollIntoView({ block: "end", behavior: reduced ? "auto" : "smooth" });
  }, [messages.length, sendPending]);
  const handleScroll = () => {
    const feed = feedRef.current;
    if (!feed) return;
    followTailRef.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < feed.clientHeight / 8;
  };
  const jumpToLatest = () => {
    followTailRef.current = true;
    endRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  };
  const sendFollowingTail = async (message: string) => {
    followTailRef.current = true;
    await send(message);
  };
  const openVoice = async () => {
    setVoiceLoadError(null);
    if (VoiceDialog) {
      setVoiceOpen(true);
      return;
    }
    setVoiceLoading(true);
    try {
      const module = await import("../voice/VoiceSessionDialog");
      setVoiceDialog(() => module.VoiceSessionDialog);
      setVoiceOpen(true);
    } catch {
      setVoiceLoadError("No pudimos cargar el modo de voz. Intenta nuevamente o continúa por texto.");
    } finally {
      setVoiceLoading(false);
    }
  };
  const closeVoice = () => {
    setVoiceOpen(false);
    window.requestAnimationFrame(() => voiceButtonRef.current?.focus());
  };
  const fallbackToText = () => {
    setVoiceOpen(false);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };
  return (
    <article className={styles.tutor}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Tutor de texto</p>
          <h1 ref={headingRef} tabIndex={-1}>{detail.data?.title ?? "Tu espacio para entender"}</h1>
          <p>Pregunta, contrasta y continúa el hilo sin perder el contexto de tu conversación.</p>
        </div>
        <aside className={styles.heroActions} aria-label="Estado y modos de conversación">
          <span className={styles.sessionState}>{activeSessionId ? "Conversación activa" : "Sesión nueva"}</span>
          {capabilities.voice ? (
            <button ref={voiceButtonRef} className={styles.voiceButton} type="button" disabled={voiceLoading || voiceOpen} onClick={() => void openVoice()}>
              <span aria-hidden="true"><i /><i /><i /></span>
              {voiceLoading ? "Cargando voz…" : "Conversar por voz"}
            </button>
          ) : null}
          {voiceLoadError ? <p className={styles.voiceLoadError} role="alert">{voiceLoadError}</p> : null}
        </aside>
      </header>

      <div className={styles.workspace}>
        <TutorConversation
          activeSessionId={activeSessionId}
          messages={messages}
          historyPending={detail.isPending}
          historyError={detail.isError}
          historySuccess={detail.isSuccess}
          sendPending={sendPending}
          sendError={sendError}
          retryAvailable={Boolean(failedMessage)}
          status={status}
          feedRef={feedRef}
          endRef={endRef}
          onScroll={handleScroll}
          onJumpToLatest={jumpToLatest}
          onRetryHistory={() => void detail.refetch()}
          onRetrySend={() => { if (failedMessage) void sendFollowingTail(failedMessage); }}
        >
          {activeSessionId && pendingQuiz ? (
            <LearningCycle
              key={cycleKey}
              studentId={studentId}
              sessionId={activeSessionId}
              pendingQuiz={pendingQuiz}
              pendingPractice={detail.data?.pending_practice?.exercise ?? null}
              tutorBusy={sendPending || learningBusy}
              onBusyChange={setLearningBusy}
              onEvaluationCompleted={completeEvaluation}
              onPracticeCompleted={completePractice}
              onPracticeStarted={() => refreshLearningData(activeSessionId)}
              onTutorPrompt={(prompt) => void sendFollowingTail(prompt)}
            />
          ) : null}
          <TutorComposer
            draft={draft}
            pending={sendPending}
            disabled={learningBusy}
            textareaRef={textareaRef}
            onDraftChange={setDraft}
            onSend={(message) => void sendFollowingTail(message)}
            onCancel={cancel}
          />
        </TutorConversation>
        <div className={styles.insightRail}>
          <LearningProgressPanel studentId={studentId} latestProgress={latestProgress} />
          <TutorTrace events={trace} />
        </div>
      </div>
      {voiceOpen && VoiceDialog ? (
        <VoiceDialog
          activeSessionId={activeSessionId}
          studentId={studentId}
          onClose={closeVoice}
          onFallback={fallbackToText}
        />
      ) : null}
    </article>
  );
}
