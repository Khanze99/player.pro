const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers: { ...headers, ...options?.headers } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, err.detail ?? "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; refresh_token: string; token_type: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: (token: string) => request<import("@/types").User>("/api/v1/auth/me", {}, token),

  teamDashboard: (teamId: string, token: string) =>
    request<import("@/types").PlayerStatus[]>(`/api/v1/dashboard/team/${teamId}`, {}, token),

  players: (teamId: string, token: string) =>
    request<import("@/types").User[]>(`/api/v1/players?team_id=${teamId}`, {}, token),

  player: (id: string, token: string) =>
    request<import("@/types").User>(`/api/v1/players/${id}`, {}, token),

  playerQuestionnaires: (id: string, token: string, days = 30) =>
    request<import("@/types").Questionnaire[]>(`/api/v1/players/${id}/questionnaires?days=${days}`, {}, token),

  playerClearances: (id: string, token: string) =>
    request<import("@/types").MedicalClearance[]>(`/api/v1/players/${id}/clearances`, {}, token),

  playerNotes: (id: string, token: string) =>
    request<import("@/types").MedicalNote[]>(`/api/v1/players/${id}/notes`, {}, token),

  createClearance: (data: { player_id: string; issued_date: string; valid_until: string; notes?: string }, token: string) =>
    request<import("@/types").MedicalClearance>("/api/v1/clearances/", { method: "POST", body: JSON.stringify(data) }, token),

  createNote: (data: { player_id: string; content: string }, token: string) =>
    request<import("@/types").MedicalNote>("/api/v1/clearances/notes", { method: "POST", body: JSON.stringify(data) }, token),
};
