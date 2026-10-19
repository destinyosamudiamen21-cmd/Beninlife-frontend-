import type { Look } from "../api/appearance";
import type { Going } from "../api/travel";

/** Sent 10 times a second: where a player is. */
export type NetPlayer = {
  id: string;
  x: number;
  z: number;
  rot: number;
};

/** Sent only when it changes: who a player is, what they look like and what they are doing. */
export type RosterEntry = {
  id: string;
  username: string;
  look: Look;
  /** What their body is doing: "legwork", "sit", "out" (passed out) ... or "" for nothing in particular. */
  pose: string;
  /** The car they are driving, "model|colour|plate", or "" (or missing) on foot. */
  car?: string;
  /** A passenger: whose car they are in, or "". */
  riding?: string;
  /** A driver who has locked the doors. */
  locked?: boolean;
};

/** A car standing on the street: whose it is, which car, and where. */
export type ParkedCar = { id: string; look: string; x: number; z: number; rot: number };

/** Something the server tells one player besides who is where. */
export type WorldEvent =
  /** Somebody near enough to hear said something out loud. */
  | { type: "say"; id: string; name: string; text: string }
  /** One step of setting up a voice call with a player standing near. */
  | { type: "rtc"; from: string; data: Record<string, unknown> }
  /** A message arrived on the phone. `kind` is "money" when it is money that was sent: then `amount` is how much. */
  | { type: "dm"; from: string; name: string; text: string; kind?: string; amount?: number }
  /**
   * Riding in cars. To a passenger: `driver` is "" when they are out of the car (at `x`, `z`).
   * To a driver: `passenger` got "in" or "out".
   */
  | { type: "ride"; driver?: string; x?: number; z?: number; passenger?: string; kind?: string }
  /** A passenger: the car they are in drove into another district. */
  | { type: "drove"; district: string; x: number; z: number }
  /** Something happened to this player: `kind` says what ("vip": `name` brought them into a booth; "saved": `name` saved their number). */
  | { type: "event"; kind: string; name: string }
  /**
   * Moving about with friends. `kind`: "invite" (`name` asks this player to roll with them),
   * "joined", "left", "declined", "ride" (`name` took a ride and this player rode along:
   * `trip` is the ride), "behind" (`name` took a ride but this player could not go: `text` says why).
   */
  | { type: "crew"; kind: "invite" | "joined" | "left" | "declined" | "ride" | "behind"; from: string; name: string; where?: string; text?: string; trip?: Going };
