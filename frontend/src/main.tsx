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

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <FrontendApplication />
    </AppErrorBoundary>
  </StrictMode>,
);
