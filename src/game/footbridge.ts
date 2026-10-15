// Footbridges: the decks and stairs a player can climb, and the roof over them.
// The map file gives every bridge and staircase a height at each point (Road.y).
// This file turns those into (1) something to walk on and (2) the roof and its posts.
// No 3D imports here, so all of it can be tested alone.

import { PLAYER_RADIUS, type Collider, type Point } from "./collision";
import type { DistrictData } from "./districtData";
import { MeshBuilder, type MeshData } from "./districtGeometry";
import { hexToLinear } from "./tint";

/** One straight piece of a deck or a staircase, from a to b. */
export type Walkway = {
  ax: number;
  az: number;
  ay: number;
  bx: number;
  bz: number;
  by: number;
  /** Half the width of the slab. */
  half: number;
};

const RAIL_GAP = 0.25; // a walker's middle stays this far inside the rail
const STEP_UP = 0.35; // the highest step taken without stairs
const ON_THE_GROUND = 0.5; // feet lower than this are still among the things on the street
const HEADROOM = 2.3; // a slab higher than this can be walked under
const NEAR_HEIGHT = 0.6; // a piece this close in height is the one being walked on
const RAIL_REACH = 1.0; // the rail to slide along is looked for this far up and down
const UP_HIGH = 1.2; // from here up the street below loses sight of the player
const TELEPORT = 1.5; // a jump this long in one step is not walking

/** Every climbable piece in a district. */
export function buildWalkways(district: DistrictData): Walkway[] {
  const walkways: Walkway[] = [];
  for (const road of district.roads) {
    const heights = road.y;
    if (!heights) continue;
    for (let i = 0; i + 1 < heights.length; i++) {
      const ax = road.p[i * 2],
        az = road.p[i * 2 + 1];
      const bx = road.p[i * 2 + 2],
        bz = road.p[i * 2 + 3];
      if (Math.hypot(bx - ax, bz - az) < 1e-6) continue;
      walkways.push({
        ax,
        az,
        ay: heights[i],
        bx,
        bz,
        by: heights[i + 1],
        half: road.w / 2,
      });
    }
  }
  return walkways;
}

// The nearest point of a piece to (x, z): how far along it (0 to 1), where, and how high.
const nearest = { t: 0, x: 0, z: 0, y: 0, gap: 0 };

function measure(piece: Walkway, x: number, z: number): void {
  const dx = piece.bx - piece.ax,
    dz = piece.bz - piece.az;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - piece.ax) * dx + (z - piece.az) * dz) / (dx * dx + dz * dz)
    )
  );
  nearest.t = t;
  nearest.x = piece.ax + dx * t;
  nearest.z = piece.az + dz * t;
  nearest.y = piece.ay + (piece.by - piece.ay) * t;
  nearest.gap = Math.hypot(x - nearest.x, z - nearest.z);
}

/**
 * How high the walkway is at a spot, or null if the spot is not on one.
 * Used for other players: the server only says where they are on the map, so someone
 * standing where a bridge is, is taken to be on it. (So is someone walking in the road
 * right under it. Telling the two apart needs the server to carry a height.)
 */
export function walkwayHeight(
  walkways: Walkway[],
  x: number,
  z: number
): number | null {
  let found: number | null = null;
  let gap = Infinity;
  for (const piece of walkways) {
    measure(piece, x, z);
    if (nearest.gap <= piece.half && nearest.gap < gap) {
      gap = nearest.gap;
      found = nearest.y;
    }
  }
  return found;
}

/** A collider that also knows how high the player's feet are. */
export type Climber = Collider & {
  /** Height of the player's feet after the last step. */
  height(): number;
  /**
   * Call with the player's own position in `out`. If they are up on a bridge, it is moved
   * to the foot of the nearest stairs and `up` is set: that is where the street below
   * should think they are.
   */
  street(out: { x: number; z: number; up: boolean }): void;
};

/**
 * Wraps the street's collider so its footbridges can be climbed.
 *
 * On the ground nothing changes, except that the low end of a staircase lifts the player
 * and the side of a staircase is a wall. Once the player's feet are off the ground they
 * are on the bridge: they stay between its rails, and nothing down on the street (a
 * stall, a passing bus) can touch them until they come down the other side.
 */
