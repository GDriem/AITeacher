import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend, result, required, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";
import { CatalogEditor } from "./CatalogEditor";
import { UnitEditor } from "./UnitEditor";
import { AssessmentAuthor } from "./AssessmentAuthor";
import { ReviewQueue } from "./ReviewQueue";

export function AuthorSpace() {
  const [view, setView] = useState("units");
  return <section><h1>Autoría</h1><nav className="backend-tabs" aria-label="Herramientas de autoría">{([["units", "Unidades"], ["catalog", "Catálogo"], ["reviews", "Corregir entregas"]] as const).map(([value, title]) =>
    <button key={value} type="button" aria-current={view === value ? "page" : undefined} onClick={() => setView(value)}>{title}</button>)}</nav>
    {view === "units" ? <AuthorUnits /> : view === "catalog" ? <CatalogEditor /> : <ReviewQueue />}
  </section>;
}

function AuthorUnits() {
  const [offset, setOffset] = useState(0);
  const [topicOffset, setTopicOffset] = useState(0);
  const [id, setId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [topicId, setTopicId] = useState("");
  const units = useQuery({ queryKey: ["author-units", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/units", { signal, params: { query: { offset, limit: 20 } } })) });
  const topics = useQuery({ queryKey: ["author-topics", topicOffset], queryFn: async ({ signal }) => result(await backend.GET("/api/catalog/topics", { signal, params: { query: { offset: topicOffset, limit: 20 } } })) });
  const unit = useQuery({ queryKey: ["author-unit", id], enabled: Boolean(id), queryFn: async ({ signal }) => result(await backend.GET("/api/units/{unitId}", { signal, params: { path: { unitId: required(id) } } })) });
  return <><h2>Unidades editoriales</h2><button type="button" onClick={() => { setCreating(true); setId(null); }}>Crear unidad</button>
    {units.isPending ? <Busy /> : units.isError ? <Failure error={units.error} retry={() => void units.refetch()} /> : <>
      <ul>{units.data.items.map((item) => <li key={item.id}><button type="button" onClick={() => { setCreating(false); setId(item.id); }}>{item.title} · {item.publishedRevisionId ? "con publicación" : "borrador"}</button></li>)}</ul>
      <Pages offset={offset} total={units.data.total} change={setOffset} /></>}
    {creating ? <><Field title="Tema de la nueva unidad"><select required value={topicId} onChange={(event) => setTopicId(event.target.value)}><option value="">Selecciona un tema</option>{topics.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      {topics.isError ? <Failure error={topics.error} retry={() => void topics.refetch()} /> : null}
      {topics.data ? <Pages offset={topicOffset} total={topics.data.total} change={setTopicOffset} /> : null}
      {topicId ? <UnitEditor key={`new-${topicId}`} topicId={topicId} saved={(value) => { setId(value.id); setCreating(false); }} /> : null}</> : null}
    {id ? unit.isPending ? <Busy /> : unit.isError ? <Failure error={unit.error} retry={() => void unit.refetch()} /> : <>
      <UnitEditor key={unit.data.revision.id} topicId={unit.data.topicId} unit={unit.data} saved={() => void unit.refetch()} />
      <Publication unit={unit.data} />
      {unit.data.publishedRevisionId ? <AssessmentAuthor unitId={unit.data.id} revisionId={unit.data.publishedRevisionId} topicId={unit.data.topicId} /> : null}
    </> : null}
  </>;
}

function Publication({ unit }: { unit: Schema["UnitResponse"] }) {
  const queries = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const publish = useMutation({ mutationFn: async () => result(await backend.POST("/api/units/{unitId}/revisions/{revisionId}/publish", { params: { path: { unitId: unit.id, revisionId: unit.revision.id } }, body: { version: unit.version } })),
    onSuccess: () => { void queries.invalidateQueries({ queryKey: ["author-unit", unit.id] }); void queries.invalidateQueries({ queryKey: ["units"] }); void queries.invalidateQueries({ queryKey: ["author-units"] }); } });
  const withdraw = useMutation({ mutationFn: async () => {
    const response = await backend.POST("/api/units/{unitId}/unpublish", { params: { path: { unitId: unit.id } }, body: { version: unit.version } });
    if (!response.response.ok) result(response);
  }, onSuccess: () => { setConfirm(false); void queries.invalidateQueries({ queryKey: ["author-unit", unit.id] }); void queries.invalidateQueries({ queryKey: ["units"] }); void queries.invalidateQueries({ queryKey: ["author-units"] }); } });
  return <div className="backend-panel"><h3>Publicación</h3><p>Se comprueba la cobertura de lectura, práctica y evaluación de cada objetivo. Las revisiones publicadas se conservan.</p>
    <button type="button" disabled={publish.isPending || unit.publishedRevisionId === unit.revision.id} onClick={() => publish.mutate()}>Publicar esta revisión</button>
    {unit.publishedRevisionId ? <button type="button" onClick={() => setConfirm(true)}>Retirar publicación</button> : null}
    {confirm ? <div><p>Retirar impide nuevas lecturas y turnos sobre la publicación.</p><button type="button" disabled={withdraw.isPending} onClick={() => withdraw.mutate()}>Confirmar retiro</button><button type="button" onClick={() => setConfirm(false)}>Cancelar</button></div> : null}
    {publish.isError ? <Failure error={publish.error} retry={() => void queries.invalidateQueries({ queryKey: ["author-unit", unit.id] })} /> : null}
    {withdraw.isError ? <Failure error={withdraw.error} /> : null}
  </div>;
}
