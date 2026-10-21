import { lazy, Suspense } from "react";

const Application = import.meta.env.VITE_BACKEND === "dotnet"
  ? lazy(() => import("./features/backend/BackendApp"))
  : lazy(() => import("./LegacyApp"));

export function FrontendApplication() {
  return <Suspense fallback={<p role="status">Preparando tu espacio de aprendizaje…</p>}><Application /></Suspense>;
}