export function withFootbridges(
  base: Collider,
  district: DistrictData
): Climber {
  const walkways = buildWalkways(district);
  // The bottom of every staircase: where the street "sees" a player who is up above.
  const stairFeet: Point[] = [];
  for (const piece of walkways) {
    if (piece.ay < 0.05) stairFeet.push({ x: piece.ax, z: piece.az });
    if (piece.by < 0.05) stairFeet.push({ x: piece.bx, z: piece.bz });
  }

  let y = 0;
  let lastX = Infinity,
    lastZ = Infinity;

  /**
   * How high the staircase standing in the way of someone on the ground at (x, z) is, or
   * 0 if nothing is. The first low steps are not in the way, and nor is anything high
   * enough to walk under.
   */
  const wallAt = (x: number, z: number): number => {
    let height = 0;
    for (const piece of walkways) {
      measure(piece, x, z);
      if (
        nearest.gap < piece.half + PLAYER_RADIUS &&
        nearest.y > STEP_UP &&
        nearest.y < HEADROOM &&
        nearest.y > height
      ) {
        height = nearest.y;
      }
    }
    return height;
  };

  // Where two pieces meet, a spot is on both. The one whose middle line is nearest is the
  // one being walked on; choosing that way keeps the height smooth round a bend.

  /** The height of the piece underfoot at (x, z) if it can be stepped onto, or -1. */
  const stepAt = (x: number, z: number): number => {
    let height = -1,
      gap = Infinity;
    for (const piece of walkways) {
      measure(piece, x, z);
      if (
        nearest.gap <= piece.half - RAIL_GAP &&
        nearest.y <= y + STEP_UP &&
        nearest.gap < gap
      ) {
        gap = nearest.gap;
        height = nearest.y;
      }
    }
    return height;
  };

  /**
   * Feet height for someone on the ground stepping to (x, z), or -1 if a staircase is in
   * the way there. `fromWall` is what was in the way where they stood before the step.
   * Someone already in among the stairs (put down there, or stepped off the side of a
   * low step) is never shut in: they may always move towards lower stairs, and so out.
   */
  const settle = (x: number, z: number, fromWall: number): number => {
    const step = stepAt(x, z);
    if (step >= 0) return step;
    const wall = wallAt(x, z);
    if (wall === 0) return 0;
    return fromWall > 0 && wall <= fromWall ? 0 : -1;
  };

  const walkOnGround = (
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    out: Point
  ): boolean => {
    let hit = base.resolve(fromX, fromZ, toX, toZ, out);
    if (walkways.length === 0) return hit;

    const fromWall = wallAt(fromX, fromZ);
    let feet = settle(out.x, out.z, fromWall);
    if (feet < 0) {
      // The side of a staircase. Try the step along each axis alone, so the player slides
      // along it the way they slide along a wall.
      hit = true;
      const endX = out.x,
        endZ = out.z;
      if ((feet = settle(endX, fromZ, fromWall)) >= 0) {
        out.z = fromZ;
      } else if ((feet = settle(fromX, endZ, fromWall)) >= 0) {
        out.x = fromX;
      } else {
        out.x = fromX;
        out.z = fromZ;
        feet = y; // no step taken: still standing where they were
      }
    }
    y = feet;
    return hit;
  };

  const walkOnBridge = (
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    out: Point
  ): boolean => {
    // 1. The step ends on the bridge: take it.
    let best = -1,
      bestGap = Infinity;
    for (const piece of walkways) {
      measure(piece, toX, toZ);
      if (
        nearest.gap <= piece.half - RAIL_GAP &&
        Math.abs(nearest.y - y) <= NEAR_HEIGHT &&
        nearest.gap < bestGap
      ) {
        bestGap = nearest.gap;
        best = nearest.y;
      }
    }
    if (best >= 0) {
      out.x = toX;
      out.z = toZ;
      y = best;
      return false;
    }

    // 2. It ends past a rail: stop at the rail. Pushing straight out of it is what makes
    //    the player slide along.
    let railX = fromX,
      railZ = fromZ,
      railY = y;
    bestGap = Infinity;
    for (const piece of walkways) {
      measure(piece, toX, toZ);
      if (Math.abs(nearest.y - y) > RAIL_REACH || nearest.gap >= bestGap)
        continue;
      const reach = piece.half - RAIL_GAP;
      const scale = nearest.gap > reach ? reach / nearest.gap : 1;
      bestGap = nearest.gap;
      railX = nearest.x + (toX - nearest.x) * scale;
      railZ = nearest.z + (toZ - nearest.z) * scale;
      railY = nearest.y;
    }
    out.x = railX;
    out.z = railZ;
    y = railY;
    return true;
  };

  const resolve = (
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    out: Point
  ): boolean => {
    // Put somewhere new: off a bus, out of a house, back in the game after a refresh.
    // That is on the ground, unless the spot is where a walkway is: then they are on it.
    // (The server only remembers where a player was on the map, not how high. Someone
    // who left the game half way up the stairs must come back on the stairs, not shut
    // inside them.)
    if (Math.hypot(fromX - lastX, fromZ - lastZ) > TELEPORT) {
      y = 0;
      let gap = Infinity;
      for (const piece of walkways) {
        measure(piece, fromX, fromZ);
        if (nearest.gap < piece.half + PLAYER_RADIUS && nearest.gap < gap) {
          gap = nearest.gap;
          y = nearest.y;
        }
      }
    }

    const hit =
      y > ON_THE_GROUND
        ? walkOnBridge(fromX, fromZ, toX, toZ, out)
        : walkOnGround(fromX, fromZ, toX, toZ, out);
    lastX = out.x;
    lastZ = out.z;
    return hit;
  };

  const street = (out: { x: number; z: number; up: boolean }): void => {
    out.up = y > UP_HIGH;
    if (!out.up) return; // on the ground the street sees the player where they are
    let gap = Infinity;
    for (const foot of stairFeet) {
      const distance = Math.hypot(foot.x - lastX, foot.z - lastZ);
      if (distance < gap) {
        gap = distance;
        out.x = foot.x;
        out.z = foot.z;
      }
    }
  };

  return {
    resolve,
    size: base.size + walkways.length,
    height: () => y,
    street,
  };
}

