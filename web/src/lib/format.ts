export function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const loadZoneLabel: Record<string, string> = {
  no_data: "Мало данных",
  undertraining: "Недогруз",
  optimal: "Норма",
  overreaching: "Перегруз",
  high_risk: "Риск травмы",
};

export function loadZoneText(zone: string): string {
  return loadZoneLabel[zone] ?? zone;
}

const availabilityLabel: Record<string, string> = {
  full: "В строю",
  modified: "Ограничен",
  unavailable: "Недоступен",
};

export function availabilityText(status: string | null): string {
  if (!status) return "—";
  return availabilityLabel[status] ?? status;
}
