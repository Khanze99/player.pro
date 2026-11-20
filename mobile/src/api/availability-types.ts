export type AvailabilityStatus = "full" | "modified" | "unavailable";
export type AvailabilityDirection = "medical" | "coaching";
export interface AvailabilityChange {
  id: string;
  athlete_id: string;
  direction: AvailabilityDirection;
  date: string;
  status: AvailabilityStatus;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  comment: string | null;
  source: "manual" | "legacy";
  version: number;
  created_at: string;
}
export interface DirectionState {
  status: AvailabilityStatus;
  effective_from: string;
  source: "default" | "manual" | "legacy";
  change: AvailabilityChange | null;
}
export interface AvailabilityState {
  athlete_id: string;
  today: string;
  start_date: string | null;
  status: AvailabilityStatus | null;
  medical: DirectionState | null;
  coaching: DirectionState | null;
  version: number;
  editable_directions: AvailabilityDirection[];
  can_view_details: boolean;
  summary: {
    availability_percent: number | null;
    tracked_days: number;
    full_days: number;
    modified_days: number;
    unavailable_days: number;
  };
}
export interface AvailabilityPayload {
  athlete_id: string;
  direction: AvailabilityDirection;
  date: string;
  status: AvailabilityStatus;
  comment: string;
  medical_note?: string;
  expected_version: number;
  request_id: string;
}
export interface AvailabilityPage {
  items: AvailabilityChange[];
  total: number;
  page: number;
  size: number;
}
export interface AvailabilityNotes {
  current: { change_id: string; date: string; medical_note: string } | null;
  items: { change_id: string; date: string; medical_note: string }[];
  total: number;
  page: number;
  size: number;
}
export interface AvailabilitySaved {
  change: AvailabilityChange;
  state: AvailabilityState;
}
