import { queryOptions } from "@tanstack/react-query";

import { getSession, getSessions } from "./sessionsApi";

export const sessionsKey = (studentId: string) => ["sessions", studentId] as const;
export const sessionListKey = (studentId: string) => [...sessionsKey(studentId), "list"] as const;
export const sessionDetailKey = (studentId: string, sessionId: string) => (
  [...sessionsKey(studentId), "detail", sessionId] as const
);

export function sessionListOptions(studentId: string) {
  return queryOptions({
    queryKey: sessionListKey(studentId),
    queryFn: ({ signal }) => getSessions(studentId, signal),
  });
}

export function sessionDetailOptions(studentId: string, sessionId: string) {
  return queryOptions({
    queryKey: sessionDetailKey(studentId, sessionId),
    queryFn: ({ signal }) => getSession(studentId, sessionId, signal),
  });
}
