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

export function inviteToBooth(playerId: string, guestId: string): Promise<{ club: Club; guest: string }> {
  return request<{ club: Club; guest: string }>(`/players/${playerId}/club/invite`, sendJson("POST", { player_id: guestId }));
}

// ---- a night out: the door, the menu, the floor, the board ---------------------------------

/** Something on the club's menu. */
export type ClubItem = { id: string; zone: "vip" | "dj" | "dance"; name: string; price: number; cooldown: number; tags: string[] };
export type Spender = { name: string; spent: number };
export type FeedItem = { text: string; kind: string; at_ms: number };

/** How the night is going in the club the player is in. */
export type Night = {
  club: string;
  name: string;
  open: boolean;
  /** The player's own time. */
  clock: string;
  /** What the DJ is playing. */
  song: string;
  /** Who took the club over tonight, or "". */
  takeover: string;
  /** Naira lying on the floor right now. */
  floor: number;
  feed: FeedItem[];
  /** The top ten in this club tonight. */
  tonight: Spender[];
  /** The top ten in every club, ever. */
  ever: Spender[];
  here: number;
  items: ClubItem[];
  /** The bundles of notes that can be sprayed. */
  sprays: number[];
  songs: string[];
  /** Seconds before each item can be ordered again. */
  ready_in: Record<string, number>;
  money: number;
  /** What was just picked up off the floor. */
  picked: number;
  ambient: string;
};

/** Order off the menu. `amount` and `target` are for spraying, `song` for a request. */
export type ClubOrder = { item: string; amount?: number; target?: string | null; song?: string };

export function fetchNight(playerId: string): Promise<Night> {
  return request<Night>(`/players/${playerId}/club/live`);
}

export function orderAtClub(playerId: string, order: ClubOrder): Promise<Night> {
  return request<Night>(`/players/${playerId}/club/act`, sendJson("POST", order));
}

export function pickUpMoney(playerId: string): Promise<Night> {
  return request<Night>(`/players/${playerId}/club/pick`, { method: "POST" });
}

/** Hang about outside until the doors open at ten. */
export function waitForTen(playerId: string): Promise<{ lines: string[] }> {
  return request<{ lines: string[] }>(`/players/${playerId}/club/wait`, { method: "POST" });
}

/** At the door of one of the GRA clubs: let in (for a minute, to walk through) at night. Refused with 423 while it is shut. */
export function clubDoor(playerId: string, club: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/players/${playerId}/club/door`, sendJson("POST", { club }));
}
