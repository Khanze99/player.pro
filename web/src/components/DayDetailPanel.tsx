"use client";

// Веб-версия mobile/src/app/athlete/[id]/index.tsx (секции «Самочувствие» / «Карта
// боли» / «Травма / недомогание» / «Восстановительные процедуры» / «Комментарий») —
// см. docs/plan-web-day-detail.md. Данные уже загружены сервером целиком
// (athletes/[athleteId]/page.tsx передаёт весь wellnessHistory), поэтому в отличие
// от ReadinessBreakdownPanel здесь нет ни useEffect, ни повторных запросов —
// выбор дня просто переключает элемент уже имеющегося массива.

import { useMemo, useState } from "react";

import { BodyMapView } from "@/components/BodyMapView";
import { Card } from "@/components/ui/Card";
import {
  INJURY_TYPE_LABEL,
  RECOVERY_METHOD_LABEL,
  regionLabel,
  SIDE_LABEL,
  severityColor,
  SYMPTOM_TYPE_LABEL,
} from "@/lib/bodyMap";
import { formatDate } from "@/lib/format";
import { wellnessZone } from "@/lib/wellness";
import { zoneColorVar } from "@/lib/zone";
import type { ReadinessComponent, WellnessEntry } from "@/types";

const SCALE_ROWS: { key: ReadinessComponent["key"]; label: string }[] = [
  { key: "sleep_quality", label: "Сон" },
  { key: "energy", label: "Энергия" },
  { key: "mood", label: "Настроение" },
  { key: "stress", label: "Стресс" },
  { key: "soreness", label: "Боль" },
];

export function DayDetailPanel({
  entries,
  initialDate,
}: {
  entries: WellnessEntry[];
  initialDate: string | null;
}) {
  const sorted = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const defaultDate = (initialDate && sorted.some((e) => e.date === initialDate) ? initialDate : sorted[0]?.date) ?? null;
  const [date, setDate] = useState<string | null>(defaultDate);

  if (sorted.length === 0) {
    return (
      <Card>
        <h2 className="font-medium text-[var(--text)] mb-1">День целиком</h2>
        <p className="text-sm text-[var(--text-muted)]">Опрос за этот день не заполнен</p>
      </Card>
    );
  }

  const entry = sorted.find((e) => e.date === date) ?? sorted[0];

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-medium text-[var(--text)]">День целиком</h2>
        <select
          value={entry.date}
          onChange={(e) => setDate(e.target.value)}
          className="text-xs font-medium px-2 py-1 rounded-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
        >
          {sorted.map((e) => (
            <option key={e.id} value={e.date}>
              {formatDate(e.date)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-6">
        <section>
          <h3 className="text-sm text-[var(--text-muted)] mb-2">Самочувствие</h3>
          <div className="space-y-2">
            {SCALE_ROWS.map((row) => {
              const value = entry[row.key];
              const color = zoneColorVar(wellnessZone(row.key, value));
              return (
                <div key={row.key} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-[var(--text-muted)] shrink-0">{row.label}</span>
                  <div className="flex-1 h-2 bg-[var(--surface-muted)] overflow-hidden">
                    <div className="h-full" style={{ width: `${((value - 1) / 9) * 100}%`, backgroundColor: color }} />
                  </div>
                  <span className="w-6 text-right text-sm font-semibold tabular-nums" style={{ color }}>
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-6 mt-3 pt-3 border-t border-[var(--border)]">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Сон, ч</p>
              <p className="text-sm font-medium text-[var(--text)]">{entry.sleep_hours ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Пульс покоя</p>
              <p className="text-sm font-medium text-[var(--text)]">{entry.resting_hr ?? "—"}</p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm text-[var(--text-muted)] mb-2">Карта боли</h3>
          <BodyMapView points={entry.pain_points} />
          {entry.pain_points.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] mt-2">Ничего не отмечено</p>
          ) : (
            <div className="space-y-2 mt-3">
              {entry.pain_points.map((p, i) => (
                <div key={`${p.region}:${p.side}:${i}`} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--text)]">
                      {regionLabel(p.region)} <span className="text-[var(--text-muted)]">· {SIDE_LABEL[p.side]}</span>
                    </p>
                    {p.note && <p className="text-xs italic text-[var(--text-muted)]">«{p.note}»</p>}
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: severityColor(p.severity) }}>
                    {p.severity} / 10
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm text-[var(--text-muted)] mb-2">Травма / недомогание</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {entry.injury ? (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--risk-soft)] text-[var(--risk)]">
                  {entry.injury_type ? INJURY_TYPE_LABEL[entry.injury_type] : "Травма"}
                </span>
              ) : (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--no-data-soft)] text-[var(--no-data)]">
                  Травмы нет
                </span>
              )}
              {entry.injury_details && <p className="text-sm text-[var(--text-muted)]">{entry.injury_details}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {entry.symptom ? (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--caution-soft)] text-[var(--caution)]">
                  {entry.symptom_type ? SYMPTOM_TYPE_LABEL[entry.symptom_type] : "Недомогание"}
                </span>
              ) : (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--no-data-soft)] text-[var(--no-data)]">
                  Недомогания нет
                </span>
              )}
              {entry.symptom_details && <p className="text-sm text-[var(--text-muted)]">{entry.symptom_details}</p>}
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm text-[var(--text-muted)] mb-2">Восстановительные процедуры</h3>
          {entry.recovery_methods.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Процедур не было</p>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {entry.recovery_methods.map((m) => (
                <span
                  key={m}
                  className="text-xs font-medium px-2.5 py-1 rounded-sm bg-[var(--surface-muted)] text-[var(--text)]"
                >
                  {RECOVERY_METHOD_LABEL[m]}
                </span>
              ))}
            </div>
          )}
        </section>

        {entry.comment && (
          <section>
            <h3 className="text-sm text-[var(--text-muted)] mb-2">Комментарий игрока</h3>
            <p className="text-sm italic text-[var(--text)] leading-relaxed">{entry.comment}</p>
          </section>
        )}
      </div>
    </Card>
  );
}
