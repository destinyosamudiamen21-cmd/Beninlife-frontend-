// The things that make a street look lived in: market stalls, electricity poles and
// wires, parked buses and kekes, and the ground of markets and parks. Built from boxes
// in code like everything else, so a market of 240 stalls is one mesh and loads at once.

import type { DistrictData } from "./districtData";
import { MeshBuilder, triangulate, type MeshData } from "./districtGeometry";
import { hexToLinear, type RGB } from "./tint";

type Vec3 = [number, number, number];

/** What a stall sells. The order must match GOODS in tools/build_district.py. */
export const GOODS = [
  "okrika",
  "food",
  "fabric",
  "beads",
  "electronics",
  "bushmeat",
  "provisions",
] as const;

const C = (hex: string) => hexToLinear(hex);
const WOOD = C("#7a5a3c"),
  DARK_WOOD = C("#4f3a28"),
  RUST = C("#8a4a32"),
  ZINC = C("#9a9d9f");
const POLE = C("#4a3a2c"),
  WIRE = C("#1d1d1f"),
  TYRE = C("#18181a"),
  GLASS = C("#1f2a36");
const BUS = C("#f0b90b"),
  BUS_STRIPE = C("#1d1d1f"),
  CAR_PAINTS = ["#8d99a6", "#b23a2f", "#e8e6df", "#2f4a6b"].map(C);
const MARKET_GROUND = C("#a8906e"),
  PARK_GRASS = C("#7fae52");

// Umbrella cloth, two colours each.
const UMBRELLAS: [RGB, RGB][] = [
  [C("#d6352f"), C("#f2efe6")],
  [C("#2f6fd6"), C("#f2c200")],
  [C("#2f9e54"), C("#f2efe6")],
  [C("#e88a2b"), C("#3a3d42")],
  [C("#d63f8c"), C("#f2efe6")],
];

// What lies on the table, by goods: [colours, how tall the piles are].
const WARES: Record<string, { paints: RGB[]; height: number }> = {
  okrika: {
    paints: [
      "#2f6fd6",
      "#d64545",
      "#ede6d6",
      "#3a3d42",
      "#2a9d8f",
      "#c79a2b",
    ].map(C),
    height: 0.32,
  },
  food: {
    paints: ["#e88a2b", "#c79a2b", "#5a9a45", "#8a4a32", "#f2c200"].map(C),
    height: 0.2,
  },
  fabric: {
    paints: [
      "#d63f8c",
      "#6a4fe0",
      "#2a9d8f",
      "#d64545",
      "#c79a2b",
      "#2f6fd6",
    ].map(C),
    height: 0.26,
  },
  beads: {
    paints: ["#c0392b", "#e0563f", "#f2efe6", "#c79a2b"].map(C),
    height: 0.08,
  },
  electronics: {
    paints: ["#1d1d1f", "#3a3d42", "#ede6d6", "#2f6fd6"].map(C),
    height: 0.16,
  },
  bushmeat: { paints: ["#5b3a26", "#6d4a3a", "#3f2a1c"].map(C), height: 0.18 },
  provisions: {
    paints: ["#c9a36a", "#d64545", "#f2c200", "#ede6d6", "#2f9e54"].map(C),
    height: 0.3,
  },
};

function shade(color: RGB, amount: number): RGB {
  return { r: color.r * amount, g: color.g * amount, b: color.b * amount };
}

