import type { ChangeEvent } from "react";

import type { CatalogFilters as CatalogFilterValues, FilterOption } from "./catalogFilterState";
import styles from "./CatalogScreen.module.css";

interface Props {
  filters: CatalogFilterValues;
  subjects: FilterOption[];
  categories: FilterOption[];
  levels: FilterOption[];
  onChange: (filters: CatalogFilterValues) => void;
}

export function CatalogFilters({ filters, subjects, categories, levels, onChange }: Props) {
  const changeQuery = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, query: event.currentTarget.value });
  };

  const changeSubject = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      subject: event.currentTarget.value,
      category: "",
      level: "",
    });
  };

  const changeCategory = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filters, category: event.currentTarget.value });
  };

  const changeLevel = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filters, level: event.currentTarget.value });
  };

  return (
    <form className={styles.filters} aria-label="Filtros del catálogo" onSubmit={(event) => event.preventDefault()}>
      <label className={styles.search}>
        <span>Buscar tema</span>
        <span className={styles.searchControl}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.3" />
            <path d="m15.5 15.5 4 4" />
          </svg>
          <input
            type="search"
            autoComplete="off"
            placeholder="Ejemplo: embeddings, inglés o seguridad"
            value={filters.query}
            onChange={changeQuery}
            aria-controls="topic-grid"
            aria-describedby="topics-count"
          />
        </span>
      </label>
      <FilterSelect label="Materia" value={filters.subject} options={subjects} onChange={changeSubject} allLabel="Todas las materias" />
      <FilterSelect label="Categoría" value={filters.category} options={categories} onChange={changeCategory} allLabel="Todas las categorías" />
      <FilterSelect label="Nivel disponible" value={filters.level} options={levels} onChange={changeLevel} allLabel="Todos los niveles" />
    </form>
  );
}

interface SelectProps {
  label: string;
  value: string;
  options: FilterOption[];
  allLabel: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}

function FilterSelect({ label, value, options, allLabel, onChange }: SelectProps) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={onChange}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
