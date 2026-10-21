// The University of Benin as it really looks, for the UNIBEN district: salmon walls with a
// dark plinth, deep brown fascias round flat roofs, brown fins standing off the walls,
// covered corridors on salmon columns, black-and-white kerbs. And its landmarks: the
// fountain inside the main gate, the pillars down the boulevard that bend a little more
// each year ("UNIBEN has bent you"), the Senate building with its great brown columns,
// and the water tower by Engineering.
//
// Plain numbers in, triangles out, like districtGeometry.ts. The buildings tagged in the
// map file ("senate", "fountain", "pillar", "watertower", "lt", "hostel") get their own
// shapes here; every other building on campus gets the campus style.

import type { Building } from "./districtData";
import type { MeshBuilder } from "./districtGeometry";
import { hexToLinear, type RGB } from "./tint";

type Vec3 = [number, number, number];

const C = hexToLinear;
export const CAMPUS = {
  walls: ["#e9a47f", "#eaa985", "#e29a76", "#eeb18f", "#e6a07a"].map(C),
  fascia: C("#5b3424"),
  rib: C("#472819"),
  fin: C("#6a3d2a"),
  slab: C("#7b4a33"),
  plinth: C("#7d4c37"),
  roof: C("#6d4331"),
  flat: C("#8e8a82"),
  column: C("#e8a37d"),
  white: C("#f1eee6"),
  black: C("#26262a"),
  water: C("#4f9fd0"),
  spray: C("#e9f4fb"),
  concrete: C("#b4afa4"),
  steps: C("#a63c2c"),
  hedge: C("#3f7d3a"),
  hedgeDark: C("#2f6331"),
  earth: C("#a9643f"),
  leaf: C("#3f7d3a"),
};

/** Buildings drawn here and only here: not walls and a roof, but a thing of their own. */
export const LANDMARKS: ReadonlySet<string> = new Set(["fountain", "pillar", "watertower"]);

/** Is this spot (or this building) part of the campus, and so drawn in the campus style? */
export function onCampus(districtId: string, x: number, z: number, building?: Building): boolean {
  if (districtId !== "uniben") return false;
  if (building?.t === "university") return true;
  return x > -252 && x < 290 && z > -332 && z < -38;
}

function shade(color: RGB, amount: number): RGB {
  return { r: color.r * amount, g: color.g * amount, b: color.b * amount };
}

/** A building's own frame: its middle, the way its long side runs, its half sizes. */
function frame(building: Building) {
  const [cx, cz, halfLong, halfShort, angle] = building.r as number[];
  const ux = Math.cos(angle), uz = Math.sin(angle);
  /** A point `along` the long side and `across` it (positive is the side towards +z when the angle is 0). */
  const at = (along: number, across: number, y: number): Vec3 => [cx + along * ux - across * uz, y, cz + along * uz + across * ux];
  const out = (along: number, across: number): Vec3 => [along * ux - across * uz, 0, along * uz + across * ux];
  /** An upright box in the building's own frame, from `a0` to `a1` along and `c0` to `c1` across. */
  const box = (builder: MeshBuilder, a0: number, a1: number, c0: number, c1: number, y0: number, y1: number, color: RGB) => {
    const [x, , z] = at((a0 + a1) / 2, (c0 + c1) / 2, 0);
    builder.box(x, z, Math.max(0.027, (a1 - a0) / 2), Math.max(0.027, (c1 - c0) / 2), y0, y1, color, angle);
  };
  return { cx, cz, halfLong, halfShort, angle, at, out, box };
}

export function campusWall(building: Building): RGB {
  const tone = 0.95 + ((building.s * 37) % 100) / 1000;
  return shade(CAMPUS.walls[building.s % CAMPUS.walls.length], tone);
}

/**
 * The deep brown fascia round a flat roof: a band standing proud of the walls, ribbed down
 * its face, with its underside and the roof inside it. `top` is the height of the walls.
 */
