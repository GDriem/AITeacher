import type { TopicCatalogItem } from "./catalogApi";
import { categoryLabel, levelLabel, subjectLabel } from "./catalogLabels";

export interface CatalogFilters {
  query: string;
  subject: string;
  category: string;
  level: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

export function filtersFromParams(params: URLSearchParams): CatalogFilters {
  return {
    query: params.get("q") ?? "",
    subject: params.get("subject") ?? "",
    category: params.get("category") ?? "",
    level: params.get("level") ?? "",
  };
}

export function paramsFromFilters(filters: CatalogFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.category) params.set("category", filters.category);
  if (filters.level) params.set("level", filters.level);
  return params;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function uniqueOptions(values: string[], label: (value: string) => string) {
  return [...new Set(values)]
    .map((value) => ({ value, label: label(value) }))
    .toSorted((left, right) => left.label.localeCompare(right.label, "es"));
}

export function catalogOptions(topics: TopicCatalogItem[], subject: string) {
  const subjectTopics = subject ? topics.filter((topic) => topic.subject === subject) : topics;
  return {
    subjects: uniqueOptions(topics.map((topic) => topic.subject), subjectLabel),
    categories: uniqueOptions(subjectTopics.map((topic) => topic.category), categoryLabel),
    levels: uniqueOptions(subjectTopics.flatMap((topic) => topic.available_levels), levelLabel),
  };
}

export function filterTopics(topics: TopicCatalogItem[], filters: CatalogFilters) {
  const query = normalize(filters.query);
  return topics.filter((topic) => {
    const searchable = normalize(
      [topic.title, topic.topic, subjectLabel(topic.subject), categoryLabel(topic.category)].join(" "),
    );
    return (
      (!query || searchable.includes(query)) &&
      (!filters.subject || topic.subject === filters.subject) &&
      (!filters.category || topic.category === filters.category) &&
      (!filters.level || topic.available_levels.some((level) => level === filters.level))
    );
  });
}
