import { useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { backend, result, required, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";
import { Button } from "../../ui";
import shared from "./Shared.module.css";

const resources = ["subjects", "categories", "scales", "levels", "topics"] as const;
const labels = { subjects: "Materias", categories: "Categorías", scales: "Escalas", levels: "Niveles", topics: "Temas" };
export function CatalogEditor() {
  const queries = useQueryClient();
  const [kind, setKind] = useState<typeof resources[number]>("subjects");
  const [offset, setOffset] = useState(0);
  const [name, setName] = useState(""); const [slug, setSlug] = useState("");
  const [subjectId, setSubjectId] = useState(""); const [categoryId, setCategoryId] = useState("");
  const [scaleId, setScaleId] = useState(""); const [levelId, setLevelId] = useState("");
  const [purpose, setPurpose] = useState<"difficulty" | "proficiency" | "mastery">("difficulty");
  const [editing, setEditing] = useState<Schema["EntryResponse"] | null>(null);
  const [available, setAvailable] = useState(true); const [sortOrder, setSortOrder] = useState(0);
  const pages = useQueries({ queries: resources.map((resource) => ({ queryKey: ["catalog", resource, resource === kind ? offset : 0], queryFn: async ({ signal }: { signal: AbortSignal }) => result(await backend.GET(`/api/catalog/${resource}`, { signal, params: { query: { offset: resource === kind ? offset : 0, limit: 100 } } })) })) });
  const current = required(pages[resources.indexOf(kind)]);
  const changeKind = (value: typeof kind) => { setKind(value); setOffset(0); setEditing(null); setName(""); setSlug(""); };
  const save = useMutation({ mutationFn: async () => {
    const entry = { name, slug, sortOrder, isAvailable: available };
    if (editing) return result(await backend.PUT(`/api/catalog/${kind}/{id}`, { params: { path: { id: editing.id } }, body: { version: editing.version, entry } }));
    if (kind === "subjects") return result(await backend.POST("/api/catalog/subjects", { body: entry }));
    if (kind === "categories") return result(await backend.POST("/api/catalog/categories", { body: { subjectId, entry } }));
    if (kind === "scales") return result(await backend.POST("/api/catalog/scales", { body: { purpose, entry } }));
    if (kind === "levels") return result(await backend.POST("/api/catalog/levels", { body: { scaleId, entry } }));
    return result(await backend.POST("/api/catalog/topics", { body: { subjectId, categoryId, levelId: levelId || null, entry } }));
  }, onSuccess: () => { setName(""); setSlug(""); setEditing(null); void queries.invalidateQueries({ queryKey: ["catalog"] }); void queries.invalidateQueries({ queryKey: ["author-topics"] }); } });
  const list = (resource: typeof kind) => pages[resources.indexOf(resource)]?.data?.items ?? [];
  return <section><h2>Catálogo editable</h2><Field title="Qué quieres administrar"><select value={kind} onChange={(event) => changeKind(event.target.value as typeof kind)}>{resources.map((resource) => <option key={resource} value={resource}>{labels[resource]}</option>)}</select></Field>
    {current.isPending ? <Busy /> : current.isError ? <Failure error={current.error} retry={() => void current.refetch()} /> : <><ul>{current.data.items.map((item) => <li key={item.id}>
      <Button onClick={() => { setEditing(item); setName(item.name); setSlug(item.slug); setAvailable(item.isAvailable); setSortOrder(item.sortOrder); }}>{item.name} · {item.isAvailable ? "disponible" : "no disponible"}</Button></li>)}</ul>
      <Pages offset={offset} total={current.data.total} size={100} change={setOffset} /></>}
    <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><h3>{editing ? "Editar entrada" : "Nueva entrada"}</h3>
      <Field title="Nombre"><input required maxLength={150} value={name} onChange={(event) => { setName(event.target.value); if (!editing) setSlug(event.target.value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} /></Field>
      <Field title="Identificador legible"><input required maxLength={120} value={slug} onChange={(event) => setSlug(event.target.value)} /></Field>
      <Field title="Orden"><input type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></Field>
      <label className={shared.choice}><input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} />Disponible</label>
      {!editing && (kind === "categories" || kind === "topics") ? <Field title="Materia"><select required value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setCategoryId(""); }}><option value="">Selecciona una materia</option>{list("subjects").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field> : null}
      {!editing && kind === "topics" ? <><Field title="Categoría"><select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Selecciona una categoría</option>{list("categories").filter((item) => item.subjectId === subjectId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field title="Nivel opcional"><select value={levelId} onChange={(event) => setLevelId(event.target.value)}><option value="">Sin nivel</option>{list("levels").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></> : null}
      {!editing && kind === "levels" ? <Field title="Escala"><select required value={scaleId} onChange={(event) => setScaleId(event.target.value)}><option value="">Selecciona una escala</option>{list("scales").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field> : null}
      {!editing && kind === "scales" ? <Field title="Propósito"><select value={purpose} onChange={(event) => setPurpose(event.target.value as typeof purpose)}><option value="difficulty">Dificultad del contenido</option><option value="proficiency">Competencia educativa</option><option value="mastery">Dominio del alumno</option></select></Field> : null}
      <div className={shared.actions}><Button type="submit" variant="primary" disabled={save.isPending}>Guardar entrada</Button>{editing ? <Button onClick={() => { setEditing(null); setName(""); setSlug(""); }}>Cancelar edición</Button> : null}</div>
      {save.isError ? <Failure error={save.error} retry={() => void current.refetch()} /> : null}
    </form>
    {pages.some((page) => page.isError) ? <p role="alert">No se pudieron cargar todas las referencias del catálogo. Reintenta antes de crear relaciones.</p> : null}
  </section>;
}
