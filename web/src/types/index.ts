// Типы зеркалят Pydantic-схемы бэкенда буквально (имена полей — snake_case, как
// в JSON по проводу), тот же принцип, что у mobile/src/api/types.ts. Схемы см.
// backend/app/schemas/{auth,team,dashboard,metric,rpe}.py — при расхождении бэкенд
// главнее.

export type GlobalRole = "admin" | "staff" | "player";
export type TeamRole = "head_coach" | "coach" | "medic" | "athlete";
export type Zone = "green" | "yellow" | "red";
export type MetricZone = Zone | "no_data" | "undertraining" | "optimal" | "overreaching" | "high_risk";
export type AvailabilityStatus = "full" | "modified" | "unavailable";

export interface Team {
  id: string;
  org_id: string;
  name: string;
  sport: string | null;
}

export interface Membership {
  team_id: string;
  team_name: string;
  team_role: TeamRole;
}

export interface Me {
  id: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  global_role: GlobalRole;
  org_id: string | null;
  email: string | null;
  phone: string | null;
  teams: Membership[];
  // Юридический гейт онбординга (152-ФЗ ст. 9/10) — заполняется в мобильном
  // приложении при первом входе; backend/app/api/deps.py:require_consented
  // требует оба флага на каждый эндпоинт кроме /auth/* и /consent/*.
  terms_accepted: boolean;
  health_consent_accepted: boolean;
}

// ------------------------------------------------------------ Squad Status

export interface SquadPlayer {
  athlete_id: string;
  name: string;
  position: string | null;
  readiness: number | null;
  readiness_zone: Zone | null;
  acwr: number | null;
  load_zone: MetricZone;
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

// ------------------------------------------------------------ Team summary

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
  type: "training" | "match" | "individual" | "other";
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
  | "low_readiness"
  | "low_sleep"
  | "low_energy"
  | "low_mood"
  | "high_stress"
  | "high_soreness"
  | "high_load"
  | "rising_load"
  | "undertraining"
  | "injury"
  | "unavailable"
  | "hr_flag"
  | "no_survey";

export interface TeamAlert {
  athlete_id: string;
  name: string;
  severity: "risk" | "caution";
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

// ------------------------------------------------------------ Athlete report

export interface DailyMetric {
  athlete_id: string;
  date: string;
  daily_load: number;
  ewma_acute: number | null;
  ewma_chronic: number | null;
  acwr: number | null;
  load_zone: MetricZone;
  readiness: number | null;
  readiness_zone: Zone | null;
  hr_flag: boolean;
  unavailable_flag: boolean;
}

export interface ReadinessComponent {
  key: "sleep_quality" | "energy" | "mood" | "soreness" | "stress";
  value: number;
  normalized: number;
  weight: number;
  contribution: number;
  deficit: number;
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
  zone: Zone;
}

export interface ReadinessBreakdownAverage {
  date_from: string;
  date_to: string;
  days_with_data: number;
  components: ReadinessComponent[];
  avg_score: number | null;
}

// Зоны тела карты боли и структурированной травмы/симптома — буквально
// backend/app/models/enums.py (BodyRegion/BodySide/InjuryType/SymptomType/
// RecoveryMethod), см. docs/plan-web-day-detail.md.
export type BodyRegion =
  | "head"
  | "neck"
  | "shoulder"
  | "upper_back"
  | "lower_back"
  | "chest"
  | "abdomen"
  | "elbow"
  | "forearm"
  | "wrist"
  | "hand"
  | "hip"
  | "glute"
  | "groin"
  | "quad"
  | "hamstring"
  | "knee"
  | "calf"
  | "shin"
  | "ankle"
  | "foot";

export type BodySide = "left" | "right" | "center";

export type InjuryType = "muscle" | "joint" | "ligament" | "tendon" | "bone" | "bruise" | "other";

export type SymptomType =
  | "illness"
  | "fever"
  | "cough"
  | "sore_throat"
  | "headache"
  | "gastro"
  | "fatigue"
  | "other";

export type RecoveryMethod = "massage" | "compression" | "cryo_compression" | "physio";

export interface PainPoint {
  region: BodyRegion;
  side: BodySide;
  severity: number;
  note: string | null;
}

// Полная форма WellnessOut (backend/app/schemas/wellness.py). До
// docs/plan-web-day-detail.md (2026-10-15) injury_details/symptom_details/comment/
// pain_points сюда намеренно не включались — тренерский веб-кабинет их не показывал
// (см. docs/plan-web-admin.md, «Персональные и медицинские данные»). Решение
// отменено по запросу пользователя: доступ — паритет с мобилкой, без разграничения
// coach/medic (ensure_can_view_athlete, без изменений в core/authz.py).
export interface WellnessEntry {
  id: string;
  athlete_id: string;
  date: string;
  mood: number;
  energy: number;
  sleep_quality: number;
  sleep_hours: number | null;
  stress: number;
  soreness: number;
  injury: boolean;
  injury_details: string | null;
  injury_area: BodyRegion | null;
  injury_type: InjuryType | null;
  symptom: boolean;
  symptom_details: string | null;
  symptom_type: SymptomType | null;
  resting_hr: number | null;
  comment: string | null;
  pain_points: PainPoint[];
  recovery_methods: RecoveryMethod[];
}

export interface RpeEntry {
  id: string;
  athlete_id: string;
  event_id: string | null;
  date: string;
  exertion: number;
  performance: number;
  duration_min: number;
  session_load: number;
  is_late: boolean;
}

// ------------------------------------------------------------ УМО/ТМО

export type MedicalExamKind = "umo" | "tmo";

export interface MedicalExam {
  id: string;
  athlete_id: string;
  kind: MedicalExamKind;
  passed_date: string;
  valid_until: string;
  created_by: string;
  created_at: string;
}

export interface MedicalExams {
  exams: MedicalExam[];
  current_umo: MedicalExam | null;
  current_tmo: MedicalExam | null;
}
