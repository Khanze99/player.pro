export type UserRole = "athlete" | "coach" | "doctor" | "masseur" | "admin";
export type StatusColor = "green" | "yellow" | "red";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  team_id: string | null;
  jersey_number: number | null;
  position: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Questionnaire {
  id: string;
  player_id: string;
  date: string;
  sleep_quality: number;
  fatigue: number;
  muscle_soreness: number;
  mood: number;
  stress: number;
  weight: number | null;
  rpe: number | null;
  status: StatusColor;
  created_at: string;
}

export interface PlayerStatus {
  player_id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  status: StatusColor | null;
  filled_today: boolean;
  last_questionnaire: Questionnaire | null;
}

export interface MedicalClearance {
  id: string;
  player_id: string;
  issued_date: string;
  valid_until: string;
  notes: string | null;
  pdf_url: string | null;
  created_by: string;
  created_at: string;
}

export interface MedicalNote {
  id: string;
  player_id: string;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
