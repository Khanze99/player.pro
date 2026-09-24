interface Props {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: Props) {
  return (
    <div
      className={`bg-[var(--surface)] border border-[var(--border)] p-5 ${className}`}
    >
      {children}
    </div>
  );
}
