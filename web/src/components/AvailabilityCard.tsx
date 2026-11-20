"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Card } from "@/components/ui/Card";
import type { AvailabilityDirection, AvailabilitySaved, AvailabilityState, AvailabilityStatus } from "@/types/availability";

import styles from "./AvailabilityCard.module.css";

const labels: Record<AvailabilityStatus, string> = { full: "Без ограничений", modified: "С ограничениями", unavailable: "Недоступен" };
const directions: Record<AvailabilityDirection, string> = { medical: "Врач", coaching: "Тренер" };
const statusHints: Record<AvailabilityStatus, string> = {
  full: "Полное участие в нагрузке",
  modified: "Участие с ограничениями",
  unavailable: "Без участия в нагрузке",
};
const marks: Record<AvailabilityStatus, string> = { full: "✓", modified: "!", unavailable: "−" };
type AvailabilityDraft = { status: AvailabilityStatus; day: string; comment: string; note: string };

function restrictionSource(state: AvailabilityState): string | null {
  const medical = state.medical?.status === "modified" || state.medical?.status === "unavailable";
  const coaching = state.coaching?.status === "modified" || state.coaching?.status === "unavailable";
  if (medical && coaching) return "Ограничения врача и тренера";
  if (medical) return "Ограничение врача";
  if (coaching) return "Ограничение тренера";
  return null;
}

function StatusBadge({ status }: { status: AvailabilityStatus | null }) {
  return <span className={`${styles.badge} ${styles.tone}`} data-tone={status ?? "unknown"}>
    <span className={styles.mark} aria-hidden="true">{status ? marks[status] : "−"}</span>
    {status ? labels[status] : "Нет данных"}
  </span>;
}

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new RequestError(response.status, typeof body.detail === "string" ? body.detail : "Не удалось сохранить");
  return body as T;
}

export function AvailabilityCard({ athleteId }: { athleteId: string }) {
  const router = useRouter();
  const url = `/api/athletes/${athleteId}/availability`;
  const [state, setState] = useState<AvailabilityState | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<AvailabilityDirection | null>(null);

  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { setState(await request<AvailabilityState>(url)); }
    catch (err) { setState(null); setError(err instanceof Error ? err.message : "Ошибка загрузки"); }
  }, [url]);
  useEffect(() => {
    let active = true;
    request<AvailabilityState>(url).then(
      value => { if (active) setState(value); },
      err => { if (active) setError(err instanceof Error ? err.message : "Ошибка загрузки"); },
    );
    return () => { active = false; };
  }, [url]);


  return <Card className={styles.card}>
    <h2 className={styles.title}>Доступность</h2>
    {error && <div role="alert" className={styles.error}>
      <p>{error}</p>
      <button type="button" className={styles.secondary} onClick={() => void load()}>Повторить</button>
    </div>}
    {!state && !error && <p className={styles.hint}>Загрузка…</p>}
    {state && <>
      <div className={styles.summary}>
        <div className={styles.statusSummary}>
          <StatusBadge status={state.status} />
          {state.status !== "full" && restrictionSource(state) && <p className={styles.hint}>{restrictionSource(state)}</p>}
        </div>
        {state.editable_directions.length > 0 && <button
          type="button"
          className={styles.primary}
          disabled={editing !== null}
          onClick={() => { setEditing(state.editable_directions[0]); setNotice(""); }}
        >Изменить статус <span aria-hidden="true">→</span></button>}
      </div>
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {editing && <AvailabilityForm key={athleteId} state={state} direction={editing} onDirectionChange={setEditing} url={url} onCancel={() => setEditing(null)} onRefreshed={setState} onSaved={saved => {
        setState(saved.state); setEditing(null);
        setNotice(`Сохранено. Итоговая доступность: ${saved.state.status ? labels[saved.state.status] : "—"}. Ограничения другого направления не изменены.`);
        router.refresh();
      }} />}
    </>}
  </Card>;
}

