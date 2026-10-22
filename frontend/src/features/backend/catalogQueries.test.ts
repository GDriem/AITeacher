import { describe, expect, it } from "vitest";
import type { Schema } from "./client";
import { catalogTopics, filterCatalog, groupCatalog, materialCount, type CatalogData } from "./catalogQueries";

const entry = (id: string, name: string, extra: Partial<Schema["EntryResponse"]> = {}): Schema["EntryResponse"] =>
  ({ id, name, slug: id, sortOrder: 0, isAvailable: true, version: 1, ...extra });
const unit = (id: string, topicId: string, title: string, level?: string): Schema["UnitSummary"] => ({
  id, topicId, title, number: Number(id.slice(1)), version: 1, publishedRevisionId: "r", revisionId: "r",
  kind: level ? "reading" : "learningUnit", readingProvenance: level ? { sourceId: id, topic: topicId, level, keywords: [] } : null,
});

const data: CatalogData = {
  subjects: [entry("redes", "Redes", { sortOrder: 2 }), entry("mate", "Matemáticas", { sortOrder: 1 }), entry("oculta", "Oculta", { isAvailable: false })],
  categories: [entry("enr", "Enrutamiento", { subjectId: "redes" }), entry("alg", "Álgebra", { subjectId: "mate" }), entry("huerfana", "Huérfana", { subjectId: "oculta" })],
  topics: [
    entry("estatico", "Enrutamiento estático", { subjectId: "redes", categoryId: "enr", sortOrder: 1 }),
    entry("ospf", "Enrutamiento dinámico con OSPF", { subjectId: "redes", categoryId: "enr", sortOrder: 2 }),
    entry("vectores", "Vectores", { subjectId: "mate", categoryId: "alg" }),
    entry("vacio", "Sin material", { subjectId: "mate", categoryId: "alg" }),
    entry("escondido", "Escondido", { subjectId: "oculta", categoryId: "huerfana" }),
  ],
  units: [
    unit("u1", "ospf", "Áreas OSPF", "advanced"), unit("u2", "ospf", "Vecinos y adyacencias", "beginner"),
    unit("u3", "estatico", "Rutas estáticas", "beginner"), unit("u4", "vectores", "Unidad de vectores"), unit("u5", "escondido", "No debe verse", "beginner"),
  ],
  source: {
    source: "beta",
    topics: [{ slug: "ospf", name: "OSPF", subject: "redes", category: "enr", prerequisites: ["estatico", "vacio", "subredes"] }],
    levels: [{ slug: "beginner", name: "Principiante" }, { slug: "advanced", name: "Avanzado" }],
  },
};

describe("catálogo del alumno", () => {
  const topics = catalogTopics(data);

  it("muestra sólo temas disponibles con material publicado, con niveles en orden curricular", () => {
    expect(topics.map((topic) => topic.entry.id)).toEqual(["vectores", "estatico", "ospf"]);
    expect(topics.find((topic) => topic.entry.id === "ospf")?.levels).toEqual(["beginner", "advanced"]);
  });

  it("enlaza prerrequisitos con material y nombra sin enlace los que no están en el catálogo", () => {
    const prerequisites = topics.find((topic) => topic.entry.id === "ospf")?.prerequisites ?? [];
    expect(prerequisites.map((item) => [item.name, item.entry?.id])).toEqual([["Enrutamiento estático", "estatico"], ["Sin material", undefined], ["subredes", undefined]]);
  });

  it("agrupa por materia y categoría respetando el orden editorial", () => {
    expect(groupCatalog(topics).map((group) => [group.subject.name, group.categories.map((section) => section.topics.length)]))
      .toEqual([["Matemáticas", [1]], ["Redes", [2]]]);
  });

  it("filtra por nivel recortando unidades y descarta los temas sin material", () => {
    const shown = filterCatalog(topics, { level: "advanced" });
    expect(shown.map((topic) => [topic.entry.id, topic.units.map((item) => item.id)])).toEqual([["ospf", ["u1"]]]);
  });

  it("busca sin distinguir mayúsculas ni tildes en tema, categoría y título de lectura", () => {
    expect(filterCatalog(topics, { text: "algebra" }).map((topic) => topic.entry.id)).toEqual(["vectores"]);
    const byTitle = filterCatalog(topics, { text: "areas" });
    expect(byTitle.map((topic) => [topic.entry.id, topic.units.map((item) => item.id)])).toEqual([["ospf", ["u1"]]]);
    expect(filterCatalog(topics, { text: "enrutamiento", subject: "mate" })).toEqual([]);
  });

  it("cuenta el material por tipo", () => {
    expect(materialCount(data.units.slice(0, 2))).toBe("2 lecturas");
    expect(materialCount(data.units.slice(2, 4))).toBe("1 lectura · 1 unidad");
  });
});
