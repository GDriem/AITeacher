import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Toast, ToastRegion } from "../../ui";
import { ApiError } from "../../api/ApiError";
import { backend, result, type Schema } from "./client";
import { Busy, Failure } from "./Shared";
import { orphanObjectives, revisionDiff, type Document } from "./authoringModel";
import { panel } from "./panel";
import { RevisionValue } from "./RevisionValue";
import styles from "./Publication.module.css";
export function Publication({ unit, dirty }: { unit: Schema["UnitResponse"]; dirty: boolean }) {
  const queries = useQueryClient();
  const [confirm, setConfirm] = useState<"publish" | "withdraw" | null>(null);
  const [notice, setNotice] = useState("");
  const published = useQuery({ queryKey: ["published-diff", unit.id, unit.publishedRevisionId], enabled: confirm === "publish" && Boolean(unit.publishedRevisionId), queryFn: async ({ signal }) => result(await backend.GET("/api/units/{unitId}/revisions/{revisionId}", { signal, params: { path: { unitId: unit.id, revisionId: unit.publishedRevisionId ?? "" } } })) });
  const document = unit.revision.document as Document;
  const change = useMutation({ mutationFn: async (action: "publish" | "withdraw") => action === "publish"
    ? result(await backend.POST("/api/units/{unitId}/revisions/{revisionId}/publish", { params: { path: { unitId: unit.id, revisionId: unit.revision.id } }, body: { version: unit.version } }))
    : result(await backend.POST("/api/units/{unitId}/unpublish", { params: { path: { unitId: unit.id } }, body: { version: unit.version } })),
    onSuccess: (value, action) => {
      // Publicar una revisión histórica no debe sustituir el borrador más reciente del editor.
      queries.setQueryData(["author-unit", unit.id], { ...unit, version: value.version, publishedRevisionId: value.publishedRevisionId });
      setConfirm(null); setNotice(action === "publish" ? "Revisión publicada." : "Publicación retirada.");
      for (const key of ["units", "author-units", "unit", "definitions"]) void queries.invalidateQueries({ queryKey: [key] });
    } });
  const comparing = Boolean(unit.publishedRevisionId);
  const ready = !comparing || published.isSuccess;
  const diff = ready ? revisionDiff(comparing ? published.data?.revision.document as Document : null, document) : [];
  const orphans = document.kind === "learningUnit" && !document.objectives.length ? ["Añade al menos un objetivo antes de publicar."] : orphanObjectives(document);
  return <section className={panel}><h2>Publicación</h2><p>Se publica el último borrador guardado: revisión {unit.revision.number}. Guarda tus cambios antes de publicar.</p>
    <Button disabled={dirty || unit.publishedRevisionId === unit.revision.id || change.isPending} onClick={() => { change.reset(); setConfirm("publish"); }}>Publicar esta revisión</Button>
    {unit.publishedRevisionId ? <Button onClick={() => { change.reset(); setConfirm("withdraw"); }}>Retirar publicación</Button> : null}
    <ToastRegion>{notice ? <Toast tone="success" onDismiss={() => setNotice("")}>{notice}</Toast> : null}</ToastRegion>
    <Dialog open={confirm !== null} title={confirm === "publish" ? "Revisar cambios antes de publicar" : "¿Retirar la publicación?"} onClose={() => { if (!change.isPending) setConfirm(null); }} actions={<>
      <Button disabled={change.isPending} onClick={() => setConfirm(null)}>Cancelar</Button>
      <Button variant="primary" disabled={change.isPending || change.isError || (confirm === "publish" && (!ready || orphans.length > 0))} onClick={() => { if (confirm) change.mutate(confirm); }}>{confirm === "publish" ? "Confirmar publicación" : "Confirmar retiro"}</Button>
    </>}>
      {confirm === "withdraw" ? <p>La unidad dejará de estar disponible: los alumnos recibirán 404 al abrirla. Las revisiones y las entregas anteriores se conservan.</p> : <>
        <p>{comparing ? "Cambios frente a la revisión publicada." : "Primera publicación: todos los elementos son nuevos."}</p>
        {comparing && published.isPending ? <Busy /> : comparing && published.isError ? <Failure error={published.error} retry={() => void published.refetch()} /> : diff.length ? <ul className={styles.changes}>{diff.map((item, index) => <li key={index}><h3>{item.section} · {item.kind}</h3>
          {item.before !== undefined ? <details><summary>Antes</summary><RevisionValue value={item.before} document={published.data ? published.data.revision.document as Document : document} /></details> : null}
          {item.after !== undefined ? <details open><summary>Después</summary><RevisionValue value={item.after} document={document} /></details> : null}
        </li>)}</ul> : <p>Sin cambios frente a la publicación.</p>}
        {orphans.map((message) => <p key={message}>{message}</p>)}
      </>}
      {change.isError ? <><Failure error={change.error} />{change.error instanceof ApiError && change.error.status === 409 ? <p>La versión de la unidad cambió. Cierra este diálogo y recarga para revisar los cambios antes de intentarlo otra vez. <Button onClick={() => { setConfirm(null); void queries.invalidateQueries({ queryKey: ["author-unit", unit.id] }); }}>Recargar unidad</Button></p> : <Button onClick={() => change.reset()}>Reintentar</Button>}</> : null}
    </Dialog>
  </section>;
}