/** A repeatable random number from 0 to 1. */
function hash(n: number): number {
  let h = (n | 0) * 374761393 + 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---- sizes, shared with collision ------------------------------------------

const TABLE = { halfLong: 0.95, halfWide: 0.45, top: 0.8 };
const VEHICLES = [
  { halfLong: 2.3, halfWide: 0.95 }, // bus
  { halfLong: 1.25, halfWide: 0.62 }, // keke
  { halfLong: 2.05, halfWide: 0.88 }, // car
];
const POLE_HALF = 0.11;
const POLE_HEIGHT = 7.4;

/** Everything here that a player cannot walk through: centre x, centre z, half length, half width, angle. */
export function propSolids(district: DistrictData): number[][] {
  const solids: number[][] = [];
  const stalls = district.stalls ?? [];
  for (let i = 0; i + 3 < stalls.length; i += 4) {
    solids.push([
      stalls[i],
      stalls[i + 1],
      TABLE.halfLong,
      TABLE.halfWide,
      stalls[i + 2],
    ]);
  }
  const vehicles = district.vehicles ?? [];
  for (let i = 0; i + 3 < vehicles.length; i += 4) {
    const size = VEHICLES[vehicles[i + 3]] ?? VEHICLES[0];
    solids.push([
      vehicles[i],
      vehicles[i + 1],
      size.halfLong,
      size.halfWide,
      vehicles[i + 2],
    ]);
  }
  for (const wire of district.wires ?? []) {
    for (let i = 0; i + 1 < wire.length; i += 2)
      solids.push([wire[i], wire[i + 1], 0.16, 0.16, 0]);
  }
  return solids;
}

// ---- building blocks -------------------------------------------------------

/** Puts boxes down relative to a thing's own middle and facing. */
function placer(builder: MeshBuilder, x: number, z: number, angle: number) {
  const ux = Math.cos(angle),
    uz = Math.sin(angle);
  const at = (along: number, across: number): [number, number] => [
    x + along * ux - across * uz,
    z + along * uz + across * ux,
  ];
  return {
    at,
    /** A box: how far along and across from the middle, half sizes, bottom, top. */
    box(
      along: number,
      across: number,
      halfLong: number,
      halfWide: number,
      bottom: number,
      top: number,
      color: RGB
    ) {
      const [cx, cz] = at(along, across);
      builder.box(cx, cz, halfLong, halfWide, bottom, top, color, angle);
    },
  };
}

function stall(
  builder: MeshBuilder,
  x: number,
  z: number,
  angle: number,
  goods: number,
  seed: number
): void {
  const put = placer(builder, x, z, angle);
  const kind = GOODS[goods] ?? "provisions";
  const wares = WARES[kind];

  // The table: a top on a cloth skirt, which is how most market tables are dressed.
  put.box(
    0,
    0,
    TABLE.halfLong,
    TABLE.halfWide,
    TABLE.top - 0.06,
    TABLE.top,
    WOOD
  );
  put.box(
    0,
    0,
    TABLE.halfLong - 0.05,
    TABLE.halfWide - 0.05,
    0,
    TABLE.top - 0.06,
    shade(wares.paints[seed % wares.paints.length], 0.55)
  );

  // The goods, in piles.
  const piles = 3 + Math.floor(hash(seed) * 3);
  for (let i = 0; i < piles; i++) {
    const along = -0.72 + (1.44 * (i + 0.5)) / piles;
    const across = (hash(seed + i * 7) - 0.5) * 0.3;
    const tall = wares.height * (0.6 + hash(seed + i * 13) * 0.8);
    put.box(
      along,
      across,
      0.62 / piles + 0.05,
      0.2 + hash(seed + i * 5) * 0.12,
      TABLE.top,
      TABLE.top + tall,
      wares.paints[(seed + i * 3) % wares.paints.length]
    );
  }

  if (hash(seed + 99) < 0.62) {
    // A big umbrella: eight panels in two colours, on a pole behind the table.
    const [a, b] = UMBRELLAS[seed % UMBRELLAS.length];
    const [px, pz] = put.at(0, 0.55);
    builder.box(px, pz, 0.03, 0.03, 0, 2.55, DARK_WOOD);
    const top: Vec3 = [px, 2.62, pz];
    for (let i = 0; i < 8; i++) {
      const from = (i / 8) * Math.PI * 2,
        to = ((i + 1) / 8) * Math.PI * 2;
      builder.sheet(
        [
          top,
          [px + Math.cos(from) * 1.45, 2.12, pz + Math.sin(from) * 1.45],
          [px + Math.cos(to) * 1.45, 2.12, pz + Math.sin(to) * 1.45],
        ],
        i % 2 ? a : b,
        [0, 1, 0]
      );
    }
  } else {
    // A zinc shade on four posts, sloping to the back.
    const roof = hash(seed + 3) < 0.5 ? RUST : ZINC;
    const posts: [number, number, number][] = [
      [-1.05, -0.6, 2.45],
      [1.05, -0.6, 2.45],
      [-1.05, 0.75, 2.15],
      [1.05, 0.75, 2.15],
    ];
    for (const [along, across, tall] of posts)
      put.box(along, across, 0.035, 0.035, 0, tall, DARK_WOOD);
    const corner = (along: number, across: number, y: number): Vec3 => {
      const [cx, cz] = put.at(along, across);
      return [cx, y, cz];
    };
    builder.sheet(
      [
        corner(-1.2, -0.75, 2.5),
        corner(1.2, -0.75, 2.5),
        corner(1.2, 0.9, 2.17),
        corner(-1.2, 0.9, 2.17),
      ],
      roof,
      [0, 1, 0]
    );
  }
}

function vehicle(
  builder: MeshBuilder,
  x: number,
  z: number,
  angle: number,
  kind: number,
  seed: number
): void {
  const put = placer(builder, x, z, angle);
  const wheels = (along: number, across: number, radius: number) => {
    for (const a of [-along, along])
      for (const c of [-across, across])
        put.box(a, c, radius, 0.1, 0, radius * 2, TYRE);
  };

  if (kind === 0) {
    // The yellow city bus: a tall box with a band of windows.
    put.box(0, 0, 2.3, 0.95, 0.35, 2.1, BUS);
    put.box(0.1, 0, 2.05, 0.96, 1.25, 1.8, GLASS);
    put.box(0, 0, 2.31, 0.955, 0.85, 0.98, BUS_STRIPE);
    put.box(0, 0, 2.2, 0.9, 2.1, 2.16, shade(BUS, 0.85));
    wheels(1.45, 0.88, 0.36);
  } else if (kind === 1) {
    // A keke: one wheel in front, two behind, a cabin with an open side.
    put.box(-0.2, 0, 1.0, 0.62, 0.3, 1.0, BUS);
    put.box(-0.25, 0, 0.95, 0.6, 1.0, 1.55, GLASS);
    put.box(-0.2, 0, 1.05, 0.64, 1.55, 1.65, BUS);
    put.box(0.95, 0, 0.3, 0.3, 0.3, 0.95, BUS);
    put.box(1.05, 0, 0.22, 0.08, 0, 0.44, TYRE);
    for (const c of [-0.6, 0.6]) put.box(-0.85, c, 0.22, 0.08, 0, 0.44, TYRE);
  } else {
    const paint = CAR_PAINTS[seed % CAR_PAINTS.length];
    put.box(0, 0, 2.05, 0.88, 0.3, 0.95, paint);
    put.box(-0.15, 0, 1.1, 0.8, 0.95, 1.45, GLASS);
    put.box(-0.15, 0, 1.05, 0.78, 1.45, 1.5, paint);
    wheels(1.3, 0.82, 0.32);
  }
}

function flatPolygon(
  builder: MeshBuilder,
  ring: number[],
  y: number,
  color: RGB
): void {
  // triangulate() wants outlines running one way round; turn this one if it runs the other.
  let area = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    area += ring[i] * ring[j + 1] - ring[j] * ring[i + 1];
  }
  let points = ring;
  if (area < 0) {
    points = [];
    for (let i = ring.length - 2; i >= 0; i -= 2)
      points.push(ring[i], ring[i + 1]);
  }
  const triangles = triangulate(points);
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * 2,
      b = triangles[i + 1] * 2,
      c = triangles[i + 2] * 2;
    builder.face(
      [
        [points[a], y, points[a + 1]],
        [points[b], y, points[b + 1]],
        [points[c], y, points[c + 1]],
      ],
      color,
      [0, 1, 0]
    );
  }
}

