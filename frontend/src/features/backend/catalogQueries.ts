import { useQuery } from "@tanstack/react-query";
import { backend, result, type Schema } from "./client";

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

/** Catálogo completo que ve el alumno. Catálogo, tema y unidad comparten la misma caché. */
export function useCatalog() {
  return useQuery({ queryKey: ["curriculum-explorer"], queryFn: async ({ signal }) => {
    const [subjects, categories, topics, units, source] = await Promise.all([
      catalogEntries("subjects", signal), catalogEntries("categories", signal), catalogEntries("topics", signal), publishedUnits(signal),
      backend.GET("/api/catalog/source-curriculum", { signal }).then(result),
    ]);
    return { subjects, categories, topics, units, source };
  } });
}

export type CatalogData = NonNullable<ReturnType<typeof useCatalog>["data"]>;
type Entry = Schema["EntryResponse"];
type Unit = Schema["UnitSummary"];

export interface CatalogTopic {
  entry: Entry;
  subject: Entry;
  category: Entry;
  units: Unit[];
  /** Niveles con material publicado, en el orden del currículo de origen. */
  levels: string[];
  /** Prerrequisitos del currículo de origen; `entry` existe cuando el tema está disponible en el catálogo. */
  prerequisites: { slug: string; name: string; entry?: Entry }[];
}
export interface CatalogGroup { subject: Entry; categories: { category: Entry; topics: CatalogTopic[] }[] }
export interface CatalogFilters { subject?: string; category?: string; level?: string; text?: string }

const bySortOrder = (left: Entry, right: Entry) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "es");
const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");

/** Sólo los temas con material publicado cuya materia y categoría siguen disponibles. */
export function catalogTopics(data: CatalogData): CatalogTopic[] {
  const subjects = new Map(data.subjects.filter((entry) => entry.isAvailable).map((entry) => [entry.id, entry]));
  const categories = new Map(data.categories.filter((entry) => entry.isAvailable && entry.subjectId != null && subjects.has(entry.subjectId)).map((entry) => [entry.id, entry]));
  const available = data.topics.filter((entry) => entry.isAvailable && entry.categoryId != null && categories.has(entry.categoryId));
  const bySlug = new Map(available.map((entry) => [entry.slug, entry]));
  const levelOrder = data.source.levels.map((level) => level.slug);
  return available.sort(bySortOrder).flatMap((entry) => {
    const units = data.units.filter((unit) => unit.topicId === entry.id).sort((left, right) => left.number - right.number);
    const category = categories.get(entry.categoryId ?? "");
    const subject = subjects.get(category?.subjectId ?? "");
    if (!units.length || !category || !subject) return [];
    const present = new Set(units.flatMap((unit) => unit.readingProvenance ? [unit.readingProvenance.level] : []));
    const reference = data.source.topics.find((item) => item.slug === entry.slug);
    return [{
      entry, subject, category, units,
      levels: [...levelOrder.filter((level) => present.has(level)), ...[...present].filter((level) => !levelOrder.includes(level))],
      prerequisites: (reference?.prerequisites ?? []).map((slug) => ({
        slug, entry: bySlug.get(slug), name: bySlug.get(slug)?.name ?? data.source.topics.find((item) => item.slug === slug)?.name ?? slug,
      })),
    }];
  });
}

/**
 * Aplica los filtros de la URL. El nivel recorta las unidades de cada tema; la
 * búsqueda acepta el tema completo si coincide su nombre, materia o categoría y,
 * si no, conserva sólo las unidades cuyo título coincide.
 */
export function filterCatalog(topics: CatalogTopic[], { subject, category, level, text }: CatalogFilters) {
  const terms = fold(text ?? "").split(/\s+/).filter(Boolean);
  const matches = (...values: string[]) => { const haystack = fold(values.join(" ")); return terms.every((term) => haystack.includes(term)); };
  return topics.flatMap((topic) => {
    if ((subject && topic.subject.id !== subject) || (category && topic.category.id !== category)) return [];
    let units = level ? topic.units.filter((unit) => unit.readingProvenance?.level === level) : topic.units;
    if (terms.length && !matches(topic.entry.name, topic.subject.name, topic.category.name))
      units = units.filter((unit) => matches(unit.title, topic.entry.name));
    return units.length ? [{ ...topic, units }] : [];
  });
}

/** Agrupa por materia y categoría conservando el orden editorial. */
export function groupCatalog(topics: CatalogTopic[]): CatalogGroup[] {
  const groups: CatalogGroup[] = [];
  for (const topic of [...topics].sort((left, right) => bySortOrder(left.subject, right.subject) || bySortOrder(left.category, right.category))) {
    let group = groups.find((item) => item.subject.id === topic.subject.id);
    if (!group) groups.push(group = { subject: topic.subject, categories: [] });
    let section = group.categories.find((item) => item.category.id === topic.category.id);
    if (!section) group.categories.push(section = { category: topic.category, topics: [] });
    section.topics.push(topic);
  }
  return groups;
}

/** «3 lecturas · 1 unidad»: cuenta el material publicado según su tipo. */
export function materialCount(units: Unit[]) {
  const readings = units.filter((unit) => unit.kind === "reading").length;
  const complete = units.length - readings;
  return [readings ? `${String(readings)} ${readings === 1 ? "lectura" : "lecturas"}` : null,
    complete ? `${String(complete)} ${complete === 1 ? "unidad" : "unidades"}` : null].filter(Boolean).join(" · ");
}
