import { request } from "./request";

/** Where a player's house is: its front door on the street. */
export type Address = {
  estate: string;
  name: string;
  street: string;
  /** "No. 4, BDPA Close" or "Apartment 3B, Palm Court Homes" */
  label: string;
  district: string;
  district_name: string;
  x: number;
  z: number;
  facing: number;
  /** They are standing at the door right now. */
  here: boolean;
};

/** One house players live in: its door, its number, and some of the people in it. */
export type HousePlot = {
  estate: string;
  estate_name: string;
  street: string;
  kind: string;
  number: number;
  label: string;
  x: number;
  z: number;
  facing: number;
  width: number;
  floors: number;
  residents: string[];
  count: number;
  mine: boolean;
};

export type Estates = { district: string; plots: HousePlot[] };

/** Null: no house yet (the story is not told). */
export function fetchAddress(playerId: string): Promise<Address | null> {
  return request<Address | null>(`/players/${playerId}/address`);
}

export function fetchEstates(district: string, playerId: string): Promise<Estates> {
  return request<Estates>(`/estates/${district}?player_id=${encodeURIComponent(playerId)}`);
}

/** The id of "Your house" among the places on the city map. */
export const HOME_PLACE = "myhome";
