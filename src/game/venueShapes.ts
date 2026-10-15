// The shapes of a room from venues.ts, built in code from boxes: the floor, the walls and
// everything in the room in one mesh, the things that glow in a second, and glass in a third.
// The flyover and the golf course are open to the sky, so they get what lies around them too:
// the city below the bridge, the trees past the fairway.

import type { VenueLayout } from "./venues";
import { MeshBuilder, type MeshData } from "./districtGeometry";
import { hexToLinear, type RGB } from "./tint";

const C = (hex: string) => hexToLinear(hex);

function shade(colour: RGB, amount: number): RGB {
  return { r: colour.r * amount, g: colour.g * amount, b: colour.b * amount };
}

/** A repeatable number from 0 to 1. */
function hash(n: number): number {
  let h = (n | 0) * 374761393 + 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export type VenueMeshes = { solid: MeshData; glow: MeshData; glass: MeshData };

export function buildVenue(layout: VenueLayout): VenueMeshes {
  const solid = new MeshBuilder();
  const glow = new MeshBuilder();
  const glass = new MeshBuilder();
  const { width, depth, wallHeight } = layout;

  // The floor, in two-metre squares.
  const floor = C(layout.floor), floorAlt = C(layout.floorAlt);
  for (let x = 0; x < width; x += 2) {
    for (let z = 0; z < depth; z += 2) {
      const x1 = Math.min(width, x + 2), z1 = Math.min(depth, z + 2);
      solid.box((x + x1) / 2, (z + z1) / 2, (x1 - x) / 2, (z1 - z) / 2, -0.05, 0, ((x + z) / 2) % 2 ? floor : floorAlt);
    }
  }

  if (!layout.open) {
    // Walls on three sides. The camera looks in from the front, so the front wall is only a kerb.
    const wall = C(layout.wall), trim = C(layout.trim), thick = 0.2;
    solid.box(width / 2, -thick / 2, width / 2 + thick, thick / 2, 0, wallHeight, wall);
    solid.box(-thick / 2, depth / 2, thick / 2, depth / 2, 0, wallHeight, shade(wall, 0.9));
    solid.box(width + thick / 2, depth / 2, thick / 2, depth / 2, 0, wallHeight, shade(wall, 0.9));
    solid.box(width / 2, depth + thick / 2, width / 2 + thick, thick / 2, 0, 0.3, shade(wall, 0.8));
    solid.box(width / 2, 0.02, width / 2, 0.02, 0.9, 1.0, trim);
    solid.box(0.02, depth / 2, 0.02, depth / 2, 0.9, 1.0, trim);
    solid.box(width - 0.02, depth / 2, 0.02, depth / 2, 0.9, 1.0, trim);
    // A skirting board along the bottom of each wall.
    solid.box(width / 2, 0.03, width / 2, 0.03, 0, 0.14, shade(trim, 0.6));
    solid.box(0.03, depth / 2, 0.03, depth / 2, 0, 0.14, shade(trim, 0.6));
    solid.box(width - 0.03, depth / 2, 0.03, depth / 2, 0, 0.14, shade(trim, 0.6));
  }

  for (const box of layout.boxes) {
    const colour = C(box.c);
    const target = box.glow ? glow : box.glass ? glass : solid;
    target.box(box.x, box.z, box.hx, box.hz, box.y0, box.y1, colour);
  }

  if (layout.kind === "flyover") cityBelow(solid, glow, width, depth);
  if (layout.kind === "golf") aroundTheCourse(solid, width, depth);
  return { solid: solid.build(), glow: glow.build(), glass: glass.build() };
}

/** Under the flyover: the deck's pillars, the river, and the lights of the city at night. */
function cityBelow(solid: MeshBuilder, glow: MeshBuilder, width: number, depth: number): void {
  const drop = -16;
  const concrete = C("#8d9096");
  // The deck itself has a thickness, and stands on pillars.
  solid.box(width / 2, depth / 2, width / 2, depth / 2, -1.4, -0.05, shade(concrete, 0.8));
  for (let x = 8; x < width; x += 24) solid.box(x, depth / 2, 1.2, 3.2, drop, -1.4, concrete);
  // The valley floor, the river across it, and the road beneath.
  solid.box(width / 2, depth / 2, 260, 260, drop - 0.2, drop, C("#1a1f17"));
  glow.box(width * 0.7, depth / 2, 22, 240, drop, drop + 0.05, C("#0d2a44"));
  glow.box(width / 2, depth / 2 + 30, 200, 4, drop, drop + 0.06, C("#2c2a28"));
  for (let x = -150; x < 300; x += 9) glow.box(x, depth / 2 + 30, 0.25, 0.25, drop + 0.06, drop + 0.4, C(hash(x) > 0.5 ? "#ffcf6a" : "#ff4a3a"));
  // Houses on both sides of the valley, with lit windows.
  for (let i = 0; i < 260; i++) {
    const side = i % 2 ? 1 : -1;
    const x = -140 + hash(i * 3) * 420;
    const z = depth / 2 + side * (18 + hash(i * 7) * 160);
    if (Math.abs(z - depth / 2 - 30) < 8) continue;
    const half = 3 + hash(i * 11) * 5, tall = 3 + Math.floor(hash(i * 13) * 3) * 3;
    const ground = drop + (Math.abs(z - depth / 2) > 60 ? 4 + hash(i * 17) * 8 : 0);  // the hills climb away from the river
    solid.box(x, z, half, half * 0.8, ground, ground + tall, C(["#3a3530", "#2f2c2a", "#45403a", "#38342f"][i % 4]));
    solid.box(x, z, half + 0.3, half * 0.8 + 0.3, ground + tall, ground + tall + 0.4, C(["#5a3a2a", "#4a4a4e", "#6a3a26"][i % 3]));
    for (let w = 0; w < 3; w++) {
      if (hash(i * 31 + w) < 0.45) continue;
      const wx = x - half + (w + 0.5) * ((half * 2) / 3);
      glow.box(wx, z - side * (half * 0.8 + 0.02), 0.4, 0.02, ground + 1.2, ground + 2.1, C(hash(i + w) > 0.3 ? "#ffd27a" : "#9fd3ff"));
    }
  }
}

/** Past the edges of the course: more grass, a line of trees, and GRA's walls beyond. */
function aroundTheCourse(solid: MeshBuilder, width: number, depth: number): void {
  solid.box(width / 2, depth / 2, 180, 180, -0.12, -0.06, C("#3f7d2f"));
  for (let i = 0; i < 90; i++) {
    const angle = (i / 90) * Math.PI * 2;
    const x = width / 2 + Math.cos(angle) * (width * 0.62 + hash(i) * 10);
    const z = depth / 2 + Math.sin(angle) * (depth * 0.75 + hash(i * 5) * 10);
    const tall = 5 + hash(i * 9) * 5;
    solid.box(x, z, 0.35, 0.35, 0, tall * 0.45, C("#5a3a26"));
    solid.box(x, z, 2.2, 2.2, tall * 0.45, tall, C(hash(i * 3) > 0.5 ? "#2e6b2a" : "#3a7d2f"));
  }
}
