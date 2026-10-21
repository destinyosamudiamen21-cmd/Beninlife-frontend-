// Turns a house and its furniture into triangles. Like the street, everything is built
// from boxes in code, so a house needs no model files and loads at once.
//
// A house is rooms on a plot (homeRooms.ts). Each room has its own floor and wall paint;
// a wall between two rooms is two halves, one painted for each. Walls the camera looks
// through are cut down low, as in The Sims, so the inside can always be seen. A room
// still being built is drawn as a building site at the stage the workers have reached.

import type { FloorFinish, FurnitureOption, HomePlan, Paint, PlacedItem, Room } from "../api/home";
import { MeshBuilder, type MeshData } from "./districtGeometry";
import { HALF_WALL, WALL_HEIGHT, footprint, stairsRect, wallRect } from "./homeLayout";
import { doorways, isDone, serverNow, stageProgress, wallRuns, type WallRun } from "./homeRooms";
import { hexToLinear, type RGB } from "./tint";

const STEPS = 10;
const CUT_HEIGHT = 0.32;    // a wall cut away so the camera can see past it
const LOW_HEIGHT = 0.55;    // every wall, while building and arranging: "walls down"
const LINTEL = 2.1;         // the top of a doorway
/** Real seconds each building stage takes, for drawing how far along it is. The server times it. */
export const STAGE_SECONDS = [60, 120, 90, 60];

type Vec3 = [number, number, number];

