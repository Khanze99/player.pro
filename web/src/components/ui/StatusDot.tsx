import type { StatusColor } from "@/types";

const colorMap: Record<StatusColor, string> = {
  green: "bg-[var(--green)]",
  yellow: "bg-[var(--yellow)]",
  red: "bg-[var(--red)]",
};

const labelMap: Record<StatusColor, string> = {
  green: "Норма",
  yellow: "Внимание",
  red: "Критично",
};

interface Props {
  status: StatusColor | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const sizeMap = { sm: "w-2.5 h-2.5", md: "w-3.5 h-3.5", lg: "w-5 h-5" };

export function StatusDot({ status, size = "md", showLabel = false }: Props) {
  if (!status) {
    return (
      <div className="flex items-center gap-2">
        <div className={`${sizeMap[size]} rounded-full bg-[var(--border)]`} />
        {showLabel && <span className="text-[var(--text-muted)] text-sm">Нет данных</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className={`${sizeMap[size]} rounded-full ${colorMap[status]} shadow-[0_0_6px_1px] shadow-current`} />
      {showLabel && <span className="text-sm text-[var(--text-muted)]">{labelMap[status]}</span>}
    </div>
  );
}