// ---- the roof ------------------------------------------------------------

const ROOF_FROM = 2.0; // the roof starts where the stairs are this high: the low end is left open
const POST_HEIGHT = 2.45; // deck to eave
const RIDGE_RISE = 0.5; // eave to ridge
const OVERHANG = 0.3;
const POST_EVERY = 2.6; // metres
const POST = 0.05; // half its thickness

const ROOF_BLUE = hexToLinear("#2f5f9e");
const ROOF_BLUE_DARK = hexToLinear("#27508a");
const POST_GREY = hexToLinear("#55616b");

type Vec3 = [number, number, number];

/**
 * The roof over a district's footbridges, and the posts that carry it. The low end of
 * every staircase is left open to the sky, so the camera behind a player starting up the
 * stairs is never looking down at a roof.
 */
export function buildBridgeRoofs(district: DistrictData): MeshData {
  const builder = new MeshBuilder();

  for (const piece of buildWalkways(district)) {
    if (Math.max(piece.ay, piece.by) < ROOF_FROM) continue;

    // Keep only the stretch that is high enough.
    let t0 = 0,
      t1 = 1;
    if (piece.ay < ROOF_FROM)
      t0 = (ROOF_FROM - piece.ay) / (piece.by - piece.ay);
    if (piece.by < ROOF_FROM)
      t1 = (ROOF_FROM - piece.ay) / (piece.by - piece.ay);
    const length = Math.hypot(piece.bx - piece.ax, piece.bz - piece.az);
    if ((t1 - t0) * length < 0.4) continue;

    const ux = (piece.bx - piece.ax) / length,
      uz = (piece.bz - piece.az) / length;
    const sx = -uz,
      sz = ux; // across the walkway
    const spot = (t: number, across: number, lift: number): Vec3 => [
      piece.ax + (piece.bx - piece.ax) * t + sx * across,
      piece.ay + (piece.by - piece.ay) * t + lift,
      piece.az + (piece.bz - piece.az) * t + sz * across,
    ];

    // Two slopes meeting at a ridge down the middle. Seen from above and from underneath.
    // The roof runs a little past each end so two pieces meeting at a corner leave no gap.
    const reach = piece.half + OVERHANG;
    const lap = Math.min(0.5, piece.half) / length;
    const r0 = t0 > 0 ? t0 : -lap,
      r1 = t1 < 1 ? t1 : 1 + lap;
    const ridge0 = spot(r0, 0, POST_HEIGHT + RIDGE_RISE),
      ridge1 = spot(r1, 0, POST_HEIGHT + RIDGE_RISE);
    builder.sheet(
      [
        spot(r0, -reach, POST_HEIGHT),
        spot(r1, -reach, POST_HEIGHT),
        ridge1,
        ridge0,
      ],
      ROOF_BLUE,
      [-sx, 1, -sz]
    );
    builder.sheet(
      [
        spot(r0, reach, POST_HEIGHT),
        spot(r1, reach, POST_HEIGHT),
        ridge1,
        ridge0,
      ],
      ROOF_BLUE_DARK,
      [sx, 1, sz]
    );

    // Posts down both sides, standing on the edge of the slab.
    const posts = Math.max(1, Math.round(((t1 - t0) * length) / POST_EVERY));
    for (let i = 0; i <= posts; i++) {
      const t = t0 + ((t1 - t0) * i) / posts;
      for (const side of [-1, 1]) {
        const foot = spot(t, side * piece.half, 0);
        builder.box(
          foot[0],
          foot[2],
          POST,
          POST,
          foot[1],
          foot[1] + POST_HEIGHT + 0.04,
          POST_GREY,
          Math.atan2(uz, ux)
        );
      }
    }
  }
  return builder.build();
}
