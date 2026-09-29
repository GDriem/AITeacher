import type { ConversationMessage } from "./tutorApi";
import { TutorMarkdown } from "./TutorMarkdown";
import styles from "./TutorScreen.module.css";

const dateFormatter = new Intl.DateTimeFormat("es-GT", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function TutorMessage({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user";
  const createdAt = new Date(message.created_at ?? "");
  const sources = message.sources ?? [];
  return (
    <li className={[styles.message, isUser ? styles.userMessage : styles.tutorMessage].join(" ")}>
      <article>
        <div className={styles.avatar} aria-hidden="true">{isUser ? "Tú" : "A"}</div>
        <div className={styles.messageBody}>
          <header className={styles.messageHeader}>
            <strong>{message.label}</strong>
            {!Number.isNaN(createdAt.valueOf()) ? <time dateTime={message.created_at}>{dateFormatter.format(createdAt)}</time> : null}
          </header>
          <div className={styles.markdown}><TutorMarkdown>{message.content}</TutorMarkdown></div>
          {sources.length > 0 ? (
            <section className={styles.sources} aria-label="Fuentes de la respuesta">
              <h3>Fuentes</h3>
              <ul>{sources.map((source) => <li key={source}>↗ {source}</li>)}</ul>
            </section>
          ) : null}
          {message.note ? <p className={styles.note}>{message.note}</p> : null}
        </div>
      </article>
    </li>
  );
}
