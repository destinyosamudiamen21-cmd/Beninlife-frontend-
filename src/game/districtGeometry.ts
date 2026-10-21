// Turns a district file into triangles: walls, roofs, roads, bridges, trees.
// Plain numbers in, plain arrays out. Nothing here touches the 3D library,
// which is what lets this file be tested on its own.

import {
  BRIDGE_PILLAR,
  GATE,
  footprint,
  gatePillars,
  rectangleRing,
  type Building,
  type DistrictData,
  type Road,
} from "./districtData";
import { hexToLinear, type RGB } from "./tint";
import { CAMPUS, campusBuilding, campusLandmark, campusWall, onCampus, piecesOf } from "./campusShapes";

export type MeshData = {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
};

type Vec3 = [number, number, number];

// ---- colours: change these to restyle the whole city --------------------

const WALL_COLOURS = [
  "#efe6d2", "#f4efe6", "#e8d9b8", "#e3c9a3", "#f0d9c0", "#d9e3d0",
  "#d5dfe8", "#e9cdb5", "#c9b79c", "#dcdad4", "#f2e2b6", "#cfa98a",
].map(hexToLinear);

// Long-span aluminium roofing sheets, new and weathered.
const ROOF_COLOURS = [
  "#8f3f2e", "#7a3526", "#a24a33", "#6d4a3a", "#3f587a", "#35604a",
  "#8a8d90", "#9b6a47", "#59382c", "#4a6a8a",
].map(hexToLinear);

const SLAB_COLOURS = ["#b9b4a8", "#a7a297", "#c4beb0", "#9c988f"].map(hexToLinear);

const SURFACE_COLOURS: Record<string, RGB> = {
  asphalt: hexToLinear("#3c3e42"),
  worn: hexToLinear("#5e5b58"),
  dirt: hexToLinear("#a9643f"),
  paved: hexToLinear("#b9b3a6"),
};

const COLOURS = {
  yard: hexToLinear("#b0714b"),
  kerb: hexToLinear("#a9a59b"),
  marking: hexToLinear("#e9e6da"),
  track: hexToLinear("#a9553a"),
  pitch: hexToLinear("#5f9a45"),
  concrete: hexToLinear("#bdb8ab"),
  rail: hexToLinear("#8e9aa3"),
  gate: hexToLinear("#efe7d3"),
  gateTrim: hexToLinear("#7b2d2d"),
  trunk: hexToLinear("#6b4a33"),
  palmTrunk: hexToLinear("#8a7a66"),
  leaf: hexToLinear("#3f7d3a"),
  leafDark: hexToLinear("#2f6331"),
  frond: hexToLinear("#4f8f3c"),
};

// ---- sizes ---------------------------------------------------------------

const BAY_WIDTH = 3.2;       // one window every this many metres of wall
const EAVE = 0.45;           // how far a pitched roof overhangs the wall
const YARD = 2.4;            // bare earth around a building
const DASH = 3;              // painted lane dash
const DASH_GAP = 6;
const DECK_THICKNESS = 0.35;
const RAIL_HEIGHT = 1.05;

/** Ground layers, lowest first. Each is drawn as its own mesh so they never flicker. */
export const LAYER_COUNT = 5;
const LAYER_YARD = 0;
const LAYER_DIRT = 1;
const LAYER_PAVED = 2;
const LAYER_ASPHALT = 3;
const LAYER_PAINT = 4;
const LAYER_STEP = 0.02; // metres between layers

const UP: Vec3 = [0, 1, 0];
const DOWN: Vec3 = [0, -1, 0];

// ---- mesh builder --------------------------------------------------------

