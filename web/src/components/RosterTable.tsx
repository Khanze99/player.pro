"use client";

// Состав команды + перевод игроков в другую команду организации
// (docs/plan-player-transfer.md). Только игроки (athlete) — тренеров/врачей
// здесь не показываем и не переводим, это экран именно про состав игроков.
// Только admin — страница-обёртка уже это проверила (requireSession + гейт по
// роли), бэкенд перепроверяет сам (authz.require_org_admin_for_teams).
//
// Выбор множественный (чекбоксы), действие одно — внизу списка: выбрать
// команду-получателя и перевести всех отмеченных разом. Роль у перевода не
// спрашиваем: team_role в запросе не передаём, бэкенд сам сохраняет текущую
// (у всех в этом списке она и так athlete — teams_service.transfer_member).

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/format";
import type { Team, TeamMember } from "@/types";

export function RosterTable({
  teamId,
  members,
  otherTeams,
}: {
  teamId: string;
  members: TeamMember[];
  otherTeams: Team[];
}) {
  const router = useRouter();
  const athletes = members.filter((m) => m.team_role === "athlete");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toTeamId, setToTeamId] = useState(otherTeams[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function transferSelected() {
    if (selected.size === 0 || !toTeamId) return;
    setSubmitting(true);
    const nextErrors: Record<string, string> = {};
    const succeeded: string[] = [];

    // Последовательно, не параллельно: проще читать результат и не создаёт
    // гонку на составном PK (user_id, team_id) при двух переводах одного
    // игрока — тут это не нужно, но принцип «один перевод за раз» тот же.
    for (const userId of selected) {
      try {
        const res = await fetch(`/api/teams/${teamId}/members/${userId}/transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to_team_id: toTeamId, reason: reason || undefined }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.detail ?? "Не удалось перевести");
        succeeded.push(userId);
      } catch (err) {
        nextErrors[userId] = err instanceof Error ? err.message : "Ошибка";
      }
    }

    setSelected((prev) => {
      const next = new Set(prev);
      succeeded.forEach((id) => next.delete(id));
      return next;
    });
    setErrors(nextErrors);
    setSubmitting(false);
    if (succeeded.length > 0) {
      router.refresh();
    }
  }

  if (athletes.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[var(--text-muted)]">В команде пока нет игроков.</p>
      </Card>
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-[var(--border)]">
        {athletes.map((member) => (
          <li key={member.user_id} className="py-3 first:pt-0 flex items-center gap-3">
            <input
              type="checkbox"
              checked={selected.has(member.user_id)}
              onChange={() => toggle(member.user_id)}
              className="w-4 h-4 shrink-0"
            />
            <div className="flex-1">
              <p className="text-sm text-[var(--text)]">{member.name}</p>
              <p className="text-xs text-[var(--text-faint)]">в команде с {formatDate(member.since)}</p>
              {errors[member.user_id] && (
                <p className="text-xs text-[var(--risk)] mt-0.5">{errors[member.user_id]}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="pt-4 mt-1 border-t border-[var(--border)] space-y-3">
        {otherTeams.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            Нужна хотя бы вторая команда в организации, чтобы переводить игроков.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-[var(--text-muted)]">
                Перевести в команду
                <select
                  value={toTeamId}
                  onChange={(e) => setToTeamId(e.target.value)}
                  className="block border border-[var(--border-strong)] px-2 py-1.5 text-sm mt-0.5 bg-[var(--surface)] text-[var(--text)] min-w-[180px]"
                >
                  {otherTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-[var(--text-muted)] flex-1 min-w-[200px]">
                Причина (необязательно)
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Например: просмотр в основе"
                  maxLength={500}
                  className="block w-full border border-[var(--border-strong)] px-2 py-1.5 text-sm mt-0.5 bg-[var(--surface)] text-[var(--text)]"
                />
              </label>

              <button
                onClick={transferSelected}
                disabled={selected.size === 0 || submitting}
                className="text-sm font-medium px-3 py-1.5 bg-[var(--accent)] text-white disabled:opacity-50 shrink-0"
              >
                {submitting ? "Переводим…" : `Перевести (${selected.size})`}
              </button>
            </div>

            {selected.size > 0 && (
              <p className="text-xs text-[var(--risk)]">
                Выбранные игроки потеряют доступ к расписанию прежней команды, включая незаполненный
                RPE по прошедшим тренировкам. История опросов, RPE и показателей не изменится.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
