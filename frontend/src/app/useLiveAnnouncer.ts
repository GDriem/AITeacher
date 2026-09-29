import { useCallback, useState } from "react";

/**
 * Región `aria-live` compartida a nivel de shell. Repetir el mismo texto
 * fuerza un sufijo invisible para que los lectores de pantalla anuncien la
 * repetición (por ejemplo, dos desconexiones seguidas).
 */
export function useLiveAnnouncer() {
  const [message, setMessage] = useState("");

  const announce = useCallback((text: string) => {
    setMessage((current) => (current === text ? `${text} ` : text));
  }, []);

  return { message, announce };
}
