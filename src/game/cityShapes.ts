// Turns the city map into triangles: the big roads, the river, the town between the
// districts, and a small model of each district made from its own map file. Plain
// numbers in, plain arrays out; nothing here touches the 3D library.

import {
  DISTRICT_AT,
  MAP_EDGE,
  RIVER,
  TRUNKS,
  districtPatch,
} from "./cityLayout";
import { footprint, type Bounds, type DistrictData } from "./districtData";
import { MeshBuilder, triangulate, type MeshData } from "./districtGeometry";
import { hexToLinear, type RGB } from "./tint";

type Vec3 = [number, number, number];
const UP: Vec3 = [0, 1, 0];

// ---- colours: Benin from above is red earth, rusted zinc roofs and green --------------
export const EARTH = "#b9673f"; // the laterite everything stands on
const COLOURS = {
  pad: hexToLinear("#cf8a5c"), // the ground of a district that can be visited
  frame: hexToLinear("#e2b657"), // the brass line round it
  trunk: hexToLinear("#f0dcb4"), // big roads between districts
  trunkEdge: hexToLinear("#8a4a2c"),
  street: hexToLinear("#ecd9b6"), // streets inside a district
  lane: hexToLinear("#d9b98a"), // paths and dirt roads
  river: hexToLinear("#3f8f8a"),
  riverBank: hexToLinear("#4f8a45"),
  green: hexToLinear("#4f8a45"),
  bush: hexToLinear("#a2854a"), // green seen through red dust
  bushDark: hexToLinear("#93864a"),
  wall: hexToLinear("#e9d2ad"),
  farWall: hexToLinear("#b98a68"), // the town that is not open yet: the same shapes, washed out
};
// Zinc roofs: new ones are red or blue, old ones rust.
const ROOFS = [
  "#8f3f2e",
  "#a24a33",
  "#7a3526",
  "#9b5a3a",
  "#6d4a3a",
  "#b0583a",
  "#3f587a",
  "#7d6a55",
].map(hexToLinear);
const FAR_ROOFS = ["#9c5a3e", "#a8643f", "#8f5238", "#a06a4a"].map(hexToLinear);

const Y = {
  bush: 0.1,
  pad: 0.2,
  river: 0.3,
  trunkEdge: 0.5,
  trunk: 0.7,
  lane: 0.9,
  street: 1.1,
  frame: 1.3,
};

/** A repeatable number from 0 to 1, so the map is the same every time it is drawn. */
function hash(n: number): number {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function shade(color: RGB, amount: number): RGB {
  return { r: color.r * amount, g: color.g * amount, b: color.b * amount };
}

/** A flat strip along a line, with a round patch at every corner so bends have no notches. */
function ribbon(
  builder: MeshBuilder,
  points: number[],
  width: number,
  y: number,
  color: RGB
): void {
  const half = width / 2;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const ax = points[i],
      az = points[i + 1],
      bx = points[i + 2],
      bz = points[i + 3];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.01) continue;
    const nx = (-(bz - az) / length) * half,
      nz = ((bx - ax) / length) * half;
    builder.face(
      [
        [ax + nx, y, az + nz],
        [ax - nx, y, az - nz],
        [bx - nx, y, bz - nz],
        [bx + nx, y, bz + nz],
      ],
      color,
      UP
    );
  }
  for (let i = 0; i + 1 < points.length; i += 2) {
    const corners: Vec3[] = [];
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 2;
      corners.push([
        points[i] + Math.cos(angle) * half,
        y,
        points[i + 1] + Math.sin(angle) * half,
      ]);
    }
    builder.face(corners, color, UP);
  }
}

function inside(patch: Bounds, x: number, z: number, margin = 0): boolean {
  return (
    x > patch.minX - margin &&
    x < patch.maxX + margin &&
    z > patch.minZ - margin &&
    z < patch.maxZ + margin
  );
}

/** The parts of a line that lie outside every patch, cut into pieces. */
function outsidePatches(
  points: number[],
  patches: Bounds[],
  step = 12
): number[][] {
  const pieces: number[][] = [];
  let piece: number[] = [];
  const add = (x: number, z: number) => {
    if (patches.some((patch) => inside(patch, x, z))) {
      if (piece.length >= 4) pieces.push(piece);
      piece = [];
    } else {
      piece.push(x, z);
    }
  };
  for (let i = 0; i + 3 < points.length; i += 2) {
    const ax = points[i],
      az = points[i + 1],
      bx = points[i + 2],
      bz = points[i + 3];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = i === 0 ? 0 : 1; k <= steps; k++)
      add(ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps);
  }
  if (piece.length >= 4) pieces.push(piece);
  return pieces;
}

