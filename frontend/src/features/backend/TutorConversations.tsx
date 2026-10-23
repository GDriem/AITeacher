import { Button } from "../../ui";
import type { Schema } from "./client";
import { Busy, Failure } from "./Shared";
import { conversationTitle, useConversations } from "./tutorQueries";
import { useMedia } from "./useMedia";
import styles from "./Tutor.module.css";

const date = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Conversaciones de la unidad en su publicación vigente, con un título legible
 * por actividad. Columna lateral en escritorio; plegable sobre el chat en móvil.
 * Abrir una es navegar: quien monta el panel decide la URL.
 */
export function TutorConversations({ unit, current, busy, starting, start, open }: {
  unit: Schema["UnitResponse"]; current: string | null; busy: boolean; starting: boolean; start: () => void; open: (id: string) => void;
}) {
  const conversations = useConversations();
  const wide = useMedia("(min-width: 64rem)");
  // Una conversación de una publicación anterior se abre desde su enlace, no desde esta lista.
  const items = conversations.data?.pages.flatMap((page) => page.items).filter((item) => item.unitId === unit.id && item.revisionId === unit.revision.id) ?? [];
  const list = conversations.isPending ? <Busy />
    : conversations.isError ? <Failure error={conversations.error} retry={() => void conversations.refetch()} />
    : <>
      {items.length ? <ul className={styles.conversationList}>{items.map((item) => <li key={item.id}>
        <button type="button" className={styles.conversationItem} aria-current={item.id === current ? "true" : undefined} disabled={busy} onClick={() => open(item.id)}>
          <span>{conversationTitle(unit, item)}</span>
          <time dateTime={item.createdAt}>{date.format(new Date(item.createdAt))}</time>
        </button>
      </li>)}</ul> : <p className={styles.muted}>Todavía no tienes conversaciones en esta unidad.</p>}
      {conversations.hasNextPage ? <Button size="sm" variant="ghost" disabled={conversations.isFetchingNextPage} onClick={() => void conversations.fetchNextPage()}>
        {conversations.isFetchingNextPage ? "Cargando…" : "Cargar más conversaciones"}</Button> : null}
    </>;
  const label = `Conversaciones de la unidad${conversations.data ? ` (${String(items.length)})` : ""}`;
  return <nav className={styles.conversations} aria-label="Conversaciones de la unidad">
    <Button variant="primary" disabled={starting || busy} onClick={start}>{starting ? "Creando conversación…" : "Nueva conversación"}</Button>
    {wide ? <><h2 className={styles.panelTitle}>{label}</h2>{list}</>
      : <details className={styles.conversationsFold}><summary>{label}</summary>{list}</details>}
  </nav>;
}
