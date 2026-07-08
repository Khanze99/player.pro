"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";
import { Navbar } from "@/components/Navbar";
import { StatusDot } from "@/components/ui/StatusDot";
import type { PlayerStatus } from "@/types";

export default function DoctorDashboard() {
  const router = useRouter();
  const [players, setPlayers] = useState<PlayerStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user) { router.push("/login"); return; }
    if (user.role !== "doctor" && user.role !== "admin") { router.push("/login"); return; }
    if (!user.team_id) { setLoading(false); return; }

    api.teamDashboard(user.team_id, token)
      .then(setPlayers)
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[var(--text-muted)]">Загрузка...</div>;

  const redPlayers = players.filter((p) => p.status === "red");
  const expiringOrMissing = players.filter((p) => !p.filled_today);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-6">Обзор команды</h1>

        {/* Алерты */}
        {redPlayers.length > 0 && (
          <div className="mb-4 bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-xl p-4">
            <p className="text-sm text-[var(--red)] font-medium mb-2">
              Требуют внимания ({redPlayers.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {redPlayers.map((p) => (
                <Link
                  key={p.player_id}
                  href={`/doctor/player/${p.player_id}`}
                  className="text-xs bg-[var(--red)]/20 text-[var(--red)] px-2 py-1 rounded-full hover:bg-[var(--red)]/30 transition-colors"
                >
                  {p.full_name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Таблица */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left text-xs text-[var(--text-muted)] font-medium px-4 py-3">#</th>
                <th className="text-left text-xs text-[var(--text-muted)] font-medium px-4 py-3">Игрок</th>
                <th className="text-left text-xs text-[var(--text-muted)] font-medium px-4 py-3">Позиция</th>
                <th className="text-left text-xs text-[var(--text-muted)] font-medium px-4 py-3">Статус</th>
                <th className="text-left text-xs text-[var(--text-muted)] font-medium px-4 py-3">Анкета сегодня</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr
                  key={p.player_id}
                  className={`border-b border-[var(--border)] last:border-0 hover:bg-white/[0.02] transition-colors ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}
                >
                  <td className="px-4 py-3 text-sm text-[var(--text-muted)] font-mono">{p.jersey_number ?? "—"}</td>
                  <td className="px-4 py-3 text-sm font-medium">{p.full_name}</td>
                  <td className="px-4 py-3 text-sm text-[var(--text-muted)]">{p.position ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusDot status={p.status} showLabel />
                  </td>
                  <td className="px-4 py-3">
                    {p.filled_today
                      ? <span className="text-xs text-[var(--green)]">Заполнена</span>
                      : <span className="text-xs text-[var(--text-muted)]">Не заполнена</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/doctor/player/${p.player_id}`}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Открыть →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {players.length === 0 && (
            <p className="text-center text-[var(--text-muted)] py-12">Нет данных</p>
          )}
        </div>

        <p className="text-xs text-[var(--text-muted)] mt-3">
          {expiringOrMissing.length > 0 ? `${expiringOrMissing.length} игроков не заполнили анкету сегодня` : "Все заполнили анкету сегодня ✓"}
        </p>
      </main>
    </div>
  );
}
