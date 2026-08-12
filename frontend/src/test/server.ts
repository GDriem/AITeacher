import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { catalogFixture } from "./fixtures/catalog";
import { projectsFixture } from "./fixtures/projects";

export const capabilitiesFixture = {
  text: true,
  voice: false,
  voice_model: null,
  authoring: false,
};

export const authDisabledFixture = {
  enabled: false,
  authenticated: false,
  google_client_id: null,
  profile: null,
};

export const capabilitiesHandler = http.get("http://localhost:4173/api/capabilities", () =>
  HttpResponse.json(capabilitiesFixture),
);

export const authStatusHandler = http.get("http://localhost:4173/api/auth/status", () =>
  HttpResponse.json(authDisabledFixture),
);

export const catalogHandler = http.get("http://localhost:4173/api/topics", () =>
  HttpResponse.json(catalogFixture),
);

export const projectsHandler = http.get("http://localhost:4173/api/projects", () =>
  HttpResponse.json(projectsFixture),
);

export const sessionsHandler = http.get("http://localhost:4173/api/sessions", () =>
  HttpResponse.json({ sessions: [], retention_days: 365 }),
);

export const server = setupServer(
  capabilitiesHandler,
  authStatusHandler,
  catalogHandler,
  projectsHandler,
  sessionsHandler,
);
