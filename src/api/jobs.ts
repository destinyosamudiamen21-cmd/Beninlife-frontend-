import { request } from "./request";

/** A food order from Mimeals Cuisine, on its way to a door. */
export type Delivery = {
  id: number;
  to_id: string;
  to_name: string;
  district: string;
  x: number;
  z: number;
  dish: string;
  pay: number;
  started_ms: number;
  due_ms: number;
  state: string;
  /** The server's clock when it answered: the time left is counted from the server's clock, not the phone's. */
  now_ms: number;
};

export type Jobs = { delivery: Delivery | null; bonus_ready: boolean; streak: number };
export type HandedOver = { paid: number; late: boolean; message: string; money: number };
export type Bonus = { amount: number; streak: number; money: number; message: string };

export const fetchJobs = (playerId: string) => request<Jobs>(`/players/${playerId}/jobs`);
export const takeDelivery = (playerId: string) => request<Delivery>(`/players/${playerId}/delivery`, { method: "POST" });
export const handOver = (playerId: string) => request<HandedOver>(`/players/${playerId}/delivery/hand-over`, { method: "POST" });
export const dropDelivery = (playerId: string) => request<void>(`/players/${playerId}/delivery`, { method: "DELETE" });
export const claimBonus = (playerId: string) => request<Bonus>(`/players/${playerId}/daily-bonus`, { method: "POST" });
