"use client";

// Сезон / турнир — два независимых бара (docs/design-player-passport-theme.md,
// 2026-11-06): селект «Клуб» убран — лого организации теперь в шапке
// (Navbar), а несколько команд одной организации за сезон (например, вызов
// в дубль) видны прямо в названии турнира, не как отдельное измерение
// фильтра. «Все турниры» — сумма записей сезона (sumTournaments), не
// карьерный агрегат по всей истории (та «Карьера»-плашка убрана раньше).

import { useState } from "react";

import { SeasonStatCard } from "@/components/SeasonStatCard";
import { SeasonStatForm } from "@/components/SeasonStatForm";
import { ALL_TOURNAMENTS, sumTournaments } from "@/lib/seasonAggregate";
import type { SeasonStat, SportMetricDef } from "@/types";

const selectClass =
  "text-xs font-medium px-2.5 py-1.5 border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]";

function uniqueInOrder<T>(items: T[]): T[] {
  return [...new Set(items)];
}

// Название турнира в опции селекта — клуб добавляется в скобках, только если
// за сезон встречается больше одного (вызов в дубль/сборную видно прямо тут,
// без отдельного переключателя).
function tournamentLabel(entry: SeasonStat, showClub: boolean): string {
  const base = entry.competition ?? entry.team_label;
  return showClub && entry.competition ? `${base} (${entry.team_label})` : base;
}

export function SeasonStatsSection({
  athleteId,
  sport,
  addFormDefs,
  defsBySport,
  entries,
  canEdit,
}: {
  athleteId: string;
  sport: string | null;
  addFormDefs: SportMetricDef[];
  defsBySport: Record<string, SportMetricDef[]>;
  entries: SeasonStat[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  // По умолчанию — самый свежий сезон (entries уже отсортированы бэкендом
  // по season desc) и «Все турниры» для него.
  const [season, setSeason] = useState(entries[0]?.season ?? "");
  const [tournament, setTournament] = useState(ALL_TOURNAMENTS);

  const seasons = uniqueInOrder(entries.map((e) => e.season));
  const effectiveSeason = seasons.includes(season) ? season : (seasons[0] ?? "");

  const group = entries.filter((e) => e.season === effectiveSeason);
  const showClubSuffix = new Set(group.map((e) => e.team_label)).size > 1;
  const effectiveTournament =
    tournament === ALL_TOURNAMENTS || group.some((e) => e.id === tournament) ? tournament : ALL_TOURNAMENTS;

  let displayEntry: SeasonStat | undefined;
  let readOnly = false;
  if (effectiveTournament === ALL_TOURNAMENTS) {
    if (group.length <= 1) {
      displayEntry = group[0];
    } else {
      displayEntry = sumTournaments(group, defsBySport[group[0].sport] ?? []);
      readOnly = true;
    }
  } else {
    displayEntry = group.find((e) => e.id === effectiveTournament) ?? group[0];
  }

  function pickSeason(nextSeason: string) {
    setSeason(nextSeason);
    setTournament(ALL_TOURNAMENTS);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-medium text-[var(--text)]">Сезоны</h2>
        {canEdit && sport && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="text-xs font-medium px-2.5 py-1 border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
          >
            {adding ? "Отмена" : "Добавить сезон"}
          </button>
        )}
      </div>

      {canEdit && !sport && (
        <p className="text-xs text-[var(--text-faint)]">
          У команды не указан вид спорта — заполните его, чтобы вести статистику.
        </p>
      )}

      {adding && sport && (
        <SeasonStatForm athleteId={athleteId} defs={addFormDefs} onClose={() => setAdding(false)} />
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-6 text-center">Статистики по сезонам пока нет.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-[var(--text-faint)]">
              Сезон{" "}
              <select
                value={effectiveSeason}
                onChange={(e) => pickSeason(e.target.value)}
                className={`${selectClass} ml-1`}
              >
                {seasons.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--text-faint)]">
              Турнир{" "}
              <select
                value={effectiveTournament}
                onChange={(e) => setTournament(e.target.value)}
                className={`${selectClass} ml-1`}
              >
                <option value={ALL_TOURNAMENTS}>Все турниры</option>
                {group.map((e) => (
                  <option key={e.id} value={e.id}>
                    {tournamentLabel(e, showClubSuffix)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {displayEntry && (
            <SeasonStatCard
              key={displayEntry.id}
              athleteId={athleteId}
              entry={displayEntry}
              defs={defsBySport[displayEntry.sport] ?? []}
              canEdit={canEdit}
              readOnly={readOnly}
            />
          )}
        </>
      )}
    </div>
  );
}