export class MeshBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];
  private indices: number[] = [];

  /**
   * A flat face with 3 or 4 corners. `facing` says roughly which way it should
   * be visible from; the corner order is fixed up to match, so callers never
   * have to think about winding.
   */
  face(corners: Vec3[], color: RGB, facing: Vec3, uv?: number[]): void {
    const [a, b, c] = corners;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-9) return; // a face with no area
    nx /= length; ny /= length; nz /= length;

    const flip = nx * facing[0] + ny * facing[1] + nz * facing[2] < 0;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }

    const first = this.positions.length / 3;
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i];
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.colors.push(color.r, color.g, color.b);
      this.uvs.push(uv ? uv[i * 2] : 0, uv ? uv[i * 2 + 1] : 0);
    }
    for (let i = 1; i < corners.length - 1; i++) {
      if (flip) this.indices.push(first, first + i + 1, first + i);
      else this.indices.push(first, first + i, first + i + 1);
    }
  }

  /** The same face visible from both sides, for thin things like rails and palm fronds. */
  sheet(corners: Vec3[], color: RGB, facing: Vec3): void {
    this.face(corners, color, facing);
    this.face(corners, color, [-facing[0], -facing[1], -facing[2]]);
  }

  /** An upright box standing on the ground, turned by `angle`. No bottom face. */
  box(cx: number, cz: number, halfX: number, halfZ: number, y0: number, y1: number, color: RGB, angle = 0): void {
    const ring = rectangleRing([cx, cz, halfX, halfZ, angle]);
    wallsAround(this, ring, y0, y1, color);
    const top: Vec3[] = [];
    for (let i = 0; i < ring.length; i += 2) top.push([ring[i], y1, ring[i + 1]]);
    this.face(top, color, UP);
  }

  build(): MeshData {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      uvs: new Float32Array(this.uvs),
      indices: new Uint32Array(this.indices),
    };
  }
}

function shade(color: RGB, amount: number): RGB {
  return { r: color.r * amount, g: color.g * amount, b: color.b * amount };
}

/** A repeatable random number from 0 to 1 for a whole number. */
function hash(n: number): number {
  let h = (n | 0) * 374761393 + 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---- outlines ------------------------------------------------------------

/**
 * Cut an outline into triangles ("ear clipping"). Takes x, z, x, z, ... running
 * the way `footprint` returns it, and gives back corner numbers, three per triangle.
 */
export function triangulate(ring: number[]): number[] {
  const count = ring.length / 2;
  const left: number[] = [];
  for (let i = 0; i < count; i++) left.push(i);
  const triangles: number[] = [];

  const cross = (a: number, b: number, c: number) =>
    (ring[b * 2] - ring[a * 2]) * (ring[c * 2 + 1] - ring[a * 2 + 1]) -
    (ring[b * 2 + 1] - ring[a * 2 + 1]) * (ring[c * 2] - ring[a * 2]);

  let guard = count * count + 8;
  while (left.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < left.length; i++) {
      const a = left[(i + left.length - 1) % left.length];
      const b = left[i];
      const c = left[(i + 1) % left.length];
      if (cross(a, b, c) <= 1e-9) continue; // a dent, not an ear

      let empty = true;
      for (const p of left) {
        if (p === a || p === b || p === c) continue;
        if (cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0) {
          empty = false;
          break;
        }
      }
      if (!empty) continue;

      triangles.push(a, b, c);
      left.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) left.splice(0, 1); // a broken outline: drop a corner and carry on
  }
  if (left.length === 3) triangles.push(left[0], left[1], left[2]);
  return triangles;
}

function flatPolygon(builder: MeshBuilder, ring: number[], y: number, color: RGB, facing: Vec3 = UP): void {
  const triangles = triangulate(ring);
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * 2, b = triangles[i + 1] * 2, c = triangles[i + 2] * 2;
    builder.face(
      [[ring[a], y, ring[a + 1]], [ring[b], y, ring[b + 1]], [ring[c], y, ring[c + 1]]],
      color,
      facing,
    );
  }
}

/** Upright walls around an outline, with window rows mapped on when `floors` is given. */
function wallsAround(
  builder: MeshBuilder,
  ring: number[],
  y0: number,
  y1: number,
  color: RGB,
  floors = 0,
): void {
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    const ax = ring[i], az = ring[i + 1], bx = ring[j], bz = ring[j + 1];
    const dx = bx - ax, dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    // Whole windows only. A wall too short for one gets a plain strip of the texture.
    const bays = floors > 0 && length >= BAY_WIDTH * 0.6 ? Math.max(1, Math.round(length / BAY_WIDTH)) : 0;
    builder.face(
      [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]],
      color,
      [dz, 0, -dx],
      [0, 0, bays, 0, bays, floors, 0, floors],
    );
  }
}

// ---- buildings -----------------------------------------------------------

