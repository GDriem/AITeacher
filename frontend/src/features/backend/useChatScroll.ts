import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Sigue turnos nuevos solo desde el final; cargar historia conserva el mensaje visible. */
export function useChatScroll(ready: boolean, last: string, first: string | undefined) {
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
    const node = Array.from(messages ?? []).find((item) => item.getBoundingClientRect().bottom > 0);
    anchor.current = node ? { node, top: node.getBoundingClientRect().top } : null;
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflowAnchor;
    root.style.overflowAnchor = "none";
    const track = () => {
      const bottom = end.current?.getBoundingClientRect().bottom;
      if (bottom === undefined) return;
      following.current = bottom - window.innerHeight < 160;
      setAway(!following.current);
    };
    window.addEventListener("scroll", track, { passive: true });
    return () => { root.style.overflowAnchor = previous; window.removeEventListener("scroll", track); };
  }, []);
  useLayoutEffect(() => {
    const saved = anchor.current;
    if (!saved || typeof end.current?.scrollIntoView !== "function") return;
    window.scrollBy({ top: saved.node.getBoundingClientRect().top - saved.top, behavior: "instant" });
    anchor.current = null;
  }, [first]);
  useLayoutEffect(() => {
    if (ready && following.current && typeof end.current?.scrollIntoView === "function")
      end.current.scrollIntoView({ block: "end", behavior: "instant" });
  }, [ready, last]);
  return { end, ready, keep, follow, away, latest };
}
