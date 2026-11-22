export type WellnessMetric = "sleep_quality" | "energy" | "soreness" | "stress" | "mood";
export type WellnessValues = Record<WellnessMetric, number>;

export interface WellnessHistoryEvent {
  id: string;
  date: string;
  type: "training" | "match";
  title: string | null;
  planned_start: string;
}

export interface WellnessHistoryDay {
  date: string;
  submitted_at: string | null;
  values: WellnessValues | null;
  team_average: { values: WellnessValues; count: number } | null;
  events: WellnessHistoryEvent[];
}

export interface WellnessHistory {
  athlete_id: string;
  team_id: string;
  timezone: string;
  today: string;
  date_from: string;
  date_to: string;
  context_from: string;
  days: WellnessHistoryDay[];
  games: WellnessHistoryEvent[];
  cycle?: { period_days: string[] } | null;
}
