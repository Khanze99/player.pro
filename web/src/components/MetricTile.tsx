import { Card } from "@/components/ui/Card";
import { loadZoneText } from "@/lib/format";
import { zoneColorVar } from "@/lib/zone";
import type { MetricGauge } from "@/types";

interface Props {
  label: string;
  gauge: MetricGauge;
  format: (value: number) => string;
}

// Ключи distribution зависят от гейджа: green/yellow/red/no_data — у readiness/
// performance/availability, свои имена зон (optimal/overreaching/…) — у load.
const shortLabel: Record<string, string> = {
  green: "норма",
  yellow: "внимание",
  red: "критично",
  no_data: "нет данных",
};

function distributionLabel(zone: string): string {
  return shortLabel[zone] ?? loadZoneText(zone);
}

export function MetricTile({ label, gauge, format }: Props) {
  const distributionEntries = Object.entries(gauge.distribution).filter(([, count]) => count > 0);

  return (
    <Card>
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p className="text-3xl font-semibold mt-1" style={{ color: zoneColorVar(gauge.zone) }}>
        {gauge.value !== null ? format(gauge.value) : "—"}
      </p>
      <p className="text-xs text-[var(--text-faint)] mt-1">
        {gauge.covered}/{gauge.total} игроков
      </p>
      {distributionEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-[var(--border)]">
          {distributionEntries.map(([zone, count]) => (
            <span key={zone} className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  backgroundColor: zoneColorVar(zone as MetricGauge["zone"]),
                }}
              />
              {count} · {distributionLabel(zone)}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
