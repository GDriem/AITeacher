import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { Button } from "../../ui";
import { useMedia } from "./useMedia";
import styles from "./Tutor.module.css";

/** Columna en escritorio; diálogo nativo en móvil, con foco contenido y fondo inerte. */
export function TutorMapPanel({ close, children }: { close: () => void; children: ReactNode }) {
  const wide = useMedia("(min-width: 64rem)");
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const onEscape = useEffectEvent(close);
  useEffect(() => {
    const toggle = document.querySelector<HTMLElement>('[aria-controls="tutor-map"]');
    const modal = dialog.current;
    if (!wide) modal?.showModal();
    heading.current?.focus({ preventScroll: true });
    const panel = heading.current?.closest("aside");
    const escape = (event: Event) => { if ((event as KeyboardEvent).key === "Escape") onEscape(); };
    panel?.addEventListener("keydown", escape);
    return () => { panel?.removeEventListener("keydown", escape); modal?.close(); toggle?.focus({ preventScroll: true }); };
  }, [wide]);
  const content = <>
    <header className={styles.mapHeader}>
      <h2 id="tutor-map-title" ref={heading} tabIndex={-1}>Mapa de conceptos</h2>
      <Button size="sm" variant="ghost" onClick={close}>Cerrar mapa</Button>
    </header>
    {children}
  </>;
  return wide ? <aside id="tutor-map" className={styles.map} aria-labelledby="tutor-map-title">{content}</aside>
    : <dialog ref={dialog} id="tutor-map" className={styles.map} aria-labelledby="tutor-map-title"
      onCancel={(event) => { event.preventDefault(); close(); }}>{content}</dialog>;
}