function fascia(builder: MeshBuilder, building: Building, top: number, depth = 1.0, over = 0.85): void {
  const f = frame(building);
  const y0 = top, y1 = top + depth;   // never below the top of the walls: the roofs mesh starts there
  const L = f.halfLong + over, S = f.halfShort + over;
  const inset = 0.22;
  // The four faces, ribbed: strips of two browns, about 0.7 m each.
  const sides: [number, number, number, number, Vec3][] = [
    [-L, S, L, S, f.out(0, 1)],
    [L, -S, -L, -S, f.out(0, -1)],
    [L, S, L, -S, f.out(1, 0)],
    [-L, -S, -L, S, f.out(-1, 0)],
  ];
  for (const [a0, c0, a1, c1, facing] of sides) {
    const length = Math.hypot(a1 - a0, c1 - c0);
    const strips = Math.max(1, Math.round(length / 0.7));
    for (let i = 0; i < strips; i++) {
      const t0 = i / strips, t1 = (i + 1) / strips;
      const p = f.at(a0 + (a1 - a0) * t0, c0 + (c1 - c0) * t0, 0);
      const q = f.at(a0 + (a1 - a0) * t1, c0 + (c1 - c0) * t1, 0);
      builder.face([[p[0], y0, p[2]], [q[0], y0, q[2]], [q[0], y1, q[2]], [p[0], y1, p[2]]], i % 2 ? CAMPUS.rib : CAMPUS.fascia, facing);
    }
  }
  const ring = (along: number, across: number, y: number): Vec3[] => [f.at(-along, -across, y), f.at(along, -across, y), f.at(along, across, y), f.at(-along, across, y)];
  const outer = ring(L, S, y1), inner = ring(L - inset, S - inset, y1);
  // The top of the band.
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    builder.face([outer[i], outer[j], inner[j], inner[i]], shade(CAMPUS.fascia, 0.85), [0, 1, 0]);
  }
  // The inside of the band, seen from above, and the roof it hides.
  const innerLow = ring(L - inset, S - inset, top + 0.12);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const middle = f.at(0, 0, 0);
    const facing: Vec3 = [middle[0] - (inner[i][0] + inner[j][0]) / 2, 0, middle[2] - (inner[i][2] + inner[j][2]) / 2];
    builder.face([innerLow[i], innerLow[j], inner[j], inner[i]], shade(CAMPUS.fascia, 0.7), facing);
  }
  builder.face(innerLow, CAMPUS.flat, [0, 1, 0]);
  // The underside, seen from the street.
  const wall = ring(f.halfLong, f.halfShort, y0), edge = ring(L, S, y0);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    builder.face([wall[i], wall[j], edge[j], edge[i]], shade(CAMPUS.fascia, 0.55), [0, -1, 0]);
  }
}

/** Brown fins standing off a wall, one between every two windows, as on the lecture halls. */
function fins(builder: MeshBuilder, building: Building, top: number, sides: ("long" | "short")[]): void {
  const f = frame(building);
  const bay = 3.2;
  for (const side of sides) {
    const half = side === "long" ? f.halfLong : f.halfShort;
    const bays = Math.max(1, Math.round((half * 2) / bay));
    const step = (half * 2) / bays;
    for (const sign of [-1, 1]) {
      for (let k = 0; k <= bays; k++) {
        const a = -half + k * step;
        if (side === "long") f.box(builder, a - 0.15, a + 0.15, sign * f.halfShort + (sign > 0 ? 0 : -0.75), sign * f.halfShort + (sign > 0 ? 0.75 : 0), 0.45, top - 0.3, CAMPUS.fin);
        else f.box(builder, sign * f.halfLong + (sign > 0 ? 0 : -0.75), sign * f.halfLong + (sign > 0 ? 0.75 : 0), a - 0.15, a + 0.15, 0.45, top - 0.3, CAMPUS.fin);
      }
    }
  }
}

