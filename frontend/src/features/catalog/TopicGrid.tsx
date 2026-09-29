import type { TopicCatalogItem } from "./catalogApi";
import { TopicCard } from "./TopicCard";
import styles from "./CatalogScreen.module.css";

interface Props {
  topics: TopicCatalogItem[];
  allTopics: TopicCatalogItem[];
  queryActive: boolean;
  pendingTopic: string | null;
  onStart: (topic: TopicCatalogItem) => void;
}

export function TopicGrid({ topics, allTopics, queryActive, pendingTopic, onStart }: Props) {
  const titles = new Map(allTopics.map((topic) => [topic.topic, topic.title]));

  if (topics.length === 0) {
    return (
      <section className={styles.emptyState} role="status">
        <strong>{queryActive ? "Sin coincidencias" : "Aún no hay temas publicados"}</strong>
        <p>
          {queryActive
            ? "Prueba con otra palabra o ajusta los filtros."
            : "El catálogo aparecerá aquí cuando el servicio publique contenido."}
        </p>
      </section>
    );
  }

  return (
    <ul id="topic-grid" className={styles.topicGrid} aria-live="polite">
      {topics.map((topic) => (
        <TopicCard
          key={topic.topic}
          topic={topic}
          titles={titles}
          pending={pendingTopic === topic.topic}
          onStart={onStart}
        />
      ))}
    </ul>
  );
}
