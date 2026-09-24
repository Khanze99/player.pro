import type { Zone } from "@/types";

// Цвет — вторичный канал. showLabel по умолчанию true: --caution (жёлтый) даёт
// CVD-разделение в «floor band» (см. плату validate_palette.js в dataviz-скилле)
// — легально только вместе с текстовой подписью, поэтому не полагаемся на точку
// в одиночку нигде, где это не оговорено явно (numericAdjacent).
const colorVar: Record<Zone | "no_data", string> = {
  green: "var(--good)",
  yellow: "var(--caution)",
  red: "var(--risk)",
  no_data: "var(--no-data)",
};

const labelText: Record<Zone | "no_data", string> = {
  green: "Норма",
  yellow: "Внимание",
  red: "Критично",
  no_data: "Нет данных",
};

const sizePx: Record<"sm" | "md" | "lg", number> = { sm: 8, md: 10, lg: 14 };

interface Props {
  zone: Zone | null | undefined;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  /** true — рядом уже стоит число/текст, объясняющий зону (напр. балл Readiness);
   * тогда точку можно оставить без showLabel и без второго нарушения "цвет-соло". */
  numericAdjacent?: boolean;
}

export function StatusDot({ zone, size = "md", showLabel = true, numericAdjacent = false }: Props) {
  const key = zone ?? "no_data";
  const px = sizePx[size];

  if (!showLabel && !numericAdjacent) {
    // Явной подписи нет и рядом нет числа — не даём молча уйти в цвет-соло.
    showLabel = true;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block rounded-full shrink-0"
        style={{ width: px, height: px, backgroundColor: colorVar[key] }}
      />
      {showLabel && <span className="text-sm text-[var(--text-muted)]">{labelText[key]}</span>}
    </span>
  );
}
