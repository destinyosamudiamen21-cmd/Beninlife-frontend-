import { request, sendJson } from "./request";

export type TravelOption = { id: string; name: string; fare: number };

export type TravelChoices = {
  here: string;
  here_name: string;
  places: TravelOption[];
  money: number;
};

export type Trip = {
  district: string;
  name: string;
  fare: number;
  money: number;
};

export function fetchTravel(playerId: string): Promise<TravelChoices> {
  return request<TravelChoices>(`/players/${playerId}/travel`);
}

export function takeBus(playerId: string, to: string): Promise<Trip> {
  return request<Trip>(`/players/${playerId}/travel`, sendJson("POST", { to }));
}
