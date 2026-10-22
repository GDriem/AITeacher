import { useId } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Button, EmptyState, PageHeader, TopicCard, buttonClass } from "../../ui";
import { Busy, Failure, Field } from "./Shared";
import { catalogTopics, filterCatalog, groupCatalog, materialCount, useCatalog } from "./catalogQueries";
import styles from "./CurriculumExplorer.module.css";

export function CurriculumExplorer() {
  // Búsqueda y filtros viven en la URL: recargar o volver desde un tema o una unidad conserva la selección.
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const subject = search.get("materia") ?? "";
  const category = search.get("categoria") ?? "";
  const level = search.get("nivel") ?? "";
  const text = search.get("q") ?? "";
  // flushSync: React Router aplica la navegación en una transición, y la búsqueda controlada por la URL perdería el cursor.
  const filter = (changes: Record<string, string>) => setSearch((previous) => {
    const next = new URLSearchParams(previous);
    for (const [key, value] of Object.entries(changes)) if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true, flushSync: true });
  const clear = () => setSearch(new URLSearchParams(), { replace: true });
  const subjectLabel = useId();
  const levelLabel = useId();
  const query = useCatalog();
  if (query.isPending) return <Busy />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const data = query.data;
  const all = catalogTopics(data);
  const subjects = [...new Map(all.map((topic) => [topic.subject.id, topic.subject])).values()].sort((left, right) => left.sortOrder - right.sortOrder);
  const selectedCategory = all.find((topic) => topic.category.id === category)?.category;
  const levelNames = new Map(data.source.levels.map((entry) => [entry.slug, entry.name]));
  const shown = filterCatalog(all, { subject, category, level, text });
  const groups = groupCatalog(shown);
  const count = shown.reduce((total, topic) => total + topic.units.length, 0);
  const filtered = Boolean(subject || category || level || text.trim());

  return <section>
    <PageHeader title="Explora el catálogo" eyebrow="Materias · temas · lecturas"
      description="Elige un tema para ver sus lecturas por nivel. Los niveles describen el material; no acreditan dominio." />
    <div className={styles.toolbar}>
      <Field title="Buscar temas o lecturas">
        <input type="search" value={text} placeholder="Por ejemplo: OSPF, subredes, vectores" autoComplete="off"
          onChange={(event) => filter({ q: event.target.value })} />
      </Field>
      {subjects.length > 1 ? <div className={styles.chipRow}>
        <span id={subjectLabel} className={styles.chipLabel}>Materia</span>
        <div className={styles.chips} role="group" aria-labelledby={subjectLabel}>
          <Button size="sm" aria-pressed={!subject} onClick={() => filter({ materia: "", categoria: "" })}>Todas</Button>
          {subjects.map((entry) => <Button key={entry.id} size="sm" aria-pressed={subject === entry.id}
            onClick={() => filter({ materia: subject === entry.id ? "" : entry.id, categoria: "" })}>{entry.name}</Button>)}
        </div>
      </div> : null}
      <div className={styles.chipRow}>
        <span id={levelLabel} className={styles.chipLabel}>Nivel de lectura</span>
        <div className={styles.chips} role="group" aria-labelledby={levelLabel}>
          <Button size="sm" aria-pressed={!level} onClick={() => filter({ nivel: "" })}>Todos</Button>
          {data.source.levels.map((entry) => <Button key={entry.slug} size="sm" aria-pressed={level === entry.slug}
            onClick={() => filter({ nivel: level === entry.slug ? "" : entry.slug })}>{entry.name}</Button>)}
        </div>
      </div>
      {selectedCategory ? <div className={styles.chips}>
        <Button size="sm" variant="ghost" onClick={() => filter({ categoria: "" })}>Categoría: {selectedCategory.name} <span aria-hidden="true">×</span><span className={styles.visuallyHidden}>(quitar)</span></Button>
      </div> : null}
    </div>
    <div className={styles.summary}>
      <p role="status">{shown.length} {shown.length === 1 ? "tema" : "temas"} · {count} {count === 1 ? "material publicado" : "materiales publicados"}</p>
      {filtered && groups.length > 0 ? <Button size="sm" variant="ghost" onClick={clear}>Quitar filtros</Button> : null}
    </div>
    {all.length === 0 ? <EmptyState title="Todavía no hay material publicado"
      description="Cuando tu docente publique lecturas o unidades aparecerán aquí. Mientras tanto, revisa tus apuntes o repasos."
      action={<Link className={buttonClass("primary")} to="/">Volver al inicio</Link>} />
      : groups.length === 0 ? <EmptyState title="No encontramos temas con estos filtros"
        description={text.trim() ? `Nada coincide con «${text.trim()}». Revisa la ortografía, prueba con otra palabra o quita los filtros.` : "Ningún tema tiene material publicado con esta combinación. Prueba con otro nivel o quita los filtros."}
        action={<Button variant="primary" onClick={clear}>Quitar filtros</Button>} />
        : groups.map((group) => <section key={group.subject.id} className={styles.subject} aria-labelledby={`subject-${group.subject.id}`}>
          <h2 id={`subject-${group.subject.id}`} className={styles.subjectTitle}>{group.subject.name}</h2>
          {group.categories.map((section) => <section key={section.category.id} aria-labelledby={`category-${section.category.id}`}>
            <h3 id={`category-${section.category.id}`} className={styles.categoryTitle}>{section.category.name}</h3>
            <ul className={styles.grid}>{section.topics.map((topic) => <TopicCard key={topic.entry.id} headingLevel={4} title={topic.entry.name}
              to={`/temas/${encodeURIComponent(topic.entry.id)}`} state={{ catalogSearch: location.search }}
              summary={materialCount(topic.units)}
              levels={(level ? [level] : topic.levels).map((slug) => levelNames.get(slug) ?? slug)}
              note={topic.prerequisites.length ? `Antes se recomienda: ${topic.prerequisites.map((item) => item.name).join(", ")}.` : null} />)}</ul>
          </section>)}
        </section>)}
  </section>;
}
