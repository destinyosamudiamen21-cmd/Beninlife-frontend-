// Keeps a walking player out of walls, pillars and tree trunks.
// The player is a circle on the ground. Each frame the game says "I am here and
// I want to step there" and gets back where the step really ends. Pushing
// straight out of a wall is also what makes a player slide along it.

import {
  BRIDGE_PILLAR,
  TREE_TRUNK,
  footprint,
  gatePillars,
  rectangleRing,
  type Bounds,
  type DistrictData,
} from "./districtData";
import { propSolids } from "./streetProps";

export const PLAYER_RADIUS = 0.35;

const CELL = 12;          // metres per grid square
export const EDGE_MARGIN = 1; // players stop this far inside the district edge
const PASSES = 4;         // enough for a corner between two buildings
const TOLERANCE = 0.01;   // overlap smaller than this counts as touching

type Wall = { kind: "wall"; ring: number[]; minX: number; maxX: number; minZ: number; maxZ: number };
type Post = { kind: "post"; x: number; z: number; radius: number };
type Solid = Wall | Post;

export type Point = { x: number; z: number };

export type Collider = {
  /**
   * A step from (fromX, fromZ) towards (toX, toZ). Writes where the step ends into `out`
   * and returns true if something got in the way. `radius` is how wide what is moving is
   * (a person by default; a car is wider). Only the street's own collider reads it.
   */
  resolve(fromX: number, fromZ: number, toX: number, toZ: number, out: Point, radius?: number): boolean;
  /** How many solid things it knows about. Useful when checking a new map. */
  size: number;
};

function insideRing(x: number, z: number, ring: number[]): boolean {
  let inside = false;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    const az = ring[i + 1], bz = ring[j + 1];
    if (az > z !== bz > z && x < ((ring[j] - ring[i]) * (z - az)) / (bz - az) + ring[i]) inside = !inside;
  }
  return inside;
}

