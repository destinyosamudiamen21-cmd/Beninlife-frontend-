// The things that make a street look lived in: market stalls and what is laid out on
// them, electricity poles and wires, parked buses and kekes, the ground of markets and
// parks. Also the shapes the moving crowd and traffic are drawn with. All of it is built
// from boxes in code, so a market of 900 stalls is one mesh and needs no model files.

import type { DistrictData } from "./districtData";
import { MeshBuilder, triangulate, type MeshData } from "./districtGeometry";
import { hexToLinear, type RGB } from "./tint";

type Vec3 = [number, number, number];

/**
 * What a stall sells. The order must match GOODS in tools/build_district.py, because the
 * map file stores the position in this list. New kinds go on the end.
 */
export const GOODS = [
  "okrika", "food", "fabric", "beads", "electronics", "bushmeat", "provisions",
  "pepper", "yam", "fish", "grains", "shoes", "cosmetics", "plastics", "meat", "fruits",
] as const;

const C = (hex: string) => hexToLinear(hex);
const WOOD = C("#7a5a3c"), DARK_WOOD = C("#4f3a28"), POLE = C("#4a3a2c"), WIRE = C("#1d1d1f");
const TYRE = C("#18181a"), GLASS = C("#1f2a36"), CHROME = C("#b9bcc0"), LAMP = C("#f4e7b0");
// Benin City colours: buses and kekes in yellow with red, as on the road.
const BUS = C("#f5c400"), BUS_STRIPE = C("#c8102e"), WHITE = C("#f1efe9");
const KEKE_RED = C("#c8102e");
const CITY_BUS = C("#c8102e"), CITY_BUS_BAND = C("#f5c400");
const CAR_PAINTS = ["#8d99a6", "#b23a2f", "#e8e6df", "#2f4a6b", "#3a3d42", "#7a6a4a"].map(C);
const MARKET_GROUND = C("#a8906e"), PARK_GRASS = C("#7fae52"), WATER = C("#2f5d7a");
const ENAMEL = C("#dfe3e6"), SACK = C("#c9b48a"), CHARCOAL = C("#26221f"), EMBER = C("#e8662b");

// Zinc sheets and tarpaulins, new and old: what a market looks like from above.
const SHEDS = ["#8a4a32", "#9a9d9f", "#3f6fb0", "#6d4a3a", "#2f8a5a", "#b9bcc0", "#7a3526", "#4a6a8a"].map(C);

// Umbrella cloth, two colours each.
const UMBRELLAS: [RGB, RGB][] = [
  [C("#d6352f"), C("#f2efe6")], [C("#2f6fd6"), C("#f2c200")], [C("#2f9e54"), C("#f2efe6")],
  [C("#e88a2b"), C("#3a3d42")], [C("#d63f8c"), C("#f2efe6")], [C("#6a4fe0"), C("#f2efe6")],
  [C("#d6352f"), C("#f2c200")],
];

/**
 * How each kind of stall is laid out.
 *   paints  the colours of the goods
 *   show    what stands on the table (see the functions below)
 *   hang    colours of things hung on a rail behind the seller, if any
 */
type Layout = { paints: RGB[]; show: "piles" | "basins" | "shelf" | "stacks" | "sacks" | "logs" | "grill" | "board" | "folded"; hang?: RGB[]; tall?: number };

