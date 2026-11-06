"use client";

// Карточка сезона паспорта игрока (docs/plan-player-season-stats.md,
// docs/design-player-passport-theme.md): ядро сезона крупными тайлами,
// радар с медианой команды и метрики по категориям полосками. Радар,
// тайлы и полосы берут числа из одного источника (entry.metrics), а
// ориентир из одного TeamBenchmark.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { SeasonStatForm } from "@/components/SeasonStatForm";
import {
  computeRadarAxes,
  formatAxisValue,
  MIN_RADAR_AXES,
  SeasonStatRadar,
  type RadarAxis,
} from "@/components/SeasonStatRadar";
import { Card } from "@/components/ui/Card";
import {
  categoryText,
  coreText,
  metricText,
  orderCategories,
  orderDefs,
  radarAxisText,
} from "@/lib/seasonStatLabels";
import type { SeasonStat, SeasonStatMetricValue, SportMetricDef, TeamBenchmark } from "@/types";

// Радар по умолчанию: оси каталога on_radar_default с данными. Если таких
// меньше RADAR_MIN_DEFAULT (у записи заполнена только часть каталога),
// добираем другими заполненными показателями до RADAR_TARGET, в порядке
// категорий: иначе из 8 стандартных осей остаётся 3-4, и радар вырождается
// в треугольник или ромб.
const RADAR_MIN_DEFAULT = 6;
const RADAR_TARGET = 8;

function defaultRadarKeys(filledDefs: SportMetricDef[]): Set<string> {
  const keys = filledDefs.filter((d) => d.on_radar_default).map((d) => d.key);
  if (keys.length < RADAR_MIN_DEFAULT) {
    for (const d of filledDefs) {
      if (keys.length >= RADAR_TARGET) break;
      if (!keys.includes(d.key)) keys.push(d.key);
    }
  }
  return new Set(keys);
}

// Запасной порог, если ориентир команды не загрузился; источник правды:
// backend MIN_RELIABLE_MINUTES, приходит в TeamBenchmark.min_minutes
const FALLBACK_MIN_MINUTES = 450;

function fmt(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

function Kpi({
  value,
  label,
  per90,
  bench,
}: {
  value: React.ReactNode;
  label: string;
  per90?: number | null;
  bench?: number | null;
}) {
  return (
    <div className="bg-[var(--surface-muted)] border border-[var(--border)] px-4 py-3.5 flex flex-col">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-faint)]">{label}</span>
      <span className="mt-1 text-[28px] leading-none font-semibold text-[var(--text)] tabular-nums">{value}</span>
      {per90 !== undefined && per90 !== null && (
        <span className="mt-2 text-xs tabular-nums">
          <span className="text-[var(--accent)] font-medium">{per90.toFixed(2)}/90</span>
          {bench !== undefined && bench !== null && (
            <span className="text-[var(--text-faint)]"> · команда {bench.toFixed(2)}</span>
          )}
        </span>
      )}
    </div>
  );
}

