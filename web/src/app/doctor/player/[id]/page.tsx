"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";
import { Navbar } from "@/components/Navbar";
import { StatusDot } from "@/components/ui/StatusDot";
import { Card } from "@/components/ui/Card";
import type { User, Questionnaire, MedicalClearance, MedicalNote } from "@/types";

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function ClearanceStatus({ clearance }: { clearance: MedicalClearance | undefined }) {
  if (!clearance) return <span className="text-xs text-[var(--text-muted)]">Нет данных</span>;
  const days = daysUntil(clearance.valid_until);
  if (days < 0) return <span className="text-xs text-[var(--red)]">Истёк {Math.abs(days)} дн. назад</span>;
  if (days <= 30) return <span className="text-xs text-[var(--yellow)]">Истекает через {days} дн.</span>;
  return <span className="text-xs text-[var(--green)]">Действует до {new Date(clearance.valid_until).toLocaleDateString("ru-RU")}</span>;
}

export default function PlayerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const playerId = params.id;

  const [player, setPlayer] = useState<User | null>(null);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [clearances, setClearances] = useState<MedicalClearance[]>([]);
  const [notes, setNotes] = useState<MedicalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"questionnaires" | "umo" | "notes">("questionnaires");

  // УМО форма
  const [umoForm, setUmoForm] = useState({ issued_date: "", valid_until: "", notes: "" });
  const [umoLoading, setUmoLoading] = useState(false);
  const [umoError, setUmoError] = useState("");

  // Заметки форма
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user || (user.role !== "doctor" && user.role !== "admin")) {
      router.push("/login");
      return;
    }

    Promise.all([
      api.player(playerId, token),
      api.playerQuestionnaires(playerId, token, 30),
      api.playerClearances(playerId, token),
      api.playerNotes(playerId, token),
    ]).then(([p, qs, cls, ns]) => {
      setPlayer(p);
      setQuestionnaires(qs);
      setClearances(cls);
      setNotes(ns);
    }).catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router, playerId]);

  async function submitClearance(e: FormEvent) {
    e.preventDefault();
    setUmoError("");
    setUmoLoading(true);
    const token = getToken()!;
    try {
      const created = await api.createClearance({
        player_id: playerId,
        issued_date: umoForm.issued_date,
        valid_until: umoForm.valid_until,
        notes: umoForm.notes || undefined,
      }, token);
      setClearances([created, ...clearances]);
      setUmoForm({ issued_date: "", valid_until: "", notes: "" });
    } catch (err: unknown) {
      setUmoError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setUmoLoading(false);
    }
  }

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setNoteLoading(true);
    const token = getToken()!;
    try {
      const created = await api.createNote({ player_id: playerId, content: noteText }, token);
      setNotes([created, ...notes]);
      setNoteText("");
    } finally {
      setNoteLoading(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[var(--text-muted)]">Загрузка...</div>;
  if (!player) return null;

  const latestQ = questionnaires[0];
  const latestClearance = clearances[0];

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Хлебные крошки */}
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mb-6">
          <Link href="/doctor/dashboard" className="hover:text-[var(--text)] transition-colors">Команда</Link>
          <span>/</span>
          <span className="text-[var(--text)]">{player.full_name}</span>
        </div>

        {/* Шапка игрока */}
        <div className="flex items-start gap-6 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center text-2xl font-bold text-[var(--text-muted)]">
            {player.jersey_number ?? "?"}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">{player.full_name}</h1>
            <p className="text-[var(--text-muted)] text-sm mt-0.5">{player.position ?? "Позиция не указана"}</p>
            <div className="flex items-center gap-4 mt-3">
              {latestQ
                ? <StatusDot status={latestQ.status} showLabel />
                : <span className="text-sm text-[var(--text-muted)]">Нет данных сегодня</span>
              }
              <span className="text-[var(--border)]">·</span>
              <ClearanceStatus clearance={latestClearance} />
            </div>
          </div>
        </div>

        {/* Вкладки */}
        <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
          {([
            { key: "questionnaires", label: "Анкеты" },
            { key: "umo", label: "УМО" },
            { key: "notes", label: "Заметки" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === key ? "text-[var(--accent)] border-[var(--accent)]" : "text-[var(--text-muted)] border-transparent hover:text-[var(--text)]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Анкеты */}
        {tab === "questionnaires" && (
          <div className="space-y-3">
            {questionnaires.length === 0 && <p className="text-[var(--text-muted)]">Нет данных за последние 30 дней</p>}
            {questionnaires.map((q) => (
              <Card key={q.id}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">{new Date(q.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span>
                  <StatusDot status={q.status} showLabel />
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { label: "Сон", value: q.sleep_quality },
                    { label: "Усталость", value: q.fatigue },
                    { label: "Мышцы", value: q.muscle_soreness },
                    { label: "Настроение", value: q.mood },
                    { label: "Стресс", value: q.stress },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <div className={`text-xl font-bold ${value >= 7 ? "text-[var(--green)]" : value >= 5 ? "text-[var(--yellow)]" : "text-[var(--red)]"}`}>
                        {value}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
                {(q.weight || q.rpe) && (
                  <div className="flex gap-4 mt-3 pt-3 border-t border-[var(--border)]">
                    {q.weight && <span className="text-xs text-[var(--text-muted)]">Вес: <span className="text-[var(--text)]">{q.weight} кг</span></span>}
                    {q.rpe && <span className="text-xs text-[var(--text-muted)]">RPE: <span className="text-[var(--text)]">{q.rpe}</span></span>}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* УМО */}
        {tab === "umo" && (
          <div className="space-y-4">
            {/* Форма добавления */}
            <Card>
              <h3 className="text-sm font-medium mb-4">Добавить запись УМО</h3>
              <form onSubmit={submitClearance} className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Дата выдачи</label>
                  <input
                    type="date"
                    value={umoForm.issued_date}
                    onChange={(e) => setUmoForm({ ...umoForm, issued_date: e.target.value })}
                    required
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Действует до</label>
                  <input
                    type="date"
                    value={umoForm.valid_until}
                    onChange={(e) => setUmoForm({ ...umoForm, valid_until: e.target.value })}
                    required
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Примечания</label>
                  <input
                    type="text"
                    value={umoForm.notes}
                    onChange={(e) => setUmoForm({ ...umoForm, notes: e.target.value })}
                    placeholder="Прошёл без замечаний..."
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>
                {umoError && <p className="col-span-2 text-xs text-[var(--red)]">{umoError}</p>}
                <button
                  type="submit"
                  disabled={umoLoading}
                  className="col-span-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  {umoLoading ? "Сохраняем..." : "Сохранить"}
                </button>
              </form>
            </Card>

            {/* История */}
            {clearances.map((c) => {
              const days = daysUntil(c.valid_until);
              return (
                <Card key={c.id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(c.issued_date).toLocaleDateString("ru-RU")} → {new Date(c.valid_until).toLocaleDateString("ru-RU")}
                      </p>
                      {c.notes && <p className="text-xs text-[var(--text-muted)] mt-1">{c.notes}</p>}
                    </div>
                    <div className="text-right">
                      {days < 0
                        ? <span className="text-xs font-medium text-[var(--red)]">Истёк</span>
                        : days <= 30
                        ? <span className="text-xs font-medium text-[var(--yellow)]">{days} дн.</span>
                        : <span className="text-xs font-medium text-[var(--green)]">Действует</span>
                      }
                    </div>
                  </div>
                </Card>
              );
            })}
            {clearances.length === 0 && <p className="text-[var(--text-muted)] text-sm">Записей УМО нет</p>}
          </div>
        )}

        {/* Заметки */}
        {tab === "notes" && (
          <div className="space-y-4">
            <Card>
              <h3 className="text-sm font-medium mb-3">Новая заметка</h3>
              <form onSubmit={submitNote} className="space-y-3">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Заметка видна только вам..."
                  rows={3}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
                />
                <button
                  type="submit"
                  disabled={noteLoading || !noteText.trim()}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {noteLoading ? "Сохраняем..." : "Сохранить"}
                </button>
              </form>
            </Card>

            {notes.map((n) => (
              <Card key={n.id}>
                <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-2">
                  {new Date(n.created_at).toLocaleString("ru-RU")}
                </p>
              </Card>
            ))}
            {notes.length === 0 && <p className="text-[var(--text-muted)] text-sm">Заметок нет</p>}
          </div>
        )}
      </main>
    </div>
  );
}
