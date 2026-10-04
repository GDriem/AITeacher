import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "../../api/ApiError";
import type { LearningLevel, TopicCatalogItem, TopicCatalogResponse } from "./catalogApi";
import { startTopic } from "./catalogApi";
import { CatalogFilters } from "./CatalogFilters";
import { CatalogExplorer } from "./CatalogExplorer";
import { CatalogLevelPicker } from "./CatalogLevelPicker";
import { categoryLabel, subjectLabel } from "./catalogLabels";
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  const showAll = searchParams.get("view") === "all" || Boolean(filters.query || (filters.level && !filters.subject));
  const showLessons = showAll || Boolean(filters.subject && filters.category);

  const startMutation = useMutation({
    mutationFn: ({ topic, level }: { topic: TopicCatalogItem; level: LearningLevel | "" }) => startTopic(studentId, topic.title, level || undefined),
    onSuccess: (response, { topic }) => {
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
  const scopeTopics = filterTopics(catalog.data.topics, { ...filters, query: "", level: "" });
  const availableLevels = [...new Set(scopeTopics.flatMap((topic) => topic.available_levels))];
  const recommendation = recommendationForSubject(catalog.data, filters.subject, visibleTopics);
  const pendingTopic = startMutation.isPending ? startMutation.variables.topic.topic : null;
  const count =
    visibleTopics.length === catalog.data.total_topics
      ? `${String(catalog.data.total_topics)} temas`
      : `${String(visibleTopics.length)} de ${String(catalog.data.total_topics)} temas`;

  const updateFilters = (next: typeof filters) => {
    const params = paramsFromFilters(next);
    if (showAll) params.set("view", "all");
    setSearchParams(params, { replace: true });
  };

  const explore = (subject = "", category = "", all = false) => {
    const params = paramsFromFilters({ subject, category, query: "", level: subject === filters.subject && subject ? filters.level : "" });
    if (all) params.set("view", "all");
    setSearchParams(params);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const startRecommended = (topicId: string) => {
    const topic = catalog.data.topics.find((item) => item.topic === topicId);
    if (topic) startMutation.mutate({ topic, level: filters.level });
  };

  return (
    <article className={styles.catalog}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Explora el currículo</p>
          <h1 ref={titleRef} tabIndex={-1}>
            {showAll ? "Todos los temas" : filters.category && filters.subject ? categoryLabel(filters.category) : "Elige qué quieres aprender"}
          </h1>
          <p className={styles.lede}>
            {showAll ? "Busca un tema o usa los filtros para encontrar tu próxima lección." : "Elige una materia, explora sus categorías y encuentra tu próxima lección."}
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

      <nav className={styles.explorerNav} aria-label="Explorar catálogo">
        <div className={styles.breadcrumbs}>
          <button type="button" aria-current={!showAll && !filters.subject ? "page" : undefined} onClick={() => explore()}>Materias</button>
          {!showAll && filters.subject ? <>
            <span aria-hidden="true">/</span>
            <button type="button" aria-current={!filters.category ? "page" : undefined} onClick={() => explore(filters.subject)}>{subjectLabel(filters.subject)}</button>
            {filters.category ? <><span aria-hidden="true">/</span><span aria-current="page">{categoryLabel(filters.category)}</span></> : null}
          </> : null}
        </div>
        <button type="button" className={styles.viewAll} aria-current={showAll ? "page" : undefined} onClick={() => explore("", "", true)}>Ver todo <span aria-hidden="true">↗</span></button>
      </nav>

      {!showAll && filters.subject ? <CatalogLevelPicker level={filters.level} available={availableLevels}
        onChange={(level) => updateFilters({ ...filters, level })} /> : null}

      {!showLessons ? <CatalogExplorer topics={catalog.data.topics} subject={filters.subject} level={filters.level}
        onSubject={(subject) => explore(subject)} onCategory={(category) => explore(filters.subject, category)} /> : null}

      {showAll ? <CatalogFilters
        filters={filters}
        subjects={options.subjects}
        categories={options.categories}
        levels={options.levels}
        onChange={updateFilters}
      /> : null}
      {showLessons ? <section className={styles.lessons} aria-label="Temas de aprendizaje">
      {!showAll ? <h2>Temas de {categoryLabel(filters.category)}</h2> : null}
      <TopicGrid
        topics={visibleTopics}
        allTopics={catalog.data.topics}
        queryActive={Boolean(filters.query || filters.subject || filters.category || filters.level)}
        pendingTopic={pendingTopic}
        selectedLevel={filters.level}
        onStart={(topic) => startMutation.mutate({ topic, level: filters.level })}
      />
      </section> : null}
    </article>
  );
}

function recommendationForSubject(data: TopicCatalogResponse, subject: string, topics: TopicCatalogItem[]) {
  const recommended = topics.find((topic) => topic.topic === data.recommendation?.topic);
  if (recommended && (!subject || recommended.subject === subject)) return data.recommendation;

  const next = topics.find(
    (topic) => (!subject || topic.subject === subject) && (topic.status === "in_progress" || topic.status === "available"),
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
