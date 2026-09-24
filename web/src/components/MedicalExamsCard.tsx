"use client";

// УМО/ТМО (docs/plan-medical-exams.md) — читает весь штаб с доступом к игроку,
// добавляет запись только врач (canEdit решается на странице по MeOut.teams,
// бэкенд всё равно перепроверяет сам через ensure_can_manage_medical_exams).

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Card } from "@/components/ui/Card";
import { formatDate, todayISO } from "@/lib/format";
import type { MedicalExam, MedicalExamKind, MedicalExams } from "@/types";

const KIND_LABEL: Record<MedicalExamKind, string> = { umo: "УМО", tmo: "ТМО" };

function isValid(exam: MedicalExam | null): boolean {
  return exam !== null && exam.valid_until >= todayISO();
}

function SummaryTile({ kind, exam }: { kind: MedicalExamKind; exam: MedicalExam | null }) {
  const color = exam === null ? "var(--no-data)" : isValid(exam) ? "var(--good)" : "var(--risk)";
  const text =
    exam === null ? "нет данных" : isValid(exam) ? `действует до ${formatDate(exam.valid_until)}` : `истёк ${formatDate(exam.valid_until)}`;

  return (
    <div>
      <p className="text-xs text-[var(--text-faint)] uppercase tracking-wide">{KIND_LABEL[kind]}</p>
      <p className="text-sm font-medium" style={{ color }}>
        {text}
      </p>
    </div>
  );
}

export function MedicalExamsCard({
  athleteId,
  data,
  canEdit,
}: {
  athleteId: string;
  data: MedicalExams;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<MedicalExamKind>("umo");
  const [passedDate, setPassedDate] = useState(todayISO());
  const [validUntil, setValidUntil] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/medical-exams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, passed_date: passedDate, valid_until: validUntil }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? "Не удалось сохранить");
      setFormOpen(false);
      setValidUntil("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-medium text-[var(--text)]">Медосмотры</h2>
        {canEdit && (
          <button
            onClick={() => setFormOpen((v) => !v)}
            className="text-xs font-medium px-2.5 py-1 border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
          >
            {formOpen ? "Отмена" : "Добавить осмотр"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <SummaryTile kind="umo" exam={data.current_umo} />
        <SummaryTile kind="tmo" exam={data.current_tmo} />
      </div>

      {formOpen && (
        <form onSubmit={submit} className="border border-[var(--border)] p-3 mb-4 space-y-2">
          <div className="flex gap-2">
            {(["umo", "tmo"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className="text-xs font-medium px-2.5 py-1 transition-colors"
                style={{
                  backgroundColor: kind === k ? "var(--accent)" : "var(--surface-muted)",
                  color: kind === k ? "white" : "var(--text-muted)",
                }}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-end flex-wrap">
            <label className="text-xs text-[var(--text-muted)]">
              Дата прохождения
              <input
                type="date"
                required
                value={passedDate}
                onChange={(e) => setPassedDate(e.target.value)}
                className="block border border-[var(--border-strong)] px-2 py-1 text-sm mt-0.5"
              />
            </label>
            <label className="text-xs text-[var(--text-muted)]">
              Действует до
              <input
                type="date"
                required
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="block border border-[var(--border-strong)] px-2 py-1 text-sm mt-0.5"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="text-sm font-medium px-3 py-1.5 bg-[var(--accent)] text-white disabled:opacity-50"
            >
              {submitting ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
          {error && <p className="text-xs text-[var(--risk)]">{error}</p>}
        </form>
      )}

      {data.exams.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Осмотров пока нет</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {data.exams.map((exam) => (
            <li key={exam.id} className="py-2 flex items-center justify-between text-sm">
              <span className="text-[var(--text)]">{KIND_LABEL[exam.kind]}</span>
              <span className="text-[var(--text-muted)]">
                {formatDate(exam.passed_date)} → {formatDate(exam.valid_until)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
