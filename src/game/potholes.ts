// Benin roads: potholes, and stretches where the tarmac has broken up. They are the same for
// everybody (drawn from the district's own name, not at random each time), they are drawn on
// the road, and a car that drives into one jolts, loses speed and bangs.

import { MeshBuilder, type MeshData } from "./districtGeometry";
import type { DistrictData } from "./districtData";
import { hexToLinear } from "./tint";

export type Pothole = { x: number; z: number; r: number; deep: boolean };

const ROADS = new Set(["trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "service"]);
const CELL = 12;

/** A little random number maker that always gives the same numbers for the same seed. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export type Potholes = { list: Pothole[]; grid: Map<string, Pothole[]> };

const made = new Map<string, Potholes>();

/**
 * Where the holes are. Main roads are mostly patched; side streets and dirt roads are worse.
 * Every so often a whole stretch has broken up: holes one after another for 30–60 m.
 */
export function potholesFor(district: DistrictData): Potholes {
  const known = made.get(district.id);
  if (known) return known;
  const random = seeded(`potholes-${district.id}`);
  const list: Pothole[] = [];
  for (const road of district.roads) {
    if (!ROADS.has(road.t)) continue;
    const every = road.t === "trunk" || road.t === "primary" ? 70 : road.s === "dirt" ? 22 : 38;
    const p = road.p;
    let carry = random() * every;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 1e-3) continue;
      const ux = (bx - ax) / length, uz = (bz - az) / length;
      let at = carry;
      while (at < length) {
        const broken = random() < 0.12;                 // a stretch where the road has gone
        const count = broken ? 4 + Math.floor(random() * 5) : 1;
        for (let k = 0; k < count && at < length; k++) {
          const across = (random() - 0.5) * Math.max(1, road.w - 2.2);
          const r = broken ? 0.7 + random() * 1.1 : 0.5 + random() * 0.8;
          list.push({ x: ax + ux * at - uz * across, z: az + uz * at + ux * across, r, deep: random() < 0.3 });
          at += broken ? 4 + random() * 6 : 0;
        }
        at += every * (0.6 + random() * 0.8);
      }
      carry = at - length;
    }
  }
  const grid = new Map<string, Pothole[]>();
  for (const hole of list) {
    const key = `${Math.floor(hole.x / CELL)},${Math.floor(hole.z / CELL)}`;
    let cell = grid.get(key);
    if (!cell) grid.set(key, (cell = []));
    cell.push(hole);
  }
  const result = { list, grid };
  made.set(district.id, result);
  return result;
}

/** The hole a wheel at (x, z) is in, or null. */
export function holeAt(holes: Potholes, x: number, z: number): Pothole | null {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      for (const hole of holes.grid.get(`${cx + i},${cz + j}`) ?? []) {
        if ((hole.x - x) ** 2 + (hole.z - z) ** 2 < hole.r * hole.r) return hole;
      }
    }
  }
  return null;
}

/** The holes, as flat dark patches on the road: a rim of broken tarmac, the hole, and water in the deep ones. */
export function buildPotholes(holes: Potholes): MeshData {
  const b = new MeshBuilder();
  const rim = hexToLinear("#5d5953"), hole = hexToLinear("#2a2724"), water = hexToLinear("#5b6b63");
  const up: [number, number, number] = [0, 1, 0];
  const random = seeded("pothole-shapes");
  for (const h of holes.list) {
    const sides = 9;
    const radii = Array.from({ length: sides }, () => 0.75 + random() * 0.4);
    const ring = (scale: number, y: number, colour: ReturnType<typeof hexToLinear>) => {
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2, c = ((i + 1) / sides) * Math.PI * 2;
        const ra = h.r * scale * radii[i], rc = h.r * scale * radii[(i + 1) % sides];
        b.face([[h.x, y, h.z], [h.x + Math.cos(a) * ra, y, h.z + Math.sin(a) * ra], [h.x + Math.cos(c) * rc, y, h.z + Math.sin(c) * rc]], colour, up);
      }
    };
    ring(1.25, 0.112, rim);
    ring(1.0, 0.116, hole);
    if (h.deep) ring(0.6, 0.12, water);
  }
  return b.build();
}
