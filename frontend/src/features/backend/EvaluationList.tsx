import { Button } from "../../ui";

interface Evaluation { id: string; title: string; mode: "practice" | "assessment"; timeLimitMinutes: number; maxAttempts: number }
/** Presentación compartida de Evaluar; sin `start` solo muestra la información, sin llamadas ni intentos. */
export function EvaluationList({ items, start, pending = false }: { items: Evaluation[]; start?: (id: string) => void; pending?: boolean }) {
  return <><h2>Prácticas y evaluaciones</h2>
    {items.length === 0 ? <p>Todavía no hay evaluaciones para esta revisión.</p> : <ul>{items.map((item) => <li key={item.id}>
      <p>{item.title} · {item.mode === "practice" ? "Práctica" : "Evaluación"} · {item.timeLimitMinutes} minutos · hasta {item.maxAttempts} intentos</p>
      {start ? <Button disabled={pending} onClick={() => start(item.id)}>Iniciar {item.title}</Button> : null}
    </li>)}</ul>}
  </>;
}