function AvailabilityForm({ state, direction, onDirectionChange, url, onCancel, onRefreshed, onSaved }: { state: AvailabilityState; direction: AvailabilityDirection; onDirectionChange: (direction: AvailabilityDirection) => void; url: string; onCancel: () => void; onRefreshed: (state: AvailabilityState) => void; onSaved: (saved: AvailabilitySaved) => void }) {
  const [version, setVersion] = useState(state.version);
  const [conflict, setConflict] = useState(false);
  const [drafts, setDrafts] = useState<Record<AvailabilityDirection, AvailabilityDraft>>(() => ({
    medical: { status: state.medical?.status ?? "full", day: state.today, comment: "", note: "" },
    coaching: { status: state.coaching?.status ?? "full", day: state.today, comment: "", note: "" },
  }));
  const { status, day, comment, note } = drafts[direction];
  const updateDraft = (patch: Partial<AvailabilityDraft>) => setDrafts(previous => ({ ...previous, [direction]: { ...previous[direction], ...patch } }));
  const otherDirection = direction === "medical" ? "coaching" : "medical";
  const otherRestricted = state[otherDirection]?.status === "modified" || state[otherDirection]?.status === "unavailable";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef({ signature: "", id: "" });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || conflict || !comment.trim() || !state.editable_directions.includes(direction)) return;
    setError(""); setNotice(""); setPending(true);
    const payload = { athlete_id: state.athlete_id, direction, date: day, status, comment: comment.trim(), expected_version: version, ...(direction === "medical" ? { medical_note: note.trim() } : {}) };
    const signature = JSON.stringify(payload);
    if (retry.current.signature !== signature) retry.current = { signature, id: crypto.randomUUID() };
    try { onSaved(await request<AvailabilitySaved>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, request_id: retry.current.id }) })); }
    catch (err) { setError(err instanceof Error ? err.message : "Ошибка сохранения"); setConflict(err instanceof RequestError && err.status === 409); }
    finally { setPending(false); }
  }
  async function refreshState() {
    setPending(true);
    try {
      const latest = await request<AvailabilityState>(url);
      onRefreshed(latest); setVersion(latest.version); setConflict(false);
      setError("");
      setNotice("Данные обновлены. Проверьте оба статуса перед повторным сохранением.");
    } catch (err) { setError(err instanceof Error ? err.message : "Ошибка загрузки"); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className={styles.form} aria-label={`Изменение доступности: ${directions[direction]}`}>
    <div className={styles.formHeader}>
      <div>
        <h3>{direction === "medical" ? "Медицинский статус" : "Тренерский статус"}</h3>
        <p className={styles.subtitle}>Вы меняете только своё направление. Ограничения {direction === "medical" ? "тренера" : "врача"} сохранятся.</p>
      </div>
      <StatusBadge status={status} />
    </div>
    <div className={styles.formBody}>
      {state.editable_directions.length > 1 && <fieldset className={styles.fieldset} disabled={pending || conflict}>
        <legend>Направление</legend>
        <div className={styles.directionOptions}>
          {state.editable_directions.map(value => <label key={value} className={styles.directionOption}>
            <input type="radio" name="availability-direction" value={value} checked={direction === value} onChange={() => onDirectionChange(value)} />
            {directions[value]}
          </label>)}
        </div>
      </fieldset>}
      <fieldset className={styles.fieldset} disabled={pending}>
        <legend>Участие в нагрузке</legend>
        <div className={styles.options}>
          {(Object.keys(labels) as AvailabilityStatus[]).map(value => <label key={value} className={`${styles.option} ${styles.tone}`} data-tone={value} data-selected={status === value}>
            <input type="radio" name={`availability-status-${direction}`} value={value} checked={status === value} onChange={() => updateDraft({ status: value })} />
            <span className={styles.optionTitle}><span className={styles.mark} aria-hidden="true">{marks[value]}</span>{labels[value]}</span>
            <span className={styles.optionHint}>{statusHints[value]}</span>
          </label>)}
        </div>
      </fieldset>
      {status === "full" && otherRestricted && <p role="status" className={styles.notice}>
        Ограничение {otherDirection === "medical" ? "врача" : "тренера"} останется: это действие его не снимает.
      </p>}
      <label className={styles.dateField}>
        <span className={styles.label}>С какой даты</span>
        <input className={styles.input} type="date" value={day} min={state.start_date ?? undefined} max={state.today} onChange={e => updateDraft({ day: e.target.value })} required disabled={pending} />
      </label>
      <label>
        <span className={styles.label}>Причина изменения <span className={styles.required}>*</span></span>
        <textarea className={styles.input} value={comment} onChange={e => updateDraft({ comment: e.target.value })} placeholder="Что изменилось и какие ограничения нужно учитывать?" required maxLength={1000} rows={3} disabled={pending} />
        <span className={`${styles.hint} ${styles.fieldHint}`}>Комментарий увидят спортсмен и штаб команды.</span>
      </label>
      {direction === "medical" && <label>
        <span className={styles.label}>Диагноз / медицинское пояснение<span className={styles.optional}>Необязательно</span></span>
        <textarea className={styles.input} value={note} onChange={e => updateDraft({ note: e.target.value })} placeholder="Диагноз и рекомендации врача" maxLength={2000} rows={3} disabled={pending} />
        <span className={`${styles.hint} ${styles.fieldHint}`}>Видно также тренеру и спортсмену.</span>
      </label>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {conflict && <button type="button" className={styles.secondary} disabled={pending} onClick={() => void refreshState()}>Обновить текущий статус (текст сохранится)</button>}
    </div>
    <div className={styles.actions}>
      <button className={styles.secondary} type="button" disabled={pending} onClick={onCancel}>Отмена</button>
      <button className={styles.primary} disabled={pending || conflict || !comment.trim() || !state.editable_directions.includes(direction)} type="submit">{pending ? "Сохраняем…" : "Сохранить статус"}</button>
    </div>
  </form>;
}
