// Arranging a house: where a new piece would go, and whether it fits there. The server
// has the last word (home_service.check_spot); this is the same arithmetic done first, so
// the player sees red before they press the button and not an error after. No 3D imports.

import type { FurnitureOption, HomePlan, PlacedItem, Spot } from "../api/home";
import { footprint, itemRect, type Rect } from "./homeLayout";

/** How much clear floor is left between the player and a piece they are offered, in metres. */
const AHEAD = 0.35;
/** How close to a piece of furniture a player must stand to pick it out, in metres. */
export const PICK_REACH = 1.0;
const BODY = 0.3; // how much room the player's own body takes. Less than AHEAD, so a piece offered ahead is never on top of them.

/** Cells that must stay empty so the door, the stairs and the people in the room can be reached. Must match the server. */
export function reservedCells(plan: HomePlan, floor: number): Set<string> {
  const reserved = new Set<string>();
  const add = (x: number, z: number) => reserved.add(`${x},${z}`);
  if (floor === 0) {
    for (let cx = plan.door.x; cx < plan.door.x + plan.door.w; cx++) {
      add(cx, 0);
      add(cx, 1);
    }
    for (const fixture of plan.fixtures ?? []) {
      add(fixture.x, fixture.z);
      if (fixture.kind === "door") add(fixture.x + 1, fixture.z);
    }
  }
  const stairs = plan.stairs;
  if (stairs) {
    for (let cx = stairs.x; cx < stairs.x + stairs.w; cx++) {
      for (let cz = stairs.z; cz < stairs.z + stairs.d; cz++) add(cx, cz);
    }
    const from = floor === 0 ? stairs.z + stairs.d : stairs.z - 2;
    for (let cx = stairs.x; cx < stairs.x + stairs.w + 2; cx++) {
      for (let cz = from; cz < from + 2; cz++) add(cx, cz);
    }
  }
  return reserved;
}

/**
 * Where a piece would be put for a player standing at (x, z): its footprint centred on
 * them from side to side, and its near edge just beyond them, away from the camera. It is
 * kept inside the room, so against the back wall it can land on top of them (and whyNot says so).
 */
export function offerSpot(
  plan: HomePlan,
  floor: number,
  option: FurnitureOption,
  rot: number,
  x: number,
  z: number
): Spot {
  const room = plan.floors[floor] ?? plan.floors[0];
  const { w, d } = footprint(option, rot);
  const cellX = Math.round(x / plan.cell - w / 2);
  const cellZ = Math.floor((z - AHEAD) / plan.cell) - d;
  return {
    floor,
    x: Math.max(0, Math.min(room.w - w, cellX)),
    z: Math.max(0, Math.min(room.d - d, cellZ)),
    rot: ((rot % 4) + 4) % 4,
  };
}

/** The patch of floor a piece would cover at a spot, in metres. */
export function spotRect(
  plan: HomePlan,
  option: FurnitureOption,
  spot: Spot
): Rect {
  return itemRect(plan, option, {
    id: 0,
    item: option.id,
    gift: false,
    ...spot,
  });
}

/**
 * Why a piece cannot go at a spot, in words, or null if it can. `ignoreId` is the piece
 * being moved, which is not in its own way. (px, pz) is where the player stands: nothing
 * solid may be put down on top of them.
 */
export function whyNot(
  plan: HomePlan,
  items: PlacedItem[],
  catalogue: FurnitureOption[],
  option: FurnitureOption,
  spot: Spot,
  ignoreId: number | null,
  px: number,
  pz: number
): string | null {
  const room = plan.floors[spot.floor];
  if (!room) return "This house does not have that floor.";
  const { w, d } = footprint(option, spot.rot);
  if (spot.x < 0 || spot.z < 0 || spot.x + w > room.w || spot.z + d > room.d)
    return "That does not fit inside the room.";

  const reserved = reservedCells(plan, spot.floor);
  for (let cx = spot.x; cx < spot.x + w; cx++) {
    for (let cz = spot.z; cz < spot.z + d; cz++) {
      if (reserved.has(`${cx},${cz}`))
        return "Keep the door, the stairs and the people clear.";
    }
  }

  const options = new Map(catalogue.map((entry) => [entry.id, entry]));
  for (const other of items) {
    if (other.floor !== spot.floor || other.id === ignoreId) continue;
    const otherOption = options.get(other.item);
    if (!otherOption || otherOption.solid !== option.solid) continue; // a rug may lie under furniture
    const size = footprint(otherOption, other.rot);
    const apartX = spot.x + w <= other.x || other.x + size.w <= spot.x;
    const apartZ = spot.z + d <= other.z || other.z + size.d <= spot.z;
    if (!apartX && !apartZ) return "Something is already there.";
  }

  if (option.solid) {
    const rect = spotRect(plan, option, spot);
    if (
      Math.abs(px - rect.cx) < rect.halfX + BODY &&
      Math.abs(pz - rect.cz) < rect.halfZ + BODY
    )
      return "Step back: you are standing there.";
  }
  return null;
}

/**
 * The piece of furniture a player is standing at, usable or not: the one that would be
 * moved or sold. The nearest within reach; of two equally near, the one placed first.
 */
export function nearestPiece(
  plan: HomePlan,
  floor: number,
  items: PlacedItem[],
  catalogue: FurnitureOption[],
  x: number,
  z: number
): PlacedItem | null {
  let best: PlacedItem | null = null;
  let bestGap = PICK_REACH;
  for (const item of items) {
    if (item.floor !== floor) continue;
    let option: FurnitureOption | null = null;
    for (const entry of catalogue) if (entry.id === item.item) option = entry;
    if (!option) continue;
    const turned = item.rot % 2 !== 0;
    const w = turned ? option.d : option.w;
    const d = turned ? option.w : option.d;
    const overX =
      Math.abs(x - (item.x + w / 2) * plan.cell) - (w * plan.cell) / 2;
    const overZ =
      Math.abs(z - (item.z + d / 2) * plan.cell) - (d * plan.cell) / 2;
    const gap = Math.hypot(Math.max(overX, 0), Math.max(overZ, 0));
    if (
      gap < bestGap ||
      (gap === bestGap && best !== null && item.id < best.id)
    ) {
      best = item;
      bestGap = gap;
    }
  }
  return best;
}

/** What a piece sells for. Must match the server: half price, and nothing for what came with the house. */
export function sellPrice(option: FurnitureOption, item: PlacedItem): number {
  return item.gift ? 0 : Math.floor(option.price * 0.5);
}
