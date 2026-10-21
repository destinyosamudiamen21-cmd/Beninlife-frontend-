// The light in a house, and what it falls on: floors that shine, ceilings, and the glow of
// the lights themselves. Like the rest of the house it is made in code from the rooms, so
// it needs no model files and costs a phone very little.
//
// Real lights are dear on a phone, so most of the light is painted on: downlights along the
// walls throw a cone of warm light down the wall and a soft pool on the floor; lamps and
// chandeliers throw pools round them; a tray ceiling glows along its edge. All of it is one
// mesh drawn with one texture (homeLook.ts) and added on top of what it falls on.

import type { FloorFinish, FurnitureOption, HomePlan, PlacedItem, Room } from "../api/home";
import { MeshBuilder, type MeshData } from "./districtGeometry";

type Vec3 = [number, number, number];
import { HALF_WALL, WALL_HEIGHT, footprint, stairsRect, wallRect } from "./homeLayout";
import { isDone, serverNow, wallRuns, type WallRun } from "./homeRooms";
import { hexToLinear, type RGB } from "./tint";
import type { WallView } from "./homeGeometry";

// ---- floors -------------------------------------------------------------------------------

/** How a floor finish catches the light: polished stone and tiles, satin wood, or matte. */
export type Sheen = "polished" | "satin" | "matte";
const SHEEN: Record<string, Sheen> = {
  marble: "polished", marble_black: "polished", onyx: "polished", tiles_white: "polished", tiles_brown: "polished",
  tiles_blue: "polished", terrazzo: "polished", checker: "polished", porcelain: "polished",
  wood: "satin", wood_dark: "satin", walnut: "satin", parquet: "satin",
  cement: "matte", carpet: "matte", rug_floor: "matte",
};
export function sheenOf(finish: string): Sheen {
  return SHEEN[finish] ?? "satin";
}

