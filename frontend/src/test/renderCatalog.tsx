import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "../app/AppShell";
import { CatalogScreen } from "../features/catalog/CatalogScreen";

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
            element: <CatalogScreen legacyHandoff={legacyHandoff} />,
          },
        ],
      },
    ],
    { basename: "/app", initialEntries: [initialEntry] },
  );

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...result, queryClient, router };
}
