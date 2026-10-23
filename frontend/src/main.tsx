import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { FrontendApplication } from "./FrontendApplication";
import "./styles/tokens.css";
import "./styles/global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("No se encontró el punto de montaje de AITeacher.");
}

// El build .NET sigue el tema del sistema; el build Python queda en oscuro (ver tokens.css).
if (import.meta.env.VITE_BACKEND === "dotnet") {
  document.documentElement.dataset.theme = "auto";
  const dark = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (dark) {
    dark.media = "(prefers-color-scheme: dark)";
    const light = dark.cloneNode() as HTMLMetaElement;
    light.media = "(prefers-color-scheme: light)";
    light.content = "#f3f6fa";
    dark.after(light);
  }
}

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <FrontendApplication />
    </AppErrorBoundary>
  </StrictMode>,
);
