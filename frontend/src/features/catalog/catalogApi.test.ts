import { describe, expect, it } from "vitest";

import { getTopicCatalog } from "./catalogApi";

describe("catalogApi", () => {
  it("consume el contrato de temas a través del cliente generado", async () => {
    const catalog = await getTopicCatalog("student-test");
    expect(catalog.total_topics).toBe(4);
  });
});
