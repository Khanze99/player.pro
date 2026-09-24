import type { MetricZone } from "@/types";

// Единая раскраска по зоне для readiness/performance/availability (green/yellow/red)
// и отдельно для load (свои названия зон, ACWR — раздел 6.2-6.3 ТЗ), но палитра та же.
export function zoneColorVar(zone: MetricZone | null | undefined): string {
  switch (zone) {
    case "green":
    case "optimal":
      return "var(--good)";
    case "yellow":
    case "overreaching":
      return "var(--caution)";
    case "red":
    case "high_risk":
      return "var(--risk)";
    default:
      return "var(--no-data)";
  }
}
