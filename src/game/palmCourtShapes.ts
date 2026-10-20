// Palm Court, on Sapele Link in GRA: the Ivory Palm Hotel and the Palm Court Homes serviced
// apartments beside it. The map has a plain box where each stands (tools/make_town.py: what is
// bumped into and what the map shows); this is what is drawn over each box, a hand's breadth
// bigger so the box is hidden inside.
//
// The hotel is an ivory tower with bronze glass, gold at its crown and a lit canopy over the
// drive-in. The apartments are a long white-and-grey terrace (after the newer estates going up
// round Benin): glass balconies with warm light under every slab, cyan lines between the bays,
// and a pool deck on the roof. Plain data, no 3D imports.

import type { BoxSpec } from "./boxBuilder";

export type PalmCourtParts = {
  solid: BoxSpec[];     // lit by the sun
  glass: BoxSpec[];     // dark and shiny
  railing: BoxSpec[];   // see-through glass
  glow: BoxSpec[];      // gives its own light
  water: BoxSpec[];     // the pools and the fountain
  jets: BoxSpec[];      // fountain jets, which move
  signs: { text: string; x: number; y: number; z: number; width: number; height: number; colour: string; back: string }[];
};

// The boxes on the map (gra.json): centre, half sizes, floors of 3 m.
export const HOTEL = { x: 70, z: 117, hx: 14, hz: 11, height: 24 };
export const HOMES = { x: 170, z: 120, hx: 44, hz: 8, height: 12 };
const SKIN = 0.15;   // how far the drawn walls stand outside the map's box

const IVORY = "#ece5d4", IVORY_DARK = "#d9d0bb", GOLD = "#c9a24e", BRONZE_GLASS = "#253039", WARM = "#ffe2a6";
const WHITE = "#f2f1ec", STONE = "#80838a", STONE_DARK = "#5e6168", GLASS = "#1d242b", CYAN = "#79e6ff", LED = "#fff0d2";

function palm(x: number, z: number, height: number, out: PalmCourtParts): void {
  out.solid.push([x, z, 0.22, 0.22, 0, height, "#8a7a66"], [x, z, 0.3, 0.3, height - 0.4, height, "#6b5b49"]);
  for (let i = 0; i < 7; i++) {
    const turn = (i / 7) * Math.PI * 2;
    out.solid.push([x + Math.sin(turn) * 1.3, z + Math.cos(turn) * 1.3, 0.22, 1.3, height - 0.15 - (i % 2) * 0.25, height + 0.05 - (i % 2) * 0.25, i % 2 ? "#4f8a3f" : "#3f7d3a", turn]);
  }
}

function fountain(x: number, z: number, radius: number, out: PalmCourtParts): void {
  for (let i = 0; i < 12; i++) {
    const turn = (i / 12) * Math.PI * 2;
    out.solid.push([x + Math.sin(turn) * radius, z + Math.cos(turn) * radius, radius * 0.27, 0.2, 0, 0.55, "#e6e1d6", turn]);
  }
  out.water.push([x, z, radius * 0.86, radius * 0.86, 0.02, 0.42, "#4fc9ec", Math.PI / 12]);
  out.solid.push([x, z, 0.35, 0.35, 0, 1.4, "#e6e1d6"], [x, z, 0.8, 0.8, 1.4, 1.55, "#e6e1d6"]);
  for (let i = 0; i < 6; i++) {
    const turn = (i / 6) * Math.PI * 2;
    out.jets.push([x + Math.sin(turn) * radius * 0.55, z + Math.cos(turn) * radius * 0.55, 0.05, 0.05, 0.4, 1.6, "#e8f8ff"]);
  }
  out.jets.push([x, z, 0.07, 0.07, 1.55, 3.2, "#e8f8ff"]);
}

