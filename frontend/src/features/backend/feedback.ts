/** Destino de «Enviar comentarios de la beta» fijado al construir; sólo se aceptan enlaces web o de correo. */
export function feedbackHref(raw: string | undefined) {
  const value = raw?.trim() ?? "";
  return /^(https?:\/\/|mailto:)\S+$/i.test(value) ? value : null;
}