function buildingColours(building: Building): { wall: RGB; roof: RGB } {
  const tone = 0.9 + hash(building.s + 5) * 0.16;
  const wall = shade(WALL_COLOURS[building.s % WALL_COLOURS.length], tone);
  const roofSet = building.k === "flat" ? SLAB_COLOURS : ROOF_COLOURS;
  const roof = shade(roofSet[Math.floor(building.s / 13) % roofSet.length], 0.88 + hash(building.s + 9) * 0.2);
  return { wall, roof };
}

function pitchedRoof(builder: MeshBuilder, building: Building, top: number, wall: RGB, roof: RGB): void {
  const [cx, cz, halfLong, halfShort, angle] = building.r as number[];
  const ux = Math.cos(angle), uz = Math.sin(angle);
  const long = halfLong + EAVE;
  const short = halfShort + EAVE;
  const rise = Math.min(3.2, Math.max(0.8, short * 0.5));
  const at = (along: number, across: number, y: number): Vec3 => [
    cx + along * ux - across * uz,
    y,
    cz + along * uz + across * ux,
  ];
  const outward = (along: number, across: number): Vec3 => [along * ux - across * uz, 0.6, along * uz + across * ux];

  // The underside, so the overhang is not see-through from the street.
  builder.face([at(-long, -short, top), at(long, -short, top), at(long, short, top), at(-long, short, top)], shade(wall, 0.7), DOWN);

  if (building.k === "gable") {
    const a = at(-long, 0, top + rise), b = at(long, 0, top + rise);
    builder.face([at(-long, short, top), at(long, short, top), b, a], roof, outward(0, 1));
    builder.face([at(long, -short, top), at(-long, -short, top), a, b], shade(roof, 0.94), outward(0, -1));
    // The two triangular end walls under the ridge.
    for (const end of [-1, 1]) {
      builder.face(
        [at(end * halfLong, -short, top), at(end * halfLong, short, top), at(end * halfLong, 0, top + rise)],
        wall,
        outward(end, 0),
      );
    }
    return;
  }

  // Hip roof: four slopes meeting on a short ridge (or at a point, on a square building).
  const ridge = Math.max(0, long - short);
  const a = at(-ridge, 0, top + rise), b = at(ridge, 0, top + rise);
  if (ridge > 0.05) {
    builder.face([at(-long, short, top), at(long, short, top), b, a], roof, outward(0, 1));
    builder.face([at(long, -short, top), at(-long, -short, top), a, b], shade(roof, 0.94), outward(0, -1));
  } else {
    builder.face([at(-long, short, top), at(long, short, top), a], roof, outward(0, 1));
    builder.face([at(long, -short, top), at(-long, -short, top), a], shade(roof, 0.94), outward(0, -1));
  }
  builder.face([at(long, short, top), at(long, -short, top), b], shade(roof, 0.88), outward(1, 0));
  builder.face([at(-long, -short, top), at(-long, short, top), a], shade(roof, 0.88), outward(-1, 0));
}

function addBuilding(walls: MeshBuilder, roofs: MeshBuilder, yards: MeshBuilder, parts: MeshBuilder, building: Building, floorHeight: number, campus = false): void {
  const ring = footprint(building);
  if (ring.length < 6) return;
  const colours = buildingColours(building);
  const wall = campus ? campusWall(building) : colours.wall;
  const roof = campus ? CAMPUS.roof : colours.roof;
  const top = building.f * floorHeight;

  wallsAround(walls, ring, 0, top, wall, building.f);
  if (campus && building.r && (building.f >= 2 || building.k === "flat")) campusBuilding(roofs, parts, building, floorHeight);
  else if (building.r && building.k !== "flat") pitchedRoof(roofs, building, top, wall, roof);
  else flatPolygon(roofs, ring, top, roof);

  // Bare earth around most buildings: compounds here are swept ground, not lawn.
  if (building.r && building.s % 10 < 8) {
    const yard = rectangleRing(building.r, YARD);
    flatPolygon(yards, yard, LAYER_YARD * LAYER_STEP + 0.02, COLOURS.yard);
  }
}

// ---- roads ---------------------------------------------------------------

function disc(builder: MeshBuilder, x: number, y: number, z: number, radius: number, color: RGB): void {
  const sides = 10;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const b = ((i + 1) / sides) * Math.PI * 2;
    builder.face(
      [[x, y, z], [x + Math.cos(a) * radius, y, z + Math.sin(a) * radius], [x + Math.cos(b) * radius, y, z + Math.sin(b) * radius]],
      color,
      UP,
    );
  }
}

