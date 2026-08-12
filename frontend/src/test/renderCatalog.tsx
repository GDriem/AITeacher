import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "../app/AppShell";
import { AuthProvider } from "../features/auth/AuthProvider";
import { useAppSession } from "../features/auth/appSession";
import { CatalogScreen } from "../features/catalog/CatalogScreen";

function CatalogUnderTest({ legacyHandoff }: { legacyHandoff?: (url: string) => void }) {
  const { studentId } = useAppSession();
  return <CatalogScreen studentId={studentId} legacyHandoff={legacyHandoff} />;
}

export function renderCatalog({
  initialEntry = "/app/",
  legacyHandoff,
}: {
  initialEntry?: string;
  legacyHandoff?: (url: string) => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/",
        Component: AppShell,
        children: [
          {
            index: true,
            element: <CatalogUnderTest legacyHandoff={legacyHandoff} />,
          },
        ],
      },
    ],
    { basename: "/app", initialEntries: [initialEntry] },
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
