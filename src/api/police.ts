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
};

/** The officers call the player over. Refused (409) unless the server has them at that checkpoint. */
export function getStopped(playerId: string, checkpoint: string): Promise<PoliceStop> {
  return request<PoliceStop>(`/players/${playerId}/police/stop`, sendJson("POST", { checkpoint }));
}

export function answerPolice(playerId: string, stop: string, choice: string): Promise<PoliceStop> {
  return request<PoliceStop>(`/players/${playerId}/police/answer`, sendJson("POST", { stop, choice }));
}
