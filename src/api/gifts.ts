import { request } from "./request";

export type Gifts = { money: number; news: string[] };

/** Any gift from the game that is on and not yet had (the birthday billion): given once each. */
export function openGifts(playerId: string): Promise<Gifts> {
  return request<Gifts>(`/players/${playerId}/gifts`, { method: "POST" });
}
