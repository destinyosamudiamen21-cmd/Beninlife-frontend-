// The arithmetic of a house: where cells are in metres, what the stairs do, and what
// a player bumps into indoors. No 3D imports here, so all of it can be tested alone.

import type { Fixture, FurnitureOption, HomePlan, PlacedItem, Room } from "../api/home";
import { EDGE_MARGIN, PLAYER_RADIUS, buildCollider, type Collider, type Point } from "./collision";
import type { Building } from "./districtData";
import { isDone, serverNow, wallRuns } from "./homeRooms";

export const WALL_HEIGHT = 2.8;
/** Half the thickness of a wall, in metres. A wall between two rooms is two halves, one painted for each. */
export const HALF_WALL = 0.075;
/**
 * How wide a player is indoors, as a circle on the floor. Slimmer than out on the street
 * (PLAYER_RADIUS): a house is full of doorways and furniture, and a phone thumb is not precise.
 */
export const HOME_RADIUS = 0.22;
/** How near the stairs a player must be for the "Go upstairs" button. */
export const STAIRS_REACH = 1.8;

export type FloorChange = { floor: number; x: number; z: number };
export type Rect = { cx: number; cz: number; halfX: number; halfZ: number };

/** Cells an item covers. A quarter turn swaps width and depth. Must match the server. */
export function footprint(option: FurnitureOption, rot: number): { w: number; d: number } {
  return rot % 2 ? { w: option.d, d: option.w } : { w: option.w, d: option.d };
}

/** Where an item stands, in metres. */
export function itemRect(plan: HomePlan, option: FurnitureOption, item: PlacedItem): Rect {
  const { w, d } = footprint(option, item.rot);
  return {
    cx: (item.x + w / 2) * plan.cell,
    cz: (item.z + d / 2) * plan.cell,
    halfX: (w * plan.cell) / 2,
    halfZ: (d * plan.cell) / 2,
  };
}

/** Where a fixture stands, in metres: the middle of its cell. A person is as wide as a person. */
export function fixtureRect(plan: HomePlan, fixture: Fixture): Rect {
  const half = fixture.kind === "person" ? 0.28 : plan.cell / 2;
  return { cx: (fixture.x + 0.5) * plan.cell, cz: (fixture.z + 0.5) * plan.cell, halfX: half, halfZ: half };
}

/** The room on one floor, in metres. The back-left corner is (0, 0); the camera looks from the front. */
export function roomSize(plan: HomePlan, floor: number): { width: number; depth: number } {
  const room = plan.floors[floor] ?? plan.floors[0];
  return { width: room.w * plan.cell, depth: room.d * plan.cell };
}

/** Where a player stands after coming in through the door. */
export function doorSpot(plan: HomePlan): { x: number; z: number } {
  return { x: (plan.door.x + plan.door.w / 2) * plan.cell, z: 1.5 * plan.cell };
}

/** The stair strip in metres, or null in a house with one floor. */
export function stairsRect(plan: HomePlan): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const stairs = plan.stairs;
  if (!stairs) return null;
  return {
    minX: stairs.x * plan.cell,
    maxX: (stairs.x + stairs.w) * plan.cell,
    minZ: stairs.z * plan.cell,
    maxZ: (stairs.z + stairs.d) * plan.cell,
  };
}

/**
 * Has the player stepped onto the stairs? Downstairs the way up is the front row of the
 * strip (the bottom step). Upstairs the way down is the back row (the top step).
 * Returns where they come out on the other floor: a landing, never another step,
 * so arriving can never send them straight back.
 */
export function stairTrigger(plan: HomePlan, floor: number, x: number, z: number): FloorChange | null {
  const strip = stairsRect(plan);
  if (!strip || plan.floors.length < 2) return null;
  if (x < strip.minX || x > strip.maxX) return null;

  if (floor === 0 && z >= strip.maxZ - plan.cell && z <= strip.maxZ + 0.1) {
    return stairsGo(plan, floor);
  }
  if (floor === 1 && z >= strip.minZ - 0.1 && z <= strip.minZ + plan.cell) {
    return stairsGo(plan, floor);
  }
  return null;
}

/** Where taking the stairs from this floor puts a player: on the landing at the other end. */
export function stairsGo(plan: HomePlan, floor: number): FloorChange | null {
  const strip = stairsRect(plan);
  if (!strip || plan.floors.length < 2) return null;
  const middle = (strip.minX + strip.maxX) / 2;
  return floor === 0
    ? { floor: 1, x: middle, z: strip.minZ - plan.cell }
    : { floor: 0, x: middle, z: strip.maxZ + plan.cell };
}

/**
 * Is the player near enough to the foot (or, upstairs, the head) of the stairs to take them
 * with a button? Returns where they would come out, or null. Walking onto the step does it
 * too (stairTrigger); the button is for a crowded room and a clumsy thumb.
 */
export function stairsNear(plan: HomePlan, floor: number, x: number, z: number): FloorChange | null {
  const strip = stairsRect(plan);
  if (!strip || plan.floors.length < 2) return null;
  const middle = (strip.minX + strip.maxX) / 2;
  const stepZ = floor === 0 ? strip.maxZ - plan.cell / 2 : strip.minZ + plan.cell / 2;
  const gapX = Math.max(0, Math.abs(x - middle) - (strip.maxX - strip.minX) / 2);
  return Math.hypot(gapX, z - stepZ) <= STAIRS_REACH ? stairsGo(plan, floor) : null;
}

