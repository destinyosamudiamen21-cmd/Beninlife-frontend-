import { request, sendJson } from "./request";

export type RaceKind = { id: string; name: string; laps: number; entry: number; prizes: number[]; odds: number; blurb: string };
export type Hire = { model: string; name: string; price: number };
export type Rival = { name: string; model: string; colour: string; seconds: number };

export type Race = {
  id: number;
  kind: string;
  name: string;
  laps: number;
  car_model: string;
  hired: boolean;
  car_id: number;
  look: string;
  bet: number;
  odds: number;
  rivals: Rival[];
  go_ms: number;
  now_ms: number;
  checkpoint: number;
  total: number;
  finished: boolean;
  state: string;
  seconds: number | null;
  place: number | null;
  won: number;
  false_start: boolean;
};

export type Races = {
  races: RaceKind[];
  hires: Hire[];
  min_bet: number;
  max_bet: number;
  current: Race | null;
  money: number;
};

export type RaceResult = { race: Race; message: string; money: number };

export const fetchRaces = (playerId: string) => request<Races>(`/players/${playerId}/races`);
export const startRace = (playerId: string, kind: string, hire: string | null, bet: number) =>
  request<Race>(`/players/${playerId}/races`, sendJson("POST", { kind, hire, bet }));
export const finishRace = (playerId: string) => request<RaceResult>(`/players/${playerId}/races/finish`, { method: "POST" });
export const giveUpRace = (playerId: string) => request<void>(`/players/${playerId}/races`, { method: "DELETE" });
