"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";
import { Navbar } from "@/components/Navbar";
import { StatusDot } from "@/components/ui/StatusDot";
import { Card } from "@/components/ui/Card";
import type { PlayerStatus, StatusColor } from "@/types";

type Filter = "all" | StatusColor | "missing";

export default function CoachDashboard() {
  const router = useRouter();
  const [players, setPlayers] = useState<PlayerStatus[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user) { router.push("/login"); return; }
    if (user.role !== "coach" && user.role !== "admin") { router.push("/login"); return; }
    if (!user.team_id) { setLoading(false); return; }

    api.teamDashboard(user.team_id, token)
      .then(setPlayers)
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  const filtered = players.filter((p) => {
    if (filter === "all") return true;
    if (filter === "missing") return !p.filled_today;
    return p.status === filter;
  });

  const counts = {
    green: players.filter((p) => p.status === "green").length,
    yellow: players.filter((p) => p.status === "yellow").length,
    red: players.filter((p) => p.status === "red").length,
    missing: players.filter((p) => !p.filled_today).length,
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[var(--text-muted)]">Загрузка...</div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Команда</h1>
            <p className="text-[var(--text-muted)] text-sm mt-0.5">{today} · {players.length} игроков</p>
          </div>
        </div>

        {/* Сводка */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {([
            { key: "green", label: "Норма", color: "var(--green)" },
            { key: "yellow", label: "Внимание", color: "var(--yellow)" },
            { key: "red", label: "Критично", color: "var(--red)" },
            { key: "missing", label: "Не заполнили", color: "var(--text-muted)" },
          ] as const).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setFilter(filter === key ? "all" : key)}
              className={`bg-[var(--bg-card)] border rounded-xl p-4 text-left transition-colors ${filter === key ? "border-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--text-muted)]"}`}
            >
              <div className="text-2xl font-bold" style={{ color }}>{counts[key]}</div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">{label}</div>
            </button>
          ))}
        </div>

        {/* Фильтр */}
        {filter !== "all" && (
          <button onClick={() => setFilter("all")} className="mb-4 text-xs text-[var(--accent)] hover:underline">
            ← Показать всех
          </button>
        )}

        {/* Сетка игроков */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((p) => (
            <Card key={p.player_id} className="relative">
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs text-[var(--text-muted)] font-mono">#{p.jersey_number ?? "—"}</span>
                <StatusDot status={p.status} size="sm" />
              </div>
              <div className="text-sm font-medium leading-tight">{p.full_name}</div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">{p.position ?? "—"}</div>
              <div className="mt-3 flex items-center gap-1.5">
                {p.filled_today
                  ? <span className="text-[10px] text-[var(--green)] bg-[var(--green)]/10 px-1.5 py-0.5 rounded-full">Заполнил</span>
                  : <span className="text-[10px] text-[var(--text-muted)] bg-[var(--border)] px-1.5 py-0.5 rounded-full">Не заполнил</span>
                }
              </div>
            </Card>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-[var(--text-muted)] mt-16">Нет игроков в этой категории</p>
        )}
      </main>
    </div>
  );
}
