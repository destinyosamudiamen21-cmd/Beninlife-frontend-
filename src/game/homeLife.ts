// Using the things in a house: the furniture, and whatever comes with the room (a
// roommate, the door to the bathroom). No 3D imports here, so all of it can be tested alone.

import type { FurnitureOption, HomePlan, PlacedItem } from "../api/home";
import { fixtureRect, itemRect } from "./homeLayout";
import type { Near, Stand } from "./nearby";

/** How close to the edge of a piece of furniture a player must stand to use it, in metres. */
export const REACH = 0.9;
/** A person is talked to from a little further off than a chair is sat on. */
export const PERSON_REACH = 1.1;

/**
 * Where a body goes on a piece of furniture, measured like the furniture's own boxes
 * (homeGeometry.ts): metres from its middle before it is turned, the back at -z. `y` is
 * how high the seat or the mattress is. A sitter faces +z, out of the seat. Someone lying
 * down is stood at the foot facing away from the pillow, and tips over backwards from
 * the feet (fightMoves.ts, "lie"), so their head lands on the pillow.
 */
type Rest = { x: number; z: number; y: number; face: "front" | "side" };
const SEATS: Record<string, Rest[]> = {
  chair: [{ x: 0, z: 0.04, y: 0, face: "front" }],
  plastic_chair: [{ x: 0, z: 0.04, y: 0, face: "front" }],
  armchair: [{ x: 0, z: 0.12, y: 0, face: "front" }],
  sofa: [{ x: -0.42, z: 0.12, y: 0, face: "front" }, { x: 0.42, z: 0.12, y: 0, face: "front" }],
  couch: [{ x: -0.3, z: 0.12, y: 0, face: "front" }, { x: 0.3, z: 0.12, y: 0, face: "front" }],
  sofa3: [{ x: -0.72, z: 0.12, y: 0, face: "front" }, { x: 0, z: 0.12, y: 0, face: "front" }, { x: 0.72, z: 0.12, y: 0, face: "front" }],
};
const BEDS: Record<string, Rest[]> = {
  mattress: [{ x: 0, z: 0.86, y: 0.22, face: "front" }],
  bunk: [{ x: 0, z: 0.86, y: 0.52, face: "front" }],
  bed: [{ x: 0, z: 0.88, y: 0.54, face: "front" }],
  bigbed: [{ x: -0.42, z: 0.88, y: 0.6, face: "front" }, { x: 0.42, z: 0.88, y: 0.6, face: "front" }],
  kingbed: [{ x: -0.45, z: 0.95, y: 0.6, face: "front" }, { x: 0.45, z: 0.95, y: 0.6, face: "front" }],
  // Along the sofa, the head on the far arm.
  sofa: [{ x: 0.84, z: 0.1, y: 0.5, face: "side" }],
  couch: [{ x: 0.6, z: 0.1, y: 0.5, face: "side" }],
  sofa3: [{ x: 1.1, z: 0.1, y: 0.5, face: "side" }],
};
/** What each thing done on furniture does with the body. The server sends the same as the pose. */
const LYING = new Set(["lie_down", "sleep_mattress", "sleep_bunk", "sleep_bed", "sleep_bigbed", "sleep_kingbed", "phone_bed", "nap"]);
const SITTING = new Set(["sit", "feet_up", "call_friend", "doze"]);

/**
 * Where a player using a piece of furniture is put: in the seat nearest them, or on the
 * bed, turned the way the piece is turned. Anything else (eating at a chair, say) leaves
 * them standing where they were, facing it.
 */
export function restSpot(kind: string, cx: number, cz: number, turns: number, x: number, z: number, action?: string): Stand {
  const list = action && LYING.has(action) ? BEDS[kind] : action && SITTING.has(action) ? SEATS[kind] : undefined;
  if (!list) return { x, z };
  const place = (rest: Rest) => {
    // A quarter turn takes (x, z) to (-z, x), as the furniture itself is turned.
    let lx = rest.x, lz = rest.z;
    let fx = rest.face === "front" ? 0 : 1, fz = rest.face === "front" ? 1 : 0;
    for (let turn = 0; turn < turns; turn++) {
      [lx, lz] = [-lz, lx];
      [fx, fz] = [-fz, fx];
    }
    return { x: cx + lx, z: cz + lz, y: rest.y, rot: Math.atan2(fx, fz) };
  };
  let best = place(list[0]);
  for (const rest of list.slice(1)) {
    const spot = place(rest);
    if (Math.hypot(spot.x - x, spot.z - z) < Math.hypot(best.x - x, best.z - z)) best = spot;
  }
  return best;
}

/**
 * Everything on one floor of a house that can be used, as things a player can stand at.
 * Built once whenever the house changes, not every frame. Furniture comes first, oldest
 * first, so that when two things are equally near the answer is always the same one.
 */
export function homeThings(
  plan: HomePlan,
  floor: number,
  items: PlacedItem[],
  catalogue: FurnitureOption[],
  usable: ReadonlySet<string>,
): Near[] {
  const options = new Map(catalogue.map((option) => [option.id, option]));
  const things: Near[] = [];

  for (const item of [...items].sort((a, b) => a.id - b.id)) {
    const option = options.get(item.item);
    if (item.floor !== floor || !option || !usable.has(item.item)) continue;
    const rect = itemRect(plan, option, item);
    things.push({
      key: `item:${item.id}`,
      target: { item_id: item.id },
      name: option.name,
      x: rect.cx,
      z: rect.cz,
      halfX: rect.halfX,
      halfZ: rect.halfZ,
      reach: REACH,
      standAt: (x, z, action) => restSpot(item.item, rect.cx, rect.cz, ((item.rot % 4) + 4) % 4, x, z, action),
    });
  }

  if (floor === 0) {
    for (const fixture of plan.fixtures ?? []) {
      const rect = fixtureRect(plan, fixture);
      const person = fixture.kind === "person";
      things.push({
        key: `spot:${fixture.id}`,
        target: { spot: fixture.id },
        name: person ? fixture.name : "the bathroom",
        verb: person ? "Talk to" : "Go to",
        x: person ? rect.cx : 0,   // a door is in the wall, not in the middle of its cell
        z: rect.cz,
        halfX: person ? rect.halfX : 0,
        halfZ: rect.halfZ,
        reach: person ? PERSON_REACH : REACH,
      });
    }
  }
  return things;
}
