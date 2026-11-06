"use client";

// Сезон и турнир (docs/design-player-passport-theme.md): оба выпадающими
// списками. Сезонов за карьеру может быть много, таблетки на десяток
// сезонов разъезжались бы в строку.
// «Все турниры» = сумма всех записей сезона (sumTournaments), включая другие
// команды: селекта «Клуб» нет, команда видна в подписи опции турнира.

import { useState } from "react";

import { SeasonStatCard } from "@/components/SeasonStatCard";
import { SeasonStatForm } from "@/components/SeasonStatForm";
import { ALL_TOURNAMENTS, sumTournaments } from "@/lib/seasonAggregate";
import type { SeasonStat, SportMetricDef, TeamBenchmark } from "@/types";

const selectClass =
  "h-8 text-xs font-medium px-2.5 border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]";

function uniqueInOrder<T>(items: T[]): T[] {
  return [...new Set(items)];
}

// Команда в скобках, только если за сезон их больше одной (дубль/сборная)
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
  benchmarkBySeason,
  canEdit,
}: {
  athleteId: string;
  sport: string | null;
  addFormDefs: SportMetricDef[];
  defsBySport: Record<string, SportMetricDef[]>;
  entries: SeasonStat[];
  // Медиана команды по сезону; null, если ориентир не загрузился
  benchmarkBySeason: Record<string, TeamBenchmark | null>;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  // По умолчанию самый свежий сезон (бэкенд сортирует season desc), «Все турниры»
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
        <div className="flex items-center gap-3 flex-wrap">
          {seasons.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
              Сезон
              <select
                value={effectiveSeason}
                onChange={(e) => pickSeason(e.target.value)}
                className={`${selectClass} min-w-[110px] tabular-nums`}
              >
                {seasons.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          {group.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
              Турнир
              {/* Одна запись за сезон: выбирать нечего, но турнир всё равно
                  виден в том же месте, что и при нескольких */}
              <select
                value={group.length > 1 ? effectiveTournament : group[0].id}
                onChange={(e) => setTournament(e.target.value)}
                disabled={group.length <= 1}
                className={`${selectClass} min-w-[220px] disabled:opacity-70`}
              >
                {group.length > 1 && <option value={ALL_TOURNAMENTS}>Все турниры ({group.length})</option>}
                {group.map((e) => (
                  <option key={e.id} value={e.id}>
                    {tournamentLabel(e, showClubSuffix)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {canEdit && sport && (
          <button
            onClick={() => setAdding((v) => !v)}
            className={`h-8 px-3 text-xs font-medium border transition-colors ${
              adding
                ? "border-[var(--border-strong)] text-[var(--text-muted)]"
                : "border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-soft)]"
            }`}
          >
            {adding ? "Отмена" : "+ Добавить сезон"}
          </button>
        )}
      </div>

      {canEdit && !sport && (
        <p className="text-xs text-[var(--text-faint)]">
          У команды не указан вид спорта: заполните его, чтобы вести статистику.
        </p>
      )}

      {adding && sport && (
        <SeasonStatForm athleteId={athleteId} sport={sport} defs={addFormDefs} onClose={() => setAdding(false)} />
      )}

      {entries.length === 0 ? (
        <div className="border border-dashed border-[var(--border-strong)] py-14 text-center">
          <p className="text-sm text-[var(--text-muted)]">Статистики по сезонам пока нет.</p>
          {canEdit && sport && (
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              Добавьте первый сезон: матчи, минуты и детализацию по ударам, пасам, единоборствам.
            </p>
          )}
        </div>
      ) : (
        displayEntry && (
          <SeasonStatCard
            key={displayEntry.id}
            athleteId={athleteId}
            entry={displayEntry}
            defs={defsBySport[displayEntry.sport] ?? []}
            benchmark={benchmarkBySeason[displayEntry.season] ?? null}
            canEdit={canEdit}
            readOnly={readOnly}
          />
        )
      )}
    </div>
  );
}