/** Left and right edge of a road at every point of its centre line. */
function ribbonEdges(points: number[], half: number): { left: number[]; right: number[] } {
  const count = points.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = points[i * 2], z = points[i * 2 + 1];
    let inX = 0, inZ = 0, outX = 0, outZ = 0;
    if (i > 0) {
      inX = x - points[i * 2 - 2]; inZ = z - points[i * 2 - 1];
      const length = Math.hypot(inX, inZ) || 1;
      inX /= length; inZ /= length;
    }
    if (i < count - 1) {
      outX = points[i * 2 + 2] - x; outZ = points[i * 2 + 3] - z;
      const length = Math.hypot(outX, outZ) || 1;
      outX /= length; outZ /= length;
    }
    if (i === 0) { inX = outX; inZ = outZ; }
    if (i === count - 1) { outX = inX; outZ = inZ; }

    // Sideways direction at a bend is the average of the two sides, stretched so
    // the road keeps its width through the corner (but never into a long spike).
    let nx = -(inZ + outZ), nz = inX + outX;
    const length = Math.hypot(nx, nz);
    if (length < 1e-6) { nx = -inZ; nz = inX; } else { nx /= length; nz /= length; }
    const cos = nx * -inZ + nz * inX;
    const reach = half / Math.max(cos, 0.5);

    left.push(x + nx * reach, z + nz * reach);
    right.push(x - nx * reach, z - nz * reach);
  }
  return { left, right };
}

function flatRibbon(builder: MeshBuilder, points: number[], width: number, y: number, color: RGB): void {
  const count = points.length / 2;
  if (count < 2) return;
  const half = width / 2;
  const { left, right } = ribbonEdges(points, half);

  for (let i = 0; i < count - 1; i++) {
    const a = i * 2, b = a + 2;
    // Two separate triangles: on a tight bend the edges can cross, and each half must still face up.
    builder.face([[left[a], y, left[a + 1]], [right[a], y, right[a + 1]], [right[b], y, right[b + 1]]], color, UP);
    builder.face([[left[a], y, left[a + 1]], [right[b], y, right[b + 1]], [left[b], y, left[b + 1]]], color, UP);
  }

  // Round off the ends and the sharp bends, so junctions and corners have no notches.
  for (let i = 0; i < count; i++) {
    let sharp = i === 0 || i === count - 1;
    if (!sharp) {
      const ax = points[i * 2] - points[i * 2 - 2], az = points[i * 2 + 1] - points[i * 2 - 1];
      const bx = points[i * 2 + 2] - points[i * 2], bz = points[i * 2 + 3] - points[i * 2 + 1];
      const dot = (ax * bx + az * bz) / ((Math.hypot(ax, az) || 1) * (Math.hypot(bx, bz) || 1));
      sharp = dot < 0.82; // a turn of more than about 35 degrees
    }
    if (sharp) disc(builder, points[i * 2], y, points[i * 2 + 1], half, color);
  }
}

/** Dashes down the middle of a road. */
function laneDashes(builder: MeshBuilder, points: number[], y: number): void {
  let offset = DASH_GAP / 2;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const ax = points[i], az = points[i + 1];
    const dx = points[i + 2] - ax, dz = points[i + 3] - az;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    const ux = dx / length, uz = dz / length;
    const sx = -uz * 0.08, sz = ux * 0.08;

    let at = offset;
    while (at + DASH <= length) {
      const x0 = ax + ux * at, z0 = az + uz * at;
      const x1 = x0 + ux * DASH, z1 = z0 + uz * DASH;
      builder.face(
        [[x0 + sx, y, z0 + sz], [x0 - sx, y, z0 - sz], [x1 - sx, y, z1 - sz], [x1 + sx, y, z1 + sz]],
        COLOURS.marking,
        UP,
      );
      at += DASH + DASH_GAP;
    }
    offset = Math.max(0, at - length);
  }
}

