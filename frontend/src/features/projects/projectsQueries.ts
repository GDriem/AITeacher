import { queryOptions } from "@tanstack/react-query";

import { getProjects } from "./projectsApi";

export const projectsKey = ["projects"] as const;

export function projectsOptions() {
  return queryOptions({
    queryKey: projectsKey,
    queryFn: ({ signal }) => getProjects(signal),
  });
}
