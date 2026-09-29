import { useEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router-dom";

const HEADING_WAIT_TIMEOUT_MS = 4_000;

function focusHeading(target: HTMLElement) {
  if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus();
}

/**
 * Mueve el foco al encabezado principal de cada ruta cuando cambia la
 * navegación dentro de la aplicación, para que el lector de pantalla anuncie
 * la nueva pantalla sin depender de que cada ruta gestione su propio foco.
 *
 * El `h1` de la ruta destino no siempre está en el DOM en el mismo commit en
 * que cambia `location.pathname`: la ruta puede cargarse de forma diferida y,
 * ya montada, su primer render suele ser un estado de carga sin encabezado
 * mientras TanStack Query resuelve la consulta. Un `MutationObserver` espera
 * a que el `h1` real aparezca antes de mover el foco; si nunca aparece (o la
 * ruta no tiene uno), el foco cae al contenedor principal.
 *
 * La primera carga se deja intacta a propósito: el foco natural del
 * navegador al inicio del documento hace que el enlace "Saltar al contenido
 * principal" sea la primera parada de tabulación, un patrón de accesibilidad
 * que no debe perderse sólo porque exista una ruta activa. El modo estricto
 * vuelve a invocar el efecto de montaje de forma síncrona (montaje → limpieza
 * → montaje) antes de que corra cualquier microtarea; posponer a `false` con
 * `queueMicrotask` deja que ambas invocaciones vean la carga como inicial sin
 * afectar la limpieza de navegaciones reales posteriores.
 */
export function useRouteFocus(mainRef: RefObject<HTMLElement | null>) {
  const location = useLocation();
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (isInitialRender.current) {
      queueMicrotask(() => {
        isInitialRender.current = false;
      });
      return;
    }

    const main = mainRef.current;
    if (!main) return;

    const existingHeading = main.querySelector<HTMLElement>("h1");
    if (existingHeading) {
      focusHeading(existingHeading);
      return;
    }

    const observer = new MutationObserver(() => {
      const heading = main.querySelector<HTMLElement>("h1");
      if (!heading) return;
      observer.disconnect();
      window.clearTimeout(fallbackTimer);
      focusHeading(heading);
    });
    observer.observe(main, { childList: true, subtree: true });
    const fallbackTimer = window.setTimeout(() => {
      observer.disconnect();
      focusHeading(main);
    }, HEADING_WAIT_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallbackTimer);
    };
  }, [location.pathname, mainRef]);
}
