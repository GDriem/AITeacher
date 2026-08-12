import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { catalogFixture } from "./fixtures/catalog";

export const catalogHandler = http.get("http://localhost:4173/api/topics", () =>
  HttpResponse.json(catalogFixture),
);

export const server = setupServer(catalogHandler);
