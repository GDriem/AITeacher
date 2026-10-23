import { useQuery } from "@tanstack/react-query";
import { backend, result } from "./client";
export async function authorPages<T>(read: (offset: number) => Promise<{ items: T[]; total: number }>) {
  const items: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await read(offset); items.push(...page.items);
    if (!page.items.length || offset + page.items.length >= page.total) return items;
  }
}
export const authorPath = (id: string) => `/autoria/unidades/${encodeURIComponent(id)}`;
export function useAuthorUnit(id: string | undefined) {
  return useQuery({ queryKey: ["author-unit", id], enabled: Boolean(id), queryFn: async ({ signal }) => result(await backend.GET("/api/units/{unitId}", { signal, params: { path: { unitId: id ?? "" } } })) });
}