function shade(color: RGB, amount: number): RGB {
  return { r: color.r * amount, g: color.g * amount, b: color.b * amount };
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

const OUTSIDE_WALL = hexToLinear("#e8e2d6");
const WALL_TOP = hexToLinear("#4a423a");
const TRIM = hexToLinear("#5d4a39");
const MOULDING = hexToLinear("#f2efe8");   // skirting, crown moulding and door frames: white, as in a good house
const SKIRT_HEIGHT = 0.13;
const CROWN = 0.11;                        // how deep the crown moulding at the top of a wall is
const DOOR_WOOD = hexToLinear("#5a3d28");
const HANDLE = hexToLinear("#c9b26a");
const GLASS = hexToLinear("#9cc4dc");
const LOUVRE = hexToLinear("#d9e6ec");
const DARK = hexToLinear("#1d1a18");
const GRASS = hexToLinear("#8fb36e");
const GRASS_FAR = hexToLinear("#7fa262");
const GRID = hexToLinear("#6f9454");
const PAVEMENT = hexToLinear("#b9b4a8");
const ROAD = hexToLinear("#4b4d50");
const FENCE = hexToLinear("#b88a5a");
const CONCRETE = hexToLinear("#a7a49c");
const DIRT = hexToLinear("#8a6a48");
const BLOCK_A = hexToLinear("#9c9a94");
const BLOCK_B = hexToLinear("#8e8c86");
const PRIMER = hexToLinear("#e6e1d6");
const TIMBER = hexToLinear("#a0784c");
const SHEET = hexToLinear("#c9ccd0");
const SCAFFOLD = hexToLinear("#5f6468");
const PEG = hexToLinear("#d9b46a");

/** How to draw the walls: all low while building, or cut where the camera looks through them. */
export type WallView = { low: boolean; dirX: number; dirZ: number };

/** Is a wall facing the camera, so it would hide the inside? `dirX, dirZ` points from the house towards the camera. */
export function cutAway(run: WallRun, view: WallView): boolean {
  const facing = run.axis === "x" ? run.out * view.dirX : run.out * view.dirZ;
  return facing > 0.35;
}

type Look = { paints: Map<string, Paint>; finishes: Map<string, FloorFinish> };

export function looksOf(paints: Paint[], finishes: FloorFinish[]): Look {
  return { paints: new Map(paints.map((paint) => [paint.id, paint])), finishes: new Map(finishes.map((finish) => [finish.id, finish])) };
}

// ---- the plot ----------------------------------------------------------

function buildPlot(builder: MeshBuilder, plan: HomePlan, grid: boolean, hole: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null): void {
  const cell = plan.cell;
  const lot = plan.lot;
  const x0 = lot.min_x * cell, x1 = lot.max_x * cell, z0 = lot.min_z * cell, z1 = lot.max_z * cell;
  const ground = (ax: number, bx: number, az: number, bz: number, color: RGB, y = -0.02) =>
    builder.face([[ax, y, az], [bx, y, az], [bx, y, bz], [ax, y, bz]], color, [0, 1, 0]);
  const far = 70;
  if (hole) {
    // Upstairs, the ground round the stair hole only: down the hole are the stairs and the floor below.
    ground(x0, x1, z0, hole.minZ, GRASS);
    ground(x0, x1, hole.maxZ, z1, GRASS);
    ground(x0, hole.minX, hole.minZ, hole.maxZ, GRASS);
    ground(hole.maxX, x1, hole.minZ, hole.maxZ, GRASS);
  } else {
    ground(x0, x1, z0, z1, GRASS);
  }
  ground(x0 - far, x0, z0 - far, z1 + far, GRASS_FAR);
  ground(x1, x1 + far, z0 - far, z1 + far, GRASS_FAR);
  ground(x0, x1, z1, z1 + far, GRASS_FAR);
  // The street side: a pavement and the road beyond it.
  ground(x0, x1, z0 - 2.2, z0, PAVEMENT, -0.015);
  ground(x0 - far, x1 + far, z0 - 9, z0 - 2.2, ROAD, -0.018);
  for (let x = x0 - far; x < x1 + far; x += 4) builder.box(x + 1, z0 - 5.6, 0.9, 0.06, -0.017, -0.012, hexToLinear("#e6e2d6"));

  // A low fence round the plot, open on the street side.
  const post = (x: number, z: number) => builder.box(x, z, 0.05, 0.05, 0, 0.9, FENCE);
  for (let x = x0; x <= x1 + 1e-6; x += 1) post(x, z1);
  for (let z = z0; z <= z1 + 1e-6; z += 1) {
    post(x0, z);
    post(x1, z);
  }
  builder.box((x0 + x1) / 2, z1, (x1 - x0) / 2, 0.025, 0.55, 0.65, FENCE);
  builder.box(x0, (z0 + z1) / 2, 0.025, (z1 - z0) / 2, 0.55, 0.65, FENCE);
  builder.box(x1, (z0 + z1) / 2, 0.025, (z1 - z0) / 2, 0.55, 0.65, FENCE);

  if (grid) {
    // The building grid, a line every metre, so a room or a chair can be lined up by eye.
    for (let x = Math.ceil(x0); x <= x1; x += 1) builder.box(x, (z0 + z1) / 2, 0.012, (z1 - z0) / 2, -0.018, -0.012, GRID);
    for (let z = Math.ceil(z0); z <= z1; z += 1) builder.box((x0 + x1) / 2, z, (x1 - x0) / 2, 0.012, -0.018, -0.012, GRID);
  }
}

// ---- rooms -------------------------------------------------------------

function buildFloor(builder: MeshBuilder, plan: HomePlan, room: Room, finish: FloorFinish | undefined, skip: (cx: number, cz: number) => boolean): void {
  const cell = plan.cell;
  const a = hexToLinear(finish?.a ?? "#9d9a92"), b = hexToLinear(finish?.b ?? "#96938b");
  const tile = Math.max(1, finish?.tile ?? 2);
  for (let cx = room.x; cx < room.x + room.w; cx++) {
    for (let cz = room.z; cz < room.z + room.d; cz++) {
      if (skip(cx, cz)) continue;
      const colour = (Math.floor(cx / tile) + Math.floor(cz / tile)) % 2 === 0 ? a : b;
      const x0 = cx * cell, z0 = cz * cell;
      builder.face([[x0, 0, z0], [x0 + cell, 0, z0], [x0 + cell, 0, z0 + cell], [x0, 0, z0 + cell]], colour, [0, 1, 0]);
    }
  }
}

function windowIn(builder: MeshBuilder, plan: HomePlan, run: WallRun, at: number): void {
  // A louvre window, seen from inside and from outside. `at` is metres along the wall.
  const cell = plan.cell;
  const line = run.line * cell;
  const faces = [-run.out * (HALF_WALL + 0.01), run.out * (HALF_WALL + 0.01)];
  for (const offset of faces) {
    const x = run.axis === "x" ? line + offset : at;
    const z = run.axis === "z" ? line + offset : at;
    const hx = run.axis === "x" ? 0.012 : 0.62, hz = run.axis === "x" ? 0.62 : 0.012;
    builder.box(x, z, hx + (run.axis === "z" ? 0.06 : 0), hz + (run.axis === "x" ? 0.06 : 0), 0.95, 2.05, TRIM);
    builder.box(x + (run.axis === "x" ? Math.sign(offset) * 0.004 : 0), z + (run.axis === "z" ? Math.sign(offset) * 0.004 : 0), hx, hz, 1.02, 1.98, GLASS);
    for (let y = 1.14; y < 1.95; y += 0.16) {
      builder.box(x + (run.axis === "x" ? Math.sign(offset) * 0.01 : 0), z + (run.axis === "z" ? Math.sign(offset) * 0.01 : 0), hx, hz, y, y + 0.03, LOUVRE);
    }
  }
}

function doorIn(builder: MeshBuilder, x: number, z: number, along: "x" | "z", side: number, half: number): void {
  // A door in a wall: frame, panel and handle, on one face.
  const hx = along === "x" ? half : 0.02, hz = along === "x" ? 0.02 : half;
  const out = (d: number) => (along === "x" ? [x, z + side * d] : [x + side * d, z]) as [number, number];
  const [fx, fz] = out(HALF_WALL + 0.01);
  builder.box(fx, fz, hx + (along === "x" ? 0.07 : 0), hz + (along === "z" ? 0.07 : 0), 0, 2.2, MOULDING);
  const [px, pz] = out(HALF_WALL + 0.03);
  builder.box(px, pz, along === "x" ? half - 0.04 : 0.02, along === "x" ? 0.02 : half - 0.04, 0, 2.08, DOOR_WOOD);
  const [hxp, hzp] = out(HALF_WALL + 0.055);
  builder.box(hxp + (along === "x" ? half - 0.16 : 0), hzp + (along === "z" ? half - 0.16 : 0), 0.03, 0.03, 0.95, 1.05, HANDLE);
}

/**
 * One storey of a house: its plot, the floor and walls of every room, doors, windows,
 * doorways, stairs, and any room still going up as a building site.
 */
export function buildHouse(
  plan: HomePlan,
  rooms: Room[],
  floor: number,
  look: Look,
  view: WallView,
  options: { grid?: boolean; now?: number; floors?: boolean } = {},
): MeshData {
  const builder = new MeshBuilder();
  const cell = plan.cell;
  const now = options.now ?? serverNow();
  const strip = stairsRect(plan);
  const stairs = plan.stairs;
  buildPlot(builder, plan, Boolean(options.grid), floor > 0 ? strip : null);

  const here = rooms.filter((room) => room.floor === floor);
  const inWell = (cx: number, cz: number) =>
    floor > 0 && stairs !== null && cx >= stairs.x && cx < stairs.x + stairs.w && cz >= stairs.z && cz < stairs.z + stairs.d;

  // Floors of the finished rooms (unless they are drawn apart, each with its own shine: homeLighting.ts).
  if (options.floors !== false) {
    for (const room of here) {
      if (isDone(room, now)) buildFloor(builder, plan, room, look.finishes.get(room.ground), inWell);
    }
  }

  // Walls of the finished rooms: each run its own half, painted for its room, and the
  // outer half of an outside wall in the outside colour.
  const doorX0 = plan.door.x * cell, doorX1 = (plan.door.x + plan.door.w) * cell;
  for (const run of wallRuns(rooms, floor, now)) {
    if (!isDone(run.room, now)) continue;
    const height = view.low ? LOW_HEIGHT : cutAway(run, view) ? CUT_HEIGHT : WALL_HEIGHT;
    const paint = hexToLinear(look.paints.get(run.room.wall)?.hex ?? "#e9dfc4");
    const inner = wallRect(plan, run);
    const sideShade = run.axis === "x" ? 0.93 : 1;
    builder.box(inner.cx, inner.cz, inner.halfX, inner.halfZ, 0, height, shade(paint, sideShade));
    builder.box(inner.cx, inner.cz, inner.halfX, inner.halfZ, height, height + 0.004, WALL_TOP);
    if (!run.inner) {
      const outer = wallRect(plan, run, true);
      builder.box(outer.cx, outer.cz, outer.halfX, outer.halfZ, 0, height, shade(OUTSIDE_WALL, sideShade));
      builder.box(outer.cx, outer.cz, outer.halfX, outer.halfZ, height, height + 0.004, WALL_TOP);
    }
    // A white skirting board along the bottom, inside, and crown moulding along the top.
    const along = (depth: number) => run.axis === "x"
      ? { cx: inner.cx - run.out * (HALF_WALL / 2 + depth), cz: inner.cz, halfX: depth, halfZ: inner.halfZ }
      : { cx: inner.cx, cz: inner.cz - run.out * (HALF_WALL / 2 + depth), halfX: inner.halfX, halfZ: depth };
    const skirt = along(0.009);
    builder.box(skirt.cx, skirt.cz, skirt.halfX, skirt.halfZ, 0, Math.min(height, SKIRT_HEIGHT), MOULDING);
    if (height >= WALL_HEIGHT) {
      const lower = along(0.022), upper = along(0.04);
      builder.box(lower.cx, lower.cz, lower.halfX, lower.halfZ, WALL_HEIGHT - CROWN, WALL_HEIGHT, MOULDING);
      builder.box(upper.cx, upper.cz, upper.halfX, upper.halfZ, WALL_HEIGHT - CROWN * 0.45, WALL_HEIGHT, MOULDING);
    }

    if (height < WALL_HEIGHT) continue;
    // Windows in long outside walls, wherever the front door is not.
    if (!run.inner) {
      const length = (run.to - run.from) * cell;
      const count = Math.floor(length / 3);
      for (let i = 0; i < count; i++) {
        const at = run.from * cell + (length * (i + 0.5)) / count;
        const nearDoor = floor === 0 && run.axis === "z" && run.line === 0 && at > doorX0 - 0.9 && at < doorX1 + 0.9;
        const nearStairs = strip !== null && run.axis === "x" && run.line * cell <= strip.maxX + 0.01 && at > strip.minZ - 0.8 && at < strip.maxZ + 0.8;
        if (!nearDoor && !nearStairs && length >= 2) windowIn(builder, plan, run, at);
      }
    }
  }

  // The front door, in the back wall that faces the street.
  if (floor === 0) {
    const half = (plan.door.w * cell) / 2;
    const centre = (doorX0 + doorX1) / 2;
    const wallLow = view.low || view.dirZ < -0.35;
    if (!wallLow) {
      doorIn(builder, centre, 0, "x", 1, half);
      doorIn(builder, centre, 0, "x", -1, half);
    } else {
      builder.box(centre, 0, half, HALF_WALL + 0.02, 0, 0.05, DOOR_WOOD); // the threshold, so the door can be found from above
    }
    // Doors that come with a hostel room, in the left wall: the way to the bathroom.
    for (const fixture of plan.fixtures ?? []) {
      if (fixture.kind !== "door") continue;
      const z = (fixture.z + 0.5) * cell;
      if (!view.low) doorIn(builder, 0, z, "z", 1, 0.45);
      builder.box(0.08, z, 0.02, 0.3, 2.2, 2.42, hexToLinear("#f1efe9"));
    }
  }

  // Lintels over the doorways, when the walls are standing.
  if (!view.low) {
    for (const door of doorways(rooms, floor, now)) {
      const along = (door.first + 1) * cell;
      const line = door.line * cell;
      const x = door.axis === "x" ? line : along, z = door.axis === "z" ? line : along;
      const hx = door.axis === "x" ? HALF_WALL : cell, hz = door.axis === "x" ? cell : HALF_WALL;
      // A doorway in a wall the camera looks through has no lintel: it would float over a cut wall.
      if (Math.abs(door.axis === "x" ? view.dirX : view.dirZ) > 0.35) continue;
      builder.box(x, z, hx, hz, LINTEL, WALL_HEIGHT, OUTSIDE_WALL);
    }
  }

  // Rooms being built.
  for (const room of here) {
    if (!isDone(room, now)) buildSite(builder, plan, rooms, room, now, view);
  }

  if (strip && stairs) {
    // Looking down the stairs from upstairs: the stairwell in the colours of the room below.
    const under = rooms.find((room) => room.floor === floor - 1 && room.x <= stairs.x && room.x + room.w >= stairs.x + stairs.w && room.z <= stairs.z && room.z + room.d >= stairs.z + stairs.d);
    const below = under ? { wall: hexToLinear(look.paints.get(under.wall)?.hex ?? "#e9dfc4"), ground: hexToLinear(look.finishes.get(under.ground)?.a ?? "#9d9a92") } : undefined;
    buildStairs(builder, plan, floor, strip, stairs.w, below);
  }
  return builder.build();
}

/** A room the workers are on, drawn at the stage they have reached. */
function buildSite(builder: MeshBuilder, plan: HomePlan, rooms: Room[], room: Room, now: number, view: WallView): void {
  const cell = plan.cell;
  const x0 = room.x * cell, x1 = (room.x + room.w) * cell, z0 = room.z * cell, z1 = (room.z + room.d) * cell;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  const stage = room.stage;                                   // the stage in hand, 1 to 4
  const p = stageProgress(room, STAGE_SECONDS[stage - 1] ?? 60, now);
  const done = (n: number) => stage > n || (stage === n && p >= 1);

  // Pegs and string round the plot of the room, and the dug earth.
  builder.box(cx, cz, hx, hz, -0.015, -0.008, DIRT);
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) builder.box(px, pz, 0.03, 0.03, 0, 0.5, PEG);

  // 1. Foundation: the slab rises.
  const slab = 0.12 * (done(1) ? 1 : stage === 1 ? p : 0);
  if (slab > 0.005) builder.box(cx, cz, hx, hz, 0, slab, CONCRETE);
  if (stage === 1 && p < 1) {
    // A heap of sand and a stack of cement bags beside it.
    builder.box(x0 + 0.5, z1 + 0.6, 0.45, 0.35, 0, 0.35, hexToLinear("#d9c08a"));
    for (let i = 0; i < 3; i++) builder.box(x1 - 0.6, z1 + 0.5 + i * 0.01, 0.3, 0.2, i * 0.12, i * 0.12 + 0.12, hexToLinear("#c9c2b0"));
  }

  // 2. Blockwork: grey block walls, course by course.
  const fullHeight = view.low ? LOW_HEIGHT : WALL_HEIGHT;
  const wallHeight = done(2) ? fullHeight : stage === 2 ? Math.max(0.2, fullHeight * p) : 0;
  if (wallHeight > 0) {
    const plaster = stage === 4 ? Math.min(1, p) : stage > 4 ? 1 : 0;
    const course = 0.2;
    for (const run of wallRuns(rooms, room.floor, now)) {
      if (run.room.id !== room.id) continue;
      const rect = wallRect(plan, run);
      const outer = wallRect(plan, run, true);
      for (let y = 0; y < wallHeight - 1e-6; y += course) {
        const top = Math.min(wallHeight, y + course);
        const block = Math.round(y / course) % 2 === 0 ? BLOCK_A : BLOCK_B;
        const colour = mix(block, PRIMER, plaster);
        builder.box(rect.cx, rect.cz, rect.halfX, rect.halfZ, slab + y, slab + top, colour);
        if (!run.inner) builder.box(outer.cx, outer.cz, outer.halfX, outer.halfZ, slab + y, slab + top, colour);
      }
    }
    if (stage === 2 && p < 1) {
      // A pallet of blocks waiting to go up.
      for (let i = 0; i < 4; i++) builder.box(x1 + 0.55, z0 + 0.4 + i * 0.42, 0.22, 0.2, 0, 0.42, BLOCK_A);
    }
  }

  // 3. Roofing: rafters across, then the sheets laid over them.
  if (!view.low && (done(2) && (stage >= 3))) {
    const rafters = Math.max(2, Math.round((x1 - x0) / 0.6));
    const shown = done(3) ? rafters : Math.round(rafters * p);
    for (let i = 0; i <= shown; i++) {
      const x = x0 + ((x1 - x0) * i) / rafters;
      builder.box(x, cz, 0.04, hz + 0.15, WALL_HEIGHT + slab, WALL_HEIGHT + slab + 0.1, TIMBER);
    }
    if (done(3) || (stage === 3 && p > 0.5)) {
      const cover = done(3) ? 1 : (p - 0.5) * 2;
      builder.box(cx, z0 + hz * cover, hx + 0.2, hz * cover + 0.1, WALL_HEIGHT + slab + 0.1, WALL_HEIGHT + slab + 0.13, SHEET);
    }
  }

  // 4. Plastering and painting: scaffolding round the outside while the walls go white.
  if (stage === 4 && p < 1) {
    const step = 1.2;
    for (let x = x0; x <= x1 + 1e-6; x += step) {
      builder.box(x, z1 + 0.5, 0.03, 0.03, 0, 3.0, SCAFFOLD);
      builder.box(x, z0 - 0.5, 0.03, 0.03, 0, 3.0, SCAFFOLD);
    }
    for (const y of [1.0, 2.0, 2.9]) {
      builder.box(cx, z1 + 0.5, hx, 0.03, y, y + 0.05, SCAFFOLD);
      builder.box(cx, z0 - 0.5, hx, 0.03, y, y + 0.05, SCAFFOLD);
    }
  }
}

