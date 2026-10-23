import { describe, expect, it } from "vitest";
import { feedbackHref } from "./feedback";

describe("feedbackHref", () => {
  it("acepta enlaces web y de correo", () => {
    expect(feedbackHref(" https://forms.example.org/beta ")).toBe("https://forms.example.org/beta");
    expect(feedbackHref("mailto:beta@example.org")).toBe("mailto:beta@example.org");
  });

  it("oculta el enlace si falta o no es seguro", () => {
    expect(feedbackHref(undefined)).toBeNull();
    expect(feedbackHref("")).toBeNull();
    expect(feedbackHref("javascript:alert(1)")).toBeNull();
    expect(feedbackHref("forms.example.org")).toBeNull();
  });
});
