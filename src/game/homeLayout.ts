// The arithmetic of a house: where cells are in metres, what the stairs do, and what
// a player bumps into indoors. No 3D imports here, so all of it can be tested alone.

import type { FurnitureOption, HomePlan, PlacedItem } from "../api/home";
import {
  EDGE_MARGIN,
  PLAYER_RADIUS,
  buildCollider,
  type Collider,
} from "./collision";
import type { Building } from "./districtData";

export const WALL_HEIGHT = 2.8;

export type FloorChange = { floor: number; x: number; z: number };
export type Rect = { cx: number; cz: number; halfX: number; halfZ: number };

/** Cells an item covers. A quarter turn swaps width and depth. Must match the server. */
export function footprint(
  option: FurnitureOption,
  rot: number
): { w: number; d: number } {
  return rot % 2 ? { w: option.d, d: option.w } : { w: option.w, d: option.d };
}

/** Where an item stands, in metres. */
export function itemRect(
  plan: HomePlan,
  option: FurnitureOption,
  item: PlacedItem
): Rect {
  const { w, d } = footprint(option, item.rot);
  return {
    cx: (item.x + w / 2) * plan.cell,
    cz: (item.z + d / 2) * plan.cell,
    halfX: (w * plan.cell) / 2,
    halfZ: (d * plan.cell) / 2,
  };
}

/** The room on one floor, in metres. The back-left corner is (0, 0); the camera looks from the front. */
export function roomSize(
  plan: HomePlan,
  floor: number
): { width: number; depth: number } {
  const room = plan.floors[floor] ?? plan.floors[0];
  return { width: room.w * plan.cell, depth: room.d * plan.cell };
}

/** Where a player stands after coming in through the door. */
export function doorSpot(plan: HomePlan): { x: number; z: number } {
  return { x: (plan.door.x + plan.door.w / 2) * plan.cell, z: 1.5 * plan.cell };
}

/** The stair strip in metres, or null in a house with one floor. */
export function stairsRect(
  plan: HomePlan
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
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
export function stairTrigger(
  plan: HomePlan,
  floor: number,
  x: number,
  z: number
): FloorChange | null {
  const strip = stairsRect(plan);
  if (!strip || plan.floors.length < 2) return null;
  if (x < strip.minX || x > strip.maxX) return null;
  const middle = (strip.minX + strip.maxX) / 2;

  if (floor === 0 && z >= strip.maxZ - plan.cell && z <= strip.maxZ) {
    return { floor: 1, x: middle, z: strip.minZ - plan.cell };
  }
  if (floor === 1 && z >= strip.minZ && z <= strip.minZ + plan.cell) {
    return { floor: 0, x: middle, z: strip.maxZ + plan.cell };
  }
  return null;
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
  return {
    r: [rect.cx, rect.cz, rect.halfX, rect.halfZ, 0],
    f: 1,
    s: 0,
    k: "flat",
  };
}

/**
 * Walls, stairs and furniture for one floor, as the same kind of collider the street uses.
 * A room is described to it as a tiny district whose "buildings" are the furniture.
 */
export function homeCollider(
  plan: HomePlan,
  floor: number,
  items: PlacedItem[],
  catalogue: FurnitureOption[]
): Collider {
  const { width, depth } = roomSize(plan, floor);
  const options = new Map(catalogue.map((option) => [option.id, option]));
  const solids: Building[] = [];

  for (const item of items) {
    if (item.floor !== floor) continue;
    const option = options.get(item.item);
    if (option?.solid) solids.push(solid(itemRect(plan, option, item)));
  }
  const stairs = stairsBlock(plan, floor);
  if (stairs) solids.push(solid(stairs));

  // The collider keeps players EDGE_MARGIN inside its bounds. Setting the bounds this far
  // outside the walls makes that land exactly a body's width from each wall.
  const reach = EDGE_MARGIN - PLAYER_RADIUS;
  return buildCollider({
    id: plan.kind,
    name: plan.name,
    attribution: "",
    bounds: {
      minX: -reach,
      maxX: width + reach,
      minZ: -reach,
      maxZ: depth + reach,
    },
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
}