const TREAD = hexToLinear("#4a2f1c");      // walnut stair treads and handrail
const RISER = hexToLinear("#efebe3");
const RAIL_HEIGHT = 0.92;

/** A straight beam of square section `size` from point a to point b (a sloping handrail). */
function beam(builder: MeshBuilder, a: Vec3, b: Vec3, size: number, color: RGB): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-6) return;
  const f: Vec3 = [dx / length, dy / length, dz / length];
  // Two directions square to the beam: one level (side), one roughly up.
  let side: Vec3 = [f[2], 0, -f[0]];
  const sl = Math.hypot(side[0], side[2]) || 1;
  side = [side[0] / sl, 0, side[2] / sl];
  const up: Vec3 = [f[1] * side[2] - f[2] * side[1], f[2] * side[0] - f[0] * side[2], f[0] * side[1] - f[1] * side[0]];
  const h = size / 2;
  const corner = (p: Vec3, s: number, u: number): Vec3 => [p[0] + side[0] * s * h + up[0] * u * h, p[1] + side[1] * s * h + up[1] * u * h, p[2] + side[2] * s * h + up[2] * u * h];
  const ring = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) {
    const [s0, u0] = ring[k], [s1, u1] = ring[(k + 1) % 4];
    const out: Vec3 = [side[0] * (s0 + s1) + up[0] * (u0 + u1), side[1] * (s0 + s1) + up[1] * (u0 + u1), side[2] * (s0 + s1) + up[2] * (u0 + u1)];
    builder.face([corner(a, s0, u0), corner(b, s0, u0), corner(b, s1, u1), corner(a, s1, u1)], color, out);
  }
  builder.face(ring.map(([s0, u0]) => corner(b, s0, u0)), color, f);
  builder.face(ring.map(([s0, u0]) => corner(a, s0, u0)), color, [-f[0], -f[1], -f[2]]);
}

/** A handrail with balusters from (x0, y0, z0) to (x1, y1, z1): walnut posts, a walnut rail on top. */
function balustrade(builder: MeshBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, every = 0.2): void {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const count = Math.max(1, Math.round(length / every));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t;
    builder.box(x, z, 0.027, 0.027, y, y + RAIL_HEIGHT, TREAD);   // sides under 5 cm are not drawn (wallsAround)
  }
  beam(builder, [x0, y0 + RAIL_HEIGHT + 0.02, z0], [x1, y1 + RAIL_HEIGHT + 0.02, z1], 0.075, TREAD);
}

function buildStairs(builder: MeshBuilder, plan: HomePlan, floor: number, strip: { minX: number; maxX: number; minZ: number; maxZ: number }, _w: number, below?: { wall: RGB; ground: RGB }): void {
  const cell = plan.cell;
  const run = (strip.maxZ - strip.minZ) / STEPS;
  const rise = WALL_HEIGHT / STEPS;
  const middle = (strip.minX + strip.maxX) / 2;
  const half = (strip.maxX - strip.minX) / 2;
  // A staircase in the old style of good houses: walnut treads with a lip, white risers and
  // white sides, and white balusters with a walnut handrail on the open side.
  const flight = (base: number, bottomZ: (i: number) => number, sign: 1 | -1) => {
    for (let i = 0; i < STEPS; i++) {
      const z = bottomZ(i);                         // the middle of step i
      const top = base + (i + 1) * rise;
      builder.box(middle, z, half, run / 2, base, top - 0.045, RISER);                    // the body of the step: white
      builder.box(middle, z + sign * 0.025, half + 0.01, run / 2 + 0.025, top - 0.045, top, TREAD); // the tread, with a lip
    }
  };
  if (floor === 0) {
    // Going up: the bottom step is at the front, each one behind it a step higher.
    flight(0, (i) => strip.maxZ - i * run - run / 2, 1);
    const x = strip.maxX + 0.05;
    balustrade(builder, x, rise, strip.maxZ - run / 2, x, WALL_HEIGHT, strip.minZ + run / 2);
    builder.box(x, strip.maxZ - run / 2, 0.06, 0.06, 0, rise + RAIL_HEIGHT + 0.12, TREAD);   // the newel post at the foot
    return;
  }
  // Coming down: the same stairs seen from above, dropping away towards the front.
  flight(-WALL_HEIGHT, (i) => strip.minZ + (STEPS - 1 - i) * run + run / 2, 1);
  const top = 0, bottom = -WALL_HEIGHT;
  const wall = below?.wall ?? DARK;
  const corner = (x: number, y: number, z: number): Vec3 => [x, y, z];
  builder.face([corner(strip.maxX, bottom, strip.minZ), corner(strip.maxX, bottom, strip.maxZ), corner(strip.maxX, top, strip.maxZ), corner(strip.maxX, top, strip.minZ)], shade(wall, 0.7), [-1, 0, 0]);
  builder.face([corner(strip.minX, bottom, strip.maxZ), corner(strip.maxX, bottom, strip.maxZ), corner(strip.maxX, top, strip.maxZ), corner(strip.minX, top, strip.maxZ)], shade(wall, 0.8), [0, 0, -1]);
  builder.face([corner(strip.minX, bottom, strip.minZ), corner(strip.minX, bottom, strip.maxZ), corner(strip.minX, top, strip.maxZ), corner(strip.minX, top, strip.minZ)], shade(wall, 0.75), [1, 0, 0]);
  // The floor at the foot of the stairs, below.
  const ground = below?.ground ?? DARK;
  builder.face([corner(strip.minX, bottom + 0.001, strip.minZ), corner(strip.maxX, bottom + 0.001, strip.minZ), corner(strip.maxX, bottom + 0.001, strip.maxZ), corner(strip.minX, bottom + 0.001, strip.maxZ)], shade(ground, 0.6), [0, 1, 0]);
  // A balustrade round the hole, open at the back where the top step is.
  const railStart = strip.minZ + cell;
  const railX = strip.maxX + 0.04, railZ = strip.maxZ + 0.04;
  balustrade(builder, railX, 0, railStart, railX, 0, railZ);
  balustrade(builder, strip.minX + 0.04, 0, railZ, railX, 0, railZ);
  builder.box(railX, railZ, 0.06, 0.06, 0, RAIL_HEIGHT + 0.1, TREAD);
  void wall;
}

// ---- furniture ---------------------------------------------------------

export const PAINT: Record<string, RGB> = {
  wood: hexToLinear("#9a6b43"),
  darkwood: hexToLinear("#5b3d28"),
  white: hexToLinear("#f1efe9"),
  cream: hexToLinear("#e6dcc0"),
  blue: hexToLinear("#3f6fb0"),
  navy: hexToLinear("#1f2a4a"),
  wine: hexToLinear("#8a2f3a"),
  gold: hexToLinear("#c79a2b"),
  sofa: hexToLinear("#6a5a4e"),
  sofaDark: hexToLinear("#54463c"),
  sofaLight: hexToLinear("#8a786a"),
  teal: hexToLinear("#2f6b6a"),
  tealDark: hexToLinear("#245453"),
  tealLight: hexToLinear("#3d8584"),
  leather: hexToLinear("#e9e2cf"),
  leatherDark: hexToLinear("#d6ccb2"),
  black: hexToLinear("#1d1d1f"),
  screen: hexToLinear("#27384a"),
  metal: hexToLinear("#b9b9b4"),
  steel: hexToLinear("#c9ccd0"),
  clay: hexToLinear("#a8573a"),
  leaf: hexToLinear("#3f7d3a"),
  leafLight: hexToLinear("#5a9a45"),
  rug: hexToLinear("#8a3a2f"),
  rugLight: hexToLinear("#d9b46a"),
  tile: hexToLinear("#bcd6e0"),
  glass: hexToLinear("#9cc4dc"),
  glassDark: hexToLinear("#2e3e4a"),
  water: hexToLinear("#7fb6d6"),
  felt: hexToLinear("#1f7a45"),
  rgb: hexToLinear("#c03ad6"),
  art1: hexToLinear("#e2803a"),
  art2: hexToLinear("#2f6fd6"),
  art3: hexToLinear("#e9c84a"),
  marble: hexToLinear("#ecebe6"),
  pink: hexToLinear("#e9a2b8"),
  red: hexToLinear("#c0392b"),
  green: hexToLinear("#1f8a4c"),
  // The luxury pieces.
  velvet: hexToLinear("#b4471e"), velvetDark: hexToLinear("#923716"), velvetLight: hexToLinear("#c95a2b"),
  brass: hexToLinear("#b8913f"), crystal: hexToLinear("#eef3f8"), ivory: hexToLinear("#efe7d6"),
  walnut: hexToLinear("#4a2f1c"), marbleTop: hexToLinear("#f1efea"), greige: hexToLinear("#cfc4b2"), greigeDark: hexToLinear("#b9ad99"),
  curtain: hexToLinear("#d9c8a6"), curtainDark: hexToLinear("#c4b18b"), emerald: hexToLinear("#1f5a45"),
  glassClear: hexToLinear("#c9e0ea"), frame: hexToLinear("#1b1b1d"), art4: hexToLinear("#6a8caf"), art5: hexToLinear("#c24f3c"),
  art6: hexToLinear("#e8d9b5"), leafDark: hexToLinear("#2f5e2c"), rose: hexToLinear("#d75c79"), rugRed: hexToLinear("#7a2128"),
  rugNavy: hexToLinear("#1f2a48"), steelDark: hexToLinear("#6b6f75"),
};

