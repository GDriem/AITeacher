import { createBrowserRouter } from "react-router-dom";
import { BackendRoot } from "./BackendRoot";
import { HomeRoute } from "./HomeRoute";
import { CurriculumExplorer } from "./CurriculumExplorer";
import { UnitSpace } from "./UnitSpace";
import { AttemptRoute } from "./AttemptRoute";
import { Notes } from "./Notes";
import { LearningReviews } from "./LearningReviews";
import { Archive } from "./Archive";
import { TopicPage } from "./TopicPage";
import { NotFound, RouteError, RouteLoading } from "./RouteStates";

/** Rutas del build .NET (docs/ui-ux-beta-plan.md, «Arquitectura de información»). */
export const router = createBrowserRouter([{
  path: "/",
  Component: BackendRoot,
  HydrateFallback: RouteLoading,
  children: [{
    ErrorBoundary: RouteError,
    children: [
      { index: true, Component: HomeRoute },
      { path: "catalogo", Component: CurriculumExplorer },
      { path: "temas/:topicId", Component: TopicPage },
      { path: "unidades/:unitId", Component: UnitSpace },
      // El tutor (chat, mapa y voz) también se descarga aparte: la unidad, el catálogo y el inicio no lo necesitan.
      { path: "unidades/:unitId/tutor", lazy: async () => ({ Component: (await import("./UnitTutor")).UnitTutor }) },
      { path: "unidades/:unitId/tutor/:conversationId", lazy: async () => ({ Component: (await import("./UnitTutor")).UnitTutor }) },
      { path: "evaluaciones/:attemptId", Component: AttemptRoute },
      { path: "apuntes", Component: Notes },
      { path: "repasos", Component: LearningReviews },
      { path: "historial", Component: Archive },
      // Autoría se descarga aparte: la usan pocos perfiles y no debe pesar en el recorrido del alumno.
      { path: "autoria", lazy: async () => ({ Component: (await import("./AuthorSpace")).AuthorSpace }), children: [
        { index: true, lazy: async () => ({ Component: (await import("./AuthorSpace")).AuthorUnits }) },
        { path: "catalogo", lazy: async () => ({ Component: (await import("./CatalogEditor")).CatalogEditor }) },
        { path: "correcciones", lazy: async () => ({ Component: (await import("./ReviewQueue")).ReviewQueue }) },
      ] },
      { path: "*", Component: NotFound },
    ],
  }],
}]);
