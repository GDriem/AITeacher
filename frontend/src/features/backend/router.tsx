import { createBrowserRouter } from "react-router-dom";
import { BackendRoot } from "./BackendRoot";
import { CurriculumExplorer } from "./CurriculumExplorer";
import { UnitSpace } from "./UnitSpace";
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
      { index: true, lazy: async () => ({ Component: (await import("./HomeRoute")).HomeRoute }) },
      { path: "catalogo", Component: CurriculumExplorer },
      { path: "temas/:topicId", Component: TopicPage },
      { path: "unidades/:unitId", Component: UnitSpace },
      // El tutor (chat, mapa y voz) también se descarga aparte: la unidad, el catálogo y el inicio no lo necesitan.
      { path: "unidades/:unitId/tutor", lazy: async () => ({ Component: (await import("./UnitTutor")).UnitTutor }) },
      { path: "unidades/:unitId/tutor/:conversationId", lazy: async () => ({ Component: (await import("./UnitTutor")).UnitTutor }) },
      // El intento (pasos, tiempo y resultado) se descarga al abrirlo desde Evaluar o Repasos.
      { path: "evaluaciones/:attemptId", lazy: async () => ({ Component: (await import("./AttemptRoute")).AttemptRoute }) },
      { path: "apuntes", lazy: async () => ({ Component: (await import("./Notes")).Notes }) },
      { path: "repasos", lazy: async () => ({ Component: (await import("./LearningReviews")).LearningReviews }) },
      { path: "historial", lazy: async () => ({ Component: (await import("./Archive")).Archive }) },
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