/**
 * One box of a piece of furniture: centre x, centre z, half width, half depth, bottom, top, paint.
 * Measured in metres from the middle of the item, before it is turned. The back of the item is -z.
 */
export type Part = [number, number, number, number, number, number, string];

function legs(x: number, z: number, size: number, top: number, paint: string): Part[] {
  return [[-x, -z, size, size, 0, top, paint], [x, -z, size, size, 0, top, paint], [-x, z, size, size, 0, top, paint], [x, z, size, size, 0, top, paint]];
}

function seat(halfX: number, colour: string, dark: string, light: string, cushions: number): Part[] {
  const parts: Part[] = [
    [0, 0.06, halfX, 0.4, 0, 0.42, colour], [0, -0.38, halfX, 0.1, 0, 0.92, colour],
    [-(halfX - 0.07), 0.06, 0.07, 0.4, 0.42, 0.64, dark], [halfX - 0.07, 0.06, 0.07, 0.4, 0.42, 0.64, dark],
  ];
  const inner = halfX - 0.15;
  for (let i = 0; i < cushions; i++) {
    const width = inner / cushions;
    parts.push([-inner + width * (2 * i + 1), 0.1, width - 0.02, 0.3, 0.42, 0.5, light]);
  }
  return parts;
}

function books(x0: number, x1: number, z: number, y: number, height: number, seed: number): Part[] {
  const colours = ["wine", "blue", "gold", "green", "navy", "art1", "cream"];
  const parts: Part[] = [];
  let x = x0, i = seed;
  while (x < x1 - 0.04) {
    const w = 0.025 + ((i * 7) % 5) * 0.006;
    const h = height * (0.7 + ((i * 3) % 4) * 0.08);
    parts.push([x + w, z, w, 0.09, y, y + h, colours[i % colours.length]]);
    x += w * 2 + 0.004;
    i++;
  }
  return parts;
}

function roundish(radius: number, y0: number, y1: number, paint: string): Part[] {
  // A disc out of three overlapping boxes: square from above, but with its corners cut.
  return [[0, 0, radius, radius * 0.42, y0, y1, paint], [0, 0, radius * 0.42, radius, y0, y1, paint], [0, 0, radius * 0.78, radius * 0.78, y0, y1, paint]];
}

