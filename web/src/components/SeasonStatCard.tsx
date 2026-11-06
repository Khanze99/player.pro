"use client";

// Одна карточка сезона паспорта игрока (docs/plan-player-season-stats.md,
// docs/design-player-passport-theme.md) — core-тайлы (как на дневном
// отчёте), затем радар (если набралось ≥3 выбранных осей с данными) и
// список всех заполненных метрик по категориям. Радар и список — один
// источник чисел (entry.metrics), не два независимых расчёта.
//
// Клубный заголовок (лого/название/плашка сезона) сюда специально не
// возвращаем — лого теперь в шапке админки (Navbar), а клуб/сезон/турнир
// уже видны в селектах над карточкой (SeasonStatsSection); повторять их
// тут — дублирование контекста, не информация.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { SeasonStatForm } from "@/components/SeasonStatForm";
import { computeRadarAxes, SeasonStatRadar } from "@/components/SeasonStatRadar";
import { Card } from "@/components/ui/Card";
import { categoryText, metricText } from "@/lib/seasonStatLabels";
import type { SeasonStat, SportMetricDef } from "@/types";

function Tile({ value, sub, label }: { value: React.ReactNode; sub?: string; label: string }) {
  return (
    <div className="bg-[var(--surface-muted)] border border-[var(--border)] px-2 py-2 text-center">
      <p className="font-semibold text-[var(--text)] tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-[var(--accent)] tabular-nums mt-0.5">{sub}</p>}
      <p className="text-[9px] text-[var(--text-faint)] tracking-wide uppercase mt-0.5">{label}</p>
    </div>
  );
}

function formatMetric(value: number, per90: number | null, pct: number | null): string {
  const parts = [value % 1 === 0 ? String(value) : value.toFixed(2)];
  if (per90 !== null) parts.push(`${per90.toFixed(2)}/90`);
  if (pct !== null) parts.push(`${Math.round(pct * 100)}%`);
  return parts.join(" · ");
}

export function SeasonStatCard({
  athleteId,
  entry,
  defs,
  canEdit,
  readOnly = false,
}: {
  athleteId: string;
  entry: SeasonStat;
  defs: SportMetricDef[];
  canEdit: boolean;
  // Сумма турниров клуба+сезона (docs/design-player-passport-theme.md) — не
  // настоящая запись БД (id начинается с "__all_tournaments__"),
  // редактирование/удаление для неё не имеют смысла независимо от canEdit.
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const editable = canEdit && !readOnly;
  const [deleting, setDeleting] = useState(false);

  // Показатели на радаре — предпочтение именно этого просмотра
  // (docs/design-player-passport-theme.md, «Показатели N из M»), не каталог:
  // ничего никуда не сохраняется, при смене записи компонент пересоздаётся
  // заново (родитель передаёт key={entry.id}) и выбор возвращается к
  // on_radar_default.
  const filledKeys = new Set(entry.metrics.map((m) => m.key));
  const pickableDefs = defs.filter((d) => filledKeys.has(d.key));
  const [radarKeys, setRadarKeys] = useState<Set<string>>(
    () => new Set(pickableDefs.filter((d) => d.on_radar_default).map((d) => d.key)),
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPanelOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [panelOpen]);

  function toggleRadarKey(key: string) {
    setRadarKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function remove() {
    if (!window.confirm(`Удалить запись за сезон ${entry.season}?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/season-stats/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Не удалось удалить");
      }
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Ошибка");
      setDeleting(false);
    }
  }

  if (editing) {
    return <SeasonStatForm athleteId={athleteId} defs={defs} initial={entry} onClose={() => setEditing(false)} />;
  }

  const defsByKey = new Map(defs.map((d) => [d.key, d]));
  const groupedMetrics = new Map<string, typeof entry.metrics>();
  for (const m of entry.metrics) {
    const category = defsByKey.get(m.key)?.category_key ?? "—";
    const list = groupedMetrics.get(category) ?? [];
    list.push(m);
    groupedMetrics.set(category, list);
  }
  const axes = computeRadarAxes(entry, defs, radarKeys);

  return (
    <Card>
      {editable && (
        <div className="flex justify-end gap-3 mb-3">
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            Изменить
          </button>
          <button
            onClick={remove}
            disabled={deleting}
            className="text-xs text-[var(--risk)] hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            Удалить
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
        <Tile value={entry.matches} label="Матчи" />
        <Tile value={`${entry.minutes}′`} label="Минуты" />
        <Tile value={entry.score} sub={entry.score_per_90 !== null ? `${entry.score_per_90}/90` : undefined} label="Голы" />
        <Tile
          value={entry.assists}
          sub={entry.assists_per_90 !== null ? `${entry.assists_per_90}/90` : undefined}
          label="Передачи"
        />
        <Tile value={entry.penalty_minor} label="ЖК" />
        <Tile value={entry.penalty_major} label="КК" />
      </div>

      {entry.metrics.length === 0 ? (
        <p className="text-xs text-[var(--text-faint)]">Детализация по ударам/пасам/единоборствам не заполнена</p>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 relative">
            <button
              onClick={() => setPanelOpen((v) => !v)}
              className="h-8 px-2.5 text-xs font-medium border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] flex items-center gap-1.5"
            >
              Показатели <span className="text-[var(--text-faint)]">{radarKeys.size} из {pickableDefs.length}</span>
            </button>
            <button
              type="button"
              disabled
              title="Импорт статистики списком — в разработке"
              className="h-8 px-2.5 text-xs font-medium border border-dashed border-[var(--border-strong)] text-[var(--text-faint)] cursor-not-allowed flex items-center gap-1.5"
            >
              Импорт CSV
            </button>

            {panelOpen && (
              <div
                ref={panelRef}
                className="absolute top-9 left-0 z-10 w-64 max-h-80 overflow-y-auto bg-[var(--surface)] border border-[var(--border-strong)] shadow-lg"
              >
                {pickableDefs.map((d) => (
                  <label
                    key={d.key}
                    className={`flex items-center gap-2 px-2.5 py-1.5 text-xs border-b border-[var(--border)] last:border-b-0 ${
                      radarKeys.has(d.key) ? "text-[var(--text)]" : "text-[var(--text-faint)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={radarKeys.has(d.key)}
                      onChange={() => toggleRadarKey(d.key)}
                      className="accent-[var(--accent)] w-3.5 h-3.5"
                    />
                    <span>
                      {metricText(d.key)} <span className="text-[var(--text-faint)]">· {categoryText(d.category_key)}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {axes.length > 0 && (
            <div className="flex justify-center">
              <div className="w-full max-w-[420px]">
                <SeasonStatRadar axes={axes} />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...groupedMetrics.entries()].map(([category, metrics]) => (
              <div key={category}>
                <p className="text-[10px] font-medium text-[var(--text-faint)] uppercase tracking-wide mb-1">
                  {categoryText(category)}
                </p>
                <div className="space-y-1">
                  {metrics.map((m) => (
                    <div key={m.key} className="flex items-baseline justify-between text-xs gap-2">
                      <span className="text-[var(--text-muted)]">{metricText(m.key)}</span>
                      <span className="text-[var(--text)] font-medium tabular-nums whitespace-nowrap">
                        {formatMetric(m.value, m.per_90, m.pct)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
