import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "../app/AppShell";
import { AuthProvider } from "../features/auth/AuthProvider";
import { useAppSession } from "../features/auth/appSession";
import { rememberActiveSession } from "../features/sessions/activeSession";
import { TutorScreen } from "../features/tutor/TutorScreen";

function TutorUnderTest() {
  const { studentId } = useAppSession();
  return <TutorScreen studentId={studentId} />;
}

export function renderTutor({ activeSessionId }: { activeSessionId?: string } = {}) {
  window.localStorage.setItem("studentAutoId", "student-test");
  if (activeSessionId) rememberActiveSession("student-test", activeSessionId);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/", Component: AppShell, children: [{ path: "tutor", element: <TutorUnderTest /> }] }],
    { basename: "/app", initialEntries: ["/app/tutor"] },
  );
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider><RouterProvider router={router} /></AuthProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient, router };
}
