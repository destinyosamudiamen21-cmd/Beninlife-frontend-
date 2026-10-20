import { request, sendJson } from "./request";

/** A police stop: what the officer is saying, and what the player can do about it. */
export type PoliceStop = {
  id: string;
  checkpoint: string;
  officer: string;
  /** What was said this round, in order. */
  lines: string[];
  /** Empty once it is over. */
  choices: { id: string; label: string }[];
  over: boolean;
  /** Naira that changed hands at this stop, so far. */
  paid: number;
  /** Game minutes it has cost, so far. */
  minutes: number;
  money: number;
  news: string[];
  /** "foot", "car" (pulled over) or "caught" (at the end of a chase). */
  kind: string;
  /** The checkpoint or the patrol. */
  place: string;
  /** The police took the car to their yard. */
  car_taken: boolean;
  /** They drove off: the chase is on. */
  fled: boolean;
};

/** A police patrol's route: a closed loop it goes round for ever at `speed` metres a second. */
export type PatrolRoute = { id: string; district: string; kind: "van" | "foot"; speed: number; points: [number, number][]; phase: number };
/** A checkpoint across a main road: where, and which way the road runs there. */
export type Checkpoint = { id: string; name: string; district: string; x: number; z: number; angle: number };
export type Patrols = {
  now_ms: number;
  routes: PatrolRoute[];
  /** Seconds of a chase left for this player, 0 if none. */
  wanted: number;
  checkpoints: Checkpoint[];
  /** How wanted the player is: 0 to 5 stars. */
  stars: number;
  chase_on_foot: boolean;
};

/** The stop a patrol opened as the player moved, or null. */
export function fetchStop(playerId: string): Promise<PoliceStop | null> {
  return request<PoliceStop | null>(`/players/${playerId}/police/stop`);
}

export function fetchPatrols(playerId: string): Promise<Patrols> {
  return request<Patrols>(`/players/${playerId}/police/patrols`);
}

/** The officers call the player over. Refused (409) unless the server has them at that checkpoint. */
export function getStopped(playerId: string, checkpoint: string): Promise<PoliceStop> {
  return request<PoliceStop>(`/players/${playerId}/police/stop`, sendJson("POST", { checkpoint }));
}

export function answerPolice(playerId: string, stop: string, choice: string): Promise<PoliceStop> {
  return request<PoliceStop>(`/players/${playerId}/police/answer`, sendJson("POST", { stop, choice }));
}
