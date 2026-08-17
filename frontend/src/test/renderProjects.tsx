import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "../app/AppShell";
import { AuthProvider } from "../features/auth/AuthProvider";
import { useAppSession } from "../features/auth/appSession";
import { ProjectsScreen } from "../features/projects/ProjectsScreen";

function ProjectsUnderTest() {
  const { studentId } = useAppSession();
  return <ProjectsScreen studentId={studentId} />;
}

export function renderProjects() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [{ path: "/", Component: AppShell, children: [{ path: "proyectos", element: <ProjectsUnderTest /> }] }],
    { initialEntries: ["/proyectos"] },
  );

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { ...result, queryClient, router };
}
