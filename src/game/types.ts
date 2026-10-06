import type { Look } from "../api/appearance";

/** Sent 10 times a second: where a player is. */
export type NetPlayer = {
  id: string;
  x: number;
  z: number;
  rot: number;
};

/** Sent only when it changes: who a player is and what they look like. */
export type RosterEntry = {
  id: string;
  username: string;
  look: Look;
};
