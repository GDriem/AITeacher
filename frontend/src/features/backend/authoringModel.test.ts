import { required } from "./client";
import { beforeEach, describe, expect, it } from "vitest";
import { applicableSteps, emptyDocument, orphanObjectives, readUnitDraft, revisionDiff, validateStep, writeUnitDraft } from "./authoringModel";

beforeEach(() => sessionStorage.clear());
describe("validación del editor por pasos", () => {
  it("asocia tema y título al paso Datos", () => {
    expect(validateStep(emptyDocument(), "datos", "")).toEqual({ topic: "Selecciona un tema.", title: "Completa este campo (máximo 150 caracteres)." });
    expect(validateStep({ ...emptyDocument(), title: "Vectores" }, "datos", "tema")).toEqual({});
  });
  it("valida texto y referencias sin aceptar un concepto eliminado", () => {
    const doc = { ...emptyDocument(), concepts: [{ id: "c", name: "" }], objectives: [{ id: "o", description: "Explicar", conceptIds: ["otro"] }] };
    expect(Object.keys(validateStep(doc, "objetivos", "t"))).toEqual(["c.name", "o.references"]);
  });
  it("exige lectura con título, texto y fuente y omite los vínculos para Solo lectura", () => {
    const doc = { ...emptyDocument(), readings: [{ id: "r", title: "Título", text: "", source: "", objectiveIds: [] }] };
    expect(Object.keys(validateStep(doc, "lecturas", "t"))).toEqual(["r.text", "r.source", "r.references"]);
    expect(applicableSteps({ ...doc, kind: "reading" })).toEqual(["datos", "lecturas", "revision"]);
    expect(validateStep({ ...doc, kind: "reading", readings: [{ ...required(doc.readings[0]), text: "Texto", source: "Fuente" }] }, "lecturas", "t")).toEqual({});
  });
  it("detecta cobertura huérfana por objetivo y sección", () => {
    const doc = { ...emptyDocument(), objectives: [{ id: "o", description: "Comparar", conceptIds: ["c"] }], exercises: [{ id: "e", prompt: "Compara", objectiveIds: ["o"] }] };
    expect(orphanObjectives(doc)).toEqual(["Comparar: falta lectura, evaluación."]);
    expect(validateStep(doc, "ejercicios", "t")).toEqual({});
    expect(validateStep({ ...doc, assessments: [{ id: "a", prompt: "", privateCriteria: "", objectiveIds: [] }] }, "evaluaciones", "t")).toHaveProperty("a.privateCriteria");
  });
});
describe("diff de revisiones", () => {
  it("primera publicación incluye título y elementos añadidos", () => {
    const doc = { ...emptyDocument(), title: "Vectores", concepts: [{ id: "c", name: "Comparación" }] };
    expect(revisionDiff(null, doc)).toContainEqual({ section: "Conceptos", kind: "Añadido", before: undefined, after: doc.concepts[0] });
  });
  it("clasifica añadidos, quitados y modificados por identidad", () => {
    const before = { ...emptyDocument(), title: "Antes", concepts: [{ id: "c", name: "Viejo" }, { id: "quitado", name: "Otro" }] };
    const after = { ...before, title: "Después", concepts: [{ id: "c", name: "Nuevo" }, { id: "nuevo", name: "Añadido" }] };
    expect(revisionDiff(before, after).map(({ section, kind }) => [section, kind])).toEqual([["Título", "Modificado"], ["Conceptos", "Quitado"], ["Conceptos", "Modificado"], ["Conceptos", "Añadido"]]);
    expect(before.concepts[0]?.name).toBe("Viejo");
  });
  it("no presenta un reordenamiento como cambio de contenido", () => {
    const doc = { ...emptyDocument(), concepts: [{ id: "a", name: "A" }, { id: "b", name: "B" }] };
    expect(revisionDiff(doc, { ...doc, concepts: [...doc.concepts].reverse() })).toEqual([]);
  });
  it("detecta cambios de referencias, criterios privados y prerrequisitos", () => {
    const doc = { ...emptyDocument(), assessments: [{ id: "a", prompt: "Compara", privateCriteria: "Antes", objectiveIds: ["o"] }], prerequisites: [{ conceptId: "a", requiresConceptId: "b" }] };
    expect(revisionDiff(doc, { ...doc, assessments: [{ ...required(doc.assessments[0]), privateCriteria: "Después", objectiveIds: ["otro"] }], prerequisites: [] }).map((c) => [c.section, c.kind])).toEqual([["Evaluaciones editoriales", "Modificado"], ["Prerrequisitos", "Quitado"]]);
  });
});
describe("persistencia por pestaña, autor y unidad", () => {
  it("restaura documento, tema y versión y permite borrarlo", () => {
    const draft = { document: { ...emptyDocument(), title: "Sin guardar" }, topicId: "t", version: 3 };
    writeUnitDraft("a", "u", draft);
    expect(readUnitDraft("a", "u")).toEqual(draft);
    expect(readUnitDraft("b", "u")).toBeNull();
    expect(readUnitDraft("a", "otra")).toBeNull();
    writeUnitDraft("a", "u", null); expect(readUnitDraft("a", "u")).toBeNull();
  });
  it("tolera almacenamiento corrupto o sin estructura", () => {
    sessionStorage.setItem("aiteacher.autoria.a.u", "{"); expect(readUnitDraft("a", "u")).toBeNull();
    sessionStorage.setItem("aiteacher.autoria.a.u", '{"topicId":"t","document":{}}'); expect(readUnitDraft("a", "u")).toBeNull();
  });
});

it("rechaza prerrequisitos sin concepto y ciclos antes de avanzar", () => {
  const doc = { ...emptyDocument(), concepts: [{ id: "a", name: "A" }, { id: "b", name: "B" }], prerequisites: [{ conceptId: "a", requiresConceptId: "b" }, { conceptId: "b", requiresConceptId: "a" }] };
  expect(validateStep(doc, "objetivos", "t")).toHaveProperty("prerequisite.0");
  expect(validateStep({ ...doc, prerequisites: [{ conceptId: "a", requiresConceptId: "b" }] }, "objetivos", "t")).toEqual({});
});
it("no añade procedencia vacía al diff", () => {
  expect(revisionDiff(emptyDocument(), { ...emptyDocument(), readingProvenance: null })).toEqual([]);
});
