import type { BmiZone, MetricZone } from "@/types";

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

// ИМТ (docs/plan-weight-tracking.md) — дефицит/избыток тревожат одинаково
// (caution), ожирение — risk, норма — good, как mobile/src/theme/tokens.ts:bmiZoneColor.
export function bmiZoneColorVar(zone: BmiZone | null | undefined): string {
  switch (zone) {
    case "normal":
      return "var(--good)";
    case "underweight":
    case "overweight":
      return "var(--caution)";
    case "obese":
      return "var(--risk)";
    default:
      return "var(--no-data)";
  }
}

// Приглушённый фон под пилюлю/бейдж того же zone — те самые --*-soft из
// globals.css, не хак с хекс-альфа-суффиксом на var(): `${var(--x)}1a` не
// валидный CSS, браузер его просто проигнорирует.
export function bmiZoneSoftVar(zone: BmiZone | null | undefined): string {
  switch (zone) {
    case "normal":
      return "var(--good-soft)";
    case "underweight":
    case "overweight":
      return "var(--caution-soft)";
    case "obese":
      return "var(--risk-soft)";
    default:
      return "var(--no-data-soft)";
  }
}