export function buildCollider(district: DistrictData): Collider {
  const bounds: Bounds = district.bounds;
  const solids: Solid[] = [];
  const grid = new Map<number, number[]>();
  const pushed: Point = { x: 0, z: 0 };

  const cellKey = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

  const register = (index: number, minX: number, maxX: number, minZ: number, maxZ: number) => {
    // Registered a player's width wider, so looking in the player's own square is enough.
    const reach = PLAYER_RADIUS + 0.05;
    for (let cx = Math.floor((minX - reach) / CELL); cx <= Math.floor((maxX + reach) / CELL); cx++) {
      for (let cz = Math.floor((minZ - reach) / CELL); cz <= Math.floor((maxZ + reach) / CELL); cz++) {
        const key = cellKey(cx, cz);
        const cell = grid.get(key);
        if (cell) cell.push(index);
        else grid.set(key, [index]);
      }
    }
  };

  const reachable = (minX: number, maxX: number, minZ: number, maxZ: number) =>
    maxX > bounds.minX - 5 && minX < bounds.maxX + 5 && maxZ > bounds.minZ - 5 && minZ < bounds.maxZ + 5;

  const addWall = (ring: number[]) => {
    if (ring.length < 6) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i]);
      minZ = Math.min(minZ, ring[i + 1]); maxZ = Math.max(maxZ, ring[i + 1]);
    }
    if (!reachable(minX, maxX, minZ, maxZ)) return; // scenery nobody can walk to
    solids.push({ kind: "wall", ring, minX, maxX, minZ, maxZ });
    register(solids.length - 1, minX, maxX, minZ, maxZ);
  };

  const addPost = (x: number, z: number, radius: number) => {
    if (!reachable(x - radius, x + radius, z - radius, z + radius)) return;
    solids.push({ kind: "post", x, z, radius });
    register(solids.length - 1, x - radius, x + radius, z - radius, z + radius);
  };

  for (const building of district.buildings) addWall(footprint(building));
  for (const gate of district.gates) {
    for (const pillar of gatePillars(gate)) {
      addWall(rectangleRing([pillar.x, pillar.z, pillar.halfX, pillar.halfZ, 0]));
    }
  }
  for (let i = 0; i + 2 < district.pillars.length; i += 3) {
    addWall(rectangleRing([district.pillars[i], district.pillars[i + 1], BRIDGE_PILLAR, BRIDGE_PILLAR, 0]));
  }
  for (let i = 0; i + 3 < district.trees.length; i += 4) {
    addPost(district.trees[i], district.trees[i + 1], TREE_TRUNK);
  }
  // Market stalls, parked vehicles and electricity poles.
  for (const solid of propSolids(district)) addWall(rectangleRing(solid));

  /** If standing at (x, z) overlaps this wall, put the nearest free spot in `pushed`. */
  const pushFromWall = (wall: Wall, x: number, z: number, fromX: number, fromZ: number, r: number): boolean => {
    if (x < wall.minX - r || x > wall.maxX + r || z < wall.minZ - r || z > wall.maxZ + r) return false;

    // Nearest spot on the outline, and the wall it is on.
    const ring = wall.ring;
    let best = Infinity, nearX = 0, nearZ = 0, wallX = 0, wallZ = 0;
    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length;
      const ax = ring[i], az = ring[i + 1];
      const dx = ring[j] - ax, dz = ring[j + 1] - az;
      const lengthSq = dx * dx + dz * dz;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq));
      const px = ax + dx * t, pz = az + dz * t;
      const distance = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (distance < best) {
        best = distance; nearX = px; nearZ = pz; wallX = dx; wallZ = dz;
      }
    }

    const distance = Math.sqrt(best);
    const inside = insideRing(x, z, ring);
    if (!inside && distance >= r) return false;

    // A player who is somehow already inside (an old saved position, a correction from
    // the server) is never trapped: this building lets them walk until they are out.
    if (insideRing(fromX, fromZ, ring)) return false;

    // Which way is out: away from the wall when outside, through the wall when inside.
    let outX: number, outZ: number;
    if (distance > 1e-6) {
      const sign = inside ? -1 : 1;
      outX = (sign * (x - nearX)) / distance;
      outZ = (sign * (z - nearZ)) / distance;
    } else {
      // Standing exactly on the wall line. Outlines all run the same way round, so "out" is known.
      const length = Math.hypot(wallX, wallZ) || 1;
      outX = wallZ / length;
      outZ = -wallX / length;
    }
    pushed.x = nearX + outX * r;
    pushed.z = nearZ + outZ * r;
    return true;
  };

  const pushFromPost = (post: Post, x: number, z: number, fromX: number, fromZ: number, r: number): boolean => {
    const reach = post.radius + r;
    const dx = x - post.x, dz = z - post.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= reach) return false;
    if (Math.hypot(fromX - post.x, fromZ - post.z) < post.radius) return false; // started inside the trunk
    if (distance < 1e-6) {
      pushed.x = post.x + reach;
      pushed.z = post.z;
      return true;
    }
    pushed.x = post.x + (dx / distance) * reach;
    pushed.z = post.z + (dz / distance) * reach;
    return true;
  };

  const push = (solid: Solid, x: number, z: number, fromX: number, fromZ: number, r: number): boolean =>
    solid.kind === "wall" ? pushFromWall(solid, x, z, fromX, fromZ, r) : pushFromPost(solid, x, z, fromX, fromZ, r);

  // The solids near a spot. Everything is filed a person's width wider than it is, so for
  // a person their own square is enough; something wider looks in the squares round it too.
  const found: number[] = [];
  const seen = new Set<number>();
  const near = (x: number, z: number, r: number): number[] | undefined => {
    if (r <= PLAYER_RADIUS + 0.01) return grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    found.length = 0;
    seen.clear();
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const cell = grid.get(cellKey(cx, cz));
        if (!cell) continue;
        for (const index of cell) {
          if (!seen.has(index)) { seen.add(index); found.push(index); }
        }
      }
    }
    return found.length ? found : undefined;
  };

  const resolve = (fromX: number, fromZ: number, toX: number, toZ: number, out: Point, radius = PLAYER_RADIUS): boolean => {
    // The edge of the district comes first, so nothing below can push a player past it.
    const startX = Math.max(bounds.minX + EDGE_MARGIN, Math.min(bounds.maxX - EDGE_MARGIN, toX));
    const startZ = Math.max(bounds.minZ + EDGE_MARGIN, Math.min(bounds.maxZ - EDGE_MARGIN, toZ));
    let moved = startX !== toX || startZ !== toZ;
    out.x = startX;
    out.z = startZ;

    for (let pass = 0; pass < PASSES; pass++) {
      const cell = near(out.x, out.z, radius);
      if (!cell) break;
      let touched = false;
      for (const index of cell) {
        if (push(solids[index], out.x, out.z, fromX, fromZ, radius)) {
          out.x = pushed.x;
          out.z = pushed.z;
          touched = true;
        }
      }
      if (!touched) break;
      moved = true;
    }
    if (!moved) return false;

    // Pushed out of one thing and into another (a gap too narrow to fit through), or
    // pushed over the edge: the step does not happen at all.
    let stuck =
      out.x < bounds.minX + EDGE_MARGIN - TOLERANCE || out.x > bounds.maxX - EDGE_MARGIN + TOLERANCE ||
      out.z < bounds.minZ + EDGE_MARGIN - TOLERANCE || out.z > bounds.maxZ - EDGE_MARGIN + TOLERANCE;
    const cell = stuck ? undefined : near(out.x, out.z, radius);
    if (cell) {
      for (const index of cell) {
        if (push(solids[index], out.x, out.z, fromX, fromZ, radius) &&
            Math.hypot(pushed.x - out.x, pushed.z - out.z) > TOLERANCE) {
          stuck = true;
          break;
        }
      }
    }
    if (stuck) {
      out.x = Math.max(bounds.minX + EDGE_MARGIN, Math.min(bounds.maxX - EDGE_MARGIN, fromX));
      out.z = Math.max(bounds.minZ + EDGE_MARGIN, Math.min(bounds.maxZ - EDGE_MARGIN, fromZ));
    }
    return true;
  };

  return { resolve, size: solids.length };
}