function hotel(out: PalmCourtParts): void {
  const { x, z, hx, hz, height } = HOTEL;
  const front = z + hz + SKIN;
  // The tower itself, and the bronze-glass lobby across the front of the ground floors.
  out.solid.push([x, z, hx + SKIN, hz + SKIN, 0, height + 0.3, IVORY]);
  out.glass.push([x, front + 0.03, hx - 1.4, 0.06, 0.2, 6.0, BRONZE_GLASS]);
  for (const lx of [-9, -3, 3, 9]) out.glow.push([x + lx, front + 0.08, 1.1, 0.02, 4.2, 4.5, WARM]);   // the lobby's lights through the glass
  // Floors above: a band of glass on every floor, all four sides, and ivory fins down the front.
  for (let floor = 2; floor < height / 3; floor++) {
    const y = floor * 3;
    out.glass.push([x, front + 0.02, hx - 0.5, 0.05, y + 0.55, y + 2.45, BRONZE_GLASS]);
    out.glass.push([x, z - hz - SKIN - 0.02, hx - 0.5, 0.05, y + 0.55, y + 2.45, BRONZE_GLASS]);
    out.glass.push([x - hx - SKIN - 0.02, z, 0.05, hz - 0.5, y + 0.55, y + 2.45, BRONZE_GLASS]);
    out.glass.push([x + hx + SKIN + 0.02, z, 0.05, hz - 0.5, y + 0.55, y + 2.45, BRONZE_GLASS]);
    out.solid.push([x, front + 0.2, hx + 0.3, 0.2, y - 0.12, y + 0.12, IVORY_DARK]);   // the floor line
    // Some rooms with their lights on.
    for (let k = 0; k < 9; k++) {
      if (((floor * 7 + k * 3) % 5) < 2) out.glow.push([x - hx + 2.2 + k * 3.0, front + 0.06, 0.9, 0.02, y + 0.8, y + 2.1, WARM]);
    }
  }
  for (let fx = -hx + 0.8; fx <= hx - 0.7; fx += 2.4) out.solid.push([x + fx, front + 0.3, 0.12, 0.3, 6.0, height, IVORY]);
  // The crown: a gold band, and an open gold frame above the roof with the name on it.
  out.solid.push([x, z, hx + 0.45, hz + 0.45, height - 0.6, height + 0.35, GOLD]);
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.solid.push([x + cx * (hx - 0.3), z + cz * (hz - 0.3), 0.3, 0.3, height, height + 3.2, GOLD]);
  out.solid.push([x, front - 0.3, hx, 0.3, height + 2.7, height + 3.3, GOLD], [x, z - hz + 0.3, hx, 0.3, height + 2.7, height + 3.3, GOLD]);
  out.glow.push([x, front + 0.05, hx - 0.4, 0.02, height + 0.36, height + 0.44, WARM]);
  // The drive-in canopy over the door, on two slim columns, lit from underneath.
  const cz = front + 3.2;
  out.solid.push([x, cz, 8, 3.2, 4.6, 5.1, "#f6f1e6"], [x, cz + 3.15, 8.05, 0.08, 4.55, 5.15, GOLD]);
  out.glow.push([x, cz, 7.6, 2.9, 4.54, 4.6, WARM]);
  out.solid.push([x - 6.5, cz + 2.4, 0.22, 0.22, 0, 4.6, GOLD], [x + 6.5, cz + 2.4, 0.22, 0.22, 0, 4.6, GOLD]);
  // Glass doors in a gold frame, a red carpet out to the kerb.
  out.glass.push([x, front + 0.09, 2.0, 0.04, 0, 3.0, "#3a4650"]);
  out.solid.push([x, front + 0.12, 2.15, 0.05, 3.0, 3.2, GOLD], [x - 2.1, front + 0.12, 0.08, 0.05, 0, 3.0, GOLD], [x + 2.1, front + 0.12, 0.08, 0.05, 0, 3.0, GOLD]);
  out.solid.push([x, front + 3.6, 1.2, 3.4, 0, 0.03, "#7a1e2a"]);
  out.solid.push([x, (front + 136.3) / 2, hx + 1, (136.3 - front) / 2, 0, 0.07, "#d8d1c2"]);
  palm(x - hx + 1.5, front + 2.6, 7.5, out);
  palm(x + hx - 1.5, front + 2.6, 7.0, out);
  out.signs.push({ text: "IVORY PALM", x, y: 5.6, z: cz + 3.3, width: 9, height: 0.9, colour: GOLD, back: "#f6f1e6" });
  out.signs.push({ text: "IVORY PALM HOTEL", x, y: height + 1.5, z: front - 0.25, width: 22, height: 2.2, colour: "#ffe7b0", back: "#00000000" });
}

