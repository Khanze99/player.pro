"use client";

import { useState } from "react";

import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { Tag } from "@/components/ui/Tag";
import { formatDate } from "@/lib/format";
import { wellnessZone } from "@/lib/wellness";
import { zoneColorVar } from "@/lib/zone";
import type { ReadinessComponent, WellnessEntry } from "@/types";

// История ежедневных опросов игрока (не только «сегодня» — раздел 6.4 ТЗ).
// Только 5 критериев + пульс + булевы флаги травмы/недомогания — без описаний
// (WellnessEntry в types/index.ts сознательно уже полного WellnessOut, см. lib/api.ts).
// Весь период уже загружен сервером (athlete/page.tsx) — «показать ещё» просто
// раскрывает уже полученные строки, без повторных запросов.

const PAGE_SIZE = 10;

const COLUMNS: { key: ReadinessComponent["key"]; label: string }[] = [
  { key: "sleep_quality", label: "Сон" },
  { key: "energy", label: "Энергия" },
  { key: "mood", label: "Настрой" },
  { key: "stress", label: "Стресс" },
  { key: "soreness", label: "Боль" },
];

export function WellnessHistoryTable({ entries }: { entries: WellnessEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const [visible, setVisible] = useState(PAGE_SIZE);

  if (sorted.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Опросов пока нет</p>;
  }

  const shown = sorted.slice(0, visible);

  return (
    <div>
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-sm border-collapse min-w-[520px]">
          <thead>
            <tr className="text-left text-[11px] text-[var(--text-faint)] uppercase tracking-wide">
              <th className="px-3 py-1.5 font-medium">Дата</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-1 py-1.5 font-medium text-center">
                  {c.label}
                </th>
              ))}
              <th className="px-1 py-1.5 font-medium text-center">Пульс</th>
              <th className="px-3 py-1.5 font-medium">Флаги</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((entry) => (
              <tr key={entry.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-1.5 text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                  {formatDate(entry.date)}
                </td>
                {COLUMNS.map((c) => {
                  const value = entry[c.key];
                  const color = zoneColorVar(wellnessZone(c.key, value));
                  return (
                    <td key={c.key} className="px-1 py-1.5 text-center font-semibold tabular-nums" style={{ color }}>
                      {value}
                    </td>
                  );
                })}
                <td className="px-1 py-1.5 text-center tabular-nums text-[var(--text-muted)]">
                  {entry.resting_hr ?? "—"}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex gap-1.5">
                    {entry.injury && <Tag color="var(--risk)">травма</Tag>}
                    {entry.symptom && <Tag color="var(--caution)">недомогание</Tag>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible < sorted.length && (
        <LoadMoreButton remaining={sorted.length - visible} onClick={() => setVisible((v) => v + PAGE_SIZE)} />
      )}
    </div>
  );
}
