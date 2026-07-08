// Типы ответов бэкенда (backend/app/schemas)

export interface Me {
  id: string;
  name: string;
  locale: string;
  global_role: string;
  org_id: string | null;
  phone: string | null;
  email: string | null;
  status: string;
}

export interface DailyMetric {
  athlete_id: string;
  date: string;
  daily_load: number;
  ewma_acute: number | null;
  ewma_chronic: number | null;
  acwr: number | null;
  load_zone: 'no_data' | 'undertraining' | 'optimal' | 'overreaching' | 'high_risk';
  readiness: number | null;
  readiness_zone: 'green' | 'yellow' | 'red' | null;
  hr_flag: boolean;
  unavailable_flag: boolean;
}

export interface Streak {
  type: 'wellness' | 'rpe';
  count: number;
  last_date: string | null;
}

export interface WellnessEntry {
  id: string;
  date: string;
  mood: number;
  energy: number;
  sleep_quality: number;
  sleep_hours: number | null;
  stress: number;
  soreness: number;
  injury: boolean;
  symptom: boolean;
  resting_hr: number | null;
  comment: string | null;
}

export interface RpeEntry {
  id: string;
  date: string;
  exertion: number;
  performance: number;
  duration_min: number;
  session_load: number;
  is_late: boolean;
}

export interface AvailabilitySummary {
  athlete_id: string;
  window_days: number;
  full_days: number;
  modified_days: number;
  unavailable_days: number;
  availability_percent: number | null;
}

export interface WellnessPayload {
  date: string;
  mood: number;
  energy: number;
  sleep_quality: number;
  sleep_hours?: number | null;
  stress: number;
  soreness: number;
  injury: boolean;
  injury_details?: string | null;
  symptom: boolean;
  symptom_details?: string | null;
  resting_hr?: number | null;
}

export interface RpePayload {
  date: string;
  exertion: number;
  performance: number;
  duration_min: number;
  event_id?: string | null;
}