/** A bridge deck or a ramp of stairs: a ribbon in the air with a rail on each side. */
function raisedRibbon(builder: MeshBuilder, road: Road): void {
  const heights = road.y as number[];
  const count = road.p.length / 2;
  const { left, right } = ribbonEdges(road.p, road.w / 2);
  const deck = COLOURS.concrete;

  for (let i = 0; i < count - 1; i++) {
    const a = i * 2, b = a + 2;
    const ya = heights[i], yb = heights[i + 1];
    const la: Vec3 = [left[a], ya, left[a + 1]], ra: Vec3 = [right[a], ya, right[a + 1]];
    const lb: Vec3 = [left[b], yb, left[b + 1]], rb: Vec3 = [right[b], yb, right[b + 1]];
    // A ramp that turns is slightly twisted, so each quad is laid as two flat triangles.
    builder.face([la, ra, rb], deck, UP);
    builder.face([la, rb, lb], deck, UP);

    const under = (p: Vec3): Vec3 => [p[0], Math.max(0, p[1] - DECK_THICKNESS), p[2]];
    builder.face([under(la), under(ra), under(rb)], shade(deck, 0.6), DOWN);
    builder.face([under(la), under(rb), under(lb)], shade(deck, 0.6), DOWN);

    for (const [p, q] of [[la, lb], [ra, rb]] as [Vec3, Vec3][]) {
      const side: Vec3 = [q[2] - p[2], 0, -(q[0] - p[0])];
      const railP: Vec3 = [p[0], p[1] + RAIL_HEIGHT, p[2]];
      const railQ: Vec3 = [q[0], q[1] + RAIL_HEIGHT, q[2]];
      // The edge of the slab and the rail above it, as one upright strip seen from both sides.
      builder.sheet([under(q), railQ, railP], COLOURS.rail, side);
      builder.sheet([under(q), railP, under(p)], COLOURS.rail, side);
    }
  }
}

// ---- everything in a district ---------------------------------------------

export type DistrictMeshes = {
  /** Building walls. This mesh uses the window texture. */
  walls: MeshData;
  roofs: MeshData;
  /** Flat things lying on the ground, lowest layer first. */
  layers: MeshData[];
  /** Bridges, stairs, pillars and gates. */
  structures: MeshData;
};

