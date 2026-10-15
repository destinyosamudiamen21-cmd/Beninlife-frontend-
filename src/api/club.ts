import { request, sendJson } from "./request";

export type Club = {
  name: string;
  visits: number;
  /** How long the player's booth has left. 0 means they have none. */
  vip_seconds: number;
  vip_price: number;
  vip_minutes: number;
  /** The booth is theirs: they rented it. A guest has a seat but cannot bring people in. */
  vip_host: boolean;
  /** How many more people they may bring into their booth. */
  guests_left: number;
  money: number;
};

export function fetchClub(playerId: string): Promise<Club> {
  return request<Club>(`/players/${playerId}/club`);
}

/** Walk in through the door. Refused with status 409 unless the player is standing at it. */
export function enterClub(playerId: string): Promise<Club> {
  return request<Club>(`/players/${playerId}/club/enter`, { method: "POST" });
}

export function rentBooth(playerId: string): Promise<Club> {
  return request<Club>(`/players/${playerId}/club/vip`, { method: "POST" });
}

export function inviteToBooth(
  playerId: string,
  guestId: string
): Promise<{ club: Club; guest: string }> {
  return request<{ club: Club; guest: string }>(
    `/players/${playerId}/club/invite`,
    sendJson("POST", { player_id: guestId })
  );
}
