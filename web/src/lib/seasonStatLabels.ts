// Подписи паспорта игрока (docs/plan-player-season-stats.md) — бэкенд отдаёт
// только машиночитаемые key/category_key (sport_metric_defs), перевод на
// клиенте, как у reasonLabel/loadZoneText. Словарь — под футбольный каталог
// (backend/app/services/season_stats_service.py:FOOTBALL_METRICS); для
// нового вида спорта дополняется вместе с его сидом каталога.

import type { SportMetricDef } from "@/types";

export const categoryLabel: Record<string, string> = {
  shooting: "Удары",
  passing: "Пасы",
  duels: "Единоборства",
  dribbles: "Обводки",
  possession: "Владение",
};

export const metricLabel: Record<string, string> = {
  shots: "Удары",
  shots_on_target: "Точность ударов",
  xg: "Ожидаемые голы (xG)",
  passes: "Передачи",
  passes_completed: "Точные передачи",
  key_passes: "Ключевые передачи",
  progressive_passes: "Прогрессивные передачи",
  duels: "Единоборства",
  duels_won: "Единоборства выигранные",
  tackles: "Отборы",
  clearances: "Выносы",
  dribbles: "Обводки успешные",
  recoveries: "Возвраты мяча",
  progressive_actions: "Прогрессивные действия",
};

// Порядок категорий на радаре и в списке: от завершения атаки к обороне,
// как читают профиль игрока в скаутинге. Бэкенд сортирует по category_key
// алфавитом (dribbles, duels, passing…), это не футбольная логика.
const CATEGORY_ORDER = ["shooting", "passing", "dribbles", "possession", "duels"];

function categoryRank(key: string): number {
  const i = CATEGORY_ORDER.indexOf(key);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

export function orderDefs<T extends SportMetricDef>(defs: T[]): T[] {
  return [...defs].sort(
    (a, b) => categoryRank(a.category_key) - categoryRank(b.category_key) || a.sort_order - b.sort_order,
  );
}

export function orderCategories(keys: string[]): string[] {
  return [...keys].sort((a, b) => categoryRank(a) - categoryRank(b));
}

const sportLabel: Record<string, string> = {
  football: "Футбол",
  hockey: "Хоккей",
  basketball: "Баскетбол",
  volleyball: "Волейбол",
};

export function sportText(sport: string): string {
  return sportLabel[sport] ?? sport;
}

// Подписи ядра записи (score/assists/penalty_*): модель общая на все виды
// спорта, футбольные «Голы/ЖК/КК» только для футбола, иначе нейтральные.
export interface CoreLabels {
  score: string;
  assists: string;
  penaltyMinor: string;
  penaltyMajor: string;
}

const coreLabels: Record<string, CoreLabels> = {
  football: { score: "Голы", assists: "Голевые", penaltyMinor: "ЖК", penaltyMajor: "КК" },
  hockey: { score: "Шайбы", assists: "Передачи", penaltyMinor: "Малые штрафы", penaltyMajor: "Большие штрафы" },
};

const genericCore: CoreLabels = {
  score: "Очки",
  assists: "Результативные",
  penaltyMinor: "Предупреждения",
  penaltyMajor: "Удаления",
};

export function coreText(sport: string): CoreLabels {
  return coreLabels[sport] ?? genericCore;
}

export function categoryText(key: string): string {
  return categoryLabel[key] ?? key;
}

export function metricText(key: string): string {
  return metricLabel[key] ?? key;
}

// Короткая подпись на оси радара — без «удары/передачи/единоборства» дважды
// (категория уже группирует), иначе подписи теснятся на маленьком SVG.
const radarAxisShort: Record<string, string> = {
  shots: "Удары",
  shots_on_target: "Точность",
  xg: "xG",
  progressive_passes: "Прогр. передачи",
  duels_won: "Единоборства",
  tackles: "Отборы",
  dribbles: "Обводки",
  recoveries: "Возвраты",
  progressive_actions: "Прогр. действия",
};

export function radarAxisText(key: string): string {
  return radarAxisShort[key] ?? metricText(key);
}
