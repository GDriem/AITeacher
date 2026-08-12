import { queryOptions } from "@tanstack/react-query";

import { getAuthStatus, getCapabilities } from "./authApi";

export const capabilitiesKey = ["app-capabilities"] as const;
export const authStatusKey = ["auth-status"] as const;

export const capabilitiesOptions = queryOptions({
  queryKey: capabilitiesKey,
  queryFn: ({ signal }) => getCapabilities(signal),
  staleTime: Number.POSITIVE_INFINITY,
});

export const authStatusOptions = queryOptions({
  queryKey: authStatusKey,
  queryFn: ({ signal }) => getAuthStatus(signal),
  staleTime: 5 * 60_000,
});