/** A covered corridor along the front: a brown slab at every floor, a salmon parapet, columns to the ground. */
function corridors(builder: MeshBuilder, building: Building, floors: number, floorHeight: number, both: boolean): void {
  const f = frame(building);
  const width = 1.9;
  const top = floors * floorHeight;
  for (const sign of both ? [1, -1] : [1]) {
    const c0 = sign > 0 ? f.halfShort : -f.halfShort - width;
    const c1 = sign > 0 ? f.halfShort + width : -f.halfShort;
    const edge0 = sign > 0 ? c1 - 0.16 : c0;
    const edge1 = sign > 0 ? c1 : c0 + 0.16;
    // The walkway at the bottom.
    f.box(builder, -f.halfLong - 0.2, f.halfLong + 0.2, c0, c1, 0, 0.14, CAMPUS.concrete);
    for (let level = 1; level < floors; level++) {
      const y = level * floorHeight;
      f.box(builder, -f.halfLong - 0.2, f.halfLong + 0.2, c0, c1, y - 0.12, y + 0.1, CAMPUS.slab);
      f.box(builder, -f.halfLong - 0.2, f.halfLong + 0.2, edge0, edge1, y + 0.1, y + 1.0, shade(CAMPUS.column, 1.04));
      f.box(builder, -f.halfLong - 0.2, f.halfLong + 0.2, edge0 - 0.04, edge1 + 0.04, y + 1.0, y + 1.08, CAMPUS.slab);
    }
    const posts = Math.max(2, Math.round((f.halfLong * 2) / 3.2) + 1);
    for (let k = 0; k < posts; k++) {
      const a = -f.halfLong + (k * (f.halfLong * 2)) / (posts - 1);
      f.box(builder, a - 0.18, a + 0.18, edge0 - 0.1, edge1 + 0.1, 0.14, top - 0.3, CAMPUS.column);
    }
  }
}

/**
 * A campus building of two floors or more (its salmon walls and windows are drawn by the
 * caller): a dark plinth, a deep brown fascia, and fins or covered corridors. The Senate
 * and 500 LT get more. The fascia goes with the roofs; everything lower down goes in `parts`.
 */
export function campusBuilding(roofs: MeshBuilder, parts: MeshBuilder, building: Building, floorHeight: number): void {
  if (!building.r) return;
  const f = frame(building);
  const top = building.f * floorHeight;
  f.box(parts, -f.halfLong - 0.06, f.halfLong + 0.06, -f.halfShort - 0.06, f.halfShort + 0.06, 0, 0.45, CAMPUS.plinth);

  if (building.t === "senate") {
    fascia(roofs, building, top, 1.4, 1.2);
    // The great brown columns across the front, rising into the fascia, and red steps up to them.
    const columns = 6;
    for (let k = 0; k < columns; k++) {
      const a = -f.halfLong + 2 + (k * (f.halfLong * 2 - 4)) / (columns - 1);
      f.box(parts, a - 0.55, a + 0.55, f.halfShort + 1.6, f.halfShort + 2.7, 0.45, top + 0.2, shade(CAMPUS.fin, 0.92));
    }
    for (let step = 0; step < 3; step++) {
      f.box(parts, -f.halfLong + 1, f.halfLong - 1, f.halfShort, f.halfShort + 4.4 - step * 0.8, 0, 0.15 + step * 0.15, CAMPUS.steps);
    }
    // A portico roof over the columns.
    f.box(parts, -f.halfLong, f.halfLong, f.halfShort, f.halfShort + 3.2, top - 0.3, top + 0.2, CAMPUS.fascia);
    return;
  }
  fascia(roofs, building, top);
  if (building.t === "lt") {
    fins(parts, building, top, ["long", "short"]);
    // A covered way along the front, on salmon posts, with the door in the middle left clear.
    f.box(parts, -f.halfLong - 1, f.halfLong + 1, f.halfShort, f.halfShort + 3.2, 3.0, 3.25, CAMPUS.slab);
    for (let a = -f.halfLong; a <= f.halfLong + 0.01; a += 4) {
      if (Math.abs(a) < 2.5) continue;
      f.box(parts, a - 0.2, a + 0.2, f.halfShort + 2.8, f.halfShort + 3.2, 0, 3.0, CAMPUS.column);
    }
    return;
  }
  if (building.t === "hostel") {
    corridors(parts, building, building.f, floorHeight, true);
    return;
  }
  if (building.s % 3 === 0) fins(parts, building, top, ["long"]);
  else corridors(parts, building, building.f, floorHeight, building.s % 3 === 2);
}

