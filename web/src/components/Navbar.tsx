import Link from "next/link";

import { LogoutButton } from "@/components/LogoutButton";
import type { GlobalRole } from "@/types";

const roleLabel: Record<GlobalRole, string> = {
  admin: "Администратор",
  staff: "Тренер/врач",
  player: "Игрок",
};

export function Navbar({ name, role }: { name: string; role: GlobalRole }) {
  return (
    <nav className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3 flex items-center justify-between">
      <Link href="/teams" className="text-base font-semibold tracking-tight text-[var(--text)]">
        player.pro <span className="text-[var(--text-faint)] font-normal">· штаб</span>
      </Link>
      <div className="flex items-center gap-4">
        <span className="text-sm text-[var(--text-muted)]">
          {name} · {roleLabel[role]}
        </span>
        <LogoutButton />
      </div>
    </nav>
  );
}
