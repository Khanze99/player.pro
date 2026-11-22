"use client";

import { useEffect, useId, useState, type CSSProperties, type FormEvent } from "react";

import { formatDate } from "@/lib/format";
import { wellnessZone } from "@/lib/wellness";
import { zoneColorVar } from "@/lib/zone";
import type { WellnessHistory, WellnessHistoryDay, WellnessHistoryEvent, WellnessMetric } from "@/types/wellness-history";

import styles from "./WellnessHistoryPanel.module.css";

type Period = { from: string; to: string };
type MetricDefinition = { key: WellnessMetric; label: string; hint: string; color: string; direction: string };
const METRICS: MetricDefinition[] = [
  { key: "stress", label: "Стресс", color: "var(--metric-stress)", direction: "ниже — лучше", hint: "1 — минимальный стресс · 10 — максимальный. Чем ниже, тем лучше." },
  { key: "sleep_quality", label: "Качество сна", color: "var(--metric-sleep)", direction: "выше — лучше", hint: "1 — очень плохой сон · 10 — отличный. Чем выше, тем лучше." },
  { key: "energy", label: "Энергия", color: "var(--metric-energy)", direction: "выше — лучше", hint: "1 — нет сил · 10 — полон энергии. Чем выше, тем лучше." },
  { key: "soreness", label: "Болезненность", color: "var(--metric-soreness)", direction: "ниже — лучше", hint: "Общая мышечная болезненность: 1 — минимальная · 10 — максимальная. Чем ниже, тем лучше." },
  { key: "mood", label: "Настроение", color: "var(--metric-mood)", direction: "выше — лучше", hint: "1 — очень плохое настроение · 10 — отличное. Чем выше, тем лучше." },
];
const TABLE_KEYS: WellnessMetric[] = ["sleep_quality", "energy", "soreness", "stress", "mood"];
const number = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function validPeriod(period: Period, today: string): boolean {
  const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
  return valid(period.from) && valid(period.to) && period.from >= "1970-01-01" && period.from <= period.to && period.to <= today && (Date.parse(period.to) - Date.parse(period.from)) / 86400000 < 90;
}

function eventName(event: WellnessHistoryEvent): string {
  return event.title || (event.type === "match" ? "Игра" : "Тренировка");
}

function Events({ events }: { events: WellnessHistoryEvent[] }) {
  if (!events.length) return <span className={styles.muted}>Нет командных событий</span>;
  return <ul className={styles.events}>{events.map(event => <li key={event.id}>
    <span className={event.type === "match" ? styles.match : styles.muted}>{event.type === "match" ? "⚑ Игра" : "· Тренировка"}</span>
    <span>{eventName(event)}</span>
  </li>)}</ul>;
}

function segments(days: WellnessHistoryDay[], getValue: (day: WellnessHistoryDay) => number | null, x: (index: number) => number, y: (value: number) => number): string[] {
  const paths: string[] = [];
  let points: string[] = [];
  for (let index = 0; index < days.length; index++) {
    const value = getValue(days[index]);
    if (value === null) {
      if (points.length > 1) paths.push(points.join(" "));
      points = [];
    } else points.push(`${x(index)},${y(value)}`);
  }
  if (points.length > 1) paths.push(points.join(" "));
  return paths;
}

function MetricSeries({ days, metric, showTeam, selected, x, y }: {
  days: WellnessHistoryDay[];
  metric: MetricDefinition;
  showTeam: boolean;
  selected: string;
  x: (index: number) => number;
  y: (value: number) => number;
}) {
  const own = (day: WellnessHistoryDay) => day.values?.[metric.key] ?? null;
  const team = (day: WellnessHistoryDay) => day.team_average?.values[metric.key] ?? null;
  return <g data-metric={metric.key}>
    {showTeam && segments(days, team, x, y).map((points, index) => <polyline key={`team-${index}`} data-series="team" points={points} fill="none" stroke={metric.color} strokeWidth={1.8} strokeDasharray="6 5" strokeOpacity={0.7} strokeLinejoin="round" />)}
    {segments(days, own, x, y).map((points, index) => <polyline key={`athlete-${index}`} data-series="athlete" points={points} fill="none" stroke={metric.color} strokeWidth={2.5} strokeLinejoin="round" />)}
    {days.map((day, index) => <g key={day.date}>
      {showTeam && team(day) !== null && <circle data-point="team" cx={x(index)} cy={y(team(day)!)} r={2.5} fill={metric.color} fillOpacity={0.7}><title>{metric.label} · команда · {formatDate(day.date)}: {number(team(day)!)}</title></circle>}
      {own(day) !== null && <circle data-point="athlete" cx={x(index)} cy={y(own(day)!)} r={day.date === selected ? 5 : 3.5} fill="var(--surface)" stroke={metric.color} strokeWidth={2}><title>{metric.label} · спортсмен · {formatDate(day.date)}: {number(own(day)!)}</title></circle>}
    </g>)}
  </g>;
}

