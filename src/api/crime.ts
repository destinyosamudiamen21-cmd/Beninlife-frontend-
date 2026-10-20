import type { Look } from "./appearance";
import type { Fight, MoveId } from "./arena";
import { request, sendJson } from "./request";

/** A car parked on a side street that is nobody's in the game. */
export type StreetCar = { i: number; x: number; z: number; rot: number; look: string; name: string };
export type StreetCars = { district: string; cars: StreetCar[]; taken: number[] };

export type Stolen = {
  /** False: the alarm went off and it did not open. */
  ok: boolean;
  message: string;
  car_id: number;
  look: string;
  model: string;
  x: number;
  z: number;
  rot: number;
  alarm: boolean;
  stars: number;
  /** What a chop shop pays for it. */
  worth: number;
};

export type Sold = { paid: number; money: number; message: string };

export type HotCar = { car_id: number; look: string; model: string; worth: number };

export type ChopShop = { id: string; name: string; district: string; x: number; z: number };

/** A fight with somebody off the street: what they did when squared up to, and the fight itself. */
export type StreetFight = {
  /** Their own choice: "fight", "run" or "beg". */
  reaction: "fight" | "run" | "beg";
  name: string;
  look: Look;
  lines: string[];
  fight: Fight | null;
  over: boolean;
  /** "win", "loss", "draw", "ran", "begged" or "walked". */
  result: string | null;
  money: number;
  /** Naira that changed hands. */
  took: number;
  stars: number;
};

export type Crime = { stars: number; hot_car: HotCar | null; fight: StreetFight | null; chops: ChopShop[] };

/** How someone in the crowd looks, as the page draws them. */
export type CrowdLook = { body: "man" | "woman"; skin_tone: string; top_color: string; bottom_color: string };

export function fetchStreetCars(district: string): Promise<StreetCars> {
  return request<StreetCars>(`/street/cars/${district}`);
}

export function fetchCrime(playerId: string): Promise<Crime> {
  return request<Crime>(`/players/${playerId}/crime`);
}

export function stealCar(playerId: string, district: string, i: number): Promise<Stolen> {
  return request<Stolen>(`/players/${playerId}/crime/steal`, sendJson("POST", { district, i }));
}

export function sellHotCar(playerId: string): Promise<Sold> {
  return request<Sold>(`/players/${playerId}/crime/sell`, sendJson("POST", {}));
}

export function startStreetFight(playerId: string, x: number, z: number, look: CrowdLook): Promise<StreetFight> {
  return request<StreetFight>(`/players/${playerId}/crime/fight`, sendJson("POST", { x, z, look }));
}

export function streetPunch(playerId: string, move: MoveId): Promise<StreetFight> {
  return request<StreetFight>(`/players/${playerId}/crime/fight/move`, sendJson("POST", { move }));
}

export function walkAway(playerId: string): Promise<StreetFight> {
  return request<StreetFight>(`/players/${playerId}/crime/fight/give-up`, sendJson("POST", {}));
}
