import { useEffect, useRef } from "react";

/** El teclado puede reducir solo el viewport visual; no compensar el zoom del alumno. */
export function useTutorViewport() {
  const workspace = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = workspace.current;
    const viewport = window.visualViewport;
    if (!node || !viewport) return;
    const update = () => {
      // Conservar el espacio al pasar del campo a Enviar: el teclado puede seguir abierto.
      const inset = viewport.scale === 1 ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      node.style.setProperty("--tutor-keyboard-inset", `${String(inset)}px`);
      node.style.setProperty("--tutor-viewport-height", `${String(viewport.scale === 1 ? viewport.height : window.innerHeight)}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return workspace;
}
