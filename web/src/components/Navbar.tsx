"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearAuth, getUser } from "@/lib/auth";

export function Navbar() {
  const router = useRouter();
  const user = getUser();

  const roleLabel: Record<string, string> = {
    doctor: "Врач",
    coach: "Тренер",
    masseur: "Массажист",
    admin: "Администратор",
  };

  function logout() {
    clearAuth();
    router.push("/login");
  }

  const homeLink = user?.role === "doctor" ? "/doctor/dashboard" : "/coach/dashboard";

  return (
    <nav className="border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-3 flex items-center justify-between">
      <Link href={homeLink} className="text-lg font-semibold tracking-tight text-[var(--accent)]">
        player.pro
      </Link>
      <div className="flex items-center gap-4">
        {user && (
          <span className="text-sm text-[var(--text-muted)]">
            {user.full_name} · {roleLabel[user.role] ?? user.role}
          </span>
        )}
        <button
          onClick={logout}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          Выйти
        </button>
      </div>
    </nav>
  );
}
