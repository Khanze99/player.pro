"use client";

import { useState } from "react";

import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { Tag } from "@/components/ui/Tag";
import { formatDate } from "@/lib/format";
import type { RpeEntry } from "@/types";

// История оценок нагрузки после тренировок (раздел 6.1 ТЗ) — до сих пор на
// экране игрока была только сумма (LoadChart, AU за неделю), не сами оценки.
// RPE намеренно не подсвечиваем цветом по зоне: высокий RPE в день матча —
// это норма, а не «плохое» значение, в отличие от критериев wellness-опроса.
// Весь период уже загружен сервером — «показать ещё» раскрывает загруженное.

const PAGE_SIZE = 10;

export function RpeHistoryTable({ entries }: { entries: RpeEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const [visible, setVisible] = useState(PAGE_SIZE);

  if (sorted.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Оценок нагрузки пока нет</p>;
  }

  const shown = sorted.slice(0, visible);

  return (
    <div>
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-sm border-collapse min-w-[480px]">
          <thead>
            <tr className="text-left text-[11px] text-[var(--text-faint)] uppercase tracking-wide">
              <th className="px-3 py-1.5 font-medium">Дата</th>
              <th className="px-1 py-1.5 font-medium text-center">RPE</th>
              <th className="px-1 py-1.5 font-medium text-center">Длительность</th>
              <th className="px-1 py-1.5 font-medium text-center">Нагрузка, AU</th>
              <th className="px-1 py-1.5 font-medium text-center">Перфоманс</th>
              <th className="px-3 py-1.5 font-medium">Флаги</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((entry) => (
              <tr key={entry.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-1.5 text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                  {formatDate(entry.date)}
                </td>
                <td className="px-1 py-1.5 text-center font-semibold tabular-nums text-[var(--text)]">
                  {entry.exertion}
                </td>
                <td className="px-1 py-1.5 text-center tabular-nums text-[var(--text-muted)]">
                  {entry.duration_min} мин
                </td>
                <td className="px-1 py-1.5 text-center font-semibold tabular-nums text-[var(--text)]">
                  {entry.session_load}
                </td>
                <td className="px-1 py-1.5 text-center tabular-nums text-[var(--text-muted)]">
                  {entry.performance}
                </td>
                <td className="px-3 py-1.5">{entry.is_late && <Tag color="var(--caution)">поздно</Tag>}</td>
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
