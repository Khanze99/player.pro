// Типы ответов бэкенда (backend/app/schemas)

export type GlobalRole = 'admin' | 'staff' | 'player';
export type TeamRole = 'head_coach' | 'coach' | 'medic' | 'athlete';
export type AvailabilityStatus = 'full' | 'modified' | 'unavailable';

export interface TeamMembership {
  team_id: string;
  team_name: string;
  team_role: TeamRole;
}

export interface Me {
  id: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  locale: string;
  global_role: GlobalRole;
  org_id: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  // Путь (не абсолютный URL) к своему аватару или null. Меняется при каждой
  // перезагрузке фото — годится как cache-busting-ключ.
  avatar_url: string | null;
  teams: TeamMembership[];
  terms_accepted: boolean;
  health_consent_accepted: boolean;
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

// Один критерий разбивки Readiness (раздел 6.4 ТЗ), отсортированы по deficit убыв. —
// первый в списке объясняет просадку сильнее всего.
export interface ReadinessComponent {
  key: 'sleep_quality' | 'energy' | 'mood' | 'soreness' | 'stress';
  value: number; // сырое 1–10 (день) или среднее (период)
  normalized: number; // 0–100
  weight: number;
  contribution: number; // очков из 100 принёс этот критерий
  deficit: number; // очков из возможного максимума критерий стоил
}

export interface ReadinessBreakdown {
  date: string;
  components: ReadinessComponent[];
  hr_modifier: number;
  hr_flag: boolean;
  injury: boolean;
  symptom: boolean;
  unavailable_flag: boolean;
  score: number;
  zone: 'green' | 'yellow' | 'red';
}

export interface ReadinessBreakdownAverage {
  date_from: string;
  date_to: string;
  days_with_data: number;
  components: ReadinessComponent[];
  avg_score: number | null;
}

// Зоны тела для карты боли и структурной травмы (зеркалит backend enums)
export type BodyRegion =
  | 'head'
  | 'neck'
  | 'shoulder'
  | 'upper_back'
  | 'lower_back'
  | 'chest'
  | 'abdomen'
  | 'elbow'
  | 'forearm'
  | 'wrist'
  | 'hand'
  | 'hip'
  | 'glute'
  | 'groin'
  | 'quad'
  | 'hamstring'
  | 'knee'
  | 'calf'
  | 'shin'
  | 'ankle'
  | 'foot';

export type BodySide = 'left' | 'right' | 'center';
export type InjuryType = 'muscle' | 'joint' | 'ligament' | 'tendon' | 'bone' | 'bruise' | 'other';
export type SymptomType =
  | 'illness'
  | 'fever'
  | 'cough'
  | 'sore_throat'
  | 'headache'
  | 'gastro'
  | 'fatigue'
  | 'other';

export interface PainPoint {
  region: BodyRegion;
  side: BodySide;
  severity: number; // 1–10, своя для этой точки
  note?: string | null; // что болит и как, необязательно, привязано к точке
}

// Восстановительные процедуры вчера — закрытый список, деталь для medic/coach,
// на Readiness не влияет (зеркалит RecoveryMethod backend/app/models/enums.py).
export type RecoveryMethod = 'massage' | 'compression' | 'cryo_compression' | 'physio';

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
  injury_area: BodyRegion | null;
  injury_type: InjuryType | null;
  injury_details: string | null;
  symptom: boolean;
  symptom_type: SymptomType | null;
  symptom_details: string | null;
  resting_hr: number | null;
  // Спецкатегория body_metrics (docs/plan-weight-tracking.md): null либо не
  // заполнено, либо смотрящему нет согласия — не различаем, как рост/вес профиля.
  weight_kg: number | null;
  comment: string | null;
  pain_points: PainPoint[];
  recovery_methods: RecoveryMethod[];
}

export interface RpeEntry {
  id: string;
  date: string;
  event_id: string | null;
  exertion: number;
  performance: number;
  duration_min: number;
  session_load: number;
  is_late: boolean;
}

/** Сессия расписания, к которой привязывается RPE: оценить можно только завершённую. */
export interface RpeSession {
  event_id: string;
  type: EventType;
  title: string | null;
  planned_start: string;
  planned_duration_min: number;
  ends_at: string;
  finished: boolean;
  rpe_submitted: boolean;
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
  injury_area?: BodyRegion | null;
  injury_type?: InjuryType | null;
  symptom: boolean;
  symptom_details?: string | null;
  symptom_type?: SymptomType | null;
  resting_hr?: number | null;
  weight_kg?: number | null;
  comment?: string | null;
  pain_points?: PainPoint[];
  recovery_methods?: RecoveryMethod[];
  // Цикл: уходит прямо в cycle_logs на backend, не хранится в WellnessEntry
  // и не возвращается обратно (см. docs/plan-women-health-nutrition.md).
  period_day?: boolean | null;
  period_pain_level?: number | null;
}

