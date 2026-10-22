import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

export interface TabItem { id: string; label: string; content: ReactNode }

/**
 * Pestañas ARIA con tabulación itinerante: Tab entra a la pestaña activa y las
 * flechas, Inicio y Fin cambian de pestaña. Admite modo controlado
 * (`selectedId` + `onSelect`) para sincronizar la pestaña con la URL.
 */
export function Tabs({ label, items, selectedId, onSelect }: {
  label: string; items: TabItem[]; selectedId?: string; onSelect?: (id: string) => void;
}) {
  const base = useId();
  const [internal, setInternal] = useState(items[0]?.id ?? "");
  const current = items.some((item) => item.id === (selectedId ?? internal)) ? (selectedId ?? internal) : (items[0]?.id ?? "");
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const select = (id: string) => { setInternal(id); onSelect?.(id); };
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = items[next];
    if (!target) return;
    select(target.id);
    tabs.current.get(target.id)?.focus();
  };
  return <div>
    <div role="tablist" aria-label={label} className={styles.list}>
      {items.map((item, index) => <button key={item.id} type="button" role="tab" id={`${base}-tab-${item.id}`}
        ref={(node) => { if (node) tabs.current.set(item.id, node); else tabs.current.delete(item.id); }}
        aria-selected={item.id === current} aria-controls={`${base}-panel-${item.id}`} tabIndex={item.id === current ? 0 : -1}
        className={styles.tab} onClick={() => select(item.id)} onKeyDown={(event) => move(event, index)}>{item.label}</button>)}
    </div>
    {items.filter((item) => item.id === current).map((item) => <div key={item.id} role="tabpanel" id={`${base}-panel-${item.id}`}
      aria-labelledby={`${base}-tab-${item.id}`} tabIndex={0} className={styles.panel}>{item.content}</div>)}
  </div>;
}