function HistoryChart({ days, metrics, showTeam, periodDays, showPeriods, selected, onSelect }: {
  days: WellnessHistoryDay[];
  metrics: MetricDefinition[];
  showTeam: boolean;
  periodDays: ReadonlySet<string>;
  showPeriods: boolean;
  selected: string;
  onSelect: (day: string) => void;
}) {
  const width = Math.max(640, days.length * 38 + 72);
  const height = 310, left = 44, right = 28, top = 30, bottom = 50;
  const step = (width - left - right) / days.length;
  const x = (index: number) => left + (index + 0.5) * step;
  const y = (value: number) => height - bottom - (value - 1) / 9 * (height - top - bottom);
  const selectedIndex = days.findIndex(day => day.date === selected);
  const label = metrics.map(item => item.label).join(", ");
  return <div className={styles.chartScroll}>
    <div style={{ minWidth: width }}>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}, ${formatDate(days[0].date)} — ${formatDate(days[days.length - 1].date)}. Шкала 1–10. Спортсмен — сплошные линии.${showTeam ? " Команда — пунктир." : ""}${showPeriods && periodDays.size ? " Розовая подложка — отмеченные дни менструации." : ""} Пропуски не соединяются.`}>
        {Array.from({ length: 10 }, (_, index) => index + 1).map(value => <g key={value}>
          <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--border)" strokeOpacity={0.6} />
          <text x={left - 14} y={y(value) + 4} textAnchor="end" className={styles.axis}>{value}</text>
        </g>)}
        {showPeriods && days.map((day, index) => periodDays.has(day.date) && <g key={`period-${day.date}`} data-period-day={day.date}>
          <title>{formatDate(day.date)}: отмечен день менструации</title>
          <rect x={x(index) - step * .44} y={top - 10} width={step * .88} height={height - top - bottom + 10} fill="var(--period-soft)" />
          <rect x={x(index) - Math.min(step * .36, 14)} y={height - bottom + 4} width={Math.min(step * .72, 28)} height={4} rx={2} fill="var(--period)" />
        </g>)}
        {days.map((day, index) => day.events.some(event => event.type === "match") && <g key={day.date}>
          <rect x={x(index) - Math.min(step * .4, 14)} y={top - 10} width={Math.min(step * .8, 28)} height={height - top - 12} fill="var(--accent-soft)" />
          <text x={x(index)} y={top - 15} textAnchor="middle" fill="var(--accent)" fontSize={13}>⚑</text>
        </g>)}
        {selectedIndex >= 0 && <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top - 10} y2={height - 24} stroke="var(--text-muted)" strokeDasharray="4 5" />}
        {metrics.map(metric => <MetricSeries key={metric.key} days={days} metric={metric} showTeam={showTeam} selected={selected} x={x} y={y} />)}
        {days.map((day, index) => <g key={day.date}>
          <text x={x(index)} y={height - 25} textAnchor="middle" className={styles.axis}>{index % Math.max(1, Math.ceil(days.length / 10)) === 0 || index === days.length - 1 ? formatDate(day.date) : ""}</text>
          {day.events.some(event => event.type === "training") && <text x={x(index)} y={height - 7} textAnchor="middle" className={styles.axis}>·</text>}
        </g>)}
      </svg>
      <div className={styles.dayButtons} style={{ paddingLeft: `${left / width * 100}%`, paddingRight: `${right / width * 100}%`, gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map(day => <button key={day.date} type="button" className={showPeriods && periodDays.has(day.date) ? styles.periodDay : undefined} aria-label={`Показатели за ${day.date}${showPeriods && periodDays.has(day.date) ? " · день менструации" : ""}`} aria-pressed={selected === day.date} onClick={() => onSelect(day.date)}>{Number(day.date.slice(8))}</button>)}
      </div>
    </div>
  </div>;
}

function DayAnalysis({ day, timezone, onPeriod }: { day: WellnessHistoryDay; timezone: string; onPeriod: boolean }) {
  return <aside className={styles.card} aria-label="Разбор дня">
    <h3 className={styles.smallTitle}>Разбор дня</h3>
    <p className={styles.selectedDate}>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
    <p className={styles.hint}>{day.submitted_at ? `Утренний опрос · ${new Date(day.submitted_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}` : "Опрос не заполнен"}</p>
    {onPeriod && <p className={styles.periodBadge}>Отмечен день менструации</p>}
    <div className={styles.eventContext}><Events events={day.events} /></div>
    {day.values ? <dl className={styles.values}>{METRICS.map(metric => {
      const value = day.values![metric.key];
      const average = day.team_average?.values[metric.key];
      const delta = average === undefined ? null : value - average;
      return <div key={metric.key} className={styles.valueRow}>
        <dt>{metric.label}</dt>
        <dd>
          <strong style={{ color: zoneColorVar(wellnessZone(metric.key, value)) }}>{number(value)} <span className={styles.muted}>/ 10</span></strong>
          <p className={styles.teamValue}>{average === undefined ? "Нет ответов команды" : `Команда: ${number(average)} · Δ ${delta! > 0 ? "+" : ""}${number(delta!)}`}</p>
        </dd>
      </div>;
    })}</dl> : <p className={styles.empty}>Нет данных спортсмена за этот день. Пропуск не считается нулём.</p>}
    {day.team_average && <p className={styles.hint}>Среднее команды · ответов: {day.team_average.count}. Без выбранного спортсмена.</p>}
    <p className={styles.contextNote}>Сопоставляйте состояние с нагрузкой и игрой. Совпадение по времени само по себе не объясняет результат. Δ — разница, а не оценка «лучше / хуже».</p>
  </aside>;
}

function GameContext({ data, game, onGame, selected, onSelect }: { data: WellnessHistory; game: WellnessHistoryEvent | undefined; onGame: (id: string) => void; selected: string; onSelect: (day: string) => void }) {
  const selectId = useId();
  const rows = game ? Array.from({ length: 4 }, (_, index) => data.days.find(day => day.date === shiftDay(game.date, index - 3))!) : [];
  return <section className={`${styles.card} ${styles.gameContext}`}>
    <div className={styles.toolbar}>
      <div><h3 className={styles.chartTitle}>Состояние вокруг игры</h3><p className={styles.hint}>Три дня до события и день игры</p></div>
      {game && <div className={styles.gamePicker}><label className={styles.hint} htmlFor={selectId}>Выберите игру</label><select id={selectId} className={styles.input} value={game.id} onChange={event => onGame(event.target.value)}>
        {data.games.map(item => <option key={item.id} value={item.id}>{formatDate(item.date)} · {eventName(item)}</option>)}
      </select></div>}
    </div>
    {!game ? <p className={styles.empty}>В выбранном периоде нет командных игр.</p> : <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead><tr><th scope="col">Дата</th><th scope="col">События</th>{TABLE_KEYS.map(key => <th scope="col" key={key}>{METRICS.find(item => item.key === key)!.label}</th>)}<th scope="col"><span className={styles.srOnly}>Разбор дня</span></th></tr></thead>
        <tbody>{rows.map(day => <tr key={day.date} data-selected={selected === day.date}>
          <th scope="row">{formatDate(day.date)}{data.cycle?.period_days.includes(day.date) && <span className={`${styles.periodBadge} ${styles.tablePeriod}`}>Менструация</span>}</th><td><Events events={day.events} /></td>
          {TABLE_KEYS.map(key => <td key={key} style={day.values ? { color: zoneColorVar(wellnessZone(key, day.values[key])) } : undefined}>{day.values ? `${number(day.values[key])} / 10` : "Нет данных"}</td>)}
          <td><button className={styles.secondary} type="button" aria-label={`Посмотреть ${day.date}`} onClick={() => onSelect(day.date)}>Посмотреть</button></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

export function WellnessHistoryPanel({ teamId, athleteId }: { teamId: string; athleteId: string }) {
  const headingId = useId();
  const [data, setData] = useState<WellnessHistory | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [draftPeriod, setDraftPeriod] = useState<Period | null>(null);
  const [metrics, setMetrics] = useState<WellnessMetric[]>(["stress"]);
  const [showTeam, setShowTeam] = useState(true);
  const [showPeriods, setShowPeriods] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [gameId, setGameId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [revision, setRevision] = useState(0);
  const url = `/api/teams/${teamId}/athletes/${athleteId}/wellness-history`;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const query = period ? `?${new URLSearchParams({ date_from: period.from, date_to: period.to })}` : "";
    fetch(url + query, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Не удалось загрузить историю состояния");
      if (active) setData(body as WellnessHistory);
    }).catch(reason => {
      if (active) setError(reason instanceof Error && reason.name !== "AbortError" ? reason.message : "Не удалось загрузить историю. Проверьте соединение и повторите попытку.");
    }).finally(() => { window.clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [url, period, revision]);

  const actualPeriod = period ?? (data ? { from: data.date_from, to: data.date_to } : null);
  const inputs = draftPeriod ?? actualPeriod;
  const days = data?.days.filter(day => day.date >= data.date_from && day.date <= data.date_to) ?? [];
  const selected = days.find(day => day.date === selectedDate) ?? days[days.length - 1];
  const game = data?.games.find(item => item.id === gameId) ?? data?.games[data.games.length - 1];
  const definitions = METRICS.filter(item => metrics.includes(item.key));
  const periodDays = new Set(data?.cycle?.period_days ?? []);
  const visiblePeriodDays = days.filter(day => periodDays.has(day.date)).length;

  function toggleMetric(key: WellnessMetric) {
    setMetrics(current => current.includes(key)
      ? current.length > 1 ? current.filter(item => item !== key) : current
      : [...current, key]);
  }

  function changePeriod(next: Period, selectedDay: string | null = null) {
    setPeriod(next); setDraftPeriod(next); setSelectedDate(selectedDay); setGameId("");
    setLoading(true); setError(""); setValidation("");
  }
  function applyPeriod(event: FormEvent) {
    event.preventDefault();
    if (!inputs || !data || !validPeriod(inputs, data.today)) { setValidation("Выберите корректный период от 1 до 90 дней, не позже сегодня."); return; }
    changePeriod(inputs);
  }
  function selectDay(day: string) {
    if (data && day < data.date_from) changePeriod({ from: day, to: data.date_to > shiftDay(day, 89) ? shiftDay(day, 89) : data.date_to }, day);
    else setSelectedDate(day);
  }

  return <section className={styles.panel} aria-labelledby={headingId} aria-busy={loading}>
    <div className={styles.toolbar}>
      <div><h2 id={headingId} className={styles.title}>История состояния</h2><p className={styles.hint}>Как менялись ответы перед тренировкой и игрой</p></div>
      <div className={styles.periodControls}>
        <div className={styles.presets} aria-label="Быстрый выбор периода">{[7, 14, 28].map(count => <button type="button" key={count} className={styles.secondary} disabled={!data} aria-pressed={!!data && actualPeriod?.to === data.today && actualPeriod.from === shiftDay(data.today, 1 - count)} onClick={() => changePeriod({ from: shiftDay(data!.today, 1 - count), to: data!.today })}>{count} дней</button>)}</div>
        <form onSubmit={applyPeriod} className={styles.dateRange}>
          <label>С<input className={styles.input} type="date" aria-label="Начало периода" min="1970-01-01" max={data?.today} value={inputs?.from ?? ""} disabled={!data} onChange={event => setDraftPeriod({ from: event.target.value, to: inputs?.to ?? "" })} /></label>
          <label>По<input className={styles.input} type="date" aria-label="Конец периода" min="1970-01-01" max={data?.today} value={inputs?.to ?? ""} disabled={!data} onChange={event => setDraftPeriod({ from: inputs?.from ?? "", to: event.target.value })} /></label>
          <button type="submit" className={styles.primary} disabled={!data}>Применить</button>
        </form>
        {!!validation && <p role="alert" className={styles.error}>{validation}</p>}
      </div>
    </div>
    {loading && <p role="status" className={styles.empty}>Загрузка истории состояния…</p>}
    {!!error && !loading && <div role="alert" className={styles.error}>{error}<button type="button" className={styles.secondary} onClick={() => { setError(""); setLoading(true); setRevision(value => value + 1); }}>Повторить</button></div>}
    {data && !loading && !error && selected && <>
      <div className={styles.layout}>
        <section className={styles.card} aria-label="График состояния">
          <div className={styles.toolbar}><h3 className={styles.chartTitle}>{definitions.length === 1 ? definitions[0].label : "Сравнение показателей"}</h3><span className={styles.hint}>{formatDate(data.date_from)} — {formatDate(data.date_to)}</span></div>
          <p className={styles.selectionHint}>Выберите один или несколько показателей для сравнения</p>
          <div className={styles.metrics} role="group" aria-label="Показатели на графике">{METRICS.map(item => {
            const active = metrics.includes(item.key);
            return <button className={`${styles.secondary} ${styles.metricButton}`} style={{ "--metric-color": item.color } as CSSProperties} key={item.key} type="button" aria-pressed={active} aria-disabled={active && metrics.length === 1} title={active && metrics.length === 1 ? "На графике должен оставаться хотя бы один показатель" : undefined} onClick={() => toggleMetric(item.key)}><span className={styles.metricDot} aria-hidden="true" />{item.label}<span className={styles.metricCheck} aria-hidden="true">{active ? "✓" : "+"}</span></button>;
          })}</div>
          <label className={styles.teamToggle}><input type="checkbox" checked={showTeam} onChange={event => setShowTeam(event.target.checked)} />Среднее команды<span className={styles.hint}>пунктиром, без выбранного спортсмена</span></label>
          {data.cycle && <>
            <label className={`${styles.teamToggle} ${styles.periodToggle}`}><input type="checkbox" checked={showPeriods} onChange={event => setShowPeriods(event.target.checked)} />Дни менструации<span className={styles.hint}>отмеченные дни, без прогноза</span></label>
            {showPeriods && visiblePeriodDays === 0 && <p className={styles.hint}>В этом периоде нет отмеченных дней менструации.</p>}
          </>}
          {definitions.length === 1 ? <p className={styles.hint}>{definitions[0].hint}</p> : <div className={styles.directions}>{definitions.map(item => <span key={item.key} style={{ color: item.color }}>{item.label}: {item.direction}</span>)}<p className={styles.hint}>Общая шкала 1–10. Значения не инвертируются: рост разных показателей не всегда означает улучшение.</p></div>}
          {!days.some(day => day.values) && <p className={styles.empty}>В этом периоде спортсмен не заполнял опрос.</p>}
          <HistoryChart days={days} metrics={definitions} showTeam={showTeam} periodDays={periodDays} showPeriods={!!data.cycle && showPeriods} selected={selected.date} onSelect={selectDay} />
          <div className={styles.legend} aria-label="Легенда графика">{definitions.map(item => <span className={styles.legendMetric} key={item.key} style={{ color: item.color }}><span className={styles.lineSample} aria-hidden="true" />{item.label}</span>)}</div>
          <div className={styles.legend}><span className={styles.legendMetric}><span className={styles.lineSample} aria-hidden="true" />Спортсмен</span>{showTeam && <span className={styles.legendMetric}><span className={`${styles.lineSample} ${styles.dashed}`} aria-hidden="true" />Среднее команды без спортсмена</span>}{data.cycle && showPeriods && <span className={styles.legendMetric}><span className={styles.periodSwatch} aria-hidden="true" />Дни менструации</span>}<span>⚑ Игра</span><span>· Тренировка</span><span>Разрыв — нет опроса</span></div>
          <p className={styles.contextNote}>Выберите день под графиком для разбора всех показателей. Среднее рассчитано по текущему составу команды и ответам за конкретный день. Заполнено: {days.filter(day => day.values).length} из {days.length} дней.</p>
        </section>
        <DayAnalysis day={selected} timezone={data.timezone} onPeriod={periodDays.has(selected.date)} />
      </div>
      <GameContext data={data} game={game} onGame={id => { setGameId(id); const chosen = data.games.find(item => item.id === id); if (chosen) setSelectedDate(chosen.date); }} selected={selected.date} onSelect={selectDay} />
    </>}
  </section>;
}
