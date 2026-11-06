// «Все турниры» для выбранного сезона (docs/plan-player-season-stats.md):
// сумма ВСЕХ записей сезона игрока, включая другие команды (дубль, сборная).
// Селекта «Клуб» больше нет (docs/design-player-passport-theme.md), так что
// итог сезона = всё, что игрок сыграл за сезон; та же логика у медианы
// команды на бэкенде (season_stats_service.team_benchmark). Тот же приём, что у daily_load: запись без метрики = 0
// в сумме, не пропуск (CLAUDE.md, «день без событий = 0»). per-90 и %
// считаются один раз над суммами, не усреднением готовых per-90/% по
// записям — иначе запись с малым числом минут искажала бы среднее сильнее.

import type { SeasonStat, SeasonStatMetricValue, SportMetricDef } from "@/types";

export const ALL_TOURNAMENTS = "";

function per90(value: number, minutes: number): number | null {
  return minutes > 0 ? Math.round(((value * 90) / minutes) * 100) / 100 : null;
}

// group: все записи одного сезона, непустой массив; defs: каталог метрик
// спорта group[0] (внутри сезона вид спорта на практике не меняется).
export function sumTournaments(group: SeasonStat[], defs: SportMetricDef[]): SeasonStat {
  let matches = 0;
  let minutes = 0;
  let score = 0;
  let assists = 0;
  let penaltyMinor = 0;
  let penaltyMajor = 0;
  const rawByKey = new Map<string, number>();
  for (const e of group) {
    matches += e.matches;
    minutes += e.minutes;
    score += e.score;
    assists += e.assists;
    penaltyMinor += e.penalty_minor;
    penaltyMajor += e.penalty_major;
    for (const m of e.metrics) rawByKey.set(m.key, (rawByKey.get(m.key) ?? 0) + m.value);
  }

  const defsByKey = new Map(defs.map((d) => [d.key, d]));
  const metrics: SeasonStatMetricValue[] = [...rawByKey.entries()].map(([key, value]) => {
    const def = defsByKey.get(key);
    const denom = def?.pct_of_key ? rawByKey.get(def.pct_of_key) : undefined;
    const pct = denom ? Math.round((value / denom) * 10000) / 10000 : null;
    return { key, value: Math.round(value * 100) / 100, per_90: per90(value, minutes), pct };
  });

  return {
    id: `__all_tournaments__${group[0].season}`,
    athlete_id: group[0].athlete_id,
    sport: group[0].sport,
    season: group[0].season,
    team_label: [...new Set(group.map((e) => e.team_label))].join(", "),
    competition: group.length > 1 ? "Все турниры" : group[0].competition,
    matches,
    minutes,
    score,
    assists,
    penalty_minor: penaltyMinor,
    penalty_major: penaltyMajor,
    score_per_90: per90(score, minutes),
    assists_per_90: per90(assists, minutes),
    metrics,
    created_by: group[0].created_by,
    created_at: group[0].created_at,
    updated_at: group[0].updated_at,
  };
}