function distanceToLine(points: number[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const ax = points[i],
      az = points[i + 1],
      dx = points[i + 2] - ax,
      dz = points[i + 3] - az;
    const along = Math.min(
      1,
      Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))
    );
    best = Math.min(best, Math.hypot(x - ax - dx * along, z - az - dz * along));
  }
  return best;
}

/** A plain block with a roof a different colour from its walls. */
function block(
  builder: MeshBuilder,
  ring: number[],
  height: number,
  wall: RGB,
  roof: RGB
): void {
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    const ax = ring[i],
      az = ring[i + 1],
      bx = ring[j],
      bz = ring[j + 1];
    builder.face(
      [
        [ax, 0, az],
        [bx, 0, bz],
        [bx, height, bz],
        [ax, height, az],
      ],
      wall,
      [bz - az, 0, -(bx - ax)]
    );
  }
  const triangles = triangulate(ring);
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * 2,
      b = triangles[i + 1] * 2,
      c = triangles[i + 2] * 2;
    builder.face(
      [
        [ring[a], height, ring[a + 1]],
        [ring[b], height, ring[b + 1]],
        [ring[c], height, ring[c + 1]],
      ],
      roof,
      UP
    );
  }
}

/**
 * Everything on the map that is not a district: the big roads, the river, and rows of
 * houses along the roads so the city does not look empty between the parts that are open.
 * `patches` are the districts' own patches of the map, which are left clear.
 */
export function buildCityGround(patches: Bounds[]): MeshData {
  const builder = new MeshBuilder();

  // Bush, farms and compounds full of trees: Benin is green wherever it is not built on.
  // Flat patches under everything else, so houses and roads sit on top of them.
  for (let n = 0; n < 240; n++) {
    const x =
      MAP_EDGE.minX -
      500 +
      hash(n * 3.1 + 1) * (MAP_EDGE.maxX - MAP_EDGE.minX + 1000);
    const z =
      MAP_EDGE.minZ -
      500 +
      hash(n * 3.1 + 2) * (MAP_EDGE.maxZ - MAP_EDGE.minZ + 1000);
    if (patches.some((patch) => inside(patch, x, z, 70))) continue;
    const radius = 35 + hash(n * 3.1 + 3) * 85;
    const corners: Vec3[] = [];
    for (let k = 0; k < 9; k++) {
      const angle = (k / 9) * Math.PI * 2;
      const reach = radius * (0.7 + hash(n * 17 + k) * 0.5);
      corners.push([
        x + Math.cos(angle) * reach,
        Y.bush,
        z + Math.sin(angle) * reach * 0.8,
      ]);
    }
    builder.face(
      corners,
      hash(n * 3.1 + 4) < 0.5 ? COLOURS.bush : COLOURS.bushDark,
      UP
    );
  }

  ribbon(builder, RIVER.p, RIVER.width + 36, Y.pad, COLOURS.riverBank);
  ribbon(builder, RIVER.p, RIVER.width, Y.river, COLOURS.river);

  for (const trunk of TRUNKS) {
    for (const piece of outsidePatches(trunk.p, patches)) {
      ribbon(builder, piece, trunk.width + 8, Y.trunkEdge, COLOURS.trunkEdge);
      ribbon(builder, piece, trunk.width, Y.trunk, COLOURS.trunk);
    }
  }

  // Houses in rows along each big road, thinning out away from it.
  let seed = 1;
  for (const trunk of TRUNKS) {
    for (let i = 0; i + 3 < trunk.p.length; i += 2) {
      const ax = trunk.p[i],
        az = trunk.p[i + 1],
        bx = trunk.p[i + 2],
        bz = trunk.p[i + 3];
      const length = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / length,
        uz = (bz - az) / length;
      const angle = Math.atan2(uz, ux);
      for (let along = 30; along < length - 20; along += 44) {
        for (const side of [-1, 1]) {
          for (let row = 0; row < 4; row++) {
            seed += 1;
            if (hash(seed) < 0.16 + row * 0.17) continue;
            const out = trunk.width / 2 + 24 + row * 40 + hash(seed + 0.3) * 8;
            const x =
              ax + ux * (along + hash(seed + 0.6) * 12) - uz * out * side;
            const z =
              az + uz * (along + hash(seed + 0.6) * 12) + ux * out * side;
            if (patches.some((patch) => inside(patch, x, z, 26))) continue;
            if (distanceToLine(RIVER.p, x, z) < RIVER.width / 2 + 40) continue;
            if (
              TRUNKS.some(
                (other) =>
                  other !== trunk &&
                  distanceToLine(other.p, x, z) < other.width / 2 + 24
              )
            )
              continue;
            const halfLong = 9 + hash(seed + 1.1) * 9,
              halfShort = 7 + hash(seed + 1.7) * 6;
            const turn = angle + (hash(seed + 2.3) - 0.5) * 0.25;
            const cos = Math.cos(turn),
              sin = Math.sin(turn);
            const ring = [
              x - halfLong * cos + halfShort * sin,
              z - halfLong * sin - halfShort * cos,
              x + halfLong * cos + halfShort * sin,
              z + halfLong * sin - halfShort * cos,
              x + halfLong * cos - halfShort * sin,
              z + halfLong * sin + halfShort * cos,
              x - halfLong * cos - halfShort * sin,
              z - halfLong * sin + halfShort * cos,
            ];
            const roof = shade(
              FAR_ROOFS[Math.floor(hash(seed + 3.1) * FAR_ROOFS.length)],
              0.92 + hash(seed + 3.7) * 0.16
            );
            block(
              builder,
              ring,
              4 + hash(seed + 4.3) * 5,
              COLOURS.farWall,
              roof
            );
          }
        }
      }
    }
  }
  return builder.build();
}

