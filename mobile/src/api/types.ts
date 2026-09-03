// Типы ответов бэкенда (backend/app/schemas)

export type GlobalRole = 'admin' | 'staff' | 'player';
export type TeamRole = 'head_coach' | 'coach' | 'medic' | 'athlete';
export type AvailabilityStatus = 'full' | 'modified' | 'unavailable';

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
  severity: number; // 1–10
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
  injury_area: BodyRegion | null;
  injury_type: InjuryType | null;
  symptom: boolean;
  symptom_type: SymptomType | null;
  resting_hr: number | null;
  comment: string | null;
  pain_points: PainPoint[];
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
  comment?: string | null;
  pain_points?: PainPoint[];
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

// Цикл (backend/app/schemas/cycle.py). Спецкатегория — доступ только по согласию.
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal' | 'suppressed' | 'unknown';
export type FlowIntensity = 'spotting' | 'light' | 'medium' | 'heavy';
export type CycleSymptomKey =
  | 'cramps'
  | 'headache'
  | 'back_pain'
  | 'bloating'
  | 'fatigue'
  | 'mood_swings'
  | 'nausea'
  | 'breast_tenderness'
  | 'insomnia'
  | 'other';
export type Contraception =
  | 'none'
  | 'combined_oc'
  | 'progestin_only'
  | 'hormonal_iud'
  | 'copper_iud'
  | 'implant'
  | 'injection'
  | 'other'
  | 'not_specified';

export interface AthleteProfile {
  user_id: string;
  position: string | null;
  baseline_resting_hr: number | null;
  birthdate: string | null;
  sex: Sex;
}

export interface CycleSettings {
  tracking_enabled: boolean;
  average_cycle_length: number;
  average_period_length: number;
  contraception: Contraception;
}

export interface CycleSymptomEntry {
  symptom: CycleSymptomKey;
  severity: number;
}

export interface CycleLog {
  id: string;
  date: string;
  period_start: boolean;
  period_end: boolean;
  flow: FlowIntensity | null;
  note: string | null;
  symptoms: CycleSymptomEntry[];
}

export interface CycleLogPayload {
  date: string;
  period_start?: boolean;
  period_end?: boolean;
  flow?: FlowIntensity | null;
  note?: string | null;
  symptoms?: CycleSymptomEntry[];
}

export interface CycleState {
  date: string;
  tracking_enabled: boolean;
  cycle_day: number | null;
  phase: CyclePhase;
  last_period_start: string | null;
  next_period_predicted: string | null;
  average_cycle_length: number;
  observed_cycle_length: number | null;
  days_since_last_period: number | null;
  amenorrhea_flag: boolean;
  contraception: Contraception;
}

export interface PhaseInsight {
  phase: CyclePhase;
  days: number;
  avg_readiness: number | null;
  avg_load: number | null;
}

export interface CycleInsights {
  window_days: number;
  cycles_recorded: number;
  covered_days: number;
  enough_data: boolean;
  phases: PhaseInsight[];
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
