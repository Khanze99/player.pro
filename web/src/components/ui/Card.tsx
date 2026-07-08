interface Props {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = "", onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 ${onClick ? "cursor-pointer hover:border-[var(--accent)] transition-colors" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