// Строка метрики: полоска относительно потолка оси (radar_max) и риска
// медианы команды. Полоска нейтральная, без светофора: «больше» не везде
// значит «лучше» (выносы у нападающего, например).
function MetricRow({
  def,
  metric,
  bench,
}: {
  def: SportMetricDef | undefined;
  metric: SeasonStatMetricValue;
  bench: number | null;
}) {
  const isPercent = def?.unit === "percent";
  const shown = isPercent ? metric.pct : metric.per_90;
  const max = def?.radar_max ?? null;
  const frac = shown !== null && max ? Math.min(1, shown / max) : null;
  const benchFrac = bench !== null && max ? Math.min(1, bench / max) : null;

  return (
    <div className="py-3 border-b border-[var(--border)] last:border-b-0">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-[var(--text-muted)]">{metricText(metric.key)}</span>
        <span className="tabular-nums whitespace-nowrap">
          {shown !== null && (
            <span className="text-[var(--text)] font-semibold">
              {isPercent ? formatAxisValue(shown, true) : `${shown.toFixed(2)}/90`}
            </span>
          )}
          <span className="text-[var(--text-faint)]"> · {fmt(metric.value)}</span>
        </span>
      </div>
      {frac !== null && (
        <div className="relative mt-2.5 h-1.5 bg-[var(--surface-muted)]">
          <div className="absolute inset-y-0 left-0 bg-[var(--accent)]" style={{ width: `${frac * 100}%` }} />
          {benchFrac !== null && (
            <div
              className="absolute -top-1 -bottom-1 w-0.5 bg-[var(--text-muted)]"
              style={{ left: `calc(${benchFrac * 100}% - 1px)` }}
              title={`Медиана команды: ${formatAxisValue(bench!, isPercent)}`}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Отклонения от медианы команды по осям радара: самые заметные «выше» и
// «ниже». Формулировка нейтральная, без «сильно/слабо»: больше не всегда
// лучше, решает тренер.
function Deviations({ axes }: { axes: RadarAxis[] }) {
  const deltas = axes
    .filter((a) => a.benchmark !== null && a.benchmark > 0)
    .map((a) => ({ axis: a, delta: a.value / a.benchmark! - 1 }))
    .filter((d) => Math.abs(d.delta) >= 0.05);
  const above = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const below = deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
  if (above.length === 0 && below.length === 0) return null;

  const row = ({ axis, delta }: { axis: RadarAxis; delta: number }) => (
    <li key={axis.key} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
      <span className="text-[var(--text-muted)]">{radarAxisText(axis.key)}</span>
      <span className="tabular-nums whitespace-nowrap">
        <span className="font-semibold text-[var(--text)]">
          {delta > 0 ? "+" : "−"}
          {Math.round(Math.abs(delta) * 100)}%
        </span>
        <span className="text-[var(--text-faint)]">
          {" "}
          · {formatAxisValue(axis.value, axis.isPercent)} vs {formatAxisValue(axis.benchmark!, axis.isPercent)}
        </span>
      </span>
    </li>
  );

  return (
    <div className="border border-[var(--border)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text)]">Относительно команды</h3>
      <p className="text-[11px] text-[var(--text-faint)] mt-0.5">Показатели радара против медианы состава</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]">Выше медианы</p>
          {above.length > 0 ? (
            <ul className="divide-y divide-[var(--border)]">{above.map(row)}</ul>
          ) : (
            <p className="py-1.5 text-xs text-[var(--text-faint)]">Нет</p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">Ниже медианы</p>
          {below.length > 0 ? (
            <ul className="divide-y divide-[var(--border)]">{below.map(row)}</ul>
          ) : (
            <p className="py-1.5 text-xs text-[var(--text-faint)]">Нет</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function SeasonStatCard({
  athleteId,
  entry,
  defs,
  benchmark,
  canEdit,
  readOnly = false,
}: {
  athleteId: string;
  entry: SeasonStat;
  defs: SportMetricDef[];
  benchmark: TeamBenchmark | null;
  canEdit: boolean;
  // Сумма турниров сезона (sumTournaments): не настоящая запись БД (id
  // начинается с "__all_tournaments__"), правка и удаление для неё не имеют
  // смысла независимо от canEdit.
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const editable = canEdit && !readOnly;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const orderedDefs = orderDefs(defs);
  // Выбор показателей на радаре: предпочтение этого просмотра, не каталог.
  // Родитель передаёт key={entry.id}: при смене записи выбор сбрасывается на
  // значение по умолчанию (defaultRadarKeys).
  // В панели весь каталог спорта («N из 14» у любого игрока), незаполненные
  // в этой записи видны, но неактивны: иначе знаменатель скакал от игрока к
  // игроку («4 из 9», «5 из 11») и было непонятно, из чего выбор.
  const filledKeys = new Set(entry.metrics.map((m) => m.key));
  const catalogDefs = orderedDefs.filter((d) => d.radar_max);
  const filledDefs = catalogDefs.filter((d) => filledKeys.has(d.key));
  const [radarKeys, setRadarKeys] = useState<Set<string>>(() => defaultRadarKeys(filledDefs));
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
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/season-stats/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Не удалось удалить");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (editing) {
    return <SeasonStatForm athleteId={athleteId} sport={entry.sport} defs={defs} initial={entry} onClose={() => setEditing(false)} />;
  }

  const core = coreText(entry.sport);
  const minMinutes = benchmark?.min_minutes ?? FALLBACK_MIN_MINUTES;
  const lowMinutes = entry.minutes > 0 && entry.minutes < minMinutes;
  const hasBench = (benchmark?.metrics.length ?? 0) > 0;
  const benchByKey = new Map((benchmark?.metrics ?? []).map((m) => [m.key, m]));

  const defsByKey = new Map(orderedDefs.map((d) => [d.key, d]));
  const metricsByCategory = new Map<string, SeasonStatMetricValue[]>();
  for (const def of orderedDefs) {
    const metric = entry.metrics.find((m) => m.key === def.key);
    if (!metric) continue;
    const list = metricsByCategory.get(def.category_key) ?? [];
    list.push(metric);
    metricsByCategory.set(def.category_key, list);
  }
  const axes = computeRadarAxes(entry, orderedDefs, radarKeys, benchmark);

  return (
    <Card className="p-0!">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--border)]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text)] truncate">
            {entry.competition ?? "Без турнира"}
          </p>
          <p className="text-xs text-[var(--text-faint)] truncate">
            {entry.team_label} · сезон {entry.season}
          </p>
        </div>
        {editable && (
          <div className="flex items-center gap-3 shrink-0 text-xs">
            {confirmingDelete ? (
              <>
                <span className="text-[var(--text-muted)]">Удалить запись?</span>
                <button
                  onClick={remove}
                  disabled={deleting}
                  className="font-medium text-[var(--risk)] hover:opacity-80 disabled:opacity-50"
                >
                  {deleting ? "Удаляем…" : "Да, удалить"}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Отмена
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                >
                  Изменить
                </button>
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="text-[var(--risk)] hover:opacity-80 transition-opacity"
                >
                  Удалить
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="px-5 pt-3 text-xs text-[var(--risk)]">{error}</p>}

      {lowMinutes && (
        <div className="mx-5 mt-4 px-3 py-2 text-xs border border-[var(--caution)] bg-[var(--caution-soft)] text-[var(--text)]">
          Мало игрового времени: {entry.minutes}′ из {minMinutes}′, нужных для надёжных показателей на 90 минут.
          Цифры ниже ориентировочные.
        </div>
      )}

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Радар */}
        <section className="border border-[var(--border)] p-4 flex flex-col min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)]">Профиль игрока</h3>
              <div className="mt-1.5 flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[var(--accent)]" /> Игрок, на 90 минут
                </span>
                {hasBench && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 border-t border-dashed border-[var(--text-muted)]" /> Медиана команды (
                    {benchmark!.players} игр.)
                  </span>
                )}
              </div>
            </div>
            {catalogDefs.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setPanelOpen((v) => !v)}
                  className="h-8 px-2.5 text-xs font-medium border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] flex items-center gap-1.5 hover:border-[var(--accent)] transition-colors"
                >
                  Показатели{" "}
                  <span className="text-[var(--text-faint)] tabular-nums">
                    {radarKeys.size} из {catalogDefs.length}
                  </span>
                </button>
                {panelOpen && (
                  <div
                    ref={panelRef}
                    className="absolute top-9 right-0 z-10 w-64 max-h-80 overflow-y-auto bg-[var(--surface)] border border-[var(--border-strong)] shadow-lg"
                  >
                    {catalogDefs.map((d) => {
                      const filled = filledKeys.has(d.key);
                      return (
                        <label
                          key={d.key}
                          className={`flex items-center gap-2 px-2.5 py-1.5 text-xs border-b border-[var(--border)] last:border-b-0 ${
                            !filled
                              ? "text-[var(--text-faint)] opacity-60 cursor-not-allowed"
                              : radarKeys.has(d.key)
                                ? "text-[var(--text)] cursor-pointer"
                                : "text-[var(--text-muted)] cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={filled && radarKeys.has(d.key)}
                            disabled={!filled}
                            onChange={() => toggleRadarKey(d.key)}
                            className="accent-[var(--accent)] w-3.5 h-3.5"
                          />
                          <span className="flex-1">
                            {metricText(d.key)}{" "}
                            <span className="text-[var(--text-faint)]">· {categoryText(d.category_key)}</span>
                          </span>
                          {!filled && <span className="text-[10px] text-[var(--text-faint)]">нет данных</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center mt-2">
            {axes.length >= MIN_RADAR_AXES ? (
              <div className="w-full max-w-[540px]">
                <SeasonStatRadar axes={axes} dimmed={lowMinutes} />
              </div>
            ) : (
              <p className="py-16 text-center text-xs text-[var(--text-faint)] max-w-[260px]">
                {filledDefs.length < MIN_RADAR_AXES
                  ? "Для радара нужно минимум 3 заполненных показателя: добавьте детализацию в записи сезона."
                  : `Выберите минимум ${MIN_RADAR_AXES} показателя в «Показателях», сейчас ${axes.length}.`}
              </p>
            )}
          </div>
        </section>

        {/* Ядро сезона */}
        <section className="flex flex-col gap-3 min-w-0">
          <div className="grid grid-cols-2 gap-3">
            <Kpi value={entry.matches} label="Матчи" />
            <Kpi value={`${entry.minutes}′`} label="Минуты" />
            <Kpi value={entry.score} label={core.score} per90={entry.score_per_90} bench={benchmark?.score_per_90} />
            <Kpi
              value={entry.assists}
              label={core.assists}
              per90={entry.assists_per_90}
              bench={benchmark?.assists_per_90}
            />
            <Kpi value={entry.penalty_minor} label={core.penaltyMinor} />
            <Kpi value={entry.penalty_major} label={core.penaltyMajor} />
          </div>
          {hasBench && <Deviations axes={axes} />}
          {!hasBench && benchmark && (
            <p className="text-[11px] text-[var(--text-faint)]">
              Сравнение с командой появится, когда наберётся минимум 3 игрока с {benchmark.min_minutes}′ за сезон
              (сейчас {benchmark.players}).
            </p>
          )}
        </section>
      </div>

      {entry.metrics.length === 0 ? (
        <p className="px-5 pb-5 text-xs text-[var(--text-faint)]">
          Детализация по ударам, пасам и единоборствам не заполнена.
        </p>
      ) : (
        <div className="grid gap-x-10 gap-y-8 mx-5 mb-6 pt-6 border-t border-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
          {orderCategories([...metricsByCategory.keys()]).map((category) => (
            <div key={category}>
              <p className="text-[11px] font-medium text-[var(--text-faint)] uppercase tracking-[0.08em] mb-1.5">
                {categoryText(category)}
              </p>
              {metricsByCategory.get(category)!.map((m) => {
                const def = defsByKey.get(m.key);
                const bench = benchByKey.get(m.key);
                const benchValue = (def?.unit === "percent" ? bench?.pct : bench?.per_90) ?? null;
                return <MetricRow key={m.key} def={def} metric={m} bench={benchValue} />;
              })}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