// ---- everything on a district's streets ---------------------------------------

export type StreetMeshes = {
  /** Stalls, poles, wires and vehicles. */
  props: MeshData;
  /** The ground of markets and parks, lying flat under everything else. */
  pads: MeshData;
};

export function buildStreetProps(district: DistrictData): StreetMeshes {
  const props = new MeshBuilder();
  const pads = new MeshBuilder();

  for (const area of district.areas) {
    if (area.p.length < 6) continue;
    if (area.t === "market") flatPolygon(pads, area.p, 0.012, MARKET_GROUND);
    else if (area.t === "park") flatPolygon(pads, area.p, 0.012, PARK_GRASS);
  }

  const stalls = district.stalls ?? [];
  for (let i = 0; i + 3 < stalls.length; i += 4)
    stall(props, stalls[i], stalls[i + 1], stalls[i + 2], stalls[i + 3], i);

  const vehicles = district.vehicles ?? [];
  for (let i = 0; i + 3 < vehicles.length; i += 4) {
    vehicle(
      props,
      vehicles[i],
      vehicles[i + 1],
      vehicles[i + 2],
      vehicles[i + 3],
      i
    );
  }

  // Poles with a crossarm, and two wires from each pole to the next one down the street.
  for (const wire of district.wires ?? []) {
    for (let i = 0; i + 1 < wire.length; i += 2) {
      const x = wire[i],
        z = wire[i + 1];
      const hasNext = i + 3 < wire.length;
      const hasPrevious = i >= 2;
      const dx = hasNext ? wire[i + 2] - x : hasPrevious ? x - wire[i - 2] : 1;
      const dz = hasNext ? wire[i + 3] - z : hasPrevious ? z - wire[i - 1] : 0;
      const along = Math.atan2(dz, dx);

      props.box(x, z, POLE_HALF, POLE_HALF, 0, POLE_HEIGHT, POLE);
      props.box(
        x,
        z,
        0.06,
        0.8,
        POLE_HEIGHT - 0.5,
        POLE_HEIGHT - 0.38,
        POLE,
        along
      );

      if (hasNext) {
        const length = Math.hypot(dx, dz);
        const sideX = (-dz / length) * 0.7,
          sideZ = (dx / length) * 0.7;
        for (const side of [-1, 1]) {
          props.box(
            x + dx / 2 + sideX * side,
            z + dz / 2 + sideZ * side,
            length / 2,
            0.015,
            POLE_HEIGHT - 0.4,
            POLE_HEIGHT - 0.37,
            WIRE,
            along
          );
        }
      }
    }
  }

  return { props: props.build(), pads: pads.build() };
}
