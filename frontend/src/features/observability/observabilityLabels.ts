const activityLabels: Record<string, string> = {
  guided_explanation: "Explicaciones",
  topic_evaluation: "Evaluaciones",
  practice_evaluation: "Prácticas",
  project_evaluation: "Proyectos",
};

export const activityLabel = (value: string) => activityLabels[value] ?? value.replaceAll("_", " ");

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (hours > 0) return `${String(hours)} h ${String(minutes)} min`;
  if (minutes > 0) return `${String(minutes)} min`;
  return `${String(seconds)} s`;
}

export function formatPercentage(ratio: number) {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("es").format(value);
}

export function formatCost(estimatedCostUsd: number, pricingConfigured: boolean) {
  return pricingConfigured ? `$${estimatedCostUsd.toFixed(4)}` : "Sin tarifa";
}
