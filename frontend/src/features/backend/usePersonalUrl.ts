import { useSearchParams } from "react-router-dom";

/** Filtros, páginas y selección se guardan en la URL, también al usar Atrás. */
export function usePersonalUrl() {
  const [search, setSearch] = useSearchParams();
  const set = (key: string, value: string | number | null, replace = false) => setSearch((previous) => {
    const next = new URLSearchParams(previous);
    if (value === null || value === "" || value === 0) next.delete(key); else next.set(key, String(value));
    return next;
  }, { replace });
  const page = (key: string) => {
    const value = Number(search.get(key));
    return Number.isSafeInteger(value) && value >= 0 ? Math.floor(value / 20) * 20 : 0;
  };
  return { search, set, page, setSearch };
}
