/**
 * The shapes of the 3D bus ride (BusRide3D.tsx): the yellow bus, inside and out, and the
 * roadside going by. Plain data, so they can be drawn and checked without the 3D engine.
 */
import { MeshBuilder, type MeshData } from "./districtGeometry";
import { hexToLinear, type RGB } from "./tint";

export const BUS_LENGTH = 6.4;
export const SEGMENT = 60;        // metres of roadside in one piece
/** The player's seat: back row, second from the left (z, from the middle of the bus). */
export const SEAT_Z = BUS_LENGTH / 2 - 1.65 - 3 * 1.15;

type V3 = [number, number, number];


function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A box with all six sides, so it can be seen from inside the bus as well as out. */
function slab(b: MeshBuilder, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, colour: RGB): void {
  const c = (x: number, y: number, z: number): V3 => [x, y, z];
  b.face([c(x0, y1, z0), c(x1, y1, z0), c(x1, y1, z1), c(x0, y1, z1)], colour, [0, 1, 0]);
  b.face([c(x0, y0, z0), c(x1, y0, z0), c(x1, y0, z1), c(x0, y0, z1)], colour, [0, -1, 0]);
  b.face([c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)], colour, [0, 0, 1]);
  b.face([c(x0, y0, z0), c(x1, y0, z0), c(x1, y1, z0), c(x0, y1, z0)], colour, [0, 0, -1]);
  b.face([c(x1, y0, z0), c(x1, y0, z1), c(x1, y1, z1), c(x1, y1, z0)], colour, [1, 0, 0]);
  b.face([c(x0, y0, z0), c(x0, y0, z1), c(x0, y1, z1), c(x0, y1, z0)], colour, [-1, 0, 0]);
}

const YELLOW = hexToLinear("#f2c200");
const BLACK = hexToLinear("#1d1d1f");
const GREY = hexToLinear("#5a5f66");
const SEAT = hexToLinear("#6b2a20");
const FLOOR = hexToLinear("#2b2b30");
const TYRE = hexToLinear("#141416");
const SKINS = ["#a9714b", "#8d5a3b", "#774a2f", "#613a25", "#4b2c1c"].map(hexToLinear);
const CLOTHES = ["#2f6fd6", "#2f9e54", "#d64545", "#e88a2b", "#6a4fe0", "#d63f8c", "#2a9d8f", "#3a3d42", "#ede6d6", "#c79a2b"].map(hexToLinear);

/**
 * The bus, facing +z, wheels on y = 0: a yellow body with black stripes, open windows, the
 * sliding door open on the right (+x, the pavement side), benches and people inside.
 */
