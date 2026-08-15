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
          path: "tutor",
          lazy: () => import("../routes/TutorRoute"),
        },
        {
          path: "autoria",
          lazy: () => import("../routes/AuthoringRoute"),
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