const LAYOUTS: Record<string, Layout> = {
  okrika: { paints: ["#2f6fd6", "#d64545", "#ede6d6", "#3a3d42", "#2a9d8f", "#c79a2b"].map(C), show: "piles", tall: 0.34,
            hang: ["#2f6fd6", "#ede6d6", "#d64545", "#3a3d42", "#c79a2b", "#2a9d8f", "#d63f8c"].map(C) },
  food: { paints: ["#e88a2b", "#c79a2b", "#8a4a32", "#f2c200"].map(C), show: "grill" },
  fabric: { paints: ["#d63f8c", "#6a4fe0", "#2a9d8f", "#d64545", "#c79a2b", "#2f6fd6", "#f2c200"].map(C), show: "folded",
            hang: ["#d63f8c", "#2f6fd6", "#c79a2b", "#2a9d8f"].map(C) },
  beads: { paints: ["#c0392b", "#e0563f", "#f2efe6", "#c79a2b"].map(C), show: "board" },
  electronics: { paints: ["#1d1d1f", "#3a3d42", "#ede6d6", "#2f6fd6", "#d64545"].map(C), show: "board" },
  bushmeat: { paints: ["#5b3a26", "#6d4a3a", "#3f2a1c"].map(C), show: "piles", tall: 0.18,
              hang: ["#4a2f1f", "#5b3a26", "#3f2a1c"].map(C) },
  provisions: { paints: ["#c9a36a", "#d64545", "#f2c200", "#ede6d6", "#2f9e54", "#2f6fd6"].map(C), show: "shelf" },
  pepper: { paints: ["#d6281f", "#e0452b", "#e88a2b", "#3f8a3a", "#b81f1a"].map(C), show: "basins" },
  yam: { paints: ["#7a5a3c", "#8a6a4a", "#6b4a33"].map(C), show: "logs" },
  fish: { paints: ["#aab4ba", "#8a949a", "#6d4a3a", "#c9d2d6"].map(C), show: "basins" },
  grains: { paints: ["#f1efe9", "#e6d9a8", "#8a5a3c", "#c79a2b", "#d9c9a0"].map(C), show: "sacks" },
  shoes: { paints: ["#1d1d1f", "#6b4226", "#f1efe9", "#b23a2f", "#2f4a6b"].map(C), show: "shelf",
           hang: ["#6b4226", "#1d1d1f", "#b23a2f", "#c79a2b"].map(C) },
  cosmetics: { paints: ["#d63f8c", "#f1efe9", "#6a4fe0", "#f2c200", "#2a9d8f"].map(C), show: "shelf" },
  plastics: { paints: ["#2f6fd6", "#d6352f", "#2f9e54", "#f2c200", "#d63f8c", "#e88a2b"].map(C), show: "stacks" },
  meat: { paints: ["#9a2a25", "#b23a2f", "#7a1f1c", "#c9605a"].map(C), show: "piles", tall: 0.14,
          hang: ["#9a2a25", "#7a1f1c", "#b23a2f"].map(C) },
  fruits: { paints: ["#e88a2b", "#f2c200", "#3f8a3a", "#d6352f", "#c79a2b"].map(C), show: "basins" },
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

// ---- sizes, shared with collision and with the traffic -----------------------

const TABLE = { halfLong: 0.95, halfWide: 0.45, top: 0.8 };
const POLE_HALF = 0.11;
const POLE_HEIGHT = 7.4;

/** Vehicle kinds: 0 yellow bus, 1 keke, 2 car, 3 the long city bus. Half length and half width in metres. */
export const VEHICLE_SIZES = [
  { halfLong: 2.3, halfWide: 0.95 },
  { halfLong: 1.25, halfWide: 0.62 },
  { halfLong: 2.05, halfWide: 0.88 },
  { halfLong: 4.9, halfWide: 1.2 },
];

/** Everything here that a player cannot walk through: centre x, centre z, half length, half width, angle. */
export function propSolids(district: DistrictData): number[][] {
  const solids: number[][] = [];
  const stalls = district.stalls ?? [];
  for (let i = 0; i + 3 < stalls.length; i += 4) {
    solids.push([stalls[i], stalls[i + 1], TABLE.halfLong, TABLE.halfWide, stalls[i + 2]]);
  }
  const vehicles = district.vehicles ?? [];
  for (let i = 0; i + 3 < vehicles.length; i += 4) {
    const size = VEHICLE_SIZES[vehicles[i + 3]] ?? VEHICLE_SIZES[0];
    solids.push([vehicles[i], vehicles[i + 1], size.halfLong, size.halfWide, vehicles[i + 2]]);
  }
  for (const wire of district.wires ?? []) {
    for (let i = 0; i + 1 < wire.length; i += 2) solids.push([wire[i], wire[i + 1], 0.16, 0.16, 0]);
  }
  return solids;
}

// ---- building blocks -------------------------------------------------------

/**
 * Puts boxes down relative to a thing's own middle and facing. "Along" runs down its
 * length. "Across" runs from the front (negative) to the back (positive): for a stall the
 * customers stand at the front and the seller at the back.
 */
function placer(builder: MeshBuilder, x: number, z: number, angle: number) {
  const ux = Math.cos(angle), uz = Math.sin(angle);
  const at = (along: number, across: number): [number, number] => [x + along * ux - across * uz, z + along * uz + across * ux];
  return {
    at,
    /** A box: how far along and across from the middle, half sizes, bottom, top. */
    box(along: number, across: number, halfLong: number, halfWide: number, bottom: number, top: number, color: RGB) {
      const [cx, cz] = at(along, across);
      builder.box(cx, cz, halfLong, halfWide, bottom, top, color, angle);
    },
    corner(along: number, across: number, y: number): Vec3 {
      const [cx, cz] = at(along, across);
      return [cx, y, cz];
    },
  };
}

type Put = ReturnType<typeof placer>;
const TOP = TABLE.top;

// ---- what is laid out on a stall ---------------------------------------------

function showPiles(put: Put, layout: Layout, seed: number): void {
  const piles = 3 + Math.floor(hash(seed) * 2);
  const tall = layout.tall ?? 0.22;
  for (let i = 0; i < piles; i++) {
    const along = -0.72 + (1.44 * (i + 0.5)) / piles;
    const height = tall * (0.6 + hash(seed + i * 13) * 0.8);
    put.box(along, (hash(seed + i * 7) - 0.5) * 0.2, 0.62 / piles + 0.05, 0.22 + hash(seed + i * 5) * 0.12, TOP, TOP + height,
      layout.paints[(seed + i * 3) % layout.paints.length]);
  }
}

/** Enamel basins heaped with tomatoes, pepper, fish or oranges. */
function showBasins(put: Put, layout: Layout, seed: number): void {
  for (let i = 0; i < 3; i++) {
    const along = -0.62 + i * 0.62;
    const paint = layout.paints[(seed + i * 2) % layout.paints.length];
    put.box(along, 0, 0.27, 0.3, TOP, TOP + 0.1, i === 1 ? shade(ENAMEL, 0.8) : ENAMEL);
    put.box(along, 0, 0.21, 0.24, TOP + 0.1, TOP + 0.2, paint);
    put.box(along, 0, 0.12, 0.14, TOP + 0.2, TOP + 0.28, shade(paint, 1.12));
  }
}

/** Two steps of shelf with small packets, tins or shoes lined up on them. */
function showShelf(put: Put, layout: Layout, seed: number): void {
  put.box(0, 0.12, 0.88, 0.3, TOP, TOP + 0.16, DARK_WOOD);
  put.box(0, 0.26, 0.88, 0.16, TOP + 0.16, TOP + 0.34, DARK_WOOD);
  for (let i = 0; i < 4; i++) {
    const along = -0.66 + i * 0.44;
    put.box(along, -0.24, 0.15, 0.1, TOP, TOP + 0.13, layout.paints[(seed + i) % layout.paints.length]);
    put.box(along + 0.05, -0.02, 0.14, 0.09, TOP + 0.16, TOP + 0.3, layout.paints[(seed + i * 2 + 1) % layout.paints.length]);
    if (i % 2 === 0) put.box(along + 0.2, 0.26, 0.16, 0.1, TOP + 0.34, TOP + 0.5, layout.paints[(seed + i + 3) % layout.paints.length]);
  }
}

/** Buckets and basins stacked inside each other, higher than the seller's head. */
function showStacks(put: Put, layout: Layout, seed: number): void {
  for (let i = 0; i < 4; i++) {
    const along = -0.68 + i * 0.45;
    const height = 0.35 + hash(seed + i * 11) * 0.55;
    put.box(along, 0.05, 0.19, 0.2, TOP, TOP + height * 0.55, layout.paints[(seed + i) % layout.paints.length]);
    put.box(along, 0.05, 0.16, 0.17, TOP + height * 0.55, TOP + height, layout.paints[(seed + i * 2 + 2) % layout.paints.length]);
  }
}

/** Open sacks of rice, garri and beans, each with a measuring tin. */
function showSacks(put: Put, layout: Layout, seed: number): void {
  for (let i = 0; i < 3; i++) {
    const along = -0.6 + i * 0.6;
    put.box(along, 0, 0.26, 0.3, TOP, TOP + 0.3, SACK);
    put.box(along, 0, 0.22, 0.26, TOP + 0.3, TOP + 0.36, layout.paints[(seed + i) % layout.paints.length]);
  }
  put.box(-0.3, -0.05, 0.06, 0.06, TOP + 0.36, TOP + 0.46, CHROME);
}

/** Yam tubers laid in a pile, and a bunch of plantain. */
function showLogs(put: Put, layout: Layout, seed: number): void {
  for (let i = 0; i < 4; i++) {
    put.box(-0.35, -0.27 + i * 0.18, 0.5, 0.075, TOP, TOP + 0.13, layout.paints[(seed + i) % layout.paints.length]);
  }
  for (let i = 0; i < 3; i++) {
    put.box(-0.35, -0.18 + i * 0.18, 0.46, 0.075, TOP + 0.13, TOP + 0.26, layout.paints[(seed + i + 1) % layout.paints.length]);
  }
  put.box(0.55, 0, 0.22, 0.3, TOP, TOP + 0.2, C("#6f9a3a"));
  put.box(0.55, 0, 0.16, 0.22, TOP + 0.2, TOP + 0.32, C("#d9c23a"));
}

/** A charcoal grill with bole and fish on it, and a cooler beside it. */
function showGrill(put: Put, layout: Layout, seed: number): void {
  put.box(-0.4, 0, 0.42, 0.3, TOP, TOP + 0.16, CHARCOAL);
  put.box(-0.4, 0, 0.38, 0.26, TOP + 0.16, TOP + 0.18, EMBER);
  for (let i = 0; i < 3; i++) {
    put.box(-0.66 + i * 0.26, 0, 0.09, 0.2, TOP + 0.18, TOP + 0.25, layout.paints[(seed + i) % layout.paints.length]);
  }
  put.box(0.45, 0.05, 0.28, 0.24, TOP, TOP + 0.34, hash(seed) < 0.5 ? C("#2f6fd6") : C("#d6352f"));
  put.box(0.45, 0.05, 0.29, 0.25, TOP + 0.34, TOP + 0.38, WHITE);
}

/** An upright board with small things pinned to it: beads, chargers, earpieces. */
function showBoard(put: Put, layout: Layout, seed: number): void {
  put.box(0, 0.36, 0.86, 0.03, TOP, TOP + 0.95, shade(layout.paints[0], 0.35));
  for (let i = 0; i < 6; i++) {
    const along = -0.66 + (i % 3) * 0.66;
    const height = TOP + 0.18 + Math.floor(i / 3) * 0.4;
    put.box(along, 0.31, 0.16, 0.03, height, height + 0.26, layout.paints[(seed + i) % layout.paints.length]);
  }
  for (let i = 0; i < 3; i++) {
    put.box(-0.6 + i * 0.6, -0.12, 0.2, 0.18, TOP, TOP + 0.07, layout.paints[(seed + i + 2) % layout.paints.length]);
  }
}

/** Cloth folded and stacked, a different print in every layer. */
function showFolded(put: Put, layout: Layout, seed: number): void {
  for (let i = 0; i < 3; i++) {
    const along = -0.62 + i * 0.62;
    const layers = 2 + Math.floor(hash(seed + i * 17) * 2);
    for (let layer = 0; layer < layers; layer++) {
      put.box(along, 0, 0.26, 0.32, TOP + layer * 0.09, TOP + layer * 0.09 + 0.085,
        layout.paints[(seed + i * 3 + layer * 2) % layout.paints.length]);
    }
  }
}

/** A rail behind the seller with clothes, bags or meat hanging from it. */
function hangRail(put: Put, paints: RGB[], seed: number, wide: boolean): void {
  put.box(-0.92, 0.95, 0.03, 0.03, 0, 2.05, DARK_WOOD);
  put.box(0.92, 0.95, 0.03, 0.03, 0, 2.05, DARK_WOOD);
  put.box(0, 0.95, 0.95, 0.025, 2.0, 2.05, DARK_WOOD);
  const count = wide ? 3 : 5;
  for (let i = 0; i < count; i++) {
    const along = -0.74 + (1.48 * (i + 0.5)) / count;
    const drop = wide ? 0.95 : 0.55 + hash(seed + i * 9) * 0.3;
    put.box(along, 0.95, wide ? 0.22 : 0.12, 0.03, 2.0 - drop, 1.98, paints[(seed + i * 2) % paints.length]);
  }
}

// ---- a whole stall -----------------------------------------------------------

function stall(builder: MeshBuilder, x: number, z: number, angle: number, goods: number, seed: number, covered: boolean): void {
  const put = placer(builder, x, z, angle);
  const kind = GOODS[goods] ?? "provisions";
  const layout = LAYOUTS[kind];

  // The table: a top on a cloth skirt, which is how most market tables are dressed.
  put.box(0, 0, TABLE.halfLong, TABLE.halfWide, TOP - 0.06, TOP, WOOD);
  put.box(0, 0, TABLE.halfLong - 0.05, TABLE.halfWide - 0.05, 0, TOP - 0.06, shade(layout.paints[seed % layout.paints.length], 0.5));

  switch (layout.show) {
    case "basins": showBasins(put, layout, seed); break;
    case "shelf": showShelf(put, layout, seed); break;
    case "stacks": showStacks(put, layout, seed); break;
    case "sacks": showSacks(put, layout, seed); break;
    case "logs": showLogs(put, layout, seed); break;
    case "grill": showGrill(put, layout, seed); break;
    case "board": showBoard(put, layout, seed); break;
    case "folded": showFolded(put, layout, seed); break;
    default: showPiles(put, layout, seed);
  }
  if (layout.hang && hash(seed + 41) < 0.8) hangRail(put, layout.hang, seed, kind === "fabric");

  // Shade. Along the road most traders have an umbrella. Inside the market it is a mix of
  // umbrellas, zinc and tarpaulin, and some tables stand in the open. A shade only covers
  // the seller's half of the stall: the aisle stays open, so the player can always be seen.
  const roll = hash(seed + 99);
  if (roll < (covered ? 0.38 : 0.68)) {
    const [a, b] = UMBRELLAS[seed % UMBRELLAS.length];
    const [px, pz] = put.at(hash(seed + 5) * 0.6 - 0.3, 0.75);
    const tall = 2.55 + hash(seed + 7) * 0.35;
    builder.box(px, pz, 0.03, 0.03, 0, tall, DARK_WOOD);
    const top: Vec3 = [px, tall + 0.08, pz];
    const tilt = hash(seed + 6) * 6.283;
    for (let i = 0; i < 8; i++) {
      const from = tilt + (i / 8) * Math.PI * 2, to = tilt + ((i + 1) / 8) * Math.PI * 2;
      builder.sheet(
        [top, [px + Math.cos(from) * 1.4, tall - 0.4, pz + Math.sin(from) * 1.4], [px + Math.cos(to) * 1.4, tall - 0.4, pz + Math.sin(to) * 1.4]],
        i % 2 ? a : b,
        [0, 1, 0],
      );
    }
  } else if (!covered || roll < 0.8) {
    // A shade on four posts, patched from whatever sheet was to hand.
    const roof = SHEDS[Math.floor(hash(seed + 3) * SHEDS.length) % SHEDS.length];
    const posts: [number, number, number][] = [[-1.4, 0.05, 2.7], [1.4, 0.05, 2.7], [-1.4, 1.45, 2.4], [1.4, 1.45, 2.4]];
    for (const [along, across, tall] of posts) put.box(along, across, 0.035, 0.035, 0, tall, DARK_WOOD);
    builder.sheet([put.corner(-1.55, -0.1, 2.75), put.corner(1.55, -0.1, 2.75), put.corner(1.55, 1.6, 2.38), put.corner(-1.55, 1.6, 2.38)],
      shade(roof, 0.85 + hash(seed + 8) * 0.3), [0, 1, 0]);
  }
}

// ---- vehicles ----------------------------------------------------------------

/**
 * One vehicle, as boxes. `paint` replaces the body colour: pass white for a shape that
 * will be tinted afterwards, one colour per vehicle.
 */
function vehicle(builder: MeshBuilder, x: number, z: number, angle: number, kind: number, seed: number, paint?: RGB): void {
  const put = placer(builder, x, z, angle);
  const wheels = (along: number, across: number, radius: number) => {
    for (const a of [-along, along]) for (const c of [-across, across]) put.box(a, c, radius, 0.1, 0, radius * 2, TYRE);
  };

  if (kind === 0) {
    // The yellow bus: a tall box with a band of windows and a red stripe.
    const body = paint ?? BUS;
    put.box(0, 0, 2.3, 0.95, 0.35, 2.1, body);
    put.box(0.1, 0, 2.05, 0.96, 1.25, 1.8, GLASS);
    put.box(0, 0, 2.31, 0.955, 0.85, 0.98, BUS_STRIPE);
    put.box(0, 0, 2.2, 0.9, 2.1, 2.16, shade(body, 0.85));
    put.box(2.31, 0.6, 0.02, 0.18, 0.7, 0.9, LAMP);
    put.box(2.31, -0.6, 0.02, 0.18, 0.7, 0.9, LAMP);
    wheels(1.45, 0.88, 0.36);
  } else if (kind === 1) {
    // A keke: one wheel in front, two behind, a cabin with open sides.
    const body = paint ?? BUS;
    // Red below, a yellow canopy on top.
    const lower = paint ?? KEKE_RED;
    put.box(-0.2, 0, 1.0, 0.62, 0.3, 1.0, lower);
    put.box(-0.25, 0, 0.95, 0.6, 1.0, 1.55, GLASS);
    put.box(-0.2, 0, 1.05, 0.64, 1.55, 1.65, body);
    put.box(0.95, 0, 0.3, 0.3, 0.3, 0.95, lower);
    put.box(1.05, 0, 0.22, 0.08, 0, 0.44, TYRE);
    for (const c of [-0.6, 0.6]) put.box(-0.85, c, 0.22, 0.08, 0, 0.44, TYRE);
  } else if (kind === 3) {
    // The long city bus, red with a yellow band.
    const body = paint ?? CITY_BUS;
    put.box(0, 0, 4.9, 1.2, 0.4, 2.9, body);
    put.box(0, 0, 4.91, 1.205, 1.0, 1.35, CITY_BUS_BAND);
    put.box(0.1, 0, 4.6, 1.21, 1.6, 2.4, GLASS);
    put.box(0, 0, 4.7, 1.1, 2.9, 3.0, WHITE);
    put.box(4.91, 0.8, 0.02, 0.2, 0.8, 1.0, LAMP);
    put.box(4.91, -0.8, 0.02, 0.2, 0.8, 1.0, LAMP);
    for (const a of [-3.2, 3.2]) for (const c of [-1.12, 1.12]) put.box(a, c, 0.46, 0.12, 0, 0.92, TYRE);
  } else {
    const body = paint ?? CAR_PAINTS[seed % CAR_PAINTS.length];
    put.box(0, 0, 2.05, 0.88, 0.3, 0.95, body);
    put.box(-0.15, 0, 1.1, 0.8, 0.95, 1.45, GLASS);
    put.box(-0.15, 0, 1.05, 0.78, 1.45, 1.5, body);
    put.box(2.06, 0.6, 0.02, 0.16, 0.6, 0.78, LAMP);
    put.box(2.06, -0.6, 0.02, 0.16, 0.6, 0.78, LAMP);
    wheels(1.3, 0.82, 0.32);
  }
}

/**
 * The shape of one moving vehicle, standing at (0, 0) and pointing along +x.
 * Cars are built white so each one can be given its own paint.
 */
export function buildVehicleShape(kind: number): MeshData {
  const builder = new MeshBuilder();
  vehicle(builder, 0, 0, 0, kind, 0, kind === 2 ? WHITE : undefined);
  return builder.build();
}

/** Paint for moving cars: red, green and blue from 0 to 1, repeated. */
export const CAR_TINTS: number[] = CAR_PAINTS.flatMap((paint) => [paint.r / WHITE.r, paint.g / WHITE.g, paint.b / WHITE.b]);

// ---- the crowd ---------------------------------------------------------------

/** Where the parts of a person join, in metres, for someone 1.72 m tall. */
export const PERSON = { hip: 0.86, shoulder: 1.4, crown: 1.74, legGap: 0.095, armGap: 0.245 };

export type PersonShapes = {
  /** Chest and hips: tinted with the colour of the top. */
  body: MeshData;
  /** Head and hair: tinted with the skin tone. */
  head: MeshData;
  /** One leg, hanging down from (0, 0, 0): it swings from the hip. */
  leg: MeshData;
  /** One arm, hanging down from (0, 0, 0): it swings from the shoulder. */
  arm: MeshData;
  /** A basin of goods, carried on the head. Sits on (0, 0, 0). */
  load: MeshData;
};

/**
 * A person made of five boxes, drawn hundreds of times over for the crowd. Every part is
 * white or grey so the game can tint each person their own colours. A person faces +z.
 */
export function buildPersonShapes(): PersonShapes {
  const white: RGB = { r: 1, g: 1, b: 1 };
  const part = (build: (builder: MeshBuilder) => void): MeshData => {
    const builder = new MeshBuilder();
    build(builder);
    return builder.build();
  };
  return {
    body: part((b) => {
      b.box(0, 0, 0.19, 0.115, PERSON.hip - 0.04, PERSON.shoulder + 0.02, white);
    }),
    head: part((b) => {
      b.box(0, 0, 0.06, 0.06, PERSON.shoulder + 0.02, 1.48, white);
      b.box(0, 0.005, 0.105, 0.115, 1.48, 1.7, white);
      b.box(0, -0.01, 0.11, 0.12, 1.66, PERSON.crown, { r: 0.07, g: 0.06, b: 0.06 });
    }),
    leg: part((b) => {
      b.box(0, 0, 0.078, 0.088, -PERSON.hip, 0, white);
      b.box(0, 0.035, 0.08, 0.125, -PERSON.hip, -PERSON.hip + 0.07, { r: 0.12, g: 0.1, b: 0.1 });
    }),
    arm: part((b) => {
      b.box(0, 0, 0.05, 0.055, -0.58, 0, white);
    }),
    load: part((b) => {
      b.box(0, 0, 0.27, 0.27, 0, 0.11, { r: 0.8, g: 0.82, b: 0.84 });
      b.box(0, 0, 0.21, 0.21, 0.11, 0.26, white);
    }),
  };
}

// ---- flat ground ------------------------------------------------------------

function flatPolygon(builder: MeshBuilder, ring: number[], y: number, color: RGB): void {
  // triangulate() wants outlines running one way round; turn this one if it runs the other.
  let area = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    area += ring[i] * ring[j + 1] - ring[j] * ring[i + 1];
  }
  let points = ring;
  if (area < 0) {
    points = [];
    for (let i = ring.length - 2; i >= 0; i -= 2) points.push(ring[i], ring[i + 1]);
  }
  const triangles = triangulate(points);
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * 2, b = triangles[i + 1] * 2, c = triangles[i + 2] * 2;
    builder.face(
      [[points[a], y, points[a + 1]], [points[b], y, points[b + 1]], [points[c], y, points[c + 1]]],
      color,
      [0, 1, 0],
    );
  }
}

