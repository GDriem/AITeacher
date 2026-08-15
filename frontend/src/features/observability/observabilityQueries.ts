import { queryOptions } from "@tanstack/react-query";

import { getObservabilitySnapshot } from "./observabilityApi";

export const observabilityKey = ["observability"] as const;

export const observabilityOptions = queryOptions({
  queryKey: observabilityKey,
  queryFn: ({ signal }) => getObservabilitySnapshot(signal),
  refetchInterval: 30_000,
});
