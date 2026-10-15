// The Ikpoba Hill flyover, seen from the street: a concrete deck over the Benin–Agbor Road,
// on pillars, with its black and white barriers and its lamps. It is only to look at from
// below: walking up onto it goes through its door, into the flyover itself (venues.ts).

import { MeshBuilder, type MeshData } from "./districtGeometry";
import { hexToLinear } from "./tint";

/** Where the deck is, in the Ikpoba Hill district's metres. */
export const FLYOVER = { from: -150, to: 150, ramp: 45, z0: 1.5, z1: 14.5, height: 7 };

export function buildFlyover(): { solid: MeshData; glow: MeshData } {
  const solid = new MeshBuilder();
  const glow = new MeshBuilder();
  const concrete = hexToLinear("#9a9da2"), under = hexToLinear("#6e7176");
  const black = hexToLinear("#151517"), white = hexToLinear("#f2f2f2");
  const { from, to, ramp, z0, z1, height } = FLYOVER;
  const mid = (z0 + z1) / 2, half = (z1 - z0) / 2;

  // The deck, in slices so the ramps can slope: each slice a little higher than the last.
  const step = 3;
  for (let x = from - ramp; x < to + ramp; x += step) {
    const centre = x + step / 2;
    const climb = centre < from ? (centre - (from - ramp)) / ramp : centre > to ? (to + ramp - centre) / ramp : 1;
    const top = Math.max(0.3, height * climb);
    solid.box(centre, mid, step / 2 + 0.02, half, top - 0.9, top, top > 3 ? under : concrete);
    // The barriers along both edges, in black and white blocks.
    for (const z of [z0 + 0.25, z1 - 0.25]) {
      solid.box(centre - 0.75, z, 0.75, 0.25, top, top + 1.0, Math.floor(x / 1.5) % 2 ? black : white);
      solid.box(centre + 0.75, z, 0.75, 0.25, top, top + 1.0, Math.floor(x / 1.5) % 2 ? white : black);
    }
  }
  // Pillars down to the road, on the kerbs.
  for (let x = from + 10; x < to; x += 30) {
    for (const z of [z0 + 0.8, z1 - 0.8]) solid.box(x, z, 0.8, 0.8, 0, height - 0.9, concrete);
    solid.box(x, mid, 0.9, half, height - 1.6, height - 0.9, under);
  }
  // Lamps on the deck, lit.
  for (let x = from + 6; x < to; x += 24) {
    solid.box(x, mid, 0.1, 0.1, height, height + 6.5, hexToLinear("#3a3d42"));
    solid.box(x, mid, 1.1, 0.08, height + 6.4, height + 6.5, hexToLinear("#3a3d42"));
    glow.box(x - 1.0, mid, 0.3, 0.16, height + 6.25, height + 6.4, hexToLinear("#ffd27a"));
    glow.box(x + 1.0, mid, 0.3, 0.16, height + 6.25, height + 6.4, hexToLinear("#ffd27a"));
  }
  return { solid: solid.build(), glow: glow.build() };
}
