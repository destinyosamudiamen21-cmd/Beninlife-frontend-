// The offices on Boundary Road, GRA, where the office jobs are (career_service.py): Oba Trust
// Bank, a stone-and-green-glass bank with a columned front, flags and an ATM gallery, and Edo
// Tech Hub, a dark glass box with lime light running up it, a floor hanging out over the
// street, and a mural down its side. The map has a plain box where each stands
// (tools/make_town.py); these are drawn over them, a hand's breadth bigger. Plain data.

import type { PalmCourtParts } from "./palmCourtShapes";

export const BANK = { x: 99, z: -16.3, hx: 12, hz: 9, height: 18 };
export const HUB = { x: -22, z: -17.3, hx: 12, hz: 10, height: 12 };
const SKIN = 0.15;

const STONE = "#efe8da", STONE_DARK = "#d8cfbd", GREEN = "#0f5d3a", GREEN_GLASS = "#163a2c", GOLD = "#c9a24e", WARM = "#ffe2a6";
const HUB_GLASS = "#1b2531", HUB_FRAME = "#2b2f36", LIME = "#9dff5c", WHITE = "#f4f4f2";

function bank(out: PalmCourtParts): void {
  const { x, z, hx, hz, height } = BANK;
  const front = z + hz + SKIN;   // the face towards Boundary Road
  out.solid.push([x, z, hx + SKIN, hz + SKIN, 0, height + 0.3, STONE]);
  out.solid.push([x, front + 0.12, hx + 0.3, 0.15, 0, 1.2, STONE_DARK]);                 // the plinth
  // The banking hall behind tall green glass, and a band of glass on every floor above.
  out.glass.push([x, front + 0.03, hx - 1.0, 0.05, 1.2, 5.6, GREEN_GLASS]);
  for (const lx of [-8, -3, 3, 8]) out.glow.push([x + lx, front + 0.07, 1.3, 0.02, 4.4, 4.7, WARM]);
  for (let floor = 2; floor < height / 3; floor++) {
    const y = floor * 3;
    out.glass.push([x, front + 0.02, hx - 0.6, 0.05, y + 0.5, y + 2.5, GREEN_GLASS]);
    out.glass.push([x - hx - SKIN - 0.02, z, 0.05, hz - 0.6, y + 0.5, y + 2.5, GREEN_GLASS]);
    out.glass.push([x + hx + SKIN + 0.02, z, 0.05, hz - 0.6, y + 0.5, y + 2.5, GREEN_GLASS]);
    for (let k = 0; k < 7; k++) if (((floor * 5 + k * 3) % 4) === 0) out.glow.push([x - hx + 2 + k * 3.3, front + 0.06, 1.0, 0.02, y + 0.8, y + 2.1, WARM]);
  }
  // The columned front: four columns either side of the door, a beam on top with the name.
  for (const lx of [-10.5, -6.5, 6.5, 10.5]) {
    out.solid.push([x + lx, front + 1.6, 0.42, 0.42, 0, 8.6, STONE], [x + lx, front + 1.6, 0.6, 0.6, 0, 0.4, STONE_DARK], [x + lx, front + 1.6, 0.6, 0.6, 8.4, 8.8, STONE_DARK]);
  }
  out.solid.push([x, front + 1.4, hx + 0.4, 1.4, 8.8, 10.0, STONE], [x, front + 2.82, hx + 0.4, 0.04, 8.9, 9.9, GREEN]);
  out.glow.push([x, front + 1.4, hx, 1.3, 8.74, 8.8, WARM]);
  out.glow.push([x, front + 2.87, hx, 0.02, 8.86, 8.9, GOLD]);
  // Revolving doors in bronze, the green carpet, and the ATM gallery to the right.
  out.glass.push([x, front + 0.09, 1.8, 0.05, 0, 3.2, "#3a4a44"]);
  out.solid.push([x, front + 0.12, 2.0, 0.06, 3.2, 3.5, GOLD], [x - 1.9, front + 0.12, 0.08, 0.06, 0, 3.2, GOLD], [x + 1.9, front + 0.12, 0.08, 0.06, 0, 3.2, GOLD]);
  out.solid.push([x, front + 1.3, 1.1, 1.1, 0, 0.03, GREEN]);
  for (const lx of [-9.2, -7.8]) {
    out.solid.push([x + lx, front + 0.25, 0.5, 0.25, 0, 1.7, "#2a2d31"]);
    out.glow.push([x + lx, front + 0.52, 0.3, 0.02, 1.1, 1.45, "#7fd1ff"]);
  }
  out.glow.push([x - 8.5, front + 0.3, 1.4, 0.03, 1.9, 2.15, GREEN]);
  // Two flagpoles: Nigeria's flag, green, white, green.
  for (const lx of [-hx - 0.8, hx + 0.8]) {
    const fx = x + lx, fz = front + 3.4;
    out.solid.push([fx, fz, 0.06, 0.06, 0, 9.5, "#c9ccd0"], [fx, fz, 0.25, 0.25, 0, 0.3, STONE_DARK]);
    out.solid.push([fx + 0.55, fz, 0.35, 0.02, 8.2, 9.3, "#118a3f"], [fx + 1.25, fz, 0.35, 0.02, 8.2, 9.3, "#ffffff"], [fx + 1.95, fz, 0.35, 0.02, 8.2, 9.3, "#118a3f"]);
  }
  // A green crown light round the roof.
  out.glow.push([x, front - 0.05, hx + 0.1, 0.02, height + 0.05, height + 0.25, "#3ad07a"]);
  out.signs.push({ text: "OBA TRUST BANK", x, y: 9.4, z: front + 2.9, width: 14, height: 0.9, colour: GOLD, back: GREEN });
  out.signs.push({ text: "Now hiring · Apply at reception", x, y: 6.3, z: front + 0.1, width: 7, height: 0.5, colour: "#ffffff", back: GREEN });
}

