// Цикл в отчёте штаба — минимальный трекинг (решение 2026-10-16,
// docs/plan-women-health-nutrition.md): только отметка дня + болевой порог.
// Спецкатегория, читается через ensure_can_view_sensitive. Без согласия игрока
// api.cycleAthleteState возвращает null (403 съеден на сервере, см. lib/api.ts) —
// секция тогда просто не рисуется, без ошибки на странице. Не рисуем секцию
// вообще, если сегодня не отмечены месячные — нечего показывать.
// Не клиентский компонент: данных мало, взаимодействия нет.

import { Card } from "@/components/ui/Card";
import type { CycleStaffView } from "@/types";

export function CycleCard({ data }: { data: CycleStaffView | null }) {
  if (!data || !data.on_period) return null;

  return (
    <Card>
      <h2 className="font-medium text-[var(--text)] mb-4">Цикл</h2>
      <div className="space-y-3">
        <span className="inline-block text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--risk-soft)] text-[var(--risk)]">
          Сегодня месячные
        </span>
        {data.pain_level !== null && (
          <p className="text-sm text-[var(--text-muted)]">Болевой порог: {data.pain_level} / 10</p>
        )}
      </div>
    </Card>
  );
}