export function buildBus(): MeshData {
  const b = new MeshBuilder();
  const w = 1.05, L = BUS_LENGTH / 2, floor = 0.55, sill = 1.35, top = 2.35, t = 0.06;
  slab(b, -w, w, floor - 0.12, floor, -L, L, FLOOR);                           // the floor
  slab(b, -w, w, top, top + 0.08, -L, L, YELLOW);                              // the roof
  slab(b, -w - 0.02, w + 0.02, top + 0.08, top + 0.1, -L, L, BLACK);           // its rim
  // Sides: a panel up to the sill, a stripe at the top, pillars between the windows.
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -w : w - t, x1 = side < 0 ? -w + t : w;
    const doorFrom = 0.4, doorTo = 1.55;                                       // the door, on the right
    for (const [z0, z1] of side > 0 ? [[-L, doorFrom], [doorTo, L]] : [[-L, L]]) {
      slab(b, x0, x1, 0.32, sill, z0, z1, YELLOW);
      slab(b, x0 - side * 0.005, x1 + side * 0.005, 0.95, 1.08, z0, z1, BLACK); // the stripe
    }
    slab(b, x0, x1, top - 0.28, top, -L, L, YELLOW);
    for (let z = -L; z <= L - 0.5; z += 1.1) {
      if (side > 0 && z + 0.07 > doorFrom - 0.1 && z < doorTo) continue;
      slab(b, x0, x1, sill, top - 0.28, z, z + 0.08, GREY);
    }
  }
  // Back and front, the windscreen, the dashboard and the driver.
  slab(b, -w, w, 0.32, top, -L, -L + t, YELLOW);
  slab(b, -w, w, 1.55, 2.0, -L - 0.01, -L + t, BLACK);                         // the back window
  slab(b, -w, w, 0.32, 1.25, L - t, L, YELLOW);
  slab(b, -w, w, 0.32, 0.7, L, L + 0.15, GREY);                                // the bumper
  slab(b, -w, w, 1.0, 1.2, L - 0.55, L - t, BLACK);                            // the dashboard
  for (const x of [-w + 0.05, w - 0.12]) slab(b, x, x + 0.07, 1.25, top, L - t, L, GREY); // windscreen pillars
  for (const side of [-1, 1]) {
    slab(b, side * w * 0.72 - 0.18, side * w * 0.72 + 0.18, 0.55, 0.75, L + 0.15, L + 0.17, hexToLinear("#fff6d0")); // headlamps
  }
  // Wheels.
  for (const z of [-L + 1.0, L - 1.1]) for (const side of [-1, 1]) slab(b, side * w - 0.13, side * w + 0.13, 0, 0.66, z - 0.33, z + 0.33, TYRE);
  // Benches: four rows of seats across, the people on them, and the driver.
  const rnd = random(7);
  for (let row = 0; row < 4; row++) {
    const z = L - 1.65 - row * 1.15;
    slab(b, -w + 0.1, w - 0.1, floor + 0.38, floor + 0.48, z - 0.25, z + 0.2, SEAT);
    slab(b, -w + 0.1, w - 0.1, floor + 0.48, floor + 1.05, z - 0.3, z - 0.22, SEAT);
    for (let seat = 0; seat < 4; seat++) {
      if (row === 3 && seat === 1) continue;            // the player's place: an empty seat
      if (rnd() < 0.15) continue;
      person(b, -w + 0.38 + seat * 0.43, floor + 0.48, z, rnd);
    }
  }
  person(b, -w + 0.45, floor + 0.48, L - 0.85, rnd);   // the driver
  slab(b, -w + 0.3, -w + 0.62, 1.15, 1.2, L - 0.6, L - 0.5, BLACK); // the steering wheel
  // The conductor, standing in the doorway, holding on.
  person(b, w - 0.35, floor, 1.0, rnd, true);
  return b.build();
}

/** Someone sitting (or standing, for the conductor), facing forward. */
function person(b: MeshBuilder, x: number, y: number, z: number, rnd: () => number, standing = false): void {
  const skin = SKINS[Math.floor(rnd() * SKINS.length)];
  const shirt = CLOTHES[Math.floor(rnd() * CLOTHES.length)];
  const legs = standing ? 0.85 : 0.0;
  if (standing) slab(b, x - 0.13, x + 0.13, y, y + legs, z - 0.1, z + 0.1, hexToLinear("#2b2b30"));
  slab(b, x - 0.17, x + 0.17, y + legs, y + legs + 0.6, z - 0.12, z + 0.12, shirt);
  slab(b, x - 0.09, x + 0.09, y + legs + 0.62, y + legs + 0.84, z - 0.09, z + 0.11, skin);
  slab(b, x - 0.1, x + 0.1, y + legs + 0.8, y + legs + 0.88, z - 0.11, z + 0.1, rnd() < 0.3 ? CLOTHES[Math.floor(rnd() * CLOTHES.length)] : hexToLinear("#17120f")); // hair, or a cap
  if (!standing) slab(b, x - 0.15, x + 0.15, y, y + 0.12, z, z + 0.42, hexToLinear("#2b2b30"));
}

