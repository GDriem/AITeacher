const dateTimeFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });
/** Fecha y hora en español aunque el navegador esté en otro idioma. */
export function formatDateTime(value: string) { return dateTimeFormat.format(new Date(value)); }

export const attemptLabels = { inProgress: "En curso", submitted: "Entregada", expired: "Vencida", pendingReview: "Pendiente de corrección docente" };
