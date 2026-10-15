import { request, sendJson } from "./request";

// ---- the bus stop, as it was before the map -----------------------------------------

export type TravelOption = { id: string; name: string; fare: number };

export type TravelChoices = { here: string; here_name: string; places: TravelOption[]; money: number };

export type Trip = { district: string; name: string; fare: number; money: number };

export function fetchTravel(playerId: string): Promise<TravelChoices> {
  return request<TravelChoices>(`/players/${playerId}/travel`);
}

export function takeBus(playerId: string, to: string): Promise<Trip> {
  return request<Trip>(`/players/${playerId}/travel`, sendJson("POST", { to }));
}

// ---- the city map -------------------------------------------------------------------

export type RideMode = "trek" | "bus" | "keke" | "bike" | "cab" | "drive";

/** One way of getting to a place from where the player is now. */
export type RideOption = {
  mode: RideMode;
  name: string;
  /** Naira. 0 for walking. */
  fare: number;
  /** How long the ride takes to watch. */
  seconds: number;
  /** How long it takes by the player's own clock. */
  minutes: number;
  note: string;
  /** Why it cannot be taken right now, or null if it can. */
  blocked: string | null;
};

/** A place marked on the map. (x, z) is where it is inside its own district. */
export type CityPlace = {
  id: string;
  name: string;
  /** Which picture the map gives it: "stop", "school", "food", "club", "market" ... */
  kind: string;
  district: string;
  district_name: string;
  x: number;
  z: number;
  /** In the district the player is in. */
  here: boolean;
  metres: number;
  options: RideOption[];
};

export type City = {
  district: string;
  district_name: string;
  x: number;
  z: number;
  /** False indoors: they must go outside before going anywhere. */
  on_street: boolean;
  places: CityPlace[];
  money: number;
};

/** A ride that has been paid for. The server has already put the player down at (x, z) in `district`. */
export type Going = {
  place: string;
  name: string;
  mode: RideMode;
  ride: string;
  district: string;
  district_name: string;
  x: number;
  z: number;
  fare: number;
  money: number;
  seconds: number;
  /** Metres still to walk: more than 0 after a bus, which only goes to the bus stop. */
  walk: number;
  to_x: number;
  to_z: number;
  news: string[];
  /** The friends who rode along, by username. */
  crew?: string[];
};

/** Every place on the map, and what each way of getting there costs from where the player stands. */
export function fetchCity(playerId: string): Promise<City> {
  return request<City>(`/players/${playerId}/city`);
}

/** Pay for a ride to a place. Walking is not asked for: the player just walks. */
export function goTo(playerId: string, place: string, mode: RideMode): Promise<Going> {
  return request<Going>(`/players/${playerId}/city/go`, sendJson("POST", { place, mode }));
}
