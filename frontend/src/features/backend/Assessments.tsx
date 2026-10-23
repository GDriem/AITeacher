import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { backend, result, type Schema } from "./client";
import { Busy, Failure, Pages } from "./Shared";
import { attemptLabels } from "./labels";
import { Button } from "../../ui";

export function Assessments({ unit }: { unit: Schema["UnitResponse"] }) {
  const [offset, setOffset] = useState(0);
  const navigate = useNavigate();
  const openAttempt = (id: string) => void navigate(`/evaluaciones/${encodeURIComponent(id)}`);
  const requestIds = useRef(new Map<string, string>());
  const definitions = useQuery({ queryKey: ["definitions", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/assessments/definitions", { signal, params: { query: { offset, limit: 20 } } })) });
  const start = useMutation({ mutationFn: async (definitionRevisionId: string) => {
    const requestId = requestIds.current.get(definitionRevisionId) ?? crypto.randomUUID();
    requestIds.current.set(definitionRevisionId, requestId);
    return result(await backend.POST("/api/assessments/attempts", { body: { definitionRevisionId, requestId } }));
  }, onSuccess: (attempt) => { requestIds.current.delete(attempt.definitionRevisionId); openAttempt(attempt.id); } });
  return <section><h2>Prácticas y evaluaciones</h2>
    {definitions.isPending ? <Busy /> : definitions.isError ? <Failure error={definitions.error} retry={() => void definitions.refetch()} /> : <>
      <ul>{definitions.data.items.filter((item) => item.unitId === unit.id && item.unitRevisionId === unit.revision.id).map((item) => <li key={item.id}>
        <p>{item.title} · {item.mode === "practice" ? "Práctica" : "Evaluación"} · {item.timeLimitMinutes} minutos · hasta {item.maxAttempts} intentos</p>
        <Button disabled={start.isPending} onClick={() => start.mutate(item.id)}>Iniciar {item.title}</Button></li>)}</ul>
      <Pages offset={offset} total={definitions.data.total} change={setOffset} />
    </>}
    {start.isError ? <Failure error={start.error} /> : null}
    <OwnAttempts select={openAttempt} />
  </section>;
}

export function OwnAttempts({ select }: { select: (id: string) => void }) {
  const [offset, setOffset] = useState(0);
  const attempts = useQuery({ queryKey: ["attempts", offset], queryFn: async ({ signal }) => result(await backend.GET("/api/assessments/attempts", { signal, params: { query: { offset, limit: 20 } } })) });
  return <details><summary>Mis intentos anteriores</summary>
    {attempts.isPending ? <Busy /> : attempts.isError ? <Failure error={attempts.error} retry={() => void attempts.refetch()} /> : <>
      {attempts.data.items.length === 0 ? <p>Aún no has iniciado evaluaciones.</p> : <ul>{attempts.data.items.map((item) => <li key={item.id}><p>{item.title} · {attemptLabels[item.status]} · {new Date(item.startedAt).toLocaleString()}</p>
        <Button onClick={() => select(item.id)}>{item.status === "inProgress" ? "Retomar" : "Consultar"}</Button></li>)}</ul>}
      <Pages offset={offset} total={attempts.data.total} change={setOffset} /></>}
  </details>;
}