// События расписания: командные (team_id задан) и индивидуальные (backend/app/schemas/event.py)
export type EventType = 'training' | 'match' | 'individual' | 'other';
export type AttendanceStatus = 'present' | 'absent' | 'excused';

export interface CalendarEvent {
  id: string;
  team_id: string | null;
  type: EventType;
  title: string | null;
  planned_start: string;
  planned_duration_min: number;
  location_id: string | null;
  created_by: string;
}

export interface EventPayload {
  team_id?: string | null;
  type: EventType;
  title?: string | null;
  planned_start: string;
  planned_duration_min: number;
}

export interface Attendance {
  event_id: string;
  user_id: string;
  status: AttendanceStatus;
}

export interface TeamMember {
  user_id: string;
  name: string;
  team_role: TeamRole;
}

// Squad Status — строка дашборда тренера (backend/app/schemas/dashboard.py)
export interface SquadPlayer {
  athlete_id: string;
  name: string;
  position: string | null;
  readiness: number | null;
  readiness_zone: 'green' | 'yellow' | 'red' | null;
  acwr: number | null;
  load_zone: DailyMetric['load_zone'];
  daily_load: number;
  load_7d: number;
  performance_7d: number | null;
  availability: AvailabilityStatus | null;
  availability_percent: number | null;
  wellness_filled: boolean;
  active_injury: boolean;
  hr_flag: boolean;
  has_pain_points: boolean;
  // Только если дано согласие уровня coach — иначе всегда false, как и у
  // игроков без цикл-трекинга (см. docs/plan-women-health-nutrition.md).
  on_period: boolean;
}

export interface SquadStatus {
  team_id: string;
  date: string;
  players: SquadPlayer[];
}

// Зона для бублика: у нагрузки своя шкала (ACWR), у остальных — светофор
export type MetricZone = 'green' | 'yellow' | 'red' | 'no_data' | DailyMetric['load_zone'];

export interface MetricGauge {
  value: number | null;
  scale_max: number;
  zone: MetricZone;
  covered: number;
  total: number;
  distribution: Record<string, number>;
}

export interface WellnessReport {
  filled: number;
  total: number;
  avg_sleep_quality: number | null;
  avg_energy: number | null;
  avg_mood: number | null;
  avg_stress: number | null;
  avg_soreness: number | null;
  avg_sleep_hours: number | null;
  with_pain: number;
  with_injury_flag: number;
  with_symptom_flag: number;
  missing: string[];
}

export interface DashboardEvent {
  id: string;
  type: CalendarEvent['type'];
  title: string | null;
  planned_start: string;
  planned_duration_min: number;
  present: number;
  absent: number;
  rpe_filled: number;
  avg_exertion: number | null;
  avg_load: number | null;
}

export type AlertReason =
  | 'low_readiness'
  | 'low_sleep'
  | 'low_energy'
  | 'low_mood'
  | 'high_stress'
  | 'high_soreness'
  | 'high_load'
  | 'rising_load'
  | 'undertraining'
  | 'injury'
  | 'unavailable'
  | 'hr_flag'
  | 'no_survey';

export interface TeamAlert {
  athlete_id: string;
  name: string;
  severity: 'risk' | 'caution';
  reasons: AlertReason[];
}

export interface TeamSummary {
  team_id: string;
  team_name: string;
  date: string;
  squad_size: number;
  readiness: MetricGauge;
  load: MetricGauge;
  performance: MetricGauge;
  availability: MetricGauge;
  wellness: WellnessReport;
  past_events: DashboardEvent[];
  upcoming_events: DashboardEvent[];
  alerts: TeamAlert[];
}

export interface TeamInjury {
  kind: 'injury' | 'illness';
  id: string;
  athlete_id: string;
  athlete_name: string;
  title: string;
  body_region: BodyRegion | null;
  body_side: 'left' | 'right' | 'center' | null;
  injury_type: string | null;
  symptom_type: string | null;
  severity: 'minor' | 'moderate' | 'severe' | null;
  status: 'active' | 'recovering' | 'closed' | null;
  start_date: string;
  end_date: string | null;
  days_out: number;
  availability: AvailabilityStatus | null;
}

export interface TeamInjuries {
  team_id: string;
  date: string;
  window_days: number;
  active: TeamInjury[];
  recent: TeamInjury[];
  hotspots: { body_region: BodyRegion; count: number }[];
}

export interface InvitePayload {
  identifier: string;
  name?: string | null;
  global_role: GlobalRole;
  team_id?: string | null;
  team_role?: TeamRole | null;
}

