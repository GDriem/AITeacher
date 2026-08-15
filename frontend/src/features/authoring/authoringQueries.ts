import { queryOptions } from "@tanstack/react-query";

import { listAuthoredLessons } from "./authoringApi";

export const authoredLessonsKey = ["authoring", "lessons"] as const;

export function authoredLessonsOptions(token: string) {
  return queryOptions({
    queryKey: authoredLessonsKey,
    queryFn: ({ signal }) => listAuthoredLessons(token, signal),
    staleTime: 30_000,
    gcTime: 0,
  });
}
