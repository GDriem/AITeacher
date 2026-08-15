import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "../app/AppShell";
import { AuthProvider } from "../features/auth/AuthProvider";
import { AuthoringScreen } from "../features/authoring/AuthoringScreen";
import { useAppSession } from "../features/auth/appSession";
import { server } from "./server";

function AuthoringUnderTest() {
  const { studentId } = useAppSession();
  return <AuthoringScreen studentId={studentId} />;
}

export function renderAuthoring() {
  server.use(http.get("http://localhost:4173/api/capabilities", () =>
    HttpResponse.json({ text: true, voice: false, voice_model: null, authoring: true }),
  ));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/", Component: AppShell, children: [{ path: "autoria", element: <AuthoringUnderTest /> }] }],
    { basename: "/app", initialEntries: ["/app/autoria"] },
  );
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider><RouterProvider router={router} /></AuthProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient, router };
}
