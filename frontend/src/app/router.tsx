import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "./AppShell";
import { NotFoundRoute } from "./NotFoundRoute";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { RouteLoading } from "./RouteLoading";

export const router = createBrowserRouter(
  [
    {
      path: "/",
      Component: AppShell,
      ErrorBoundary: RouteErrorBoundary,
      HydrateFallback: RouteLoading,
      children: [
        {
          index: true,
          lazy: () => import("../routes/CatalogRoute"),
        },
        {
          path: "proyectos",
          lazy: () => import("../routes/ProjectsRoute"),
        },
        {
          path: "*",
          Component: NotFoundRoute,
        },
      ],
    },
  ],
  { basename: "/app" },
);
