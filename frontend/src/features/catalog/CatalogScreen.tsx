import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "../../api/ApiError";
import type { TopicCatalogItem, TopicCatalogResponse } from "./catalogApi";
import { startTopic } from "./catalogApi";
import { CatalogFilters } from "./CatalogFilters";
import { catalogOptions, filterTopics, filtersFromParams, paramsFromFilters } from "./catalogFilterState";
import { LearningPath } from "./LearningPath";
import { topicCatalogKey, topicCatalogOptions } from "./catalogQueries";
import { useSessions } from "../sessions/sessionsContext";
import { sessionListKey } from "../sessions/sessionsQueries";
import { TopicGrid } from "./TopicGrid";
import styles from "./CatalogScreen.module.css";

interface Props {
  studentId: string;
}

export function CatalogScreen({ studentId }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activateSession } = useSessions();
  const catalog = useQuery(topicCatalogOptions(studentId));
  const filters = filtersFromParams(searchParams);

  const startMutation = useMutation({
    mutationFn: (topic: TopicCatalogItem) => startTopic(studentId, topic.title),
    onSuccess: (response, topic) => {
      const message = `Quiero aprender sobre ${topic.title}`;
      activateSession(response.session_id);
      void queryClient.invalidateQueries({ queryKey: topicCatalogKey(studentId) });
      void queryClient.invalidateQueries({ queryKey: sessionListKey(studentId) });
      void navigate("/tutor", { state: { tutorExchange: { message, response } } });
    },
  });

  if (catalog.isPending) return <CatalogLoading />;
  if (catalog.isError) return <CatalogError error={catalog.error} onRetry={() => void catalog.refetch()} />;

  const options = catalogOptions(catalog.data.topics, filters.subject);
  const visibleTopics = filterTopics(catalog.data.topics, filters);
  const recommendation = recommendationForSubject(catalog.data, filters.subject);
  const pendingTopic = startMutation.isPending ? startMutation.variables.topic : null;
  const count =
    visibleTopics.length === catalog.data.total_topics
      ? `${String(catalog.data.total_topics)} temas`
      : `${String(visibleTopics.length)} de ${String(catalog.data.total_topics)} temas`;

  const updateFilters = (next: typeof filters) => {
    setSearchParams(paramsFromFilters(next), { replace: true });
  };

  const startRecommended = (topicId: string) => {
    const topic = catalog.data.topics.find((item) => item.topic === topicId);
    if (topic) startMutation.mutate(topic);
  };

  return (
    <article className={styles.catalog}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Explora el currículo</p>
          <h1>Elige qué quieres aprender</h1>
          <p className={styles.lede}>
            Recorre inteligencia artificial o practica inglés. Cada tema se ajusta al punto en el que estás.
          </p>
        </div>
        <strong id="topics-count" className={styles.count} aria-live="polite">
          {count}
        </strong>
      </header>

      <LearningPath
        recommendation={recommendation}
        pending={startMutation.isPending && pendingTopic === recommendation?.topic}
        onStart={startRecommended}
      />

      {startMutation.isError ? (
        <p className={styles.startError} role="alert">
          <strong>No pudimos iniciar el tema.</strong> {errorCopy(startMutation.error)}
        </p>
      ) : null}

      <CatalogFilters
        filters={filters}
        subjects={options.subjects}
        categories={options.categories}
        levels={options.levels}
        onChange={updateFilters}
      />
      <TopicGrid
        topics={visibleTopics}
        allTopics={catalog.data.topics}
        queryActive={Boolean(filters.query || filters.subject || filters.category || filters.level)}
        pendingTopic={pendingTopic}
        onStart={(topic) => startMutation.mutate(topic)}
      />
    </article>
  );
}

function recommendationForSubject(data: TopicCatalogResponse, subject: string) {
  if (!subject) return data.recommendation;
  const recommended = data.topics.find((topic) => topic.topic === data.recommendation?.topic);
  if (recommended?.subject === subject) return data.recommendation;

  const next = data.topics.find(
    (topic) => topic.subject === subject && (topic.status === "in_progress" || topic.status === "available"),
  );
  if (!next) return null;
  return {
    topic: next.topic,
    title: next.title,
    reason:
      next.status === "in_progress"
        ? `Retoma este tema desde tu mejor resultado: ${String(Math.round(next.progress?.best_score ?? 0))}/100.`
        : "Es el siguiente tema disponible en esta materia.",
  };
}

function errorCopy(error: Error) {
  return error instanceof ApiError ? error.message : "Intenta nuevamente.";
}

function CatalogLoading() {
  return (
    <section className={styles.catalog} aria-busy="true" aria-label="Cargando catálogo">
      <div className={styles.loadingHeader} />
      <div className={styles.loadingPath} />
      <div className={styles.loadingGrid}>
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </section>
  );
}

function CatalogError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <section className={styles.errorState} role="alert">
      <p className={styles.eyebrow}>Catálogo temporalmente interrumpido</p>
      <h1>No pudimos cargar los temas.</h1>
      <p>{errorCopy(error)}</p>
      <button type="button" onClick={onRetry}>
        Reintentar
      </button>
    </section>
  );
}
