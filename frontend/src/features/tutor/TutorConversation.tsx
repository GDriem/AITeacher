import type { ReactNode, RefObject } from "react";

import type { ConversationMessage } from "./tutorApi";
import { TutorMessage } from "./TutorMessage";
import { TutorHistoryError, TutorLoading, TutorWelcome } from "./TutorStates";
import styles from "./TutorScreen.module.css";

interface Props {
  activeSessionId: string | null;
  messages: ConversationMessage[];
  historyPending: boolean;
  historyError: boolean;
  historySuccess: boolean;
  sendPending: boolean;
  sendError: string | null;
  retryAvailable: boolean;
  status: string;
  feedRef: RefObject<HTMLDivElement | null>;
  endRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onJumpToLatest: () => void;
  onRetryHistory: () => void;
  onRetrySend: () => void;
  children: ReactNode;
}

export function TutorConversation({
  activeSessionId,
  messages,
  historyPending,
  historyError,
  historySuccess,
  sendPending,
  sendError,
  retryAvailable,
  status,
  feedRef,
  endRef,
  onScroll,
  onJumpToLatest,
  onRetryHistory,
  onRetrySend,
  children,
}: Props) {
  return (
    <section className={styles.conversation}>
      <h2 id="feed-title" className={styles.srOnly}>Conversación</h2>
      <div ref={feedRef} className={styles.feed} role="region" aria-labelledby="feed-title" aria-busy={sendPending} onScroll={onScroll}>
        {messages.length > 0 ? <button className={styles.feedJump} type="button" onClick={onJumpToLatest}>Ir al mensaje más reciente ↓</button> : null}
        {historyPending && activeSessionId && messages.length === 0 ? <TutorLoading /> : null}
        {historyError && messages.length === 0 ? <TutorHistoryError onRetry={onRetryHistory} /> : null}
        {messages.length === 0 && (!activeSessionId || historySuccess) ? <TutorWelcome /> : null}
        {historyError && messages.length > 0 ? (
          <p className={styles.inlineWarning} role="alert">No pudimos sincronizar el historial. <button type="button" onClick={onRetryHistory}>Reintentar</button></p>
        ) : null}
        {messages.length > 0 ? <ol className={styles.messageList}>{messages.map((message) => <TutorMessage key={message.id} message={message} />)}</ol> : null}
        {sendPending ? <p className={styles.waiting} role="status">El tutor está coordinando la respuesta…</p> : null}
        <div ref={endRef} />
      </div>
      {sendError ? (
        <div className={styles.sendError} role="alert">
          <p><strong>No pudimos enviar el mensaje.</strong> {sendError}</p>
          {retryAvailable ? <button type="button" onClick={onRetrySend}>Reintentar</button> : null}
        </div>
      ) : null}
      {children}
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">{status}</p>
    </section>
  );
}
