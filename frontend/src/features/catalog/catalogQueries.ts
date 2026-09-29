import { queryOptions } from "@tanstack/react-query";

import { getTopicCatalog } from "./catalogApi";

export const topicCatalogKey = (studentId: string) => ["topics", studentId] as const;

export function topicCatalogOptions(studentId: string) {
  return queryOptions({
    queryKey: topicCatalogKey(studentId),
    queryFn: ({ signal }) => getTopicCatalog(studentId, signal),
  });
}
