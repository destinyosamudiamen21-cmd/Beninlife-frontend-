import { request } from "./request";

export type Rank = { title: string; pay: number; shifts: number };
export type Track = { id: string; company: string; place: string; district: string; hours: string; blurb: string; ranks: Rank[] };
export type CareerNow = {
  track: string;
  company: string;
  place: string;
  rank: number;
  title: string;
  pay: number;
  shifts: number;
  next_title: string | null;
  shifts_to_next: number;
  hours: string;
};
export type OtherJob = { name: string; pay: string; where: string; place: string; how: string };
export type JobsBoard = { current: CareerNow | null; tracks: Track[]; others: OtherJob[] };

/** The jobs board: the player's office job, the careers on offer, and every other way to earn. */
export function fetchCareer(playerId: string): Promise<JobsBoard> {
  return request<JobsBoard>(`/players/${playerId}/career`);
}
