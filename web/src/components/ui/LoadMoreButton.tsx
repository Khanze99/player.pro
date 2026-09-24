export function LoadMoreButton({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full mt-2 py-1.5 text-xs font-medium text-[var(--accent)] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] transition-colors"
    >
      Показать ещё ({remaining})
    </button>
  );
}
