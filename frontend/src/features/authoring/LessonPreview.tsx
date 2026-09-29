import { TutorMarkdown } from "../tutor/TutorMarkdown";
import type { LearningContent } from "./authoringApi";
import { authoringLevelLabel } from "./authoringLabels";
import styles from "./AuthoringScreen.module.css";

export function LessonPreview({ content, topicTitle }: { content: LearningContent; topicTitle: string }) {
  const keywords = content.keywords ?? [];
  return (
    <article className={styles.preview} aria-labelledby="lesson-preview-title">
      <p className={styles.eyebrow}>{authoringLevelLabel(content.level)} · {topicTitle}</p>
      <h3 id="lesson-preview-title">{content.title}</h3>
      <div className={styles.previewBody}><TutorMarkdown>{content.text}</TutorMarkdown></div>
      <p className={styles.previewSource}><strong>Fuente:</strong> {content.source}</p>
      {keywords.length ? (
        <ul className={styles.keywords} aria-label="Palabras clave">
          {keywords.map((keyword) => <li key={keyword}>{keyword}</li>)}
        </ul>
      ) : null}
    </article>
  );
}
