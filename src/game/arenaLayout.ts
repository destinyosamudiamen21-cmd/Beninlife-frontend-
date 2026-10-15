// The arithmetic of the fight club: where everything stands, what a player bumps into,
// and what they are near enough to use. No 3D imports here, so all of it can be tested alone.

import {
  EDGE_MARGIN,
  PLAYER_RADIUS,
  buildCollider,
  type Collider,
} from "./collision";
import type { Building } from "./districtData";
import type { Hold } from "./fightMoves";

/** The room, in metres. The back-left corner is (0, 0); the camera looks in from the front. */
export const ARENA = {
  width: 22,
  depth: 14,
  wallHeight: 5.2,
  ring: {
    x: 11,
    z: 6.2,
    canvas: 3.0, // half the square the fighters stand on
    apron: 3.3, // half the platform, out to its skirt
    floor: 0.9, // how high the canvas is off the ground
    post: 1.45, // corner posts, above the canvas
  },
  /** The heavy bags, hanging in a row down the left wall. */
  bags: [
    { x: 3.0, z: 3.6 },
    { x: 3.0, z: 6.2 },
    { x: 3.0, z: 8.8 },
  ],
  bagRadius: 0.24,
  coach: { x: 18.4, z: 9.3, rot: -1.75 },
  table: { x: 19.9, z: 9.3, halfX: 0.45, halfZ: 0.8 },
  /** Two tiers of benches along the back wall, where people watch from. */
  stands: { minX: 6.0, maxX: 16.0, front: 2.15 },
  tyre: { x: 17.6, z: 3.6, radius: 0.72 },
  rack: { x: 20.9, z: 5.6, halfX: 0.45, halfZ: 1.3 },
  bench: { x: 1.1, z: 11.6, halfX: 0.3, halfZ: 1.1 },
  /** Where a player stands after coming in. */
  door: { x: 11, z: 12.7 },
};

/** What the player is close enough to use. */
export type Near =
  | { kind: "coach" }
  | { kind: "bag"; bag: number }
  | { kind: "ring" }
  | null;

const COACH_REACH = 2.3;
const BAG_REACH = 1.5;
const RING_REACH = 1.3; // from the edge of the platform

/** The nearest thing a player at (x, z) can use. The coach wins over the ring, the ring over a bag. */
export function nearAt(x: number, z: number): Near {
  if (Math.hypot(x - ARENA.coach.x, z - ARENA.coach.z) < COACH_REACH)
    return { kind: "coach" };

  const ring = ARENA.ring;
  const fromRing =
    Math.max(Math.abs(x - ring.x), Math.abs(z - ring.z)) - ring.apron;
  if (fromRing < RING_REACH) return { kind: "ring" };

  let best = -1,
    gap = BAG_REACH;
  ARENA.bags.forEach((bag, index) => {
    const distance = Math.hypot(x - bag.x, z - bag.z);
    if (distance < gap) {
      gap = distance;
      best = index;
    }
  });
  return best >= 0 ? { kind: "bag", bag: best } : null;
}

export function sameNear(a: Near, b: Near): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  return a.kind !== "bag" || (b.kind === "bag" && a.bag === b.bag);
}

function solid(x: number, z: number, halfX: number, halfZ: number): Building {
  return { r: [x, z, halfX, halfZ, 0], f: 1, s: 0, k: "flat" };
}

/** Everything that stands on the gym floor, as the same kind of collider the street uses. */
export function arenaCollider(): Collider {
  const { ring, stands, tyre, rack, table, bench, coach } = ARENA;
  const solids: Building[] = [
    solid(ring.x, ring.z, ring.apron, ring.apron),
    solid(
      (stands.minX + stands.maxX) / 2,
      stands.front / 2,
      (stands.maxX - stands.minX) / 2,
      stands.front / 2
    ),
    solid(tyre.x, tyre.z, tyre.radius, tyre.radius),
    solid(rack.x, rack.z, rack.halfX, rack.halfZ),
    solid(table.x, table.z, table.halfX, table.halfZ),
    solid(bench.x, bench.z, bench.halfX, bench.halfZ),
    solid(coach.x, coach.z, 0.28, 0.28),
    ...ARENA.bags.map((bag) =>
      solid(bag.x, bag.z, ARENA.bagRadius, ARENA.bagRadius)
    ),
  ];

  // The collider keeps players EDGE_MARGIN inside its bounds. Setting the bounds this far
  // outside the walls makes that land exactly a body's width from each wall.
  const reach = EDGE_MARGIN - PLAYER_RADIUS;
  return buildCollider({
    id: "arena",
    name: "Fight club",
    attribution: "",
    bounds: {
      minX: -reach,
      maxX: ARENA.width + reach,
      minZ: -reach,
      maxZ: ARENA.depth + reach,
    },
    spawn: [ARENA.door.x, ARENA.door.z],
    floorHeight: ARENA.wallHeight,
    buildings: solids,
    roads: [],
    areas: [],
    gates: [],
    pillars: [],
    trees: [],
    labels: [],
  });
}

// ---- where people are stood ------------------------------------------------

const FIGHT_GAP = 0.68; // each fighter stands this far from the middle of the ring
const QUARTER = Math.PI / 2;

/** The two fighters face each other across the middle of the ring, side-on to the camera. */
export function fightHold(side: "you" | "them"): Hold {
  const { ring } = ARENA;
  const sign = side === "you" ? -1 : 1;
  return {
    x: ring.x + sign * FIGHT_GAP,
    z: ring.z,
    y: ring.floor,
    rot: -sign * QUARTER, // the player on the left faces right, and the other way round
    lookX: ring.x,
    lookZ: ring.z,
    lookY: ring.floor + 0.95,
    // High enough to see both fighters over the top rope.
    distance: 6.0,
    height: 1.9,
    side: 0,
  };
}

/** Standing at a heavy bag, hitting it. The bags hang by the left wall, so the player faces left. */
export function bagHold(bag: number): Hold {
  const spot = ARENA.bags[bag] ?? ARENA.bags[0];
  return {
    x: spot.x + 0.78,
    z: spot.z,
    y: 0,
    rot: -QUARTER,
    lookX: spot.x + 0.4,
    lookZ: spot.z,
    lookY: 1.2,
    // From the right, so the next bag along is not in the way.
    distance: 3.4,
    height: 0.8,
    side: 2.2,
  };
}

/** Where a player is put down after a fight: at the foot of the ring, on the camera's side. */
export function ringside(): { x: number; z: number } {
  return { x: ARENA.ring.x, z: ARENA.ring.z + ARENA.ring.apron + 1.1 };
}
