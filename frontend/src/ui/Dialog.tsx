import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./Dialog.module.css";

/**
 * Diálogo modal sobre `<dialog>` nativo: el navegador atrapa el foco, vuelve
 * inerte el resto de la página y cierra con Escape. Al cerrarse, el foco
 * regresa al elemento que lo abrió.
 */
export function Dialog({ open, title, onClose, children, actions }: {
  open: boolean; title: string; onClose: () => void; children?: ReactNode; actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClose={() => { opener.current?.focus(); opener.current = null; }}>
    {open ? <div className={styles.content}>
      <h2 id={titleId} className={styles.title}>{title}</h2>
      {children}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div> : null}
  </dialog>;
}
