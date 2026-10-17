import { request, sendJson } from "./request";

export type Who = { username?: string; player_id?: string };
export type Blocked = { id: string; username: string };
export type Blocks = { blocked: Blocked[] };

export type AdminReport = {
  id: number;
  reporter: string;
  reported: string;
  reported_id: string;
  reason: string;
  details: string;
  context: string;
  created_ms: number;
  reports_against: number;
  banned: boolean;
};

export function fetchReasons(): Promise<string[]> {
  return request<string[]>("/report-reasons");
}

export function fetchBlocks(playerId: string): Promise<Blocks> {
  return request<Blocks>(`/players/${playerId}/blocks`);
}

export function block(playerId: string, who: Who): Promise<Blocks> {
  return request<Blocks>(`/players/${playerId}/blocks`, sendJson("POST", who));
}

export function unblock(playerId: string, otherId: string): Promise<Blocks> {
  return request<Blocks>(`/players/${playerId}/blocks/${otherId}`, { method: "DELETE" });
}

export async function report(playerId: string, who: Who, reason: string, details: string): Promise<void> {
  await request<unknown>(`/players/${playerId}/reports`, sendJson("POST", { ...who, reason, details }));
}

// ---- admins ----

export function fetchReports(): Promise<{ reports: AdminReport[] }> {
  return request<{ reports: AdminReport[] }>("/admin/reports");
}

export async function closeReport(id: number): Promise<void> {
  await request<unknown>(`/admin/reports/${id}/close`, { method: "POST" });
}

export function banPlayer(who: Who, reason: string, days: number): Promise<{ username: string; until_ms: number }> {
  return request(`/admin/bans`, sendJson("POST", { ...who, reason, days }));
}

export async function unbanPlayer(who: Who): Promise<void> {
  await request<unknown>(`/admin/unban`, sendJson("POST", who));
}