function insideRing(x: number, z: number, ring: number[]): boolean {
  let inside = false;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    const az = ring[i + 1], bz = ring[j + 1];
    if (az > z !== bz > z && x < ((ring[j] - ring[i]) * (z - az)) / (bz - az) + ring[i]) inside = !inside;
  }
  return inside;
}

// ---- everything on a district's streets ---------------------------------------

export type StreetMeshes = {
  /** Stalls, poles, wires and parked vehicles. */
  props: MeshData;
  /** The ground of markets and parks, lying flat under everything else. */
  pads: MeshData;
};

export function buildStreetProps(district: DistrictData): StreetMeshes {
  const props = new MeshBuilder();
  const pads = new MeshBuilder();

  const markets: number[][] = [];
  for (const area of district.areas) {
    if (area.p.length < 6) continue;
    if (area.t === "market") {
      flatPolygon(pads, area.p, 0.012, MARKET_GROUND);
      markets.push(area.p);
    } else if (area.t === "park") {
      flatPolygon(pads, area.p, 0.012, PARK_GRASS);
    } else if (area.t === "water") {
      flatPolygon(pads, area.p, 0.014, WATER);
    }
  }

  const stalls = district.stalls ?? [];
  for (let i = 0; i + 3 < stalls.length; i += 4) {
    const covered = markets.some((ring) => insideRing(stalls[i], stalls[i + 1], ring));
    stall(props, stalls[i], stalls[i + 1], stalls[i + 2], stalls[i + 3], i, covered);
  }

  const vehicles = district.vehicles ?? [];
  for (let i = 0; i + 3 < vehicles.length; i += 4) {
    vehicle(props, vehicles[i], vehicles[i + 1], vehicles[i + 2], vehicles[i + 3], i);
  }

  // Poles with a crossarm, and two wires from each pole to the next one down the street.
  for (const wire of district.wires ?? []) {
    for (let i = 0; i + 1 < wire.length; i += 2) {
      const x = wire[i], z = wire[i + 1];
      const hasNext = i + 3 < wire.length;
      const hasPrevious = i >= 2;
      const dx = hasNext ? wire[i + 2] - x : hasPrevious ? x - wire[i - 2] : 1;
      const dz = hasNext ? wire[i + 3] - z : hasPrevious ? z - wire[i - 1] : 0;
      const along = Math.atan2(dz, dx);

      props.box(x, z, POLE_HALF, POLE_HALF, 0, POLE_HEIGHT, POLE);
      props.box(x, z, 0.06, 0.8, POLE_HEIGHT - 0.5, POLE_HEIGHT - 0.38, POLE, along);

      if (hasNext) {
        const length = Math.hypot(dx, dz);
        const sideX = (-dz / length) * 0.7, sideZ = (dx / length) * 0.7;
        for (const side of [-1, 1]) {
          props.box(x + dx / 2 + sideX * side, z + dz / 2 + sideZ * side, length / 2, 0.015,
            POLE_HEIGHT - 0.4, POLE_HEIGHT - 0.37, WIRE, along);
        }
      }
    }
  }

  return { props: props.build(), pads: pads.build() };
}
