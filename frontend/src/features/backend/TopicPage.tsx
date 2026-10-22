import { Link, useLocation, useParams } from "react-router-dom";
import { EmptyState, PageHeader, TopicCard, buttonClass } from "../../ui";
import { required } from "./client";
import { Busy, Failure } from "./Shared";
import { catalogTopics, materialCount, useCatalog } from "./catalogQueries";
import { catalogPath, topicPath } from "./unitQueries";
import styles from "./TopicPage.module.css";

/** Tema: descripción, prerrequisitos enlazados y unidades publicadas agrupadas por nivel. */
export function TopicPage() {
  const topicId = required(useParams().topicId);
  // El estado de navegación trae los filtros del catálogo; se reenvía a la unidad para que también pueda volver.
  const state: unknown = useLocation().state;
  const back = catalogPath(state);
  const query = useCatalog();
  if (query.isPending) return <Busy />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const topic = catalogTopics(query.data).find((item) => item.entry.id === topicId);
  if (!topic) return <section>
    <PageHeader title="Este tema no está disponible" breadcrumbs={[{ label: "Catálogo", to: back }, { label: "Tema" }]} />
    <EmptyState title="No hay material publicado para este tema" description="Puede que el enlace sea antiguo o que el tema todavía no tenga lecturas. Busca otro tema en el catálogo."
      action={<Link className={buttonClass("primary")} to={back}>Ir al catálogo</Link>} />
  </section>;

  const levelNames = new Map(query.data.source.levels.map((entry) => [entry.slug, entry.name]));
  const groups = [
    ...topic.levels.map((level) => ({ key: level, title: levelNames.get(level) ?? level, units: topic.units.filter((unit) => unit.readingProvenance?.level === level) })),
    { key: "complete", title: "Unidades completas", units: topic.units.filter((unit) => !unit.readingProvenance) },
  ].filter((group) => group.units.length);
  const levels = topic.levels.length;
  return <section>
    <PageHeader title={topic.entry.name} eyebrow={`${topic.subject.name} · ${topic.category.name}`}
      breadcrumbs={[{ label: "Catálogo", to: back }, { label: topic.entry.name }]}
      description={`Material publicado: ${materialCount(topic.units)}${levels ? ` en ${String(levels)} ${levels === 1 ? "nivel" : "niveles"}` : ""}. Los niveles describen el material; no acreditan dominio.`}
      actions={<Link className={buttonClass("ghost")} to={back}>Volver al catálogo</Link>} />
    {topic.prerequisites.length ? <aside className={styles.prerequisites} aria-labelledby="topic-prerequisites">
      <h2 id="topic-prerequisites">Antes se recomienda</h2>
      <ul>{topic.prerequisites.map((item) => <li key={item.slug}>
        {item.entry ? <Link to={topicPath(item.entry.id)} state={state}>{item.name}</Link> : item.name}
      </li>)}</ul>
      <p>Es una recomendación: puedes estudiar este tema de todos modos.</p>
    </aside> : null}
    {groups.map((group) => <section key={group.key} className={styles.level} aria-labelledby={`level-${group.key}`}>
      <h2 id={`level-${group.key}`} className={styles.levelTitle}>{group.title} <span>{materialCount(group.units)}</span></h2>
      <ul className={styles.grid}>{group.units.map((unit) => <TopicCard key={unit.id} title={unit.title} to={`/unidades/${encodeURIComponent(unit.id)}`} state={state}
        eyebrow={unit.kind === "reading" ? "Lectura" : "Unidad"}
        summary={unit.kind === "reading" ? "Material de lectura con consulta al tutor." : "Objetivos, práctica y evaluación."} />)}</ul>
    </section>)}
  </section>;
}