/** A stretch of roadside: the road, the kerbs, shops and houses, stalls, trees and poles. */
export function buildRoadside(seed: number): MeshData {
  const b = new MeshBuilder();
  const rnd = random(seed);
  const C = hexToLinear;
  const z0 = 0, z1 = SEGMENT;
  slab(b, -5, 5, -0.05, 0.0, z0, z1, C("#3c3e42"));                            // the road
  for (let z = z0; z < z1; z += 6) slab(b, -0.08, 0.08, 0.0, 0.01, z, z + 3, C("#e9e6da")); // the middle line
  for (const side of [-1, 1]) {
    slab(b, side * 5, side * 5 + side * 0.2, -0.05, 0.15, z0, z1, C("#9a9488"));  // kerb
    slab(b, Math.min(side * 5.2, side * 9), Math.max(side * 5.2, side * 9), -0.05, 0.12, z0, z1, C("#b09a78")); // red earth verge
    slab(b, Math.min(side * 9, side * 60), Math.max(side * 9, side * 60), -0.06, 0.0, z0, z1, C("#7e9a52"));  // grass beyond
    let z = z0 + rnd() * 4;
    while (z < z1 - 4) {
      const width = 5 + rnd() * 8, depth = 6 + rnd() * 8, height = 3 + rnd() * (rnd() < 0.2 ? 9 : 4);
      const x = side * (9.6 + depth / 2 + rnd() * 3);   // set back behind the verge
      const wall = C(["#efe6d2", "#e8d9b8", "#e3c9a3", "#f0d9c0", "#d9e3d0", "#cfd3cc", "#f4efe6"][Math.floor(rnd() * 7)]);
      slab(b, x - depth / 2, x + depth / 2, 0, height, z, z + width, wall);
      slab(b, x - depth / 2 - 0.3, x + depth / 2 + 0.3, height, height + 0.25, z - 0.3, z + width + 0.3,
        C(["#8a3a2a", "#6f7376", "#a4552f", "#5a5f66"][Math.floor(rnd() * 4)]));      // the roof
      // A row of shop shutters and windows on the side facing the road.
      const face = x - side * (depth / 2) - side * 0.02;
      for (let k = 0.6; k < width - 0.8; k += 1.6) slab(b, face - 0.02, face + 0.02, 0.4, Math.min(height - 0.4, 2.4), z + k, z + k + 1.0, C(rnd() < 0.5 ? "#4a5a64" : "#2f3a44"));
      // Now and then a stall with an umbrella at the roadside.
      if (rnd() < 0.45) {
        const sx = side * (6.5 + rnd() * 1.5), sz = z + rnd() * width;
        slab(b, sx - 0.6, sx + 0.6, 0.7, 0.8, sz - 0.4, sz + 0.4, C("#7a5a3c"));
        slab(b, sx - 0.04, sx + 0.04, 0.8, 2.1, sz - 0.04, sz + 0.04, C("#5a5f66"));
        slab(b, sx - 1.0, sx + 1.0, 2.1, 2.2, sz - 1.0, sz + 1.0, C(["#d64545", "#2f6fd6", "#f2c200", "#2f9e54"][Math.floor(rnd() * 4)]));
      }
      z += width + 1 + rnd() * 5;
    }
    // Electric poles and trees.
    for (let p = z0 + 4; p < z1; p += 18) slab(b, side * 5.6 - 0.1, side * 5.6 + 0.1, 0, 7, p, p + 0.2, C("#6b5a46"));
    for (let k = 0; k < 3; k++) {
      const tz = z0 + rnd() * SEGMENT, tx = side * (8 + rnd() * 2);
      slab(b, tx - 0.15, tx + 0.15, 0, 2.4, tz - 0.15, tz + 0.15, C("#5a3d27"));
      slab(b, tx - 1.4, tx + 1.4, 2.2, 4.4, tz - 1.4, tz + 1.4, C(rnd() < 0.5 ? "#3f7a3a" : "#4d8a41"));
    }
  }
  return b.build();
}