/**
 * A small model of one district, in its place on the map: its ground with a brass line
 * round it, its streets, its sports ground, and every building as a block with a roof.
 */
export function buildDistrictModel(district: DistrictData): MeshData {
  const builder = new MeshBuilder();
  const at = DISTRICT_AT[district.id];
  const patch = districtPatch(district.id, district.bounds);
  if (!at || !patch) return builder.build();
  const { minX, maxX, minZ, maxZ } = patch;

  builder.face(
    [
      [minX, Y.pad, minZ],
      [maxX, Y.pad, minZ],
      [maxX, Y.pad, maxZ],
      [minX, Y.pad, maxZ],
    ],
    COLOURS.pad,
    UP
  );
  ribbon(
    builder,
    [minX, minZ, maxX, minZ, maxX, maxZ, minX, maxZ, minX, minZ],
    7,
    Y.frame,
    COLOURS.frame
  );

  for (const area of district.areas) {
    if (area.t !== "pitch" || area.p.length < 6) continue;
    const ring = footprint({ p: area.p, f: 1, s: 0, k: "flat" }).map(
      (value, i) => value + (i % 2 === 0 ? at.x : at.z)
    );
    const triangles = triangulate(ring);
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i] * 2,
        b = triangles[i + 1] * 2,
        c = triangles[i + 2] * 2;
      builder.face(
        [
          [ring[a], Y.lane, ring[a + 1]],
          [ring[b], Y.lane, ring[b + 1]],
          [ring[c], Y.lane, ring[c + 1]],
        ],
        COLOURS.green,
        UP
      );
    }
  }

  // Streets. A road that runs off the edge of the district is cut off at the edge.
  for (const road of district.roads) {
    if (road.y) continue; // bridges and stairs are too small to matter from up here
    const moved = road.p.map((value, i) => value + (i % 2 === 0 ? at.x : at.z));
    const pieces = clipToPatch(moved, patch);
    const big = road.s === "asphalt";
    for (const piece of pieces)
      ribbon(
        builder,
        piece,
        Math.max(road.w, big ? 7 : 3.5),
        big ? Y.street : Y.lane,
        big ? COLOURS.street : COLOURS.lane
      );
  }

  for (const building of district.buildings) {
    const ring = footprint(building).map(
      (value, i) => value + (i % 2 === 0 ? at.x : at.z)
    );
    if (ring.length < 6) continue;
    let cx = 0,
      cz = 0;
    for (let i = 0; i < ring.length; i += 2) {
      cx += ring[i];
      cz += ring[i + 1];
    }
    if (!inside(patch, cx / (ring.length / 2), cz / (ring.length / 2)))
      continue;
    const roof = shade(
      ROOFS[Math.floor(building.s / 13) % ROOFS.length],
      0.88 + hash(building.s + 9) * 0.22
    );
    block(
      builder,
      ring,
      Math.max(1, building.f) * district.floorHeight + 1.5,
      shade(COLOURS.wall, 0.9 + hash(building.s + 5) * 0.14),
      roof
    );
  }
  return builder.build();
}

/** The parts of a line that lie inside a patch. */
function clipToPatch(points: number[], patch: Bounds): number[][] {
  const pieces: number[][] = [];
  let piece: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    if (inside(patch, points[i], points[i + 1])) {
      piece.push(points[i], points[i + 1]);
    } else {
      if (piece.length >= 4) pieces.push(piece);
      piece = [];
    }
  }
  if (piece.length >= 4) pieces.push(piece);
  return pieces;
}
