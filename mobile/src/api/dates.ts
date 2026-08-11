// Календарный «день» в продукте — локальный день игрока, а не UTC-сутки:
// опрос, RPE и нагрузка дня привязаны к его часовому поясу. Поэтому дату нельзя
// получать через toISOString(): в UTC+3 с полуночи до 03:00 он отдаёт вчера,
// и экраны начинают спорить друг с другом, какой сегодня день.

export function toLocalISO(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export const todayISO = () => toLocalISO(new Date());

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalISO(d);
}

/** Минуты к востоку от UTC: MSK → 180. Для эндпоинтов, режущих сутки по времени. */
export const tzOffsetMin = () => -new Date().getTimezoneOffset();

/** Локальные сутки [from 00:00, to 23:59:59.999] как моменты времени в UTC. */
export function localDayBounds(fromISO: string, toISO: string): { from: string; to: string } {
  return {
    from: new Date(`${fromISO}T00:00:00`).toISOString(),
    to: new Date(`${toISO}T23:59:59.999`).toISOString(),
  };
}