export function buildDistrictMeshes(district: DistrictData): DistrictMeshes {
  const walls = new MeshBuilder();
  const roofs = new MeshBuilder();
  const structures = new MeshBuilder();
  const layers: MeshBuilder[] = [];
  for (let i = 0; i < LAYER_COUNT; i++) layers.push(new MeshBuilder());
  const layerY = (layer: number) => layer * LAYER_STEP + 0.02;

  // The boulevard's pillars bend more the further they are from the gate.
  const pillars = district.buildings.filter((building) => building.t === "pillar").sort((a, b) => (b.r?.[1] ?? 0) - (a.r?.[1] ?? 0));
  for (const building of district.buildings) {
    if (campusLandmark(structures, building, pillars.indexOf(building))) continue;
    const middle = building.r ?? building.p ?? [0, 0];
    addBuilding(walls, roofs, layers[LAYER_YARD], structures, building, district.floorHeight, onCampus(district.id, middle[0], middle[1], building));
  }

  for (const road of district.roads) {
    if (road.y) {
      raisedRibbon(structures, road);
      continue;
    }
    const layer = road.s === "asphalt" ? LAYER_ASPHALT : road.s === "dirt" ? LAYER_DIRT : LAYER_PAVED;
    flatRibbon(layers[layer], road.p, road.w, layerY(layer), SURFACE_COLOURS[road.s] ?? SURFACE_COLOURS.worn);
    const half = Math.floor(road.p.length / 4) * 2;
    if (road.m && onCampus(district.id, road.p[half], road.p[half + 1])) {
      // UNIBEN paints its kerbs black and white.
      piecesOf(road.p, 1.2).forEach((piece, i) => flatRibbon(layers[LAYER_PAVED], piece, road.w + 1, layerY(LAYER_PAVED), i % 2 ? CAMPUS.black : CAMPUS.white));
      laneDashes(layers[LAYER_PAINT], road.p, layerY(LAYER_PAINT));
    } else if (road.m) {
      flatRibbon(layers[LAYER_PAVED], road.p, road.w + 1, layerY(LAYER_PAVED), COLOURS.kerb);
      laneDashes(layers[LAYER_PAINT], road.p, layerY(LAYER_PAINT));
    }
  }

  // A sports ground: a running track with a grass pitch inside it.
  for (const area of district.areas) {
    if (area.t !== "pitch" || area.p.length < 6) continue;
    const ring = footprint({ p: area.p, f: 1, s: 0, k: "flat" });
    let cx = 0, cz = 0;
    for (let i = 0; i < ring.length; i += 2) { cx += ring[i]; cz += ring[i + 1]; }
    cx /= ring.length / 2; cz /= ring.length / 2;
    const inner = ring.map((value, i) => (i % 2 === 0 ? cx + (value - cx) * 0.82 : cz + (value - cz) * 0.82));
    flatPolygon(layers[LAYER_DIRT], ring, layerY(LAYER_DIRT), COLOURS.track);
    flatPolygon(layers[LAYER_PAVED], inner, layerY(LAYER_PAVED), COLOURS.pitch);
  }

  for (let i = 0; i + 2 < district.pillars.length; i += 3) {
    const height = district.pillars[i + 2] - DECK_THICKNESS;
    structures.box(district.pillars[i], district.pillars[i + 1], BRIDGE_PILLAR, BRIDGE_PILLAR, 0, height, shade(COLOURS.concrete, 0.9));
  }

  for (const gate of district.gates) {
    // UNIBEN's gates are in the campus colours: salmon, with dark brown.
    const campus = district.id === "uniben";
    const body = campus ? CAMPUS.column : COLOURS.gate;
    const trim = campus ? CAMPUS.fascia : COLOURS.gateTrim;
    for (const pillar of gatePillars(gate)) {
      structures.box(pillar.x, pillar.z, pillar.halfX, pillar.halfZ, 0, pillar.height, body);
      // A coloured band at the foot of every pillar, and a cap on the ones that rise past the beam.
      structures.box(pillar.x, pillar.z, pillar.halfX + 0.12, pillar.halfZ + 0.12, 0, 1.1, trim);
      if (pillar.height > GATE.beamTop) {
        structures.box(pillar.x, pillar.z, pillar.halfX + 0.25, pillar.halfZ + 0.25, pillar.height, pillar.height + 0.35, trim);
      }
    }
    const reach = gate.half - GATE.pillar + 0.02; // the beam spans between the outer pillars
    structures.box(gate.x, gate.z, reach, GATE.beamDepth, GATE.beamBottom, GATE.beamTop, body);
    structures.box(gate.x, gate.z, reach, GATE.beamDepth + 0.15, GATE.beamTop, GATE.beamTop + 0.3, trim);
    // The underside of the beam, which players walk beneath.
    const under = rectangleRing([gate.x, gate.z, reach, GATE.beamDepth, 0]);
    flatPolygon(structures, under, GATE.beamBottom, shade(body, 0.6), DOWN);
  }

  return {
    walls: walls.build(),
    roofs: roofs.build(),
    layers: layers.map((layer) => layer.build()),
    structures: structures.build(),
  };
}

// ---- trees ---------------------------------------------------------------

