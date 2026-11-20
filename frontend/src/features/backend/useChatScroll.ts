import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Sigue turnos nuevos solo desde el final; cargar historia conserva el mensaje visible. */
export function useChatScroll(ready: boolean, last: string, first: string | undefined, workspace: RefObject<HTMLDivElement | null>) {
  const end = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const anchor = useRef<{ node: HTMLElement; top: number } | null>(null);
  const [away, setAway] = useState(false);
  const follow = useCallback(() => { following.current = true; setAway(false); }, []);
  const latest = () => {
    follow();
    end.current?.scrollIntoView({ block: "end", behavior: "instant" });
    const messages = end.current?.parentElement?.querySelectorAll<HTMLElement>('[id^="message-"]');
    // El botón desaparece al llegar: el foco continúa en el mensaje, no en el body.
    if (messages?.length) messages.item(messages.length - 1).focus({ preventScroll: true });
  };
  const keep = useCallback(() => {
    const messages = end.current?.parentElement?.querySelectorAll<HTMLElement>('[id^="message-"]');
    const top = end.current?.closest("dialog")?.getBoundingClientRect().top ?? 0;
    const node = Array.from(messages ?? []).find((item) => item.getBoundingClientRect().bottom > top);
    anchor.current = node ? { node, top: node.getBoundingClientRect().top } : null;
  }, []);
  useEffect(() => {
    const dialog = workspace.current?.closest("dialog");
    const root = dialog ?? document.documentElement;
    const scrollTarget = dialog ?? window;
    const previous = root.style.overflowAnchor;
    root.style.overflowAnchor = "none";
    const track = () => {
      const bottom = end.current?.getBoundingClientRect().bottom;
      if (bottom === undefined) return;
      following.current = bottom - (dialog?.getBoundingClientRect().bottom ?? window.innerHeight) < 160;
      setAway(!following.current);
    };
    scrollTarget.addEventListener("scroll", track, { passive: true });
    return () => { root.style.overflowAnchor = previous; scrollTarget.removeEventListener("scroll", track); };
  }, [workspace]);
  useLayoutEffect(() => {
    const saved = anchor.current;
    if (!saved || typeof end.current?.scrollIntoView !== "function") return;
    const scrollTarget = workspace.current?.closest("dialog") ?? window;
    scrollTarget.scrollBy({ top: saved.node.getBoundingClientRect().top - saved.top, behavior: "instant" });
    anchor.current = null;
  }, [first, workspace]);
  useLayoutEffect(() => {
    if (ready && following.current && typeof end.current?.scrollIntoView === "function")
      end.current.scrollIntoView({ block: "end", behavior: "instant" });
  }, [ready, last]);
  return { end, ready, keep, follow, away, latest };
}