export const SHAPES: Record<string, Part[]> = {
  mattress: [
    [0, 0, 0.47, 0.97, 0, 0.2, "cream"], [0, -0.72, 0.3, 0.16, 0.2, 0.28, "white"], [0, 0.3, 0.47, 0.6, 0.2, 0.22, "blue"],
  ],
  // Two beds, one above the other, in a steel frame with a ladder at the foot.
  bunk: [
    ...legs(0.46, 0.96, 0.025, 1.75, "metal"),
    [0, 0, 0.47, 0.97, 0.3, 0.36, "metal"], [0, 0, 0.44, 0.94, 0.36, 0.5, "cream"], [0, -0.7, 0.3, 0.16, 0.5, 0.58, "white"],
    [0, 0.3, 0.44, 0.6, 0.5, 0.52, "blue"],
    [0, 0, 0.47, 0.97, 1.25, 1.31, "metal"], [0, 0, 0.44, 0.94, 1.31, 1.45, "cream"], [0, -0.7, 0.3, 0.16, 1.45, 1.53, "white"],
    [0, 0.3, 0.44, 0.6, 1.45, 1.47, "wine"],
    [0, -0.96, 0.47, 0.02, 1.45, 1.75, "metal"], [0.46, 0.2, 0.02, 0.6, 1.6, 1.64, "metal"],
    [0.3, 0.98, 0.02, 0.02, 0, 1.31, "metal"], [0.1, 0.98, 0.02, 0.02, 0, 1.31, "metal"],
    [0.2, 0.98, 0.12, 0.02, 0.45, 0.48, "metal"], [0.2, 0.98, 0.12, 0.02, 0.85, 0.88, "metal"],
  ],
  bed: [
    [0, 0, 0.74, 0.99, 0, 0.28, "wood"], [0, 0.04, 0.69, 0.92, 0.28, 0.5, "white"], [0, -0.95, 0.74, 0.04, 0, 1.0, "wood"],
    [-0.34, -0.68, 0.25, 0.15, 0.5, 0.6, "cream"], [0.34, -0.68, 0.25, 0.15, 0.5, 0.6, "cream"], [0, 0.32, 0.7, 0.6, 0.5, 0.54, "wine"],
  ],
  bigbed: [
    [0, 0, 0.99, 0.99, 0, 0.3, "darkwood"], [0, 0.04, 0.94, 0.92, 0.3, 0.55, "white"], [0, -0.95, 0.99, 0.04, 0, 1.2, "darkwood"],
    [-0.46, -0.68, 0.32, 0.15, 0.55, 0.66, "cream"], [0.46, -0.68, 0.32, 0.15, 0.55, 0.66, "cream"], [0, 0.32, 0.95, 0.6, 0.55, 0.6, "gold"],
  ],
  // A big bed with a buttoned headboard, a navy duvet and a bench at the foot.
  kingbed: [
    [0, -0.05, 0.98, 1.0, 0, 0.32, "leather"], [0, 0, 0.94, 0.94, 0.32, 0.58, "white"], [0, -1.18, 1.0, 0.07, 0, 1.4, "leather"],
    ...[-0.6, -0.2, 0.2, 0.6].flatMap((x): Part[] => [[x, -1.105, 0.02, 0.004, 0.85, 0.87, "leatherDark"], [x, -1.105, 0.02, 0.004, 1.12, 1.14, "leatherDark"]]),
    [-0.48, -0.75, 0.36, 0.14, 0.58, 0.7, "white"], [0.48, -0.75, 0.36, 0.14, 0.58, 0.7, "white"],
    [-0.22, -0.6, 0.16, 0.08, 0.58, 0.72, "navy"], [0.22, -0.6, 0.16, 0.08, 0.58, 0.72, "navy"],
    [0, 0.3, 0.96, 0.66, 0.58, 0.63, "navy"], [0, 1.12, 0.75, 0.12, 0, 0.45, "leatherDark"],
  ],
  wardrobe: [
    [0, 0, 0.74, 0.24, 0, 2.0, "wood"], [0, 0, 0.75, 0.25, 2.0, 2.05, "darkwood"], [0, 0.243, 0.012, 0.004, 0.08, 1.92, "darkwood"],
    [-0.08, 0.238, 0.015, 0.012, 0.9, 1.12, "metal"], [0.08, 0.238, 0.015, 0.012, 0.9, 1.12, "metal"],
  ],
  // A long black unit with glass doors: clothes hanging on one side, folded on shelves on the other.
  closet: [
    [0, 0, 1.48, 0.24, 0, 2.3, "black"],
    ...[-1.1, -0.35, 0.4, 1.1].flatMap((x, i): Part[] => i % 2 === 0
      ? ["wine", "navy", "pink", "green", "cream", "art1"].map((c, j): Part => [x - 0.28 + j * 0.11, 0.05, 0.045, 0.16, 0.9, 1.9, c])
      : [0.5, 0.9, 1.3, 1.7].flatMap((y, j): Part[] => [[x - 0.15, 0.05, 0.12, 0.15, y, y + 0.1, ["pink", "red", "navy", "green"][j]], [x + 0.15, 0.05, 0.12, 0.15, y, y + 0.1, ["cream", "gold", "pink", "black"][j]]])),
    [0, 0.245, 1.46, 0.003, 0.05, 2.25, "glassDark"],
  ],
  dresser: [
    [0, 0, 0.46, 0.2, 0.72, 0.78, "white"], ...legs(0.42, 0.16, 0.025, 0.72, "gold"), [0.25, 0, 0.18, 0.17, 0.5, 0.72, "white"],
    [0, -0.2, 0.36, 0.02, 0.78, 1.75, "gold"], [0, -0.185, 0.32, 0.01, 0.82, 1.71, "glass"],
    [-0.25, 0.05, 0.04, 0.04, 0.78, 0.9, "pink"], [-0.15, 0.05, 0.03, 0.03, 0.78, 0.86, "gold"],
  ],
  nightstand: [
    [0, 0, 0.22, 0.2, 0, 0.5, "wood"], [0, 0.205, 0.17, 0.004, 0.25, 0.4, "darkwood"],
    [0, 0, 0.06, 0.06, 0.5, 0.52, "gold"], [0, 0, 0.012, 0.012, 0.52, 0.75, "gold"], [0, 0, 0.1, 0.1, 0.7, 0.85, "cream"],
  ],
  plastic_chair: [
    [0, 0.02, 0.2, 0.19, 0.4, 0.44, "white"], [0, -0.18, 0.2, 0.025, 0.44, 0.86, "white"], ...legs(0.17, 0.15, 0.02, 0.4, "white"),
  ],
  chair: [
    [0, 0.02, 0.2, 0.19, 0.42, 0.46, "wood"], [0, 0.02, 0.17, 0.16, 0.46, 0.5, "wine"], [0, -0.18, 0.2, 0.025, 0.46, 0.95, "wood"],
    ...legs(0.17, 0.15, 0.025, 0.42, "darkwood"),
  ],
  armchair: [
    [0, 0.06, 0.46, 0.4, 0, 0.42, "sofa"], [0, -0.38, 0.46, 0.1, 0, 0.92, "sofa"], [-0.4, 0.06, 0.07, 0.4, 0.42, 0.62, "sofaDark"],
    [0.4, 0.06, 0.07, 0.4, 0.42, 0.62, "sofaDark"], [0, 0.1, 0.32, 0.3, 0.42, 0.5, "sofaLight"],
  ],
  couch: seat(0.72, "teal", "tealDark", "tealLight", 2),
  sofa: seat(0.97, "sofa", "sofaDark", "sofaLight", 2),
  sofa3: seat(1.22, "leather", "leatherDark", "white", 3),
  table: [[0, 0, 0.46, 0.46, 0.68, 0.74, "wood"], ...legs(0.4, 0.4, 0.035, 0.68, "darkwood")],
  coffee_table: [
    [0, 0, 0.66, 0.4, 0.4, 0.43, "glass"], [0, 0, 0.62, 0.36, 0.12, 0.15, "darkwood"], ...legs(0.6, 0.34, 0.025, 0.4, "gold"),
    [0.25, 0.05, 0.08, 0.08, 0.43, 0.5, "cream"], [-0.2, -0.05, 0.12, 0.08, 0.15, 0.22, "wine"],
  ],
  tv: [
    [0, 0, 0.72, 0.22, 0, 0.48, "darkwood"], [0, 0, 0.12, 0.08, 0.48, 0.52, "black"], [0, -0.02, 0.6, 0.025, 0.52, 1.22, "black"],
    [0, 0.008, 0.56, 0.004, 0.56, 1.18, "screen"],
  ],
  // A white wall unit: a long low cabinet, a big screen, shelves either side, a strip of light.
  tv_wall: [
    [0, 0.02, 1.48, 0.2, 0, 0.42, "white"], [0, 0.22, 1.4, 0.004, 0.06, 0.38, "cream"],
    [0, -0.17, 0.95, 0.03, 0.72, 1.82, "black"], [0, -0.138, 0.91, 0.004, 0.76, 1.78, "screen"],
    [-1.3, -0.05, 0.18, 0.18, 0.42, 2.25, "white"], [1.3, -0.05, 0.18, 0.18, 0.42, 2.25, "white"],
    ...[0.9, 1.35, 1.8].flatMap((y): Part[] => [[-1.3, 0.0, 0.16, 0.14, y, y + 0.03, "cream"], [1.3, 0.0, 0.16, 0.14, y, y + 0.03, "cream"]]),
    [-1.3, 0.0, 0.06, 0.06, 0.93, 1.1, "gold"], [1.3, 0.0, 0.08, 0.06, 1.38, 1.5, "leaf"], [0, -0.1, 1.1, 0.02, 2.2, 2.25, "art3"],
    [0.6, 0.05, 0.12, 0.06, 0.42, 0.52, "black"],
  ],
  shelf: [
    [-0.47, 0, 0.02, 0.22, 0, 1.8, "wood"], [0.47, 0, 0.02, 0.22, 0, 1.8, "wood"], [0, -0.21, 0.47, 0.012, 0, 1.8, "darkwood"],
    [0, 0, 0.47, 0.22, 0.02, 0.06, "wood"], [0, 0, 0.47, 0.22, 0.45, 0.49, "wood"], [0, 0, 0.47, 0.22, 0.9, 0.94, "wood"],
    [0, 0, 0.47, 0.22, 1.35, 1.39, "wood"], [0, 0, 0.47, 0.22, 1.76, 1.8, "wood"],
    [-0.2, 0, 0.18, 0.15, 0.49, 0.75, "wine"], [0.15, 0, 0.2, 0.15, 0.94, 1.15, "blue"], [-0.1, 0, 0.25, 0.15, 1.39, 1.58, "gold"],
  ],
  bookshelf: [
    [-0.72, 0, 0.025, 0.22, 0, 2.1, "darkwood"], [0.72, 0, 0.025, 0.22, 0, 2.1, "darkwood"], [0, 0, 0.025, 0.22, 0, 2.1, "darkwood"],
    [0, -0.21, 0.74, 0.012, 0, 2.1, "darkwood"],
    ...[0.02, 0.52, 1.02, 1.52, 2.06].map((y): Part => [0, 0, 0.74, 0.22, y, y + 0.04, "darkwood"]),
    ...[0.06, 0.56, 1.06, 1.56].flatMap((y, i) => [...books(-0.69, -0.03, 0, y, 0.38, i * 3), ...books(0.03, 0.69, 0, y, 0.38, i * 5 + 1)]),
  ],
  // A reading desk: books, a lamp, and a drawer that sticks.
  desk: [
    [0, 0, 0.48, 0.23, 0.7, 0.75, "wood"], ...legs(0.44, 0.19, 0.025, 0.7, "darkwood"), [0.25, 0, 0.2, 0.2, 0.45, 0.7, "darkwood"],
    [-0.24, -0.06, 0.13, 0.1, 0.75, 0.79, "wine"], [-0.22, -0.06, 0.12, 0.09, 0.79, 0.82, "blue"], [-0.24, -0.05, 0.1, 0.08, 0.82, 0.845, "gold"],
    [0.32, -0.12, 0.05, 0.05, 0.75, 0.77, "black"], [0.32, -0.12, 0.012, 0.012, 0.77, 1.05, "metal"], [0.28, -0.08, 0.07, 0.06, 1.03, 1.1, "black"],
  ],
  // A black desk, two screens, a PC with its lights on, and a keyboard.
  gaming: [
    [0, 0, 0.72, 0.24, 0.72, 0.76, "black"], ...legs(0.68, 0.2, 0.025, 0.72, "black"),
    [-0.27, -0.14, 0.26, 0.02, 0.86, 1.22, "black"], [0.27, -0.14, 0.26, 0.02, 0.86, 1.22, "black"],
    [-0.27, -0.118, 0.24, 0.003, 0.88, 1.2, "screen"], [0.27, -0.118, 0.24, 0.003, 0.88, 1.2, "screen"],
    [-0.27, -0.14, 0.03, 0.03, 0.76, 0.86, "black"], [0.27, -0.14, 0.03, 0.03, 0.76, 0.86, "black"],
    [0.6, 0, 0.1, 0.2, 0, 0.48, "black"], [0.6, 0.202, 0.08, 0.003, 0.05, 0.43, "rgb"],
    [0, 0.08, 0.22, 0.06, 0.76, 0.78, "black"], [0, 0.08, 0.2, 0.05, 0.78, 0.785, "rgb"], [0.32, 0.1, 0.05, 0.07, 0.76, 0.78, "black"],
  ],
  cooker: [
    [0, 0, 0.23, 0.23, 0, 0.85, "white"], [0, 0, 0.23, 0.23, 0.85, 0.87, "black"], [0, 0.232, 0.18, 0.004, 0.15, 0.6, "black"],
    [-0.1, -0.08, 0.06, 0.06, 0.87, 0.89, "metal"], [0.1, -0.08, 0.06, 0.06, 0.87, 0.89, "metal"],
  ],
  counter: [
    [0, 0, 0.48, 0.23, 0, 0.86, "white"], [0, 0, 0.5, 0.25, 0.86, 0.9, "marble"], [0, 0.232, 0.47, 0.003, 0.82, 0.84, "cream"],
    [-0.24, 0.235, 0.06, 0.008, 0.7, 0.72, "metal"], [0.24, 0.235, 0.06, 0.008, 0.7, 0.72, "metal"],
    [0.3, -0.12, 0.08, 0.08, 0.9, 1.02, "wood"], [0.3, -0.12, 0.05, 0.05, 1.02, 1.04, "art1"],
  ],
  sink: [
    [0, 0, 0.48, 0.23, 0, 0.86, "white"], [0, 0, 0.5, 0.25, 0.86, 0.9, "marble"], [0, 0.02, 0.28, 0.15, 0.88, 0.905, "steel"],
    [0, 0.02, 0.24, 0.12, 0.86, 0.9, "glassDark"], [0, -0.18, 0.02, 0.02, 0.9, 1.15, "metal"], [0, -0.11, 0.02, 0.07, 1.12, 1.15, "metal"],
  ],
  fridge: [
    [0, 0, 0.23, 0.23, 0, 1.65, "steel"], [0, 0.232, 0.22, 0.003, 1.1, 1.12, "black"],
    [0.16, 0.24, 0.012, 0.01, 0.6, 1.0, "metal"], [0.16, 0.24, 0.012, 0.01, 1.2, 1.5, "metal"],
  ],
  freezer: [[0, 0, 0.46, 0.23, 0, 0.85, "white"], [0, 0, 0.47, 0.24, 0.85, 0.88, "steel"], [0.3, 0.235, 0.08, 0.01, 0.78, 0.82, "metal"]],
  microwave: [
    [0, 0, 0.22, 0.2, 0, 0.8, "wood"], [0, 0.2, 0.18, 0.004, 0.1, 0.7, "darkwood"],
    [0, 0, 0.21, 0.16, 0.8, 1.06, "black"], [-0.04, 0.162, 0.13, 0.003, 0.84, 1.02, "glassDark"], [0.16, 0.162, 0.03, 0.003, 0.86, 1.0, "metal"],
  ],
  dispenser: [
    [0, 0, 0.15, 0.15, 0, 1.0, "white"], [0, 0, 0.12, 0.12, 1.0, 1.42, "water"], [0, 0, 0.06, 0.06, 1.42, 1.46, "blue"],
    [-0.05, 0.152, 0.02, 0.01, 0.7, 0.78, "red"], [0.05, 0.152, 0.02, 0.01, 0.7, 0.78, "blue"], [0, 0.12, 0.1, 0.04, 0.5, 0.52, "black"],
  ],
  dining: [[0, 0, 0.96, 0.46, 0.72, 0.78, "darkwood"], ...legs(0.88, 0.38, 0.04, 0.72, "darkwood")],
  round_table: [...roundish(0.68, 0.72, 0.76, "wood"), [0, 0, 0.08, 0.08, 0.05, 0.72, "darkwood"], ...roundish(0.3, 0, 0.05, "darkwood"),
    [0, 0, 0.12, 0.12, 0.76, 0.8, "cream"], [0.06, 0.04, 0.04, 0.04, 0.8, 0.86, "art1"]],
  // A tiled corner with a glass side, a shower head on its pipe, and the bucket every bathroom has.
  shower: [
    [0, 0, 0.48, 0.48, 0, 0.06, "white"], [0, -0.46, 0.48, 0.02, 0.06, 2.0, "tile"], [-0.46, 0, 0.02, 0.48, 0.06, 1.9, "glass"],
    [0.3, -0.42, 0.015, 0.015, 0.06, 1.95, "metal"], [0.3, -0.32, 0.07, 0.1, 1.9, 1.95, "metal"],
    [-0.18, 0.16, 0.13, 0.13, 0.06, 0.34, "blue"], [-0.18, 0.16, 0.11, 0.11, 0.34, 0.345, "glass"],
  ],
  // Cistern at the back, bowl in front of it, the lid standing up.
  toilet: [
    [0, -0.36, 0.2, 0.1, 0.4, 0.82, "white"], [0, 0.05, 0.16, 0.24, 0, 0.38, "white"], [0, 0.07, 0.19, 0.27, 0.38, 0.42, "cream"],
    [0, -0.24, 0.18, 0.02, 0.42, 0.78, "white"], [0, -0.36, 0.04, 0.04, 0.82, 0.84, "metal"],
  ],
  basin: [
    [0, -0.05, 0.07, 0.07, 0, 0.74, "white"], [0, 0, 0.21, 0.18, 0.74, 0.88, "white"], [0, 0.01, 0.16, 0.13, 0.86, 0.885, "glass"],
    [0, -0.14, 0.015, 0.015, 0.88, 1.0, "metal"], [0, -0.225, 0.18, 0.01, 1.08, 1.62, "gold"], [0, -0.218, 0.16, 0.005, 1.1, 1.6, "glass"],
  ],
  bathtub: [
    [0, 0, 0.48, 0.97, 0, 0.56, "white"], [0, 0.02, 0.4, 0.86, 0.46, 0.5, "water"], [0, -0.85, 0.08, 0.04, 0.56, 0.7, "metal"],
    [0.3, 0.6, 0.12, 0.22, 0.56, 0.6, "pink"], [-0.55, 0.3, 0.06, 0.3, 0, 0.02, "art1"],
  ],
  washer: [
    [0, 0, 0.22, 0.22, 0, 0.85, "white"], [0, 0.223, 0.14, 0.004, 0.24, 0.6, "metal"], [0, 0.226, 0.11, 0.004, 0.27, 0.57, "glassDark"],
    [-0.1, 0.224, 0.08, 0.004, 0.72, 0.8, "steel"], [0.14, 0.224, 0.03, 0.004, 0.74, 0.78, "black"],
  ],
  fan: [
    [0, 0, 0.18, 0.18, 0, 0.05, "black"], [0, 0, 0.02, 0.02, 0.05, 1.2, "metal"], [0, 0, 0.2, 0.05, 1.15, 1.55, "black"],
    [0, 0.055, 0.17, 0.005, 1.18, 1.52, "steel"],
  ],
  // The blades are drawn on their own, so they can turn (HomeScene).
  ceiling_fan: [[0, 0, 0.02, 0.02, 2.45, 2.8, "metal"], [0, 0, 0.11, 0.11, 2.33, 2.47, "darkwood"], [0, 0, 0.13, 0.13, 2.78, 2.8, "metal"]],
  ac: [
    [0, -0.14, 0.45, 0.1, 2.12, 2.45, "white"], [0, -0.035, 0.42, 0.006, 2.15, 2.19, "glassDark"],
    [0.36, -0.035, 0.03, 0.004, 2.38, 2.41, "green"], [0, -0.04, 0.44, 0.004, 2.2, 2.22, "cream"],
  ],
  lamp: [[0, 0, 0.12, 0.12, 0, 0.04, "black"], [0, 0, 0.015, 0.015, 0.04, 1.4, "metal"], [0, 0, 0.16, 0.16, 1.35, 1.65, "cream"]],
  arc_lamp: [
    [-0.1, -0.1, 0.12, 0.12, 0, 0.05, "black"], [-0.1, -0.1, 0.015, 0.015, 0.05, 1.85, "gold"], [0.0, -0.1, 0.11, 0.015, 1.83, 1.87, "gold"],
    [0.1, -0.1, 0.015, 0.015, 1.7, 1.87, "gold"], [0.1, -0.1, 0.11, 0.11, 1.5, 1.7, "gold"], [0.1, -0.1, 0.08, 0.08, 1.49, 1.5, "cream"],
  ],
  // A ring light on a tripod: the ring is eight short bars round a circle, lit from inside.
  ring_lamp: [
    [-0.12, 0.08, 0.012, 0.012, 0, 1.2, "black"], [0.12, 0.08, 0.012, 0.012, 0, 1.2, "black"], [0, -0.12, 0.012, 0.012, 0, 1.2, "black"],
    [0, 0, 0.018, 0.018, 1.0, 1.45, "black"],
    ...Array.from({ length: 12 }, (_, i): Part => {
      const a = (i / 12) * Math.PI * 2;
      return [Math.cos(a) * 0.24, 0, 0.045, 0.02, 1.62 + Math.sin(a) * 0.24 - 0.035, 1.62 + Math.sin(a) * 0.24 + 0.035, "white"];
    }),
    [0, 0.005, 0.03, 0.02, 1.6, 1.66, "black"],
  ],
  chandelier: [
    [0, 0, 0.015, 0.015, 2.35, 2.8, "gold"], [0, 0, 0.1, 0.1, 2.25, 2.4, "gold"],
    [0, 0, 0.42, 0.02, 2.2, 2.24, "gold"], [0, 0, 0.02, 0.42, 2.2, 2.24, "gold"], [0, 0, 0.3, 0.3, 2.2, 2.22, "gold"],
    ...[[0.38, 0], [-0.38, 0], [0, 0.38], [0, -0.38], [0.27, 0.27], [-0.27, 0.27], [0.27, -0.27], [-0.27, -0.27]].flatMap(([x, z]): Part[] => [
      [x, z, 0.035, 0.035, 2.24, 2.34, "cream"], [x * 0.85, z * 0.85, 0.02, 0.02, 2.0, 2.15, "glass"],
    ]),
  ],
  rug: [[0, 0, 0.98, 0.73, 0, 0.02, "rug"], [0, 0, 0.8, 0.55, 0.02, 0.026, "rugLight"], [0, 0, 0.6, 0.35, 0.026, 0.032, "rug"]],
  rug_big: [
    [0, 0, 1.48, 0.98, 0, 0.02, "wine"], [0, 0, 1.36, 0.86, 0.02, 0.024, "gold"], [0, 0, 1.3, 0.8, 0.024, 0.028, "wine"],
    ...roundish(0.5, 0.028, 0.032, "gold"), ...roundish(0.32, 0.032, 0.036, "navy"),
    [-1.0, -0.55, 0.1, 0.1, 0.028, 0.032, "gold"], [1.0, 0.55, 0.1, 0.1, 0.028, 0.032, "gold"], [-1.0, 0.55, 0.1, 0.1, 0.028, 0.032, "gold"], [1.0, -0.55, 0.1, 0.1, 0.028, 0.032, "gold"],
  ],
  rug_round: [...roundish(0.72, 0, 0.02, "cream"), ...roundish(0.55, 0.02, 0.024, "art1"), ...roundish(0.36, 0.024, 0.028, "green")],
  plant: [[0, 0, 0.15, 0.15, 0, 0.3, "clay"], [0, 0, 0.2, 0.2, 0.3, 0.75, "leaf"], [0.05, -0.03, 0.12, 0.12, 0.75, 1.05, "leafLight"]],
  plant_tall: [
    [0, 0, 0.14, 0.14, 0, 0.35, "white"], [0, 0, 0.04, 0.12, 0.35, 1.45, "leaf"], [0.06, 0.03, 0.03, 0.1, 0.35, 1.25, "leafLight"],
    [-0.06, -0.02, 0.03, 0.1, 0.35, 1.3, "leafLight"], [0.02, -0.06, 0.1, 0.03, 0.35, 1.15, "leaf"],
  ],
  // On the wall behind it.
  painting: [[0, -0.22, 0.45, 0.02, 1.2, 1.9, "gold"], [0, -0.2, 0.41, 0.006, 1.24, 1.86, "art3"], [-0.15, -0.195, 0.2, 0.004, 1.3, 1.6, "art1"], [0.18, -0.195, 0.16, 0.004, 1.45, 1.8, "art2"]],
  clock: [[0, -0.23, 0.15, 0.02, 1.9, 2.2, "black"], [0, -0.215, 0.13, 0.005, 1.92, 2.18, "white"], [0, -0.21, 0.01, 0.003, 2.05, 2.15, "black"], [0.04, -0.21, 0.05, 0.003, 2.05, 2.06, "black"]],

  // ---- luxury pieces ----
  // (Anything on a wall stands clear of it: a wall takes the back 7.5 cm of the item's cell.)
  // An L-shaped sofa in burnt-orange velvet: a long seat along the back and a chaise to the right.
  sofa_l: [
    [0, -0.5, 1.45, 0.45, 0.1, 0.42, "velvet"], [0, -0.92, 1.45, 0.08, 0.1, 0.92, "velvetDark"],
    [-1.42, -0.5, 0.08, 0.45, 0.1, 0.66, "velvetDark"], [1.0, 0.45, 0.45, 0.55, 0.1, 0.42, "velvet"],
    [1.42, 0.0, 0.08, 0.98, 0.1, 0.66, "velvetDark"], [0, -0.5, 1.45, 0.45, 0, 0.1, "walnut"], [1.0, 0.45, 0.45, 0.55, 0, 0.1, "walnut"],
    ...[-1.0, -0.15, 0.7].flatMap((x): Part[] => [[x, -0.76, 0.4, 0.08, 0.42, 0.82, "velvetLight"], [x, -0.42, 0.4, 0.3, 0.42, 0.5, "velvetLight"]]),
    [1.0, 0.45, 0.4, 0.5, 0.42, 0.5, "velvetLight"],
    [-1.12, -0.68, 0.14, 0.05, 0.5, 0.74, "ivory"], [-0.78, -0.68, 0.13, 0.05, 0.5, 0.72, "emerald"], [0.95, -0.68, 0.14, 0.05, 0.5, 0.74, "ivory"],
  ],
  velvet_sofa: [...seat(1.22, "velvet", "velvetDark", "velvetLight", 3), [-0.85, -0.22, 0.14, 0.05, 0.5, 0.72, "ivory"], [0.85, -0.22, 0.14, 0.05, 0.5, 0.72, "emerald"]],
  accent_chair: [...seat(0.45, "velvet", "velvetDark", "velvetLight", 1), ...legs(0.38, 0.38, 0.026, 0.06, "brass")],
  // A slim walnut console against a wall with a brass lamp and a vase on it.
  console: [
    [0, -0.05, 0.72, 0.18, 0.78, 0.82, "walnut"], ...legs(0.66, 0.12, 0.026, 0.78, "brass"),
    [0.45, -0.05, 0.07, 0.07, 0.82, 0.9, "brass"], [0.45, -0.05, 0.026, 0.026, 0.9, 1.18, "brass"], [0.45, -0.05, 0.15, 0.15, 1.12, 1.38, "ivory"],
    [-0.4, -0.05, 0.06, 0.06, 0.82, 1.05, "frame"], [-0.4, -0.05, 0.1, 0.1, 1.05, 1.2, "rose"],
  ],
  // Glass-fronted display cabinet in walnut: lit shelves of plates and ornaments.
  display_cabinet: [
    [0, -0.03, 0.72, 0.2, 0, 1.95, "walnut"], [0, 0.18, 0.66, 0.026, 0.1, 1.85, "glassDark"],
    ...[0.55, 1.0, 1.45].flatMap((y, i): Part[] => [[-0.4 + i * 0.1, 0.05, 0.12, 0.08, y, y + 0.22, "ivory"], [0.3 - i * 0.12, 0.05, 0.08, 0.08, y, y + 0.16, "brass"]]),
    [0, 0.21, 0.04, 0.03, 0.9, 1.1, "brass"],
  ],
  coffee_round: [...roundish(0.6, 0.38, 0.43, "marbleTop"), ...roundish(0.28, 0, 0.38, "brass"), [0.18, 0.05, 0.08, 0.08, 0.43, 0.52, "emerald"], [-0.2, -0.1, 0.1, 0.07, 0.43, 0.47, "frame"]],
  // A kitchen island with a white marble top, and three brass stools along the front.
  island: [
    [0, -0.12, 1.2, 0.36, 0, 0.88, "walnut"], [0, -0.12, 1.27, 0.42, 0.88, 0.94, "marbleTop"],
    ...[-0.8, 0, 0.8].flatMap((x): Part[] => [[x, 0.33, 0.15, 0.15, 0, 0.6, "brass"], [x, 0.33, 0.17, 0.15, 0.6, 0.66, "frame"]]),
    [-0.5, -0.15, 0.12, 0.09, 0.94, 1.02, "ivory"], [0.45, -0.1, 0.15, 0.1, 0.94, 1.0, "ivory"],
  ],
  // A run of fitted units: walnut doors, white marble top and splashback, cupboards above.
  kitchen_run: [
    [0, -0.02, 1.48, 0.23, 0, 0.86, "walnut"], [0, -0.02, 1.5, 0.25, 0.86, 0.9, "marbleTop"],
    [0, -0.17, 1.48, 0.026, 0.9, 1.45, "marbleTop"], [0, -0.12, 1.48, 0.13, 1.45, 2.2, "walnut"],
    [-0.6, -0.02, 0.3, 0.15, 0.86, 0.905, "steel"], [0.6, -0.02, 0.3, 0.17, 0.86, 0.91, "frame"],
    ...[-1.1, -0.37, 0.37, 1.1].map((x): Part => [x, 0.22, 0.05, 0.026, 0.66, 0.7, "brass"]),
  ],
  range: [[0, 0, 0.48, 0.24, 0, 0.9, "steel"], [0, 0, 0.48, 0.24, 0.9, 0.94, "frame"], [0, 0.23, 0.38, 0.026, 0.15, 0.7, "glassDark"], [0, 0.24, 0.4, 0.026, 0.78, 0.84, "steelDark"]],
  // A dining table for six in walnut, upholstered chairs in ivory.
  dining_set: [
    [0, 0, 1.2, 0.55, 0.72, 0.77, "walnut"], [-0.8, 0, 0.08, 0.3, 0, 0.72, "walnut"], [0.8, 0, 0.08, 0.3, 0, 0.72, "walnut"],
    ...[-0.75, 0, 0.75].flatMap((x): Part[] => [
      [x, -0.82, 0.22, 0.2, 0.42, 0.5, "ivory"], [x, -1.0, 0.22, 0.03, 0.5, 1.05, "ivory"],
      [x, 0.82, 0.22, 0.2, 0.42, 0.5, "ivory"], [x, 1.0, 0.22, 0.03, 0.5, 1.05, "ivory"],
      [x, -0.82, 0.2, 0.18, 0, 0.42, "walnut"], [x, 0.82, 0.2, 0.18, 0, 0.42, "walnut"],
    ]),
    [0, 0, 0.1, 0.1, 0.77, 0.95, "crystal"], [0.5, 0.1, 0.14, 0.14, 0.77, 0.8, "ivory"], [-0.5, -0.1, 0.14, 0.14, 0.77, 0.8, "ivory"],
  ],
  // An upholstered king bed with a tall tufted headboard and a velvet bench at its foot.
  bed_luxe: [
    [0, 0.05, 1.15, 1.1, 0, 0.35, "greige"], [0, 0.1, 1.08, 1.0, 0.35, 0.6, "white"],
    [0, -1.2, 1.25, 0.06, 0, 1.65, "greige"], ...[-0.8, -0.4, 0, 0.4, 0.8].map((x): Part => [x, -1.13, 0.17, 0.026, 0.45, 1.55, "greigeDark"]),
    [-0.5, -0.8, 0.38, 0.14, 0.6, 0.76, "white"], [0.5, -0.8, 0.38, 0.14, 0.6, 0.76, "white"], [0, -0.68, 0.3, 0.08, 0.6, 0.74, "emerald"],
    [0, 0.42, 1.1, 0.68, 0.6, 0.66, "emerald"], [0, 1.0, 1.1, 0.06, 0.4, 0.66, "emerald"],
    [0, 1.12, 0.8, 0.12, 0, 0.45, "velvet"],
  ],
  vanity_table: [
    [0, -0.03, 0.7, 0.2, 0.74, 0.78, "ivory"], ...legs(0.64, 0.14, 0.026, 0.74, "brass"),
    [0, -0.19, 0.4, 0.026, 1.0, 1.75, "brass"], [0, -0.16, 0.36, 0.026, 1.04, 1.71, "glass"],
    [0, 0.12, 0.17, 0.11, 0, 0.45, "velvet"], [-0.4, -0.05, 0.05, 0.05, 0.78, 0.9, "rose"],
  ],
  // A tall walnut wardrobe with three glass doors and brass handles.
  armoire: [
    [0, 0, 1.22, 0.24, 0, 2.3, "walnut"], [0, 0, 1.24, 0.25, 2.3, 2.36, "walnut"],
    ...[-0.8, 0, 0.8].flatMap((x): Part[] => [[x, 0.243, 0.37, 0.026, 0.1, 2.2, "glassDark"], [x + 0.3, 0.27, 0.026, 0.026, 1.0, 1.3, "brass"]]),
  ],
  // Bathroom: a double vanity in walnut and marble with a big mirror; a freestanding tub; a glass shower.
  vanity: [
    [0, -0.02, 0.98, 0.23, 0, 0.82, "walnut"], [0, -0.02, 1.0, 0.25, 0.82, 0.86, "marbleTop"],
    [-0.45, 0.0, 0.2, 0.15, 0.86, 0.95, "white"], [0.45, 0.0, 0.2, 0.15, 0.86, 0.95, "white"],
    [-0.45, -0.18, 0.026, 0.026, 0.86, 1.08, "brass"], [0.45, -0.18, 0.026, 0.026, 0.86, 1.08, "brass"],
    [0, -0.19, 0.95, 0.026, 1.0, 1.95, "brass"], [0, -0.16, 0.9, 0.026, 1.04, 1.91, "glass"],
  ],
  freestanding_tub: [
    [0, 0, 0.85, 0.4, 0.08, 0.6, "white"], [0, 0, 0.75, 0.3, 0.5, 0.605, "water"],
    ...legs(0.7, 0.3, 0.04, 0.08, "brass"), [0.78, -0.3, 0.026, 0.026, 0.6, 0.85, "brass"], [0.7, -0.3, 0.09, 0.026, 0.82, 0.86, "brass"],
  ],
  shower_glass: [
    [0, 0, 0.72, 0.72, 0, 0.06, "marbleTop"], [0, 0.7, 0.72, 0.026, 0.06, 2.0, "glassClear"], [0.7, 0, 0.026, 0.72, 0.06, 2.0, "glassClear"],
    [0, -0.45, 0.16, 0.16, 2.1, 2.14, "steel"], [0, -0.66, 0.026, 0.026, 1.0, 2.14, "steel"], [0, -0.55, 0.026, 0.12, 2.1, 2.14, "steel"],
  ],
  // Lights.
  chandelier_crystal: [
    [0, 0, 0.026, 0.026, 2.42, 2.8, "brass"], ...roundish(0.52, 2.2, 2.24, "brass"), ...roundish(0.14, 2.24, 2.42, "brass"),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((i): Part[] => {
      const a = (i / 10) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
      return [[x * 0.48, z * 0.48, 0.026, 0.026, 2.0, 2.2, "crystal"], [x * 0.48, z * 0.48, 0.028, 0.028, 2.24, 2.32, "ivory"],
        [x * 0.28, z * 0.28, 0.026, 0.026, 1.9, 2.2, "crystal"]];
    }),
    [0, 0, 0.06, 0.06, 1.78, 2.2, "crystal"],
  ],
  pendants: [-0.65, 0, 0.65].flatMap((x): Part[] => [[x, 0, 0.026, 0.026, 1.9, 2.8, "frame"], [x, 0, 0.16, 0.16, 1.66, 1.9, "brass"], [x, 0, 0.08, 0.08, 1.62, 1.66, "ivory"]]),
  wall_light: [[0, -0.19, 0.07, 0.026, 1.8, 2.06, "brass"], [0, -0.16, 0.03, 0.07, 1.9, 1.95, "brass"], [0, -0.1, 0.09, 0.09, 1.86, 2.08, "ivory"]],
  floor_lamp: [...roundish(0.16, 0, 0.04, "brass"), [0, 0, 0.026, 0.026, 0.04, 1.4, "brass"], [0, 0, 0.2, 0.2, 1.35, 1.66, "ivory"]],
  // On the walls.
  art_large: [
    [0, -0.19, 0.95, 0.026, 1.0, 2.15, "frame"], [0, -0.165, 0.88, 0.026, 1.06, 2.09, "art6"],
    [-0.35, -0.14, 0.4, 0.026, 1.2, 1.75, "art5"], [0.25, -0.14, 0.45, 0.026, 1.45, 1.95, "art4"], [0.4, -0.135, 0.2, 0.026, 1.15, 1.4, "art3"],
  ],
  art_trio: [-0.65, 0, 0.65].flatMap((x, i): Part[] => [
    [x, -0.19, 0.27, 0.026, 1.25, 1.85, "brass"], [x, -0.165, 0.23, 0.026, 1.29, 1.81, "art6"],
    [x, -0.14, 0.14, 0.026, 1.4 + i * 0.05, 1.7 - i * 0.03, ["art4", "art5", "leafDark"][i]],
  ]),
  mirror: [
    [0, -0.19, 0.4, 0.026, 1.25, 1.95, "brass"], [0, -0.19, 0.28, 0.026, 1.1, 2.1, "brass"],
    [0, -0.16, 0.36, 0.026, 1.29, 1.91, "glass"], [0, -0.16, 0.24, 0.026, 1.14, 2.06, "glass"],
  ],
  curtains: [
    [0, -0.18, 1.0, 0.026, 2.55, 2.6, "brass"],
    ...[-1, 1].flatMap((side): Part[] => [0, 1, 2, 3].map((k): Part => [side * (0.5 + k * 0.12), -0.15, 0.06, 0.06, 0.02, 2.55, k % 2 ? "curtainDark" : "curtain"])),
  ],
  // On the floor.
  rug_persian: [
    [0, 0, 1.98, 1.23, 0, 0.02, "rugRed"], [0, 0, 1.86, 1.11, 0.02, 0.024, "brass"], [0, 0, 1.78, 1.03, 0.024, 0.028, "rugNavy"],
    [0, 0, 1.6, 0.85, 0.028, 0.032, "rugRed"], ...roundish(0.6, 0.032, 0.036, "brass"), ...roundish(0.42, 0.036, 0.04, "rugNavy"), ...roundish(0.2, 0.04, 0.044, "ivory"),
    ...[[-1.3, -0.6], [1.3, -0.6], [-1.3, 0.6], [1.3, 0.6]].map(([x, z]): Part => [x, z, 0.16, 0.16, 0.032, 0.036, "ivory"]),
  ],
  plant_palm: [
    [0, 0, 0.22, 0.22, 0, 0.45, "frame"], [0, 0, 0.05, 0.05, 0.45, 1.35, "darkwood"],
    [0.32, 0, 0.32, 0.06, 1.32, 1.38, "leaf"], [-0.32, 0, 0.32, 0.06, 1.32, 1.38, "leafLight"], [0, 0.32, 0.06, 0.32, 1.34, 1.4, "leafDark"], [0, -0.32, 0.06, 0.32, 1.34, 1.4, "leaf"],
    [0.22, 0.22, 0.2, 0.06, 1.42, 1.47, "leafLight"], [-0.22, -0.22, 0.2, 0.06, 1.42, 1.47, "leafDark"], [0, 0, 0.12, 0.12, 1.35, 1.6, "leaf"],
  ],
  vase: [[0, 0, 0.12, 0.12, 0, 0.6, "ivory"], [0, 0, 0.16, 0.16, 0.6, 0.82, "leafDark"], [0.06, 0.04, 0.12, 0.12, 0.72, 0.92, "rose"], [-0.07, -0.03, 0.1, 0.1, 0.75, 0.9, "art6"]],
  bookcase: [
    [0, -0.02, 1.48, 0.22, 0, 2.4, "walnut"], [0, 0.05, 1.4, 0.16, 0.12, 2.3, "frame"],
    ...[0.15, 0.7, 1.25, 1.8].flatMap((y, i): Part[] => [[0, 0.07, 1.4, 0.15, y - 0.03, y, "walnut"], ...books(-1.3, -0.1, 0.06, y, 0.42, i * 5), [0.6, 0.06, 0.12, 0.09, y, y + 0.22, i % 2 ? "brass" : "ivory"]]),
  ],
  // A snooker table: green cloth, a wooden frame, a few balls and a cue lying on it.
  pool: [
    ...legs(0.85, 1.35, 0.07, 0.66, "darkwood"),
    [0, 0, 0.97, 1.47, 0.66, 0.84, "darkwood"], [0, 0, 0.85, 1.35, 0.84, 0.86, "felt"],
    ...[[0.2, 0.3, "red"], [-0.15, 0.4, "red"], [0.05, 0.55, "red"], [0.3, -0.6, "white"], [-0.4, -0.2, "art3"], [0.45, 0.9, "blue"]].map(([x, z, c]): Part => [x as number, z as number, 0.03, 0.03, 0.86, 0.92, c as string]),
    [-0.5, -0.2, 0.012, 0.75, 0.86, 0.885, "wood"],
  ],
};