const T = (1 + Math.sqrt(5)) / 2;
const ICO_POINTS: Vec3[] = [
  [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0], [0, -1, T], [0, 1, T],
  [0, -1, -T], [0, 1, -T], [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
];
const ICO_FACES = [
  0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
  3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
];

/** A lumpy ball of leaves made of flat faces. `detail` 1 splits every face into four. */
function leafBall(
  builder: MeshBuilder,
  centre: Vec3,
  radius: Vec3,
  detail: number,
  seed: number,
  light: RGB,
  dark: RGB,
): void {
  let triangles: Vec3[][] = [];
  for (let i = 0; i < ICO_FACES.length; i += 3) {
    triangles.push([ICO_POINTS[ICO_FACES[i]], ICO_POINTS[ICO_FACES[i + 1]], ICO_POINTS[ICO_FACES[i + 2]]]);
  }
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  for (let level = 0; level < detail; level++) {
    const next: Vec3[][] = [];
    for (const [a, b, c] of triangles) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    triangles = next;
  }

  // Every corner is pushed in or out a little. The amount depends only on where the
  // corner is, so faces that share a corner still meet.
  const place = (p: Vec3): Vec3 => {
    const length = Math.hypot(p[0], p[1], p[2]);
    const key = Math.round((p[0] / length) * 97) * 31 + Math.round((p[1] / length) * 89) * 17 + Math.round((p[2] / length) * 83);
    const bump = 0.84 + hash(key + seed * 131) * 0.3;
    return [
      centre[0] + (p[0] / length) * radius[0] * bump,
      centre[1] + (p[1] / length) * radius[1] * bump,
      centre[2] + (p[2] / length) * radius[2] * bump,
    ];
  };

  triangles.forEach(([a, b, c], index) => {
    const pa = place(a), pb = place(b), pc = place(c);
    const out: Vec3 = [
      (pa[0] + pb[0] + pc[0]) / 3 - centre[0],
      (pa[1] + pb[1] + pc[1]) / 3 - centre[1],
      (pa[2] + pb[2] + pc[2]) / 3 - centre[2],
    ];
    // Leaves underneath are in shade, leaves on top catch the sun.
    const lift = Math.max(0, Math.min(1, out[1] / radius[1] / 2 + 0.5));
    const tone = 0.9 + hash(index + seed * 17) * 0.2;
    const color: RGB = {
      r: (dark.r + (light.r - dark.r) * lift) * tone,
      g: (dark.g + (light.g - dark.g) * lift) * tone,
      b: (dark.b + (light.b - dark.b) * lift) * tone,
    };
    builder.face([pa, pb, pc], color, out);
  });
}

function trunk(builder: MeshBuilder, height: number, bottom: number, top: number, color: RGB): void {
  const sides = 6;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const b = ((i + 1) / sides) * Math.PI * 2;
    const middle = (a + b) / 2;
    builder.face(
      [
        [Math.cos(a) * bottom, 0, Math.sin(a) * bottom],
        [Math.cos(b) * bottom, 0, Math.sin(b) * bottom],
        [Math.cos(b) * top, height, Math.sin(b) * top],
        [Math.cos(a) * top, height, Math.sin(a) * top],
      ],
      shade(color, 0.85 + (i % 2) * 0.15),
      [Math.cos(middle), 0, Math.sin(middle)],
    );
  }
}

/** A shade tree (mango, almond): short trunk, wide crown. About 7.5 m tall at size 1. */
export function buildShadeTree(): MeshData {
  const builder = new MeshBuilder();
  trunk(builder, 3.2, 0.3, 0.2, COLOURS.trunk);
  leafBall(builder, [0, 5.1, 0], [2.9, 2.3, 2.9], 1, 1, COLOURS.leaf, COLOURS.leafDark);
  leafBall(builder, [1.7, 4.1, 0.7], [1.7, 1.4, 1.7], 0, 2, COLOURS.leaf, COLOURS.leafDark);
  leafBall(builder, [-1.5, 4.3, -1.0], [1.8, 1.4, 1.8], 0, 3, COLOURS.leaf, COLOURS.leafDark);
  return builder.build();
}

/** A palm: tall bare trunk with drooping fronds. About 9.5 m tall at size 1. */
export function buildPalmTree(): MeshData {
  const builder = new MeshBuilder();
  const height = 8.2;
  trunk(builder, height, 0.24, 0.16, COLOURS.palmTrunk);

  const fronds = 9;
  for (let i = 0; i < fronds; i++) {
    const angle = (i / fronds) * Math.PI * 2 + hash(i) * 0.4;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const upright = i % 3 === 0; // every third frond stands up, the rest hang
    const spine: Vec3[] = upright
      ? [[0, height, 0], [dx * 1.1, height + 1.2, dz * 1.1], [dx * 2.3, height + 1.3, dz * 2.3]]
      : [[0, height, 0], [dx * 1.7, height + 0.55, dz * 1.7], [dx * 3.3, height - 0.75, dz * 3.3]];
    const widths = [0.18, 0.62, 0.06];
    const color = shade(COLOURS.frond, 0.85 + hash(i + 40) * 0.3);

    for (let s = 0; s < 2; s++) {
      const p = spine[s], q = spine[s + 1];
      const wp = widths[s], wq = widths[s + 1];
      builder.sheet(
        [
          [p[0] - dz * wp, p[1], p[2] + dx * wp],
          [p[0] + dz * wp, p[1], p[2] - dx * wp],
          [q[0] + dz * wq, q[1], q[2] - dx * wq],
          [q[0] - dz * wq, q[1], q[2] + dx * wq],
        ],
        color,
        UP,
      );
    }
  }
  return builder.build();
}
