import { useSyncExternalStore } from "react";

/** Si la consulta de medios se cumple; se actualiza al girar o redimensionar la ventana. Sin `matchMedia` vale false. */
export function useMedia(query: string) {
  // jsdom no implementa matchMedia.
  const supported = typeof (window as Partial<Window>).matchMedia === "function";
  return useSyncExternalStore((change) => {
    if (!supported) return () => undefined;
    const list = window.matchMedia(query);
    list.addEventListener("change", change);
    return () => list.removeEventListener("change", change);
  }, () => supported && window.matchMedia(query).matches, () => false);
}
