import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { catalogFixture } from "./fixtures/catalog";
import { projectsFixture } from "./fixtures/projects";

export const catalogHandler = http.get("http://localhost:4173/api/topics", () =>
  HttpResponse.json(catalogFixture),
);

export const projectsHandler = http.get("http://localhost:4173/api/projects", () =>
  HttpResponse.json(projectsFixture),
);

export const server = setupServer(catalogHandler, projectsHandler);
