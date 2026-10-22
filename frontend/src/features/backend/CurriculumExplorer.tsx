import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { backend, result, type Schema } from "./client";
import { Busy, Failure, Field } from "./Shared";
import { buttonClass, cardClass } from "../../ui";
import shared from "./Shared.module.css";
import { panel } from "./panel";
import styles from "./CurriculumExplorer.module.css";

type Resource = "subjects" | "categories" | "topics";
async function catalogEntries(resource: Resource, signal: AbortSignal) {
  const items: Schema["EntryResponse"][] = [];
  for (let offset = 0; ; offset += 100) {
    const page = result(await backend.GET(`/api/catalog/${resource}`, { signal, params: { query: { offset, limit: 100 } } }));
    items.push(...page.items);
    if (items.length >= page.total) return items;
  }
}
async function publishedUnits(signal: AbortSignal) {
  const items: Schema["UnitSummary"][] = [];
  for (let offset = 0; ; offset += 100) {
    const page = result(await backend.GET("/api/units", { signal, params: { query: { offset, limit: 100 } } }));
    items.push(...page.items.filter((unit) => unit.publishedRevisionId));
    if (offset + page.items.length >= page.total) return items;
  }
}

export function CurriculumExplorer() {
  // Los filtros viven en la URL: recargar o volver desde una unidad conserva la selección.
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const subject = search.get("materia") ?? "";
  const category = search.get("categoria") ?? "";
  const topic = search.get("tema") ?? "";
  const level = search.get("nivel") ?? "";
  const filter = (changes: Record<string, string>) => setSearch((previous) => {
    const next = new URLSearchParams(previous);
    for (const [key, value] of Object.entries(changes)) if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });
  const query = useQuery({ queryKey: ["curriculum-explorer"], queryFn: async ({ signal }) => {
    const [subjects, categories, topics, units, source] = await Promise.all([
      catalogEntries("subjects", signal), catalogEntries("categories", signal), catalogEntries("topics", signal), publishedUnits(signal),
      backend.GET("/api/catalog/source-curriculum", { signal }).then(result),
    ]);
    return { subjects, categories, topics, units, source };
  } });
  if (query.isPending) return <Busy />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const data = query.data;
  const subjects = data.subjects.filter((entry) => entry.isAvailable);
  const subjectIds = new Set(subjects.map((entry) => entry.id));
  const availableCategories = data.categories.filter((entry) => entry.isAvailable && entry.subjectId != null && subjectIds.has(entry.subjectId));
  const categoryIds = new Set(availableCategories.map((entry) => entry.id));
  const categories = availableCategories.filter((entry) => !subject || entry.subjectId === subject);
  const topics = data.topics.filter((entry) => entry.isAvailable && entry.categoryId != null && categoryIds.has(entry.categoryId) &&
    (!subject || entry.subjectId === subject) && (!category || entry.categoryId === category));
  const titles = new Map(data.source.topics.map((entry) => [entry.slug, entry.name]));
  const levelNames = new Map(data.source.levels.map((entry) => [entry.slug, entry.name]));
  const units = data.units.filter((unit) => (!level || unit.readingProvenance?.level === level));
  const shown = topics.filter((entry) => (!topic || entry.id === topic) && units.some((unit) => unit.topicId === entry.id));
  const count = units.filter((unit) => shown.some((entry) => unit.topicId === entry.id)).length;
  return <section><p className={shared.eyebrow}>Materias · temas · lecturas</p><h1>Continúa aprendiendo</h1>
    <p>Explora el catálogo y elige una lectura. Los niveles describen el material; no acreditan dominio.</p>
    <div className={styles.filters}>
      <Field title="Materia"><select value={subject} onChange={(event) => filter({ materia: event.target.value, categoria: "", tema: "" })}>
        <option value="">Todas las materias</option>{subjects.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select></Field>
      <Field title="Categoría"><select value={category} onChange={(event) => filter({ categoria: event.target.value, tema: "" })}>
        <option value="">Todas las categorías</option>{categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select></Field>
      <Field title="Tema"><select value={topic} onChange={(event) => filter({ tema: event.target.value })}>
        <option value="">Todos los temas</option>{topics.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select></Field>
      <Field title="Nivel de lectura"><select value={level} onChange={(event) => filter({ nivel: event.target.value })}>
        <option value="">Todos los niveles</option>{data.source.levels.map((entry) => <option key={entry.slug} value={entry.slug}>{entry.name}</option>)}
      </select></Field>
    </div>
    <p role="status">{count} materiales publicados en {shown.length} temas.</p>
    {shown.length === 0 ? <p>No hay unidades disponibles con estos filtros. Prueba otra selección o vuelve cuando tu docente publique el material.</p> :
      shown.map((entry) => {
        const reference = data.source.topics.find((item) => item.slug === entry.slug);
        return <section key={entry.id} className={panel} aria-labelledby={`topic-${entry.id}`}>
          <p className={shared.eyebrow}>{subjects.find((item) => item.id === entry.subjectId)?.name} · {categories.find((item) => item.id === entry.categoryId)?.name}</p>
          <h2 id={`topic-${entry.id}`}>{entry.name}</h2>
          {reference?.prerequisites.length ? <p>Antes se recomienda: {reference.prerequisites.map((slug) => titles.get(slug) ?? slug).join(", ")}. Puedes estudiar este tema de todos modos.</p> : null}
          <ul className={styles.units}>{units.filter((unit) => unit.topicId === entry.id).map((unit) => <li key={unit.id} className={cardClass(false, styles.unit)}>
            <h3>{unit.title}</h3><p>{unit.kind === "reading" ? "Lectura" : "Unidad"}{unit.readingProvenance ? ` · ${levelNames.get(unit.readingProvenance.level) ?? unit.readingProvenance.level}` : ""}</p>
            <Link className={buttonClass()} to={`/unidades/${encodeURIComponent(unit.id)}`} state={{ catalogSearch: location.search }}>Abrir unidad</Link>
          </li>)}</ul>
        </section>;
      })}
  </section>;
}