// ---- the landmarks ------------------------------------------------------------------------

/** An upright many-sided shape: a basin, a pedestal, a tank. `r1` is its radius at the top. */
function round(builder: MeshBuilder, x: number, z: number, r0: number, r1: number, y0: number, y1: number, color: RGB, sides = 16, top = true): void {
  const ring = (r: number, y: number): Vec3[] =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      return [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
    });
  const low = ring(r0, y0), high = ring(r1, y1);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const mid = (i + 0.5) / sides * Math.PI * 2;
    builder.face([low[i], low[j], high[j], high[i]], shade(color, 0.92 + 0.08 * Math.cos(mid - 0.8)), [Math.cos(mid), 0, Math.sin(mid)]);
  }
  if (top) {
    for (let i = 0; i < sides; i++) builder.face([[x, y1, z], high[(i + 1) % sides], high[i]], color, [0, 1, 0]);
  }
}

/** A square tube along a line of points bending in the upright plane through x: the pillars. */
function tube(builder: MeshBuilder, points: Vec3[], half: number, color: RGB): void {
  const rings: Vec3[][] = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    const sx = dy / length, sy = -dx / length;   // across the bend, in the upright plane
    return [
      [p[0] - sx * half, p[1] - sy * half, p[2] - half],
      [p[0] + sx * half, p[1] + sy * half, p[2] - half],
      [p[0] + sx * half, p[1] + sy * half, p[2] + half],
      [p[0] - sx * half, p[1] - sy * half, p[2] + half],
    ];
  });
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k < 4; k++) {
      const l = (k + 1) % 4;
      const middle: Vec3 = [(rings[i][k][0] + rings[i][l][0]) / 2 - points[i][0], (rings[i][k][1] + rings[i][l][1]) / 2 - points[i][1], (rings[i][k][2] + rings[i][l][2]) / 2 - points[i][2]];
      builder.face([rings[i][k], rings[i][l], rings[i + 1][l], rings[i + 1][k]], shade(color, k % 2 ? 0.9 : 1), middle);
    }
  }
  const last = rings[rings.length - 1];
  builder.face(last, color, [0, 1, 0]);
}

function fountain(builder: MeshBuilder, x: number, z: number, radius: number): void {
  round(builder, x, z, radius + 1.4, radius + 1.4, 0, 0.12, CAMPUS.concrete, 20);
  round(builder, x, z, radius, radius, 0, 0.6, CAMPUS.column, 20);
  round(builder, x, z, radius + 0.08, radius + 0.08, 0.6, 0.7, CAMPUS.white, 20, false);
  round(builder, x, z, radius - 0.25, radius - 0.25, 0, 0.5, CAMPUS.water, 20);
  round(builder, x, z, 0.45, 0.35, 0.5, 1.5, CAMPUS.white, 10);
  round(builder, x, z, 0.4, 1.3, 1.5, 1.75, CAMPUS.white, 14);
  round(builder, x, z, 1.15, 1.15, 1.75, 1.78, CAMPUS.water, 14);
  // The jet, and the spray falling back.
  round(builder, x, z, 0.14, 0.08, 1.75, 4.6, CAMPUS.spray, 8);
  round(builder, x, z, 0.08, 0.55, 3.7, 4.4, CAMPUS.spray, 10);
  round(builder, x, z, 1.0, 1.25, 0.5, 1.2, shade(CAMPUS.spray, 0.95), 14, false);
}

