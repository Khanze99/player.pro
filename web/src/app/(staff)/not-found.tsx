import Link from "next/link";

// Рендерится внутри (staff)/layout.tsx (Navbar остаётся) при notFound() —
// напр. если ссылка на игрока устарела (make seed-reset меняет ID) или игрок
// удалён из состава. См. teams/[teamId]/athletes/[athleteId]/page.tsx.
export default function StaffNotFound() {
  return (
    <div className="text-center py-20">
      <p className="text-[var(--text)] font-medium">Не нашли эту страницу</p>
      <p className="text-[var(--text-muted)] text-sm mt-1">
        Игрок мог быть удалён из состава, либо ссылка устарела.
      </p>
      <Link href="/teams" className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] mt-4 inline-block">
        ← К списку команд
      </Link>
    </div>
  );
}
