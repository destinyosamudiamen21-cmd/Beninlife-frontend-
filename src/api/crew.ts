import { request, sendJson } from "./request";

/** Someone the player is moving about with. `where` is the part of town, never the exact spot. */
export type CrewMember = { id: string; username: string; online: boolean; where: string };
export type CrewInvite = { from_id: string; name: string; where: string };
export type Crew = { members: CrewMember[]; invites: CrewInvite[] };

/** Saying yes: the crew now, and where the server has put the player (beside their friend). */
export type Joined = {
  crew: Crew;
  district: string;
  x: number;
  z: number;
  /** False when the friend is somewhere private: the player stays where they are. */
  moved: boolean;
  /** "venue:club" when the friend is inside somewhere: the player is at its door. */
  venue: string;
  note: string;
};

export function fetchCrew(playerId: string): Promise<Crew> {
  return request<Crew>(`/players/${playerId}/crew`);
}

/** Only friends can be invited, and only while they are in the game. */
export function inviteToCrew(playerId: string, friendId: string): Promise<Crew> {
  return request<Crew>(`/players/${playerId}/crew/invite`, sendJson("POST", { to_id: friendId }));
}

export function acceptCrew(playerId: string, fromId: string): Promise<Joined> {
  return request<Joined>(`/players/${playerId}/crew/accept`, sendJson("POST", { from_id: fromId }));
}

export function declineCrew(playerId: string, fromId: string): Promise<Crew> {
  return request<Crew>(`/players/${playerId}/crew/decline`, sendJson("POST", { from_id: fromId }));
}

export function leaveCrew(playerId: string): Promise<Crew> {
  return request<Crew>(`/players/${playerId}/crew/leave`, sendJson("POST", {}));
}
