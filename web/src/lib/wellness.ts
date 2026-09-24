// Нормализация сырых значений wellness-опроса (1–10) в 0–100 и зону — зеркалит
// backend/app/core/calculations.py (normalize_positive/normalize_negative,
// READINESS_GREEN=75/READINESS_YELLOW=55). Нужна там, где бэкенд отдаёт сырые
// значения без уже посчитанного normalized (история опросов, GET /wellness/*) —
// там, где normalized уже приходит готовым (readiness-breakdown), используем
// zoneFromNormalized() напрямую, эту функцию — нет смысла звать дважды.
import type { ReadinessComponent } from "@/types";

const POSITIVE: ReadinessComponent["key"][] = ["sleep_quality", "energy", "mood"];

export function normalizeWellness(key: ReadinessComponent["key"], value: number): number {
  return POSITIVE.includes(key) ? ((value - 1) / 9) * 100 : ((10 - value) / 9) * 100;
}

export function zoneFromNormalized(normalized: number): "green" | "yellow" | "red" {
  if (normalized >= 75) return "green";
  if (normalized >= 55) return "yellow";
  return "red";
}

export function wellnessZone(key: ReadinessComponent["key"], value: number): "green" | "yellow" | "red" {
  return zoneFromNormalized(normalizeWellness(key, value));
}