/** How a finish is laid: boards, stone slabs that differ a little one from the next, or tiles in two colours. */
const PATTERN: Record<string, "planks" | "stone" | "checker"> = {
  wood: "planks", wood_dark: "planks", walnut: "planks", parquet: "planks",
  marble: "stone", marble_black: "stone", onyx: "stone", terrazzo: "stone", porcelain: "stone",
};
const PLANK = 1.5;   // metres a floorboard runs
function noise(n: number): number {
  let h = (n | 0) * 374761393 + 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/**
 * The floors of every finished room on a storey, one mesh for each sheen, so each can be
 * drawn with its own shine. Big tiles get a thin grout line; planks run one way.
 */
export function buildFloors(
  plan: HomePlan, rooms: Room[], floor: number, finishes: Map<string, FloorFinish>, now: number = serverNow(),
): Record<Sheen, MeshData> {
  const builders: Record<Sheen, MeshBuilder> = { polished: new MeshBuilder(), satin: new MeshBuilder(), matte: new MeshBuilder() };
  const cell = plan.cell;
  const stairs = plan.stairs;
  const inWell = (cx: number, cz: number) =>
    floor > 0 && stairs !== null && cx >= stairs.x && cx < stairs.x + stairs.w && cz >= stairs.z && cz < stairs.z + stairs.d;
  for (const room of rooms) {
    if (room.floor !== floor || !isDone(room, now)) continue;
    const finish = finishes.get(room.ground);
    const builder = builders[sheenOf(room.ground)];
    const a = hexToLinear(finish?.a ?? "#9d9a92"), b = hexToLinear(finish?.b ?? "#96938b");
    const tile = Math.max(1, finish?.tile ?? 2);
    const pattern = PATTERN[room.ground] ?? "checker";
    for (let cx = room.x; cx < room.x + room.w; cx++) {
      for (let cz = room.z; cz < room.z + room.d; cz++) {
        if (inWell(cx, cz)) continue;
        const x0 = cx * cell, z0 = cz * cell;
        if (pattern === "planks") {
          // Two boards across each cell, running along x, each board 1.5 m long and staggered.
          for (let half = 0; half < 2; half++) {
            const row = cz * 2 + half;
            const za = z0 + (half * cell) / 2, zb = za + cell / 2;
            const stagger = (row * 0.55) % PLANK;
            // Split the cell where a board ends inside it.
            const cuts = [x0, x0 + cell];
            const firstEnd = Math.ceil((x0 + stagger) / PLANK) * PLANK - stagger;
            for (let e = firstEnd; e < x0 + cell - 1e-6; e += PLANK) if (e > x0 + 1e-6) cuts.splice(cuts.length - 1, 0, e);
            for (let k = 0; k + 1 < cuts.length; k++) {
              const board = Math.floor((cuts[k] + stagger + 1e-6) / PLANK);
              const colour = mixRGB(a, b, noise(row * 131 + board * 17 + room.id));
              builder.face([[cuts[k], 0, za], [cuts[k + 1], 0, za], [cuts[k + 1], 0, zb], [cuts[k], 0, zb]], colour, [0, 1, 0]);
            }
          }
          continue;
        }
        const tx = Math.floor(cx / tile), tz = Math.floor(cz / tile);
        const colour = pattern === "stone" ? mixRGB(a, b, noise(tx * 73 + tz * 151 + room.id)) : (tx + tz) % 2 === 0 ? a : b;
        builder.face([[x0, 0, z0], [x0 + cell, 0, z0], [x0 + cell, 0, z0 + cell], [x0, 0, z0 + cell]], colour, [0, 1, 0]);
      }
    }
  }
  return { polished: builders.polished.build(), satin: builders.satin.build(), matte: builders.matte.build() };
}

// ---- ceilings -----------------------------------------------------------------------------

const CEILING = hexToLinear("#f3f0ea");
/** The ceilings are drawn only while the camera is lower than this: from above, the house is
 * seen into, as a doll's house is. */
export const CEILING_SEEN_BELOW = WALL_HEIGHT + 0.35;
const TRAY_RISE = 0.16;       // how much higher the middle of a tray ceiling is
const TRAY_INSET = 0.55;      // how far in from the walls the tray starts
const TRAY_MIN = 3.0;         // rooms smaller than this each way have a flat ceiling

/** Rooms have ceilings: seen from inside, never from above (they face down only), so the
 * view from over the house still looks in. Big rooms get a tray: a raised middle. */
export function buildCeilings(plan: HomePlan, rooms: Room[], floor: number, view: WallView, now: number = serverNow()): MeshData {
  const builder = new MeshBuilder();
  if (view.low) return builder.build();   // building: walls down, no ceilings
  const cell = plan.cell;
  const strip = stairsRect(plan);
  const H = WALL_HEIGHT;
  const down: Vec3 = [0, -1, 0];
  for (const room of rooms) {
    if (room.floor !== floor || !isDone(room, now)) continue;
    const x0 = room.x * cell, z0 = room.z * cell, x1 = (room.x + room.w) * cell, z1 = (room.z + room.d) * cell;
    const overStairs = floor === 0 && strip !== null && strip.minX < x1 && strip.maxX > x0 && strip.minZ < z1 && strip.maxZ > z0;
    if (overStairs && strip) {
      // Looking up the stairs: the stairwell's walls going up to the ceiling upstairs.
      const shaft = { r: CEILING.r * 0.62, g: CEILING.g * 0.6, b: CEILING.b * 0.56 };
      const top = H * 2;
      builder.face([[strip.minX, top, strip.minZ], [strip.maxX, top, strip.minZ], [strip.maxX, top, strip.maxZ], [strip.minX, top, strip.maxZ]], CEILING, down);
      builder.face([[strip.minX, H, strip.minZ], [strip.maxX, H, strip.minZ], [strip.maxX, top, strip.minZ], [strip.minX, top, strip.minZ]], shaft, [0, 0, 1]);
      builder.face([[strip.minX, H, strip.maxZ], [strip.maxX, H, strip.maxZ], [strip.maxX, top, strip.maxZ], [strip.minX, top, strip.maxZ]], shaft, [0, 0, -1]);
      builder.face([[strip.minX, H, strip.minZ], [strip.minX, H, strip.maxZ], [strip.minX, top, strip.maxZ], [strip.minX, top, strip.minZ]], shaft, [1, 0, 0]);
      builder.face([[strip.maxX, H, strip.minZ], [strip.maxX, H, strip.maxZ], [strip.maxX, top, strip.maxZ], [strip.maxX, top, strip.minZ]], shaft, [-1, 0, 0]);
    }
    if (overStairs || x1 - x0 < TRAY_MIN || z1 - z0 < TRAY_MIN) {
      // Flat, cell by cell, with a hole over the stairs.
      for (let cx = room.x; cx < room.x + room.w; cx++) {
        for (let cz = room.z; cz < room.z + room.d; cz++) {
          const ax = cx * cell, az = cz * cell;
          if (overStairs && strip && ax >= strip.minX - 1e-6 && ax < strip.maxX - 1e-6 && az >= strip.minZ - 1e-6 && az < strip.maxZ - 1e-6) continue;
          builder.face([[ax, H, az], [ax + cell, H, az], [ax + cell, H, az + cell], [ax, H, az + cell]], CEILING, down);
        }
      }
      continue;
    }
    const ix0 = x0 + TRAY_INSET, iz0 = z0 + TRAY_INSET, ix1 = x1 - TRAY_INSET, iz1 = z1 - TRAY_INSET;
    const top = H + TRAY_RISE;
    // The band round the edge, at the height of the walls ...
    builder.face([[x0, H, z0], [x1, H, z0], [x1, H, iz0], [x0, H, iz0]], CEILING, down);
    builder.face([[x0, H, iz1], [x1, H, iz1], [x1, H, z1], [x0, H, z1]], CEILING, down);
    builder.face([[x0, H, iz0], [ix0, H, iz0], [ix0, H, iz1], [x0, H, iz1]], CEILING, down);
    builder.face([[ix1, H, iz0], [x1, H, iz0], [x1, H, iz1], [ix1, H, iz1]], CEILING, down);
    // ... the raised middle ...
    builder.face([[ix0, top, iz0], [ix1, top, iz0], [ix1, top, iz1], [ix0, top, iz1]], CEILING, down);
    // ... and the step up to it, facing into the room.
    const step = { r: CEILING.r * 0.9, g: CEILING.g * 0.9, b: CEILING.b * 0.88 };
    builder.face([[ix0, H, iz0], [ix1, H, iz0], [ix1, top, iz0], [ix0, top, iz0]], step, [0, 0, 1]);
    builder.face([[ix0, H, iz1], [ix1, H, iz1], [ix1, top, iz1], [ix0, top, iz1]], step, [0, 0, -1]);
    builder.face([[ix0, H, iz0], [ix0, H, iz1], [ix0, top, iz1], [ix0, top, iz0]], step, [1, 0, 0]);
    builder.face([[ix1, H, iz0], [ix1, H, iz1], [ix1, top, iz1], [ix1, top, iz0]], step, [-1, 0, 0]);
  }
  return builder.build();
}

// ---- the glow -----------------------------------------------------------------------------
// One texture holds four soft shapes, a quarter each (homeLook.ts draws it):
//   the cone a downlight throws down a wall,  a round pool of light,
//   a small bright disc (a downlight seen from below),  and a strip that fades one way.

type Region = { u0: number; v0: number; u1: number; v1: number };
const PAD = 0.004;
export const ATLAS: Record<"cone" | "pool" | "dot" | "strip", Region> = {
  cone: { u0: 0 + PAD, v0: 0.5 + PAD, u1: 0.5 - PAD, v1: 1 - PAD },
  pool: { u0: 0.5 + PAD, v0: 0.5 + PAD, u1: 1 - PAD, v1: 1 - PAD },
  dot: { u0: 0 + PAD, v0: 0 + PAD, u1: 0.5 - PAD, v1: 0.5 - PAD },
  strip: { u0: 0.5 + PAD, v0: 0 + PAD, u1: 1 - PAD, v1: 0.5 - PAD },
};
/** The colour of the light: warm white, as the bulbs are. */
export const WARM: RGB = { r: 1.0, g: 0.74, b: 0.46 };
function warm(strength: number): RGB {
  return { r: WARM.r * strength, g: WARM.g * strength, b: WARM.b * strength };
}

/** Corners a, b, c, d (going round), drawn with one region of the texture: a-b along u, b-c along v. */
function decal(builder: MeshBuilder, corners: Vec3[], region: Region, strength: number, facing: Vec3): void {
  const { u0, v0, u1, v1 } = region;
  builder.face(corners, warm(strength), facing, [u0, v0, u1, v0, u1, v1, u0, v1]);
}

const DOWNLIGHT_EVERY = 1.45;   // metres between downlights along a wall
const DOWNLIGHT_IN = 0.32;      // how far from the wall they are set in the ceiling
const CONE_WIDTH = 1.25;        // how wide the light on the wall spreads at its widest
const LIFT = 0.006;             // how far a patch of light floats off what it lights

/** What gives off light, among the furniture: how big a pool it throws and how bright. */
const LAMPS: Record<string, { pool: number; strength: number; height: number; ceiling?: number }> = {
  lamp: { pool: 1.1, strength: 0.55, height: 0.7 },
  arc_lamp: { pool: 1.5, strength: 0.6, height: 1.9 },
  floor_lamp: { pool: 1.4, strength: 0.6, height: 1.6 },
  ring_lamp: { pool: 0.9, strength: 0.5, height: 1.5 },
  chandelier: { pool: 2.4, strength: 0.7, height: 2.3, ceiling: 1.3 },
  chandelier_crystal: { pool: 2.8, strength: 0.85, height: 2.2, ceiling: 1.7 },
  pendants: { pool: 1.8, strength: 0.6, height: 2.1, ceiling: 0.9 },
  console: { pool: 1.0, strength: 0.45, height: 1.0 },
};
/** Lights on a wall: they wash the wall above and below them. */
const SCONCES = new Set(["wall_light"]);

/**
 * Every patch of light on one storey: down the walls that are standing, on the floors, on
 * the ceilings, and round the lamps. Walls cut low for the camera get none (there is no wall
 * there to light), and nothing is lit while building.
 */
export function buildGlow(
  plan: HomePlan, rooms: Room[], floor: number, view: WallView, items: PlacedItem[], catalogue: FurnitureOption[],
  cutAway: (run: WallRun, view: WallView) => boolean, now: number = serverNow(), paintOf: (wall: string) => string | undefined = () => undefined,
): MeshData {
  const builder = new MeshBuilder();
  if (view.low) return builder.build();
  const cell = plan.cell;
  const H = WALL_HEIGHT;

  // Downlights along the standing walls of finished rooms.
  for (const run of wallRuns(rooms, floor, now)) {
    if (!isDone(run.room, now) || cutAway(run, view)) continue;
    const length = (run.to - run.from) * cell;
    if (length < 1.0) continue;
    const count = Math.max(1, Math.floor(length / DOWNLIGHT_EVERY));
    const inner = wallRect(plan, run);
    // A pale wall needs far less light to look lit than a dark one: the cone is dimmed to suit.
    const paint = hexToLinear(paintOf(run.room.wall) ?? "#e9dfc4");
    const luma = 0.2126 * paint.r + 0.7152 * paint.g + 0.0722 * paint.b;
    const coneStrength = 0.95 * (0.3 + 0.7 * Math.pow(1 - Math.min(1, luma), 1.4));
    // The wall's face inside the room, and which way the room is from it.
    const nx = run.axis === "x" ? -run.out : 0, nz = run.axis === "z" ? -run.out : 0;
    const face = run.axis === "x" ? inner.cx + nx * (HALF_WALL / 2) : inner.cz + nz * (HALF_WALL / 2);
    for (let i = 0; i < count; i++) {
      const along = run.from * cell + (length * (i + 0.5)) / count;
      const half = Math.min(CONE_WIDTH / 2, length / count / 2 + 0.1);
      const at = (a: number, y: number, off: number): Vec3 =>
        run.axis === "x" ? [face + nx * off, y, a] : [a, y, face + nz * off];
      // The cone down the wall: the top of the texture at the ceiling.
      decal(builder, [at(along - half, 0.12, LIFT), at(along + half, 0.12, LIFT), at(along + half, H - 0.04, LIFT), at(along - half, H - 0.04, LIFT)],
        ATLAS.cone, coneStrength, [nx, 0, nz]);
      // The light itself, a bright disc in the ceiling.
      const dx = run.axis === "x" ? face + nx * DOWNLIGHT_IN : along, dz = run.axis === "x" ? along : face + nz * DOWNLIGHT_IN;
      const r = 0.075;
      decal(builder, [[dx - r, H - LIFT, dz - r], [dx + r, H - LIFT, dz - r], [dx + r, H - LIFT, dz + r], [dx - r, H - LIFT, dz + r]], ATLAS.dot, 1.6, [0, -1, 0]);
      // A soft pool on the floor in front of it.
      const px = dx + nx * 0.45, pz = dz + nz * 0.45, pr = 0.8;
      decal(builder, [[px - pr, LIFT, pz - pr], [px + pr, LIFT, pz - pr], [px + pr, LIFT, pz + pr], [px - pr, LIFT, pz + pr]], ATLAS.pool, 0.28, [0, 1, 0]);
    }
  }

  // The glow along the edge of a tray ceiling (lights hidden in the step).
  for (const room of rooms) {
    if (room.floor !== floor || !isDone(room, now)) continue;
    const x0 = room.x * cell + 0.55, z0 = room.z * cell + 0.55, x1 = (room.x + room.w) * cell - 0.55, z1 = (room.z + room.d) * cell - 0.55;
    if (x1 - x0 < 3.0 - 1.1 || z1 - z0 < 3.0 - 1.1) continue;   // the same rooms as get a tray (buildCeilings)
    const strip = stairsRect(plan);
    if (floor === 0 && strip && strip.minX < x1 + 0.55 && strip.maxX > x0 - 0.55 && strip.minZ < z1 + 0.55 && strip.maxZ > z0 - 0.55) continue;
    const y = H + 0.16 - LIFT, w = 0.45;
    const down: Vec3 = [0, -1, 0];
    // Four strips, each bright at the step and fading towards the middle.
    decal(builder, [[x0, y, z0 + w], [x1, y, z0 + w], [x1, y, z0], [x0, y, z0]], ATLAS.strip, 0.55, down);
    decal(builder, [[x1, y, z1 - w], [x0, y, z1 - w], [x0, y, z1], [x1, y, z1]], ATLAS.strip, 0.55, down);
    decal(builder, [[x0 + w, y, z1], [x0 + w, y, z0], [x0, y, z0], [x0, y, z1]], ATLAS.strip, 0.55, down);
    decal(builder, [[x1 - w, y, z0], [x1 - w, y, z1], [x1, y, z1], [x1, y, z0]], ATLAS.strip, 0.55, down);
  }

  // Lamps, chandeliers and wall lights.
  const options = new Map(catalogue.map((option) => [option.id, option]));
  for (const item of items) {
    if (item.floor !== floor) continue;
    const option = options.get(item.item);
    if (!option) continue;
    const { w, d } = footprint(option, item.rot);
    const cx = (item.x + w / 2) * cell, cz = (item.z + d / 2) * cell;
    const lamp = LAMPS[item.item];
    if (lamp) {
      const r = lamp.pool;
      decal(builder, [[cx - r, LIFT * 2, cz - r], [cx + r, LIFT * 2, cz - r], [cx + r, LIFT * 2, cz + r], [cx - r, LIFT * 2, cz + r]], ATLAS.pool, lamp.strength, [0, 1, 0]);
      if (lamp.ceiling) {
        // A hanging light lights the ceiling round where it hangs.
        const c = lamp.ceiling, y = H - LIFT * 2;
        decal(builder, [[cx - c, y, cz - c], [cx + c, y, cz - c], [cx + c, y, cz + c], [cx - c, y, cz + c]], ATLAS.pool, lamp.strength * 0.9, [0, -1, 0]);
      }
    }
    if (SCONCES.has(item.item)) {
      // Against the wall behind it: light washing up and down from it.
      const turns = ((item.rot % 4) + 4) % 4;
      const back: [number, number] = [[0, -1], [1, 0], [0, 1], [-1, 0]][turns] as [number, number];
      const depth = (turns % 2 === 0 ? d : w) * cell / 2;
      const wx = cx + back[0] * (depth - 0.02), wz = cz + back[1] * (depth - 0.02);
      const half = 0.55;
      const n: Vec3 = [-back[0], 0, -back[1]];
      const at = (s: number, y: number): Vec3 => back[0] !== 0 ? [wx, y, wz + s] : [wx + s, y, wz];
      // Up from the light, and down from it: the cone, the right way up each time.
      decal(builder, [at(-half, H - 0.05), at(half, H - 0.05), at(half, 1.75), at(-half, 1.75)], ATLAS.cone, 0.8, n);
      decal(builder, [at(-half, 0.5), at(half, 0.5), at(half, 1.6), at(-half, 1.6)], ATLAS.cone, 0.7, n);
    }
  }
  return builder.build();
}

/** Real lights for a storey, kept few for phones: one warm light in the middle of each of the
 * biggest finished rooms, near the ceiling. */
export function roomLights(plan: HomePlan, rooms: Room[], floor: number, most = 5, now: number = serverNow()): { x: number; z: number; size: number }[] {
  const cell = plan.cell;
  return rooms
    .filter((room) => room.floor === floor && isDone(room, now))
    .map((room) => ({ x: (room.x + room.w / 2) * cell, z: (room.z + room.d / 2) * cell, size: room.w * room.d * cell * cell }))
    .sort((a, b) => b.size - a.size)
    .slice(0, most);
}
