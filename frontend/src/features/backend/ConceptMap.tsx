import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend, result, required, type Schema } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";

const relations = { requires: "requiere", explains: "explica", applies: "aplica", differsFrom: "se diferencia de" };
const stages = { mention: "Mención", exploration: "Exploración", understanding: "Comprensión declarada" };
export function ConceptMap({ topicId, conversationId, messages }: { topicId: string; conversationId: string; messages: Schema["TutorMessage"][] }) {
  const queries = useQueryClient();
  const [graphId, setGraphId] = useState("");
  const [messageId, setMessageId] = useState("");
  const [offset, setOffset] = useState(0);
  const graphs = useQuery({ queryKey: ["graphs", topicId, offset], queryFn: async ({ signal }) => result(await backend.GET("/api/graphs/revisions", { signal, params: { query: { topicId, offset, limit: 20 } } })) });
  const graph = useQuery({ queryKey: ["map", conversationId, graphId], enabled: Boolean(graphId), queryFn: async ({ signal }) => result(await backend.GET("/api/graphs/conversations/{id}", { signal, params: { path: { id: conversationId }, query: { graphRevisionId: graphId } } })) });
  const extract = useMutation({ mutationFn: async () => result(await backend.POST("/api/graphs/conversations/{id}/extract", { params: { path: { id: conversationId } }, body: { graphRevisionId: graphId, messageId } })),
    onSuccess: () => { void queries.invalidateQueries({ queryKey: ["map", conversationId, graphId] }); } });
  return <section><h3>Mapa de conceptos</h3><p>Las menciones y la comprensión declarada conservan su origen. No acreditan dominio.</p>
    {graphs.isPending ? <Busy /> : graphs.isError ? <Failure error={graphs.error} retry={() => void graphs.refetch()} /> : <>
      {graphs.data.items.length ? <Field title="Referencia curricular"><select value={graphId} onChange={(event) => setGraphId(event.target.value)}>
        <option value="">Selecciona una referencia</option>{graphs.data.items.map((item) => <option key={item.id} value={item.id}>{item.title} · revisión {item.number}</option>)}</select></Field> : <p>Tu docente todavía no ha publicado un mapa para este tema.</p>}
      <Pages offset={offset} total={graphs.data.total} change={setOffset} />
    </>}
    {graphId ? <><Field title="Mensaje para buscar menciones"><select value={messageId} onChange={(event) => setMessageId(event.target.value)}>
      <option value="">Selecciona un mensaje tuyo de esta página</option>{messages.filter((item) => item.role === "user").map((item) => <option key={item.id} value={item.id}>{item.text.slice(0, 90)}</option>)}</select></Field>
      <button type="button" disabled={!messageId || extract.isPending} onClick={() => extract.mutate()}>Buscar menciones</button>
      {extract.isError ? <Failure error={extract.error} /> : null}
      {graph.isPending ? <Busy /> : graph.isError ? <Failure error={graph.error} retry={() => void graph.refetch()} /> : <GraphView map={graph.data} />}
    </> : null}
  </section>;
}

function GraphView({ map }: { map: Schema["ConversationGraph"] }) {
  const names = new Map(map.nodes.map((node) => [node.id, node.name]));
  const positions = new Map(map.nodes.map((node, index) => [node.id, { x: 110 + index % 3 * 240, y: 65 + Math.floor(index / 3) * 100 }]));
  return <><svg viewBox={`0 0 720 ${String(Math.max(140, Math.ceil(map.nodes.length / 3) * 100 + 30))}`} role="img" aria-label="Mapa curricular. La lista siguiente describe conceptos y relaciones.">
    {map.edges.map((edge, index) => { const from = positions.get(edge.fromNodeId), to = positions.get(edge.toNodeId); return from && to ? <line key={index} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--content-muted)" /> : null; })}
    {map.nodes.map((node) => { const point = required(positions.get(node.id)); return <g key={node.id}><title>{node.name}</title><circle cx={point.x} cy={point.y} r="24" fill="var(--surface-raised)" stroke="var(--action-primary)" /><text x={point.x} y={point.y + 45} textAnchor="middle" fill="var(--content-default)" fontSize="12">{node.name.slice(0, 28)}</text></g>; })}
  </svg>
    <h4>Conceptos y relaciones</h4><ul>{map.nodes.map((node) => <li key={node.id}>{node.name}{map.comparison.acceptedNodeIds.includes(node.id) ? " · mención aceptada" : " · sin mención aceptada"}</li>)}</ul>
    <ul>{map.edges.map((edge, index) => <li key={index}>{names.get(edge.fromNodeId)} {relations[edge.relation]} {names.get(edge.toNodeId)}</li>)}</ul>
    <p>Conceptos sin mención: {map.comparison.unmentionedNodeIds.length}. Prerrequisitos pendientes de explorar: {map.comparison.prerequisiteGaps.length}.</p>
    <h4>Observaciones y correcciones</h4>{map.observations.length === 0 ? <p>Todavía no hay observaciones en esta conversación.</p> : map.observations.map((item) => <Observation key={`${item.id}-${String(item.current.version)}`} observation={item} names={names} />)}
  </>;
}

function Observation({ observation, names }: { observation: Schema["GraphObservation"]; names: Map<string, string> }) {
  const queries = useQueryClient();
  const [reason, setReason] = useState("");
  const [stage, setStage] = useState(observation.current.stage);
  const correct = useMutation({ mutationFn: async (status: "accepted" | "rejected") => result(await backend.POST("/api/graphs/observations/{id}/corrections", {
    params: { path: { id: observation.id } }, body: { ...observation.current, stage, status, reason },
  })), onSuccess: () => { void queries.invalidateQueries({ queryKey: ["map", observation.conversationId, observation.graphRevisionId] }); } });
  return <article className="backend-panel"><p>{names.get(observation.current.fromNodeId)} · {stages[observation.current.stage]} · {observation.current.status === "accepted" ? "Aceptada" : observation.current.status === "rejected" ? "Rechazada" : "Pendiente"}</p>
    <a href={observation.sourceUrl} target="_blank" rel="noopener noreferrer">Ver mensaje de origen</a>
    <Field title="Tipo de observación"><select value={stage} onChange={(event) => setStage(event.target.value as typeof stage)}>{Object.entries(stages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field title="Motivo de tu corrección"><input required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
    <div className="backend-actions"><button type="button" disabled={!reason.trim() || correct.isPending} onClick={() => correct.mutate("accepted")}>Aceptar observación</button>
      <button type="button" disabled={!reason.trim() || correct.isPending} onClick={() => correct.mutate("rejected")}>Rechazar observación</button></div>
    {correct.isError ? <Failure error={correct.error} /> : null}
    <details><summary>Historial de cambios</summary><ol>{observation.history.map((item) => <li key={item.version}>{new Date(item.createdAt).toLocaleString()} · {item.reason || "Observación original"}</li>)}</ol></details>
  </article>;
}