function hub(out: PalmCourtParts): void {
  const { x, z, hx, hz, height } = HUB;
  const front = z + hz + SKIN;
  out.solid.push([x, z, hx + SKIN, hz + SKIN, 0, height - 3 + 0.2, HUB_FRAME]);
  // Dark glass all round the lower floors, framed by thin mullions.
  out.glass.push([x, front + 0.03, hx - 0.3, 0.05, 0.1, height - 3.2, HUB_GLASS]);
  out.glass.push([x - hx - SKIN - 0.02, z, 0.05, hz - 0.3, 0.1, height - 3.2, HUB_GLASS]);
  out.glass.push([x + hx + SKIN + 0.02, z, 0.05, hz - 0.3, 0.1, height - 3.2, HUB_GLASS]);
  for (let k = 0; k <= 12; k++) out.solid.push([x - hx + k * 2, front + 0.1, 0.05, 0.08, 0, height - 3, "#3a3f47"]);
  for (let floor = 1; floor < 3; floor++) out.solid.push([x, front + 0.12, hx + 0.1, 0.1, floor * 3 - 0.1, floor * 3 + 0.1, "#3a3f47"]);
  // People at their desks, seen through the glass: screens glowing.
  for (let floor = 0; floor < 3; floor++) {
    for (let k = 0; k < 8; k++) if (((floor * 3 + k * 5) % 3) !== 0) out.glow.push([x - hx + 2 + k * 2.9, front + 0.07, 0.45, 0.02, floor * 3 + 1.1, floor * 3 + 1.5, k % 2 ? "#8fd3ff" : "#c9f7a8"]);
  }
  // The top floor hangs out over the street: white, with a lime light along its underside.
  out.solid.push([x + 2, z + 1.2, hx + 2, hz + 1.4, height - 3, height + 0.2, WHITE]);
  const overhang = front + 2.45;   // the top floor's face, out over the pavement
  out.glass.push([x + 2, overhang + 0.03, hx + 1.6, 0.05, height - 2.6, height - 0.6, HUB_GLASS]);
  out.glow.push([x + 2, overhang + 0.05, hx + 1.9, 0.05, height - 3.12, height - 3.0, LIME]);
  // Lime light running up the front in three stripes, like a circuit.
  for (const [lx, top] of [[-9, 8.5], [-8.4, 6.0], [-7.8, 7.2]] as const) out.glow.push([x + lx, front + 0.14, 0.06, 0.03, 0.4, top, LIME]);
  out.glow.push([x - 8.4, front + 0.14, 0.6, 0.03, 6.0, 6.08, LIME]);
  // The way in: a glass door with a lime frame, a rack of bikes, benches and a mural down the side.
  out.glass.push([x, front + 0.12, 1.6, 0.05, 0, 2.8, "#33404c"]);
  out.glow.push([x, front + 0.16, 1.7, 0.03, 2.8, 2.9, LIME], [x - 1.7, front + 0.16, 0.04, 0.03, 0, 2.9, LIME], [x + 1.7, front + 0.16, 0.04, 0.03, 0, 2.9, LIME]);
  for (let k = 0; k < 5; k++) out.solid.push([x + 5 + k * 0.9, front + 1.2, 0.03, 0.6, 0, 0.75, "#2a2d31"], [x + 5 + k * 0.9, front + 1.2, 0.04, 0.45, 0.35, 0.4, k % 2 ? "#e2603b" : "#2a8cd6"]);
  for (const lx of [-6.5, 9.5]) out.solid.push([x + lx, front + 1.6, 1.2, 0.3, 0.4, 0.5, "#b07a4a"], [x + lx, front + 1.6, 1.1, 0.25, 0, 0.4, "#2a2d31"]);
  const stripes = ["#e2603b", "#f2b134", "#2a8cd6", "#7a3fb0", "#1f9d6a", "#e2603b", "#f2b134"];
  stripes.forEach((colour, k) => out.solid.push([x - hx - SKIN - 0.06, z - hz + 1.4 + k * 2.6, 0.03, 1.2, 0.3, 6.5 - (k % 3) * 0.8, colour]));
  out.signs.push({ text: "EDO TECH HUB", x: x + 2, y: height - 1.6, z: overhang + 0.12, width: 11, height: 1.3, colour: "#ffffff", back: "#00000000" });
  out.signs.push({ text: "We're hiring developers", x, y: 3.3, z: front + 0.2, width: 5.5, height: 0.45, colour: "#0d1117", back: LIME });
}

export function buildOffices(): PalmCourtParts {
  const out: PalmCourtParts = { solid: [], glass: [], railing: [], glow: [], water: [], jets: [], signs: [] };
  bank(out);
  hub(out);
  return out;
}

/** What a player bumps into besides the map's boxes: the bank's columns and flagpoles. */
export const OFFICE_SOLIDS: { x: number; z: number; hx: number; hz: number }[] = [
  ...[-10.5, -6.5, 6.5, 10.5].map((lx) => ({ x: BANK.x + lx, z: BANK.z + BANK.hz + SKIN + 1.6, hx: 0.6, hz: 0.6 })),
  ...[-BANK.hx - 0.8, BANK.hx + 0.8].map((lx) => ({ x: BANK.x + lx, z: BANK.z + BANK.hz + SKIN + 3.4, hx: 0.3, hz: 0.3 })),
];