function homes(out: PalmCourtParts): void {
  const { x, z, hx, hz, height } = HOMES;
  const front = z + hz + SKIN;
  const left = x - hx;
  out.solid.push([x, z, hx + SKIN, hz + SKIN, 0, height + 0.3, WHITE]);
  const bays = 11, bay = (hx * 2) / bays;
  for (let i = 0; i < bays; i++) {
    const x0 = left + i * bay;
    const stone = i % 2 === 0 ? STONE : STONE_DARK;
    for (let floor = 0; floor < height / 3; floor++) {
      const y = floor * 3;
      // Window and sliding doors, a grey stone panel beside them.
      out.glass.push([x0 + 3.2, front + 0.04, 2.3, 0.05, y + 0.45, y + 2.65, GLASS]);
      out.solid.push([x0 + 6.6, front + 0.08, 0.9, 0.09, y + 0.15, y + 2.9, stone]);
      if (((i * 5 + floor * 3) % 7) < 3) out.glow.push([x0 + 3.2, front + 0.1, 1.6, 0.02, y + 0.7, y + 2.3, WARM]);
      if (floor > 0) {
        // A balcony: the slab, its glass rail, and a strip of light under its edge.
        out.solid.push([x0 + 3.4, front + 0.75, 2.9, 0.75, y - 0.12, y + 0.12, WHITE]);
        out.railing.push([x0 + 3.4, front + 1.47, 2.85, 0.03, y + 0.12, y + 1.1, "#a9d3e8"]);
        out.glow.push([x0 + 3.4, front + 1.49, 2.85, 0.02, y - 0.16, y - 0.11, LED]);
      }
    }
    // A thin line of cyan light down the edge of every bay.
    out.glow.push([x0 + 0.05, front + 0.12, 0.05, 0.03, 0.3, height - 0.2, CYAN]);
  }
  // The ground floor: the leasing office's glass front at the west end, the residents' door.
  out.glass.push([left + 6.0, front + 0.12, 4.0, 0.05, 0.1, 2.9, "#2c3640"]);
  out.glow.push([left + 6.0, front + 0.16, 3.6, 0.02, 2.4, 2.6, LED]);
  out.solid.push([192, front + 0.15, 1.6, 0.06, 2.6, 2.8, GOLD], [190.4, front + 0.15, 0.06, 0.06, 0, 2.6, GOLD], [193.6, front + 0.15, 0.06, 0.06, 0, 2.6, GOLD]);
  out.glass.push([192, front + 0.13, 1.5, 0.04, 0, 2.6, "#3a4650"]);
  // The roof: a white parapet edged in glass, the pool, loungers and umbrellas, a pergola.
  const roof = height + 0.3;
  out.solid.push([x, front - 0.2, hx + SKIN, 0.2, roof, roof + 0.35, WHITE], [x, z - hz - SKIN + 0.2, hx + SKIN, 0.2, roof, roof + 0.35, WHITE]);
  out.railing.push([x, front - 0.2, hx, 0.03, roof + 0.35, roof + 1.2, "#a9d3e8"]);
  // The pool: a rim of white stone round water lit from inside (the roof is the pool's floor).
  out.solid.push([158, 115.7, 18.4, 0.3, roof, roof + 0.42, "#f4f2ec"], [158, 124.3, 18.4, 0.3, roof, roof + 0.42, "#f4f2ec"],
    [139.9, 120, 0.3, 4.6, roof, roof + 0.42, "#f4f2ec"], [176.1, 120, 0.3, 4.6, roof, roof + 0.42, "#f4f2ec"]);
  out.water.push([158, 120, 17.85, 4.05, roof, roof + 0.34, "#38c6f0"]);
  out.glow.push([158, 115.55, 17.8, 0.02, roof + 0.2, roof + 0.26, CYAN], [158, 124.45, 17.8, 0.02, roof + 0.2, roof + 0.26, CYAN]);
  for (let k = 0; k < 8; k++) {
    const lx = 142 + k * 4.4;
    out.solid.push([lx, 126.0, 0.38, 0.95, roof, roof + 0.35, WHITE], [lx, 125.25, 0.38, 0.22, roof + 0.35, roof + 0.7, WHITE]);
    if (k % 2 === 0) out.solid.push([lx + 2.2, 126.3, 0.04, 0.04, roof, roof + 2.4, "#3a3a3a"], [lx + 2.2, 126.3, 1.2, 1.2, roof + 2.35, roof + 2.5, k % 4 ? "#f2efe6" : "#1d1d1f"]);
  }
  for (let k = 0; k < 7; k++) out.solid.push([186 + k * 3.6, 120, 0.1, 5.2, roof + 2.6, roof + 2.75, "#4a3423"]);
  for (const [px, pz] of [[185.5, 115.2], [185.5, 124.8], [208.5, 115.2], [208.5, 124.8]]) out.solid.push([px, pz, 0.14, 0.14, roof, roof + 2.75, "#4a3423"]);
  out.solid.push([197, 117.5, 6.5, 0.7, roof, roof + 0.45, "#d9d3c6"], [197, 122.5, 6.5, 0.7, roof, roof + 0.45, "#d9d3c6"], [197, 120, 1.2, 1.0, roof, roof + 0.4, "#4a3423"]);
  for (let k = 0; k < 12; k++) out.glow.push([186 + k * 2, 120 + Math.sin(k) * 0.4, 0.06, 0.06, roof + 2.45, roof + 2.55, WARM]);
  // The forecourt: paved from the walls to the kerb, a fountain between the hotel and the
  // terrace, and palms along the front.
  out.solid.push([x, (front + 136.3) / 2, hx + 2, (136.3 - front) / 2, 0, 0.07, "#d8d1c2"]);
  out.solid.push([105, (front + 136.3) / 2, 21, (136.3 - front) / 2, 0, 0.07, "#cfc6b4"]);
  for (let k = 0; k < 14; k++) out.solid.push([88 + k * 2.6, 131.5, 0.05, 4.6, 0.07, 0.08, "#b9b09e"]);
  fountain(105, 129.5, 3.2, out);
  for (const px of [128, 152, 176, 200, 212]) palm(px, front + 1.6, 6 + (px % 3), out);
  out.signs.push({ text: "PALM COURT HOMES", x: 170, y: roof + 1.9, z: front - 0.1, width: 20, height: 1.9, colour: "#ffffff", back: "#00000000" });
  out.signs.push({ text: "Leasing office", x: left + 6.0, y: 3.25, z: front + 0.2, width: 5, height: 0.6, colour: "#1d1d1f", back: "#f2f1ec" });
  out.signs.push({ text: "Residents", x: 192, y: 3.15, z: front + 0.2, width: 3.2, height: 0.5, colour: GOLD, back: "#1d1d1f" });
}

export function buildPalmCourt(): PalmCourtParts {
  const out: PalmCourtParts = { solid: [], glass: [], railing: [], glow: [], water: [], jets: [], signs: [] };
  hotel(out);
  homes(out);
  return out;
}

/** What a player bumps into besides the map's two boxes: the canopy's columns and the fountain. */
export const PALM_COURT_SOLIDS: { x: number; z: number; hx: number; hz: number }[] = [
  { x: HOTEL.x - 6.5, z: HOTEL.z + HOTEL.hz + SKIN + 5.6, hx: 0.3, hz: 0.3 },
  { x: HOTEL.x + 6.5, z: HOTEL.z + HOTEL.hz + SKIN + 5.6, hx: 0.3, hz: 0.3 },
  { x: 105, z: 129.5, hx: 3.2, hz: 3.2 },
];