/** Every item id this file knows how to draw. Anything else is drawn as a plain crate. */
export const KNOWN_SHAPES = Object.keys(SHAPES);

/** The boxes of a piece, before it is turned or placed. */
export function partsOf(option: FurnitureOption, cell: number): Part[] {
  return SHAPES[option.id] ?? [[0, 0, (option.w * cell) / 2 - 0.03, (option.d * cell) / 2 - 0.03, 0, 0.6, "wood"]];
}

/** Add one piece to a mesh, where it stands and turned as it is. */
export function addPiece(builder: MeshBuilder, plan: HomePlan, option: FurnitureOption, item: { x: number; z: number; rot: number }, tint?: RGB): void {
  const { w, d } = footprint(option, item.rot);
  const centreX = (item.x + w / 2) * plan.cell;
  const centreZ = (item.z + d / 2) * plan.cell;
  const turns = ((item.rot % 4) + 4) % 4;
  for (const [px, pz, halfX, halfZ, bottom, top, paint] of partsOf(option, plan.cell)) {
    // A quarter turn moves (x, z) to (-z, x) and swaps the box's width and depth.
    let x = px, z = pz, hx = halfX, hz = halfZ;
    for (let turn = 0; turn < turns; turn++) {
      [x, z] = [-z, x];
      [hx, hz] = [hz, hx];
    }
    builder.box(centreX + x, centreZ + z, hx, hz, bottom, top, tint ?? PAINT[paint] ?? PAINT.wood);
  }
}

/** All the furniture on one floor, as one mesh. `leaveOut` is a piece being moved: it is drawn as a ghost instead. */
export function buildFurniture(
  plan: HomePlan,
  floor: number,
  items: PlacedItem[],
  catalogue: FurnitureOption[],
  leaveOut: number | null = null,
): MeshData {
  const builder = new MeshBuilder();
  const options = new Map(catalogue.map((option) => [option.id, option]));
  for (const item of items) {
    if (item.floor !== floor || item.id === leaveOut) continue;
    const option = options.get(item.item);
    if (option) addPiece(builder, plan, option, item);
  }
  return builder.build();
}

/** One piece on its own, as a mesh: the ghost of a piece being put down. */
export function buildPiece(plan: HomePlan, option: FurnitureOption, spot: { x: number; z: number; rot: number }): MeshData {
  const builder = new MeshBuilder();
  addPiece(builder, plan, option, spot);
  return builder.build();
}
