// Things a player can walk up to and use, wherever they are: furniture at home, a
// roommate, the bar in the club, a shuttle stop on the street. One shape for all of them,
// so one button, one menu and one way of standing the player there serve every place.
// No 3D imports here, so all of it can be tested alone.

import type { Target } from "../api/life";
import type { Hold } from "./fightMoves";

/** A place to be stood: where, how high the floor is there, and which way to face (left out: towards the thing). */
export type Stand = { x: number; z: number; y?: number; rot?: number };

export type Near = {
  /** The same for the same thing every time: "item:12", "spot:bar". */
  key: string;
  /** What to tell the server it is. */
  target: Target;
  name: string;
  /** The word on the button before the name. "Use" if left out. */
  verb?: string;
  /** The patch of floor it covers, in metres. Something with no size is a point. */
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  /** How close to its edge a player must be to use it. */
  reach: number;
  /**
   * Where a player who was at (x, z) is put while using it: a seat, a stool, a place on
   * the dance floor. Left out, they stay where they stood and turn to face it. `action`
   * is what they are about to do with it: on a sofa, a nap lies down and a call sits up.
   */
  standAt?: (x: number, z: number, action?: string) => Stand;
  /** How far back the camera sits while they use it. */
  distance?: number;
};

/** How far a spot is from the nearest edge of a thing. 0 if it is on top of it. */
export function gapTo(thing: Near, x: number, z: number): number {
  const overX = Math.abs(x - thing.x) - thing.halfX;
  const overZ = Math.abs(z - thing.z) - thing.halfZ;
  return Math.hypot(Math.max(overX, 0), Math.max(overZ, 0));
}

/**
 * The thing a player at (x, z) is standing at: the nearest one within its own reach, or
 * null. When two are equally near the earlier one in the list wins, so the answer does
 * not flicker between them from one frame to the next. Nothing is created here: it runs
 * every frame, and hands back one of the things it was given.
 */
export function nearestOf(things: readonly Near[], x: number, z: number): Near | null {
  let best: Near | null = null;
  let bestGap = Infinity;
  for (const thing of things) {
    const gap = gapTo(thing, x, z);
    if (gap < thing.reach && gap < bestGap) {
      best = thing;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Where a player stands while using something: where the thing says, or else on the spot
 * they were at, turned to face it, with the camera drawn in on the two of them. With no
 * thing at all they are simply held where they are.
 */
export function holdAt(thing: Near | null, x: number, z: number, action?: string): Hold {
  const stand = thing?.standAt?.(x, z, action);
  const atX = stand ? stand.x : x;
  const atZ = stand ? stand.z : z;
  let rot = stand?.rot ?? 0;
  const towardsX = thing ? thing.x : atX;
  const towardsZ = thing ? thing.z : atZ;
  // Standing exactly on its centre there is no direction to face: keep facing the camera.
  if (thing && stand?.rot === undefined && Math.hypot(towardsX - atX, towardsZ - atZ) > 1e-6) {
    rot = Math.atan2(towardsX - atX, towardsZ - atZ);
  }
  return {
    x: atX,
    z: atZ,
    y: stand?.y ?? 0,
    rot,
    lookX: (atX + towardsX) / 2,
    lookZ: (atZ + towardsZ) / 2,
    lookY: 0.9 + (stand?.y ?? 0),
    distance: thing?.distance ?? 4.4,
    height: 2.3,
    side: 0,
  };
}
