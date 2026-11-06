// Подписи паспорта игрока (docs/plan-player-season-stats.md) — бэкенд отдаёт
// только машиночитаемые key/category_key (sport_metric_defs), перевод на
// клиенте, как у reasonLabel/loadZoneText. Словарь — под футбольный каталог
// (backend/app/services/season_stats_service.py:FOOTBALL_METRICS); для
// нового вида спорта дополняется вместе с его сидом каталога.

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