/** The part of the stair strip that is solid on a floor: everything but the row you step onto. */
export function stairsBlock(plan: HomePlan, floor: number): Rect | null {
  const strip = stairsRect(plan);
  if (!strip) return null;
  const minZ = floor === 0 ? strip.minZ : strip.minZ + plan.cell;
  const maxZ = floor === 0 ? strip.maxZ - plan.cell : strip.maxZ;
  return {
    cx: (strip.minX + strip.maxX) / 2,
    cz: (minZ + maxZ) / 2,
    halfX: (strip.maxX - strip.minX) / 2,
    halfZ: (maxZ - minZ) / 2,
  };
}

function solid(rect: Rect): Building {
  return { r: [rect.cx, rect.cz, rect.halfX, rect.halfZ, 0], f: 1, s: 0, k: "flat" };
}

/** A wall run as a rectangle in metres: the half of the wall on its own room's side, or the outer half. */
export function wallRect(plan: HomePlan, run: { axis: "x" | "z"; line: number; from: number; to: number; out: 1 | -1 }, outer = false): Rect {
  const cell = plan.cell;
  // The half on the room's side lies just inside the line; the outer half just beyond it.
  const offset = (outer ? 1 : -1) * run.out * HALF_WALL * 0.5;
  const along = ((run.from + run.to) / 2) * cell;
  const half = ((run.to - run.from) / 2) * cell;
  return run.axis === "x"
    ? { cx: run.line * cell + offset, cz: along, halfX: HALF_WALL / 2, halfZ: half }
    : { cx: along, cz: run.line * cell + offset, halfX: half, halfZ: HALF_WALL / 2 };
}

/**
 * Walls, stairs and furniture for one floor, as the same kind of collider the street uses.
 * A house is described to it as a tiny district whose "buildings" are the walls and the
 * furniture. A room still going up is solid all through: nobody walks into a building site.
 */
export function homeCollider(
  plan: HomePlan,
  floor: number,
  items: PlacedItem[],
  catalogue: FurnitureOption[],
  rooms: Room[] = [],
  now: number = serverNow(),
): Collider {
  const options = new Map(catalogue.map((option) => [option.id, option]));
  const solids: Building[] = [];
  for (const run of wallRuns(rooms, floor, now)) {
    solids.push(solid(wallRect(plan, run)));
    if (!run.inner) solids.push(solid(wallRect(plan, run, true)));
  }
  for (const room of rooms) {
    if (room.floor !== floor || isDone(room, now)) continue;
    solids.push(solid({ cx: (room.x + room.w / 2) * plan.cell, cz: (room.z + room.d / 2) * plan.cell, halfX: (room.w * plan.cell) / 2, halfZ: (room.d * plan.cell) / 2 }));
  }

  for (const item of items) {
    if (item.floor !== floor) continue;
    const option = options.get(item.item);
    if (option?.solid) solids.push(solid(itemRect(plan, option, item)));
  }
  const stairs = stairsBlock(plan, floor);
  if (stairs) solids.push(solid(stairs));
  // A roommate is in the way like anybody else. A door in the wall is not.
  if (floor === 0) {
    for (const fixture of plan.fixtures ?? []) {
      if (fixture.kind === "person") solids.push(solid(fixtureRect(plan, fixture)));
    }
  }

  // The collider keeps players EDGE_MARGIN inside its bounds. Setting the bounds this far
  // outside the plot makes that land exactly a body's width from its edge. With no rooms
  // (a house read before rooms existed) the bounds are the old room, as they always were.
  const reach = EDGE_MARGIN - PLAYER_RADIUS;
  const lot = plan.lot;
  const { width, depth } = roomSize(plan, floor);
  const bounds = rooms.length > 0 && lot
    ? { minX: lot.min_x * plan.cell - reach, maxX: lot.max_x * plan.cell + reach, minZ: lot.min_z * plan.cell - reach, maxZ: lot.max_z * plan.cell + reach }
    : { minX: -reach, maxX: width + reach, minZ: -reach, maxZ: depth + reach };
  const inner = buildCollider({
    id: plan.kind,
    name: plan.name,
    attribution: "",
    bounds,
    spawn: [0, 0],
    floorHeight: WALL_HEIGHT,
    buildings: solids,
    roads: [],
    areas: [],
    gates: [],
    pillars: [],
    trees: [],
    labels: [],
  });
  // Indoors a player is slimmer than on the street, so doorways and the gaps between the
  // furniture can be walked through without threading a needle.
  // A slim body could step clean through a thin wall in one long stride (a slow frame on a
  // phone), so a long step is taken as several short ones.
  const step: Point = { x: 0, z: 0 };
  return {
    ...inner,
    resolve: (fromX, fromZ, toX, toZ, out, radius = HOME_RADIUS) => {
      const r = Math.min(radius, HOME_RADIUS);
      const parts = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / (r * 0.4)));
      // Each short step goes on from wherever the last one ended, so a wall that stopped one
      // stops the rest: aiming every step at the far end would carry the body into the wall.
      const dx = (toX - fromX) / parts, dz = (toZ - fromZ) / parts;
      let x = fromX, z = fromZ, blocked = false;
      for (let i = 1; i <= parts; i++) {
        if (inner.resolve(x, z, x + dx, z + dz, step, r)) blocked = true;
        x = step.x;
        z = step.z;
      }
      out.x = x;
      out.z = z;
      return blocked;
    },
  };
}
