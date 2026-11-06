"use client";

// Форма добавления/редактирования сезона паспорта игрока
// (docs/plan-player-season-stats.md, «Веб-клиент») — core-блок фиксирован,
// секции метрик генерируются из каталога спорта (SportMetricDef[]), не
// хардкод полей под футбол. Обязательны только сезон/команда (как на
// бэкенде, SeasonStatCreateIn) — остальное опционально, часть тренеров не
// ведёт такую точность.

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { categoryText, metricText } from "@/lib/seasonStatLabels";
import type { SeasonStat, SeasonStatPayload, SportMetricDef } from "@/types";

type NumKey = "matches" | "minutes" | "score" | "assists" | "penalty_minor" | "penalty_major";

const NUM_FIELDS: { key: NumKey; label: string }[] = [
  { key: "matches", label: "Матчи" },
  { key: "minutes", label: "Минуты" },
  { key: "score", label: "Голы" },
  { key: "assists", label: "Голевые передачи" },
  { key: "penalty_minor", label: "Жёлтые карточки" },
  { key: "penalty_major", label: "Красные карточки" },
];

function groupByCategory(defs: SportMetricDef[]): { category: string; defs: SportMetricDef[] }[] {
  const byCategory = new Map<string, SportMetricDef[]>();
  for (const d of [...defs].sort((a, b) => a.sort_order - b.sort_order)) {
    const list = byCategory.get(d.category_key) ?? [];
    list.push(d);
    byCategory.set(d.category_key, list);
  }
  return [...byCategory.entries()].map(([category, catDefs]) => ({ category, defs: catDefs }));
}

interface Props {
  athleteId: string;
  defs: SportMetricDef[];
  initial?: SeasonStat;
  onClose: () => void;
}

export function SeasonStatForm({ athleteId, defs, initial, onClose }: Props) {
  const router = useRouter();
  const editing = initial !== undefined;

  const [season, setSeason] = useState(initial?.season ?? "");
  const [teamLabel, setTeamLabel] = useState(initial?.team_label ?? "");
  const [competition, setCompetition] = useState(initial?.competition ?? "");
  const [nums, setNums] = useState<Record<NumKey, string>>({
    matches: String(initial?.matches ?? 0),
    minutes: String(initial?.minutes ?? 0),
    score: String(initial?.score ?? 0),
    assists: String(initial?.assists ?? 0),
    penalty_minor: String(initial?.penalty_minor ?? 0),
    penalty_major: String(initial?.penalty_major ?? 0),
  });
  const initialValues: Record<string, string> = {};
  for (const m of initial?.metrics ?? []) initialValues[m.key] = String(m.value);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const groups = groupByCategory(defs);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const filledValues: Record<string, number> = {};
    for (const [key, raw] of Object.entries(values)) {
      if (raw.trim() === "") continue;
      const n = Number(raw);
      if (!Number.isNaN(n)) filledValues[key] = n;
    }

    const payload: SeasonStatPayload = {
      season,
      team_label: teamLabel,
      competition: competition.trim() === "" ? undefined : competition,
      matches: Number(nums.matches) || 0,
      minutes: Number(nums.minutes) || 0,
      score: Number(nums.score) || 0,
      assists: Number(nums.assists) || 0,
      penalty_minor: Number(nums.penalty_minor) || 0,
      penalty_major: Number(nums.penalty_major) || 0,
      values: filledValues,
    };

    try {
      const res = await fetch(editing ? `/api/season-stats/${initial.id}` : "/api/season-stats", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? payload : { ...payload, athlete_id: athleteId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? "Не удалось сохранить");
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-[var(--border)] bg-[var(--surface-muted)] p-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-[var(--text-muted)]">
          Сезон *
          <input
            required
            placeholder="2025/26"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            maxLength={16}
            className="block w-full border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-sm mt-0.5"
          />
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          Команда *
          <input
            required
            placeholder="Основа"
            value={teamLabel}
            onChange={(e) => setTeamLabel(e.target.value)}
            maxLength={128}
            className="block w-full border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-sm mt-0.5"
          />
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          Турнир
          <input
            placeholder="Первенство ..."
            value={competition}
            onChange={(e) => setCompetition(e.target.value)}
            maxLength={128}
            className="block w-full border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-sm mt-0.5"
          />
        </label>
      </div>

      <div className="grid gap-3 grid-cols-3 sm:grid-cols-6">
        {NUM_FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-[var(--text-muted)]">
            {f.label}
            <input
              type="number"
              min={0}
              value={nums[f.key]}
              onChange={(e) => setNums((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="block w-full border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-sm mt-0.5 tabular-nums"
            />
          </label>
        ))}
      </div>

      {groups.length > 0 && (
        <div className="space-y-3 pt-1 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--text-faint)] pt-3">Детализация — опционально, по наличию данных</p>
          {groups.map((g) => (
            <div key={g.category}>
              <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                {categoryText(g.category)}
              </p>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {g.defs.map((d) => (
                  <label key={d.key} className="text-xs text-[var(--text-muted)]">
                    {metricText(d.key)}
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={values[d.key] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [d.key]: e.target.value }))}
                      className="block w-full border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-sm mt-0.5 tabular-nums"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="text-sm font-medium px-3 py-1.5 bg-[var(--accent)] text-white disabled:opacity-50"
        >
          {submitting ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          Отмена
        </button>
        {error && <p className="text-xs text-[var(--risk)]">{error}</p>}
      </div>
    </form>
  );
}