export interface Invitation {
  id: string;
  identifier: string;
  name: string | null;
  global_role: GlobalRole;
  team_id: string | null;
  team_role: TeamRole | null;
  status: string;
  expires_at: string;
}

export interface RpePayload {
  date: string;
  exertion: number;
  performance: number;
  duration_min: number;
  event_id?: string | null;
}

// Согласия на спецкатегории персданных (backend/app/schemas/consent.py)
export type ConsentScope = 'cycle' | 'nutrition' | 'body_metrics';
export type ConsentAudience = 'none' | 'medic' | 'coach';
export type Sex = 'female' | 'male' | 'not_specified';

export interface Consent {
  scope: ConsentScope;
  audience: ConsentAudience;
  policy_version: string | null;
  granted_at: string | null;
}

export interface ConsentList {
  policy_version: string;
  consents: Consent[];
}

// Гейт согласий при регистрации (backend/app/schemas/policy_consent.py) — ДРУГОЙ примитив,
// чем Consent/ConsentList выше: бинарный accept/revoke, а не audience-лестница «кому открыто».
export type PolicyConsentKind = 'terms' | 'health_data';

export interface PolicyConsentStatus {
  granted: boolean;
  policy_version: string | null;
  granted_at: string | null;
}

export interface PolicyConsents {
  terms: PolicyConsentStatus;
  health_data: PolicyConsentStatus;
}

export interface AthleteProfile {
  user_id: string;
  position: string | null;
  baseline_resting_hr: number | null;
  birthdate: string | null;
  sex: Sex;
  // null может значить «не заполнено» либо «нет согласия body_metrics» — на своём
  // профиле всегда приходит фактическое значение.
  height_cm: number | null;
  weight_kg: number | null;
  // ИМТ — не из БД, считается на лету на бэкенде из height_cm/weight_kg выше
  // (docs/plan-weight-tracking.md), тот же null-или-"нет согласия" принцип.
  bmi: number | null;
  bmi_zone: 'no_data' | 'underweight' | 'normal' | 'overweight' | 'obese';
}

// Цикл (backend/app/schemas/cycle.py) — минимальный трекинг (решение 2026-10-16):
// только отметка дня и болевой порог. Спецкатегория — доступ только по согласию.
// Отдельного «включить трекинг» нет (решение 2026-10-17) — всегда доступен
// игроку-женщине, день либо отмечается, либо нет.
export interface CycleSettings {
  average_cycle_length: number;
  average_period_length: number;
}

export interface CycleLog {
  id: string;
  date: string;
  on_period: boolean;
  pain_level: number | null;
}

// Отчёт штаба (GET /cycle/athletes/{id}/state) — одна витрина для coach и medic,
// детализации не осталось скрывать, видимость решает согласие.
export interface CycleStaffView {
  athlete_id: string;
  date: string;
  on_period: boolean;
  pain_level: number | null;
}

// Питание (backend/app/schemas/nutrition.py). Спецкатегория — scope=nutrition.
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodSource = 'curated' | 'open_food_facts' | 'custom';
export type FoodCategory =
  | 'meat'
  | 'fish'
  | 'dairy'
  | 'eggs'
  | 'grain'
  | 'vegetable'
  | 'fruit'
  | 'nuts'
  | 'sweets'
  | 'drinks'
  | 'supplements'
  | 'dish'
  | 'other';
export type CustomFoodKind = 'homemade' | 'new_product' | 'restaurant' | 'other';

export interface Features {
  cycle: boolean;
  nutrition: boolean;
}

export interface FoodItem {
  id: string;
  source: FoodSource;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: FoodCategory;
  custom_kind: CustomFoodKind | null;
  kcal_100g: number;
  protein_100g: number;
  fat_100g: number;
  carbs_100g: number;
  fiber_100g: number | null;
  serving_size_g: number | null;
  serving_name: string | null;
  verified: boolean;
}

export interface FoodLogEntry {
  id: string;
  date: string;
  meal: MealType;
  food_item_id: string | null;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface MacroTotals {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface NutritionTarget {
  kcal: number;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
}

export interface MealGroup {
  meal: MealType;
  entries: FoodLogEntry[];
  totals: MacroTotals;
}

export interface NutritionDay {
  date: string;
  totals: MacroTotals;
  target: NutritionTarget | null;
  meals: MealGroup[];
}

export interface FoodLogPayload {
  date: string;
  meal: MealType;
  food_item_id?: string | null;
  grams: number;
  name?: string | null;
  kcal?: number | null;
}

export interface FoodItemPayload {
  name: string;
  category: FoodCategory;
  custom_kind: CustomFoodKind;
  brand?: string | null;
  kcal_100g: number;
  protein_100g?: number;
  fat_100g?: number;
  carbs_100g?: number;
  serving_size_g?: number | null;
}
