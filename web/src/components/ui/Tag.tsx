export function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] font-medium px-1 py-px whitespace-nowrap"
      style={{ color, backgroundColor: "var(--surface-muted)" }}
    >
      {children}
    </span>
  );
}
