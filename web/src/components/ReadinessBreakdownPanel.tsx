"use client";

// Веб-версия mobile/src/components/ReadinessBreakdownCard.tsx +
// ReadinessBreakdownSection.tsx — та же логика (бар по normalized, не по deficit;
// см. разбор в переписке про «10 как 1»), тот же порядок строк (сервер уже
// сортирует по deficit), белая палитра вместо тёмной.

import { useEffect, useState } from "react";

import { Card } from "@/components/ui/Card";
import type { ReadinessBreakdown, ReadinessBreakdownAverage, ReadinessComponent } from "@/types";
import { zoneFromNormalized } from "@/lib/wellness";
import { zoneColorVar } from "@/lib/zone";

const WINDOWS = ["day", 7, 28] as const;
type Window = (typeof WINDOWS)[number];

const componentLabel: Record<ReadinessComponent["key"], string> = {
  sleep_quality: "Сон",
  energy: "Энергия",
  mood: "Настроение",
  soreness: "Боль",
  stress: "Стресс",
};

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function ReadinessBreakdownPanel({
  athleteId,
  latestDate,
}: {
  athleteId: string;
  latestDate: string | null;
}) {
  const [windowSize, setWindowSize] = useState<Window>("day");
  const [day, setDay] = useState<ReadinessBreakdown | null>(null);
  const [average, setAverage] = useState<ReadinessBreakdownAverage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!latestDate) return;
    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        const query = windowSize === "day" ? `day=${latestDate}` : `days=${windowSize}`;
        const res = await fetch(`/api/athletes/${athleteId}/readiness-breakdown?${query}`);
        const data = res.ok ? await res.json() : null;
        if (cancelled) return;
        if (windowSize === "day") setDay(data);
        else setAverage(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [athleteId, latestDate, windowSize]);

  if (!latestDate) {
    return (
      <Card>
        <p className="text-[var(--text-muted)] text-sm">Нет опросов — разбивка появится после первого.</p>
      </Card>
    );
  }

  const components = windowSize === "day" ? day?.components : average?.components;
  const score = windowSize === "day" ? day?.score : average?.avg_score;
  const zone = windowSize === "day" ? day?.zone : undefined;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-medium text-[var(--text)]">Из чего складывается балл</h2>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindowSize(w)}
              className="text-xs font-medium px-2.5 py-1 rounded-sm transition-colors"
              style={{
                backgroundColor: windowSize === w ? "var(--accent)" : "var(--surface-muted)",
                color: windowSize === w ? "white" : "var(--text-muted)",
              }}
            >
              {w === "day" ? "День" : `${w} дн.`}
            </button>
          ))}
        </div>
      </div>

      {loading && !components ? (
        <p className="text-sm text-[var(--text-faint)]">Загрузка…</p>
      ) : !components || components.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {windowSize === "day" ? "Нет опроса за этот день" : "Недостаточно данных за период"}
        </p>
      ) : (
        <div className="space-y-3">
          {score !== undefined && score !== null && (
            <p className="text-3xl font-semibold" style={{ color: zoneColorVar(zone ?? null) }}>
              {Math.round(score)}
            </p>
          )}
          {components.map((c) => {
            const color = zoneColorVar(zoneFromNormalized(c.normalized));
            const width = Math.max(4, c.normalized);
            return (
              <div key={c.key} className="flex items-center gap-3">
                <span className="w-20 text-sm text-[var(--text-muted)] shrink-0">{componentLabel[c.key]}</span>
                <div className="flex-1 h-2 bg-[var(--surface-muted)] overflow-hidden">
                  <div className="h-full" style={{ width: `${width}%`, backgroundColor: color }} />
                </div>
                <span className="w-8 text-right text-sm font-semibold tabular-nums" style={{ color }}>
                  {formatValue(c.value)}
                </span>
              </div>
            );
          })}
          {windowSize === "day" && day?.hr_flag && (
            <p className="text-xs pt-2 border-t border-[var(--border)] flex justify-between text-[var(--caution)]">
              <span>Пульс покоя выше нормы</span>
              <span className="font-semibold">{day.hr_modifier}</span>
            </p>
          )}
          {windowSize === "day" && (day?.injury || day?.symptom) && (
            <div className="flex gap-1.5 pt-1">
              {day.injury && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--risk-soft)] text-[var(--risk)]">
                  Травма
                </span>
              )}
              {day.symptom && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--risk-soft)] text-[var(--risk)]">
                  Недомогание
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