/** One of the boulevard's pillars on its plinth: a Y, straight or bent by `bend` radians. */
function pillar(builder: MeshBuilder, x: number, z: number, bend: number): void {
  builder.box(x, z, 0.9, 0.9, 0, 0.55, CAMPUS.white);
  builder.box(x, z, 0.95, 0.95, 0.55, 0.65, CAMPUS.steps);
  const points: Vec3[] = [];
  let px = x, py = 0.65, angle = 0;
  const segments = 10, length = 2.7;
  for (let i = 0; i <= segments; i++) {
    points.push([px, py, z]);
    angle = (bend * (i + 1)) / segments;
    px += Math.sin(angle) * (length / segments);
    py += Math.cos(angle) * (length / segments);
  }
  tube(builder, points, 0.17, CAMPUS.column);
  const tip = points[points.length - 1];
  for (const side of [-1, 1]) {
    const arm = angle + side * 0.55;
    tube(builder, [tip, [tip[0] + Math.sin(arm) * 0.5, tip[1] + Math.cos(arm) * 0.5, z], [tip[0] + Math.sin(arm + side * 0.25) * 1.1, tip[1] + Math.cos(arm + side * 0.25) * 1.1, z]], 0.13, CAMPUS.column);
  }
  // A flower bed either side of it, down the middle of the boulevard.
  for (const dz of [-5.5, 5.5]) {
    builder.box(x, z + dz, 2.6, 2.4, 0, 0.12, CAMPUS.earth);
    builder.box(x - 1.2, z + dz, 0.9, 2.0, 0.12, 0.6, CAMPUS.hedge);
    builder.box(x + 1.2, z + dz, 0.9, 2.0, 0.12, 0.5, CAMPUS.hedgeDark);
  }
}

function waterTower(builder: MeshBuilder, x: number, z: number): void {
  for (const side of [-1, 1]) builder.box(x + side * 0.9, z, 0.32, 1.25, 0, 14.2, CAMPUS.concrete);
  builder.box(x, z, 1.25, 1.3, 13.6, 14.4, shade(CAMPUS.concrete, 0.95));
  round(builder, x, z, 1.3, 4.6, 14.3, 18.6, shade(CAMPUS.concrete, 1.05), 4);
  // Something has taken root on top, as it has on the real one.
  builder.box(x + 0.6, z - 0.4, 0.7, 0.6, 18.6, 19.5, CAMPUS.leaf);
}

/** The landmarks of a campus building tagged in the map. Returns true if it was one. */
export function campusLandmark(builder: MeshBuilder, building: Building, order: number): boolean {
  if (!building.r || !building.t || !LANDMARKS.has(building.t)) return false;
  const [x, z, half] = building.r;
  if (building.t === "fountain") fountain(builder, x, z, half);
  else if (building.t === "pillar") pillar(builder, x, z, [0, 0.22, 0.45, 0.72][Math.min(3, order)]);
  else if (building.t === "watertower") waterTower(builder, x, z);
  return true;
}

/** Cut a line of points into pieces `every` metres long, for striped kerbs. */
export function piecesOf(points: number[], every: number): number[][] {
  const pieces: number[][] = [];
  let current: number[] = [points[0], points[1]];
  let left = every;
  for (let i = 0; i + 3 < points.length; i += 2) {
    let ax = points[i], az = points[i + 1];
    const bx = points[i + 2], bz = points[i + 3];
    let length = Math.hypot(bx - ax, bz - az);
    while (length > left) {
      const t = left / length;
      const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
      current.push(cx, cz);
      pieces.push(current);
      current = [cx, cz];
      ax = cx; az = cz;
      length -= left;
      left = every;
    }
    current.push(bx, bz);
    left -= length;
  }
  if (current.length >= 4) pieces.push(current);
  return pieces;
}

