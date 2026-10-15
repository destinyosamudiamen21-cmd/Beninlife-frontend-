import type { Look } from "./appearance";
import { request, sendJson } from "./request";

export type Opponent = {
  id: string;
  name: string;
  about: string;
  /** What they say when you step in. */
  taunt: string;
  fee: number;
  /** What winning pays this player: less once they are already beaten. */
  prize: number;
  look: Look;
  beaten: boolean;
  /** False until everyone below them is beaten. */
  open: boolean;
};

export type MoveId = "jab" | "heavy" | "block" | "dodge";

export type MoveOption = {
  id: MoveId;
  name: string;
  cost: number;
  note: string;
};

export type Corner = { health: number; max_health: number; stamina: number };

export type Fight = {
  opponent: string;
  opponent_name: string;
  opponent_look: Look;
  round: number;
  rounds: number;
  exchange: number;
  exchanges: number;
  you: Corner;
  them: Corner;
  /** What you can read of their next move. */
  hint: string;
  /** What happened in the last exchange. */
  said: string[];
  your_move: MoveId | null;
  their_move: MoveId | null;
  you_hurt: boolean;
  them_hurt: boolean;
  over: boolean;
  result: "win" | "loss" | "draw" | null;
  knockout: boolean;
  prize: number;
  money: number;
};

export type Club = {
  coach: string;
  /** What the coach has to say right now. */
  lines: string[];
  fitness: number;
  max_fitness: number;
  /** 0 when there is nothing left to learn on the bag. */
  train_price: number;
  wins: number;
  losses: number;
  opponents: Opponent[];
  moves: MoveOption[];
  money: number;
  /** A fight that was left unfinished. */
  fight: Fight | null;
};

export function fetchClub(playerId: string): Promise<Club> {
  return request<Club>(`/players/${playerId}/arena`);
}

export function trainAtClub(playerId: string): Promise<Club> {
  return request<Club>(`/players/${playerId}/arena/train`, { method: "POST" });
}

export function startFight(playerId: string, opponent: string): Promise<Fight> {
  return request<Fight>(
    `/players/${playerId}/arena/fight`,
    sendJson("POST", { opponent })
  );
}

export function throwMove(playerId: string, move: MoveId): Promise<Fight> {
  return request<Fight>(
    `/players/${playerId}/arena/punch`,
    sendJson("POST", { move })
  );
}

export function giveUpFight(playerId: string): Promise<Club> {
  return request<Club>(`/players/${playerId}/arena/give-up`, {
    method: "POST",
  });
}
