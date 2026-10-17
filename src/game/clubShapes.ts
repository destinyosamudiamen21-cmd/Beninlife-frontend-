// Turns the club into triangles: the room and everything standing in it, the neon that
// glows, the people along the walls, and the markers that stand at the things on the
// street. Like the houses and the fight club, everything is built from boxes in code, so
// it needs no model files and loads at once.
//
// This is an original room for an original Benin club. Nothing in it is taken from any
// real venue: restyle it by changing the colours and the numbers in clubLayout.ts.

import { CLUB, DANCE } from "./clubLayout";
import { buildDoorFront } from "./arenaShapes";
import type { Door } from "./districtData";
import { MeshBuilder, type MeshData } from "./districtGeometry";
import { PERSON } from "./streetProps";
import { hexToLinear, type RGB } from "./tint";

function shade(color: RGB, amount: number): RGB {
  return { r: color.r * amount, g: color.g * amount, b: color.b * amount };
}

// ---- colours: change these to restyle the club ---------------------------------------

const WALL = hexToLinear("#2a1b3d");        // deep purple, nearly black in the dark
const WALL_BAND = hexToLinear("#3a2553");
const FLOOR = hexToLinear("#1d1a22");
const FLOOR_ALT = hexToLinear("#24202b");
const STAGE = hexToLinear("#16141a");
const STEEL = hexToLinear("#4a4f58");
const SPEAKER = hexToLinear("#101012");
const CONE = hexToLinear("#3a3d44");
const COUNTER = hexToLinear("#3b2416");
const COUNTER_TOP = hexToLinear("#b0803a");  // bronze, as on the palace plaques
const SHELF = hexToLinear("#221710");
const VELVET = hexToLinear("#6e1f2c");       // the booths: oxblood, like coral beads in low light
const VELVET_DARK = hexToLinear("#4f1620");
const TABLE = hexToLinear("#15151a");
const GOLD = hexToLinear("#d9b13b");
const ROPE = hexToLinear("#8a2f3a");
const CARPET = hexToLinear("#3a1220");
const SCREEN = hexToLinear("#07080c");

export const NEON_PINK = "#ff2d95";
export const NEON_BLUE = "#00e5ff";
export const NEON_GOLD = "#ffc94a";
const BOTTLES = ["#ff7a00", "#7dff3a", "#00e5ff", "#ffe600", "#ff2d95", "#e9e4d8"].map(hexToLinear);

const SKINS = ["#a9714b", "#8d5a3b", "#774a2f", "#613a25", "#4b2c1c", "#35201a"].map(hexToLinear);
const TOPS = ["#e9e4d8", "#d64545", "#2f6fd6", "#111114", "#c79a2b", "#d63f8c", "#2a9d8f", "#6a4fe0", "#f0f0f0", "#8a2f3a"].map(hexToLinear);
const BOTTOMS = ["#15161a", "#2b3a55", "#3a3d42", "#e9e4d8", "#5d4a39"].map(hexToLinear);
const HAIR = hexToLinear("#17120f");

/** A repeatable random number from 0 to 1 for a whole number. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A flat rectangle lying on the floor. */
function mat(builder: MeshBuilder, x0: number, x1: number, z0: number, z1: number, y: number, color: RGB): void {
  builder.face([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], color, [0, 1, 0]);
}

// ---- the room -------------------------------------------------------------------------------

function buildBar(builder: MeshBuilder): void {
  const { x, z, halfX, halfZ } = CLUB.bar;
  builder.box(x, z, halfX, halfZ, 0, 1.05, COUNTER);
  builder.box(x, z, halfX + 0.06, halfZ + 0.06, 1.05, 1.11, COUNTER_TOP);
  for (let i = 0; i < 6; i++) builder.box(x + halfX + 0.005, z - halfZ + 0.7 + i * 1.4, 0.01, 0.5, 0.15, 0.95, shade(COUNTER, 1.35)); // panels
  // The flap at each end, and the shelves of bottles on the wall behind.
  builder.box((x - halfX) / 2, z - halfZ, (x - halfX) / 2, 0.06, 0.95, 1.05, COUNTER_TOP);
  builder.box((x - halfX) / 2, z + halfZ, (x - halfX) / 2, 0.06, 0.95, 1.05, COUNTER_TOP);
  builder.box(0.2, z, 0.2, halfZ, 0, 2.9, SHELF);
  for (const y of [1.2, 1.75, 2.3]) {
    builder.box(0.3, z, 0.26, halfZ - 0.1, y, y + 0.05, shade(COUNTER, 1.2));
    for (let i = 0; i < 20; i++) {
      const bz = z - halfZ + 0.35 + i * ((halfZ * 2 - 0.7) / 19);
      const bottle = BOTTLES[Math.floor(hash(i * 7 + y * 13) * BOTTLES.length)];
      builder.box(0.36, bz, 0.045, 0.045, y + 0.05, y + 0.3, bottle);
      builder.box(0.36, bz, 0.02, 0.02, y + 0.3, y + 0.4, shade(bottle, 0.7));
    }
  }
  // Stools along the room side of the counter.
  for (let i = 0; i < 6; i++) {
    const sz = z - halfZ + 0.7 + i * 1.4;
    builder.box(CLUB.bar.stools - 0.35, sz, 0.03, 0.03, 0, 0.72, STEEL);
    builder.box(CLUB.bar.stools - 0.35, sz, 0.17, 0.17, 0.72, 0.8, VELVET);
    builder.box(CLUB.bar.stools - 0.35, sz, 0.2, 0.2, 0, 0.03, STEEL);
  }
  // A fridge of drinks behind the counter, and a tray of small chops on top of it.
  builder.box(1.2, z - halfZ + 0.8, 0.35, 0.4, 0, 1.5, STEEL);
  builder.box(1.56, z - halfZ + 0.8, 0.01, 0.34, 0.15, 1.4, hexToLinear("#9cc4dc"));
  builder.box(x, z + 1.2, 0.2, 0.3, 1.11, 1.15, STEEL);
  for (let i = 0; i < 5; i++) builder.box(x - 0.1 + (i % 2) * 0.2, z + 1.0 + i * 0.1, 0.05, 0.04, 1.15, 1.2, GOLD);
}

function buildStage(builder: MeshBuilder): void {
  const { x, z, halfX, halfZ, stage } = CLUB.dj;
  builder.box(x, z, halfX, halfZ, 0, stage, STAGE);
  builder.box(x, z + halfZ + 0.005, halfX, 0.01, stage - 0.06, stage, GOLD);              // a gold edge to the stage
  // The desk: two decks and a mixer.
  builder.box(x, z + 0.35, 1.5, 0.4, stage, stage + 0.95, TABLE);
  builder.box(x, z + 0.76, 1.5, 0.02, stage + 0.1, stage + 0.9, shade(WALL_BAND, 1.4));
  for (const side of [-1, 1]) {
    builder.box(x + side * 0.85, z + 0.35, 0.36, 0.3, stage + 0.95, stage + 1.0, STEEL);
    builder.box(x + side * 0.85, z + 0.35, 0.24, 0.24, stage + 1.0, stage + 1.02, SPEAKER);
  }
  builder.box(x, z + 0.35, 0.3, 0.28, stage + 0.95, stage + 1.02, shade(STEEL, 0.7));
  // Speaker stacks, either side.
  for (const speaker of CLUB.speakers) {
    builder.box(speaker.x, speaker.z, 0.55, 0.5, 0, 1.3, SPEAKER);
    builder.box(speaker.x, speaker.z, 0.5, 0.45, 1.3, 2.4, SPEAKER);
    for (const y of [0.65, 1.85]) builder.box(speaker.x, speaker.z + 0.5, 0.33, 0.012, y - 0.33, y + 0.33, CONE);
    builder.box(speaker.x, speaker.z + 0.46, 0.14, 0.012, 2.1, 2.3, CONE);
  }
  // The frames of the three big screens on the back wall. What they show is drawn by the scene.
  for (const screen of SCREENS) {
    builder.box(screen.x, 0.06, screen.halfX + 0.08, 0.05, screen.y - screen.halfY - 0.08, screen.y + screen.halfY + 0.08, STEEL);
    builder.box(screen.x, 0.1, screen.halfX, 0.03, screen.y - screen.halfY, screen.y + screen.halfY, SCREEN);
  }
}

function buildVip(builder: MeshBuilder): void {
  const area = CLUB.vip;
  const midX = (area.minX + area.maxX) / 2, midZ = (area.minZ + area.maxZ) / 2;
  builder.box(midX, midZ, (area.maxX - area.minX) / 2, (area.maxZ - area.minZ) / 2, 0, area.floor - 0.02, STAGE);
  mat(builder, area.minX, area.maxX, area.minZ, area.maxZ, area.floor, CARPET);
  builder.box(area.minX - 0.25, area.gate.z, 0.25, area.gate.half, 0, area.floor / 2, STAGE);   // the step up

  // Brass posts and a rope, with a gap where the way in is.
  const posts: [number, number][] = [];
  for (let z = area.minZ; z <= area.maxZ + 1e-6; z += (area.maxZ - area.minZ) / 8) {
    if (Math.abs(z - area.gate.z) < area.gate.half - 0.05) continue;
    posts.push([area.minX, z]);
  }
  posts.push([area.minX, area.gate.z - area.gate.half], [area.minX, area.gate.z + area.gate.half]);
  for (const [px, pz] of posts) {
    builder.box(px, pz, 0.04, 0.04, area.floor, area.floor + 0.95, GOLD);
    builder.box(px, pz, 0.07, 0.07, area.floor + 0.95, area.floor + 1.0, GOLD);
  }
  const rope = (z0: number, z1: number) => builder.box(area.minX, (z0 + z1) / 2, 0.025, (z1 - z0) / 2, area.floor + 0.78, area.floor + 0.84, ROPE);
  rope(area.minZ, area.gate.z - area.gate.half);
  rope(area.gate.z + area.gate.half, area.maxZ);

  for (const booth of CLUB.booths) {
    const y = area.floor;
    // The sofa: a back against the wall, a deep seat, and an arm at each end.
    builder.box(25.45, booth.z, 0.2, 1.6, y, y + 1.15, VELVET_DARK);
    builder.box(24.6, booth.z, 0.65, 1.6, y, y + 0.44, VELVET);
    for (const side of [-1, 1]) builder.box(24.75, booth.z + side * 1.7, 0.8, 0.12, y, y + 0.75, VELVET_DARK);
    for (let i = -2; i <= 2; i++) builder.box(25.22, booth.z + i * 0.6, 0.04, 0.22, y + 0.55, y + 1.05, shade(VELVET, 1.25)); // buttoned back
    // A low table with a bucket and glasses on it.
    builder.box(booth.x, booth.z, 0.55, 0.75, y + 0.38, y + 0.44, TABLE);
    builder.box(booth.x, booth.z, 0.08, 0.08, y, y + 0.38, STEEL);
    builder.box(booth.x, booth.z, 0.13, 0.13, y + 0.44, y + 0.66, STEEL);
    for (let i = 0; i < 4; i++) builder.box(booth.x + (i % 2 ? 0.3 : -0.3), booth.z + (i < 2 ? 0.45 : -0.45), 0.04, 0.04, y + 0.44, y + 0.56, BOTTLES[i]);
  }
}

/** The room: floor, walls, bar, DJ stage, VIP platform and booths. Lit by the scene's lights. */
export function buildClubRoom(): MeshData {
  const builder = new MeshBuilder();
  const { width, depth, wallHeight } = CLUB;

  // The floor, in big dark squares, with the dance floor left as a pit for the lit tiles.
  for (let x = 0; x < width; x += 2) {
    for (let z = 0; z < depth; z += 2) mat(builder, x, Math.min(width, x + 2), z, Math.min(depth, z + 2), 0, ((x + z) / 2) % 2 ? FLOOR : FLOOR_ALT);
  }
  builder.box(CLUB.floor.x, CLUB.floor.z, (DANCE.maxX - DANCE.minX) / 2 + 0.12, (DANCE.maxZ - DANCE.minZ) / 2 + 0.12, 0, 0.03, STEEL);

  // Walls. The camera looks in from the front, so the front wall is only a low kerb.
  const thick = 0.2;
  builder.box(width / 2, -thick / 2, width / 2 + thick, thick / 2, 0, wallHeight, WALL);
  builder.box(-thick / 2, depth / 2, thick / 2, depth / 2, 0, wallHeight, shade(WALL, 0.9));
  builder.box(width + thick / 2, depth / 2, thick / 2, depth / 2, 0, wallHeight, shade(WALL, 0.9));
  builder.box(width / 2, depth + thick / 2, width / 2 + thick, thick / 2, 0, 0.3, shade(WALL, 0.8));
  builder.box(width / 2, 0.03, width / 2, 0.03, 0, 1.1, WALL_BAND);
  builder.box(0.03, depth / 2, 0.03, depth / 2, 0, 1.1, WALL_BAND);
  builder.box(width - 0.03, depth / 2, 0.03, depth / 2, 0, 1.1, WALL_BAND);

  // The way in: a red carpet from the front, between two brass posts.
  mat(builder, CLUB.door.x - 1.1, CLUB.door.x + 1.1, depth - 3.2, depth, 0.006, CARPET);
  for (const side of [-1, 1]) builder.box(CLUB.door.x + side * 1.3, depth - 0.5, 0.05, 0.05, 0, 1.0, GOLD);

  // A truss of lights over the dance floor.
  const trussY = wallHeight - 0.9;
  for (const z of [DANCE.minZ - 0.3, DANCE.maxZ + 0.3]) builder.box(CLUB.floor.x, z, 4.2, 0.06, trussY, trussY + 0.12, STEEL);
  for (const x of [DANCE.minX - 0.6, DANCE.maxX + 0.6]) builder.box(x, CLUB.floor.z, 0.06, 3.6, trussY, trussY + 0.12, STEEL);
  for (let i = 0; i < 8; i++) {
    const lx = DANCE.minX + (i % 4) * 2.1 + 0.05, lz = i < 4 ? DANCE.minZ - 0.3 : DANCE.maxZ + 0.3;
    builder.box(lx, lz, 0.14, 0.14, trussY - 0.3, trussY, SPEAKER);
  }

  buildStage(builder);
  buildBar(builder);
  buildVip(builder);
  return builder.build();
}

/** The three screens on the back wall: where each is, and how big. */
export const SCREENS = [
  { x: 6.2, y: 3.6, halfX: 2.3, halfY: 1.25 },
  { x: 13, y: 4.4, halfX: 2.7, halfY: 1.3 },
  { x: 19.8, y: 3.6, halfX: 2.3, halfY: 1.25 },
];

// A five-by-seven letter, as rows of dots, for the sign over the DJ.
const LETTERS: Record<string, string[]> = {
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
};

/**
 * Everything that glows: strips of neon round the walls and the bar, and the club's name
 * over the DJ. Drawn without lighting, so it is as bright in the dark as it should be.
 * The colour of each part is baked in.
 */
export function buildClubNeon(): MeshData {
  const builder = new MeshBuilder();
  const pink = hexToLinear(NEON_PINK), blue = hexToLinear(NEON_BLUE), gold = hexToLinear(NEON_GOLD);
  const { width, depth, wallHeight } = CLUB;

  // Two lines of light round the three walls.
  for (const [y, color] of [[1.14, pink], [wallHeight - 0.5, blue]] as [number, RGB][]) {
    builder.box(width / 2, 0.07, width / 2 - 0.2, 0.02, y, y + 0.06, color);
    builder.box(0.07, depth / 2, 0.02, depth / 2 - 0.2, y, y + 0.06, color);
    builder.box(width - 0.07, depth / 2, 0.02, depth / 2 - 0.2, y, y + 0.06, color);
  }
  // Under the lip of the bar and round the edge of the VIP platform.
  builder.box(CLUB.bar.x + CLUB.bar.halfX + 0.03, CLUB.bar.z, 0.015, CLUB.bar.halfZ, 0.98, 1.03, gold);
  const area = CLUB.vip;
  builder.box(area.minX - 0.01, (area.minZ + area.maxZ) / 2, 0.015, (area.maxZ - area.minZ) / 2, area.floor - 0.07, area.floor - 0.02, gold);
  // Round the dance floor.
  const edge = 0.14, half = (DANCE.maxX - DANCE.minX) / 2 + edge;
  for (const side of [-1, 1]) {
    builder.box(CLUB.floor.x, CLUB.floor.z + side * half, half, 0.03, 0.03, 0.06, pink);
    builder.box(CLUB.floor.x + side * half, CLUB.floor.z, 0.03, half, 0.03, 0.06, pink);
  }
  // The name, in dots of light, high on the back wall between the side screens.
  const dot = 0.16, word = "QUE";
  const startX = CLUB.dj.x - ((word.length * 6 - 1) * dot) / 2;
  word.split("").forEach((letter, index) => {
    LETTERS[letter].forEach((row, r) => {
      row.split("").forEach((on, c) => {
        if (on !== "1") return;
        const x = startX + (index * 6 + c) * dot + dot / 2;
        const y = 2.75 - r * dot;
        builder.box(x, 0.12, dot * 0.42, 0.02, y - dot * 0.42, y + dot * 0.42, gold);
      });
    });
  });
  return builder.build();
}

// ---- the people along the walls -----------------------------------------------------------

/** One person standing, facing the dance floor more or less. */
function stander(builder: MeshBuilder, x: number, z: number, y: number, seed: number): void {
  const skin = SKINS[Math.floor(hash(seed) * SKINS.length)];
  const top = TOPS[Math.floor(hash(seed + 7) * TOPS.length)];
  const legs = BOTTOMS[Math.floor(hash(seed + 13) * BOTTOMS.length)];
  const tall = 0.94 + hash(seed + 3) * 0.1; // not everyone is the same height
  const hip = PERSON.hip * tall, shoulder = PERSON.shoulder * tall, crown = PERSON.crown * tall;
  for (const side of [-1, 1]) {
    builder.box(x + side * PERSON.legGap, z, 0.075, 0.085, y, y + hip, legs);
    const up = hash(seed + 31 + side) > 0.62;   // a hand in the air
    builder.box(x + side * PERSON.armGap, z, 0.05, 0.055, y + (up ? shoulder - 0.05 : hip - 0.05), y + (up ? shoulder + 0.5 : shoulder), up ? skin : top);
  }
  builder.box(x, z, 0.19, 0.115, y + hip, y + shoulder, top);
  builder.box(x, z, 0.1, 0.105, y + shoulder + 0.05, y + crown - 0.06, skin);
  builder.box(x, z - 0.005, 0.108, 0.112, y + crown - 0.12, y + crown, HAIR);
}

/**
 * The crowd: people standing round the dance floor, at the bar and in the booths. They
 * come in two halves so that one half can bob up while the other comes down.
 */
export function buildClubCrowd(group: 0 | 1): MeshData {
  const builder = new MeshBuilder();
  const spots: [number, number, number][] = [];
  // Round the dance floor, a little back from its edge, leaving the front open to the camera.
  for (let i = 0; i < 9; i++) spots.push([DANCE.minX - 1.0 - hash(i) * 0.9, DANCE.minZ + 0.2 + i * 0.75, 0]);
  for (let i = 0; i < 9; i++) spots.push([DANCE.maxX + 1.0 + hash(i + 40) * 0.9, DANCE.minZ + 0.2 + i * 0.75, 0]);
  for (let i = 0; i < 7; i++) spots.push([DANCE.minX + 0.4 + i * 0.95, DANCE.minZ - 1.0 - hash(i + 80) * 0.7, 0]);
  // Leaning on the bar.
  for (let i = 0; i < 4; i++) spots.push([CLUB.bar.stools + 0.25 + hash(i + 120) * 0.3, CLUB.bar.z - 3.2 + i * 2.1, 0]);
  // In the two end booths. The middle one is left for whoever rents it.
  for (const booth of [CLUB.booths[0], CLUB.booths[2]]) {
    spots.push([23.0, booth.z - 1.25, CLUB.vip.floor], [22.6, booth.z + 1.3, CLUB.vip.floor]);
  }
  spots.forEach(([x, z, y], index) => {
    if (index % 2 === group) stander(builder, x, z, y, index * 3 + 5);
  });
  return builder.build();
}

// ---- markers on the street ---------------------------------------------------------------------

const SIGN_RED = hexToLinear("#c8372d");
const SIGN_GREEN = hexToLinear("#2f8f4e");
const SIGN_YELLOW = hexToLinear("#e0a528");
const WHITE = hexToLinear("#ecebe6");
const WOOD = hexToLinear("#8a6a4c");
const CEMENT = hexToLinear("#8f8c85");

/** A roadside shelter: where the campus shuttle and the keke wait. Green roof for a shuttle, yellow for a keke. */
function buildShelter(door: Door, roof: RGB): MeshData {
  const builder = new MeshBuilder();
  const { x, z } = door;
  builder.box(x, z - 0.9, 1.9, 0.9, 0, 0.1, CEMENT);                                   // the slab
  for (const side of [-1, 1]) {
    builder.box(x + side * 1.7, z - 1.6, 0.05, 0.05, 0.1, 2.5, STEEL);
    builder.box(x + side * 1.7, z - 0.2, 0.05, 0.05, 0.1, 2.3, STEEL);
  }
  builder.sheet([[x - 2.0, 2.55, z - 1.8], [x + 2.0, 2.55, z - 1.8], [x + 2.0, 2.3, z + 0.1], [x - 2.0, 2.3, z + 0.1]], roof, [0, 1, 0.2]);
  builder.box(x, z - 1.62, 1.7, 0.03, 0.1, 2.0, shade(WHITE, 0.92));                     // the back board
  builder.box(x, z - 1.58, 1.3, 0.02, 1.35, 1.85, roof);                                 // the name panel on it
  builder.box(x, z - 1.56, 1.1, 0.01, 1.5, 1.7, WHITE);
  builder.box(x, z - 1.2, 1.3, 0.2, 0.5, 0.56, WOOD);                                    // a bench
  for (const side of [-1, 1]) builder.box(x + side * 1.1, z - 1.2, 0.04, 0.18, 0.1, 0.5, STEEL);
  // A post at the kerb with a round sign on it.
  builder.box(x + 2.5, z, 0.04, 0.04, 0, 2.6, STEEL);
  builder.box(x + 2.5, z + 0.03, 0.28, 0.02, 2.1, 2.66, roof);
  builder.box(x + 2.5, z + 0.05, 0.2, 0.01, 2.2, 2.56, WHITE);
  return builder.build();
}

/** A painted board on two posts with a bench by it: for places that are out in the open, like a park or a track. */
function buildSignpost(door: Door): MeshData {
  const builder = new MeshBuilder();
  const { x, z } = door;
  for (const side of [-1, 1]) builder.box(x + side * 1.2, z - 1.0, 0.06, 0.06, 0, 2.4, WOOD);
  builder.box(x, z - 1.0, 1.4, 0.05, 1.5, 2.4, SIGN_GREEN);
  builder.box(x, z - 0.94, 1.25, 0.01, 1.62, 2.28, WHITE);
  builder.box(x, z - 0.92, 1.0, 0.01, 1.85, 2.05, SIGN_GREEN);
  builder.box(x + 2.6, z - 0.8, 0.9, 0.2, 0.42, 0.48, WOOD);
  for (const side of [-1, 1]) builder.box(x + 2.6 + side * 0.75, z - 0.8, 0.04, 0.18, 0, 0.42, shade(WOOD, 0.7));
  return builder.build();
}

/**
 * What marks something on the street: a doorway for a place in a building, a shelter for
 * a shuttle or keke stop, a signboard for a place in the open. Decided by the door's id.
 */
/** The same shape turned to face the other way: turned round the door's spot. */
function turnRound(mesh: MeshData, x0: number, z0: number): MeshData {
  const positions = mesh.positions.slice();
  const normals = mesh.normals.slice();
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = 2 * x0 - positions[i];
    positions[i + 2] = 2 * z0 - positions[i + 2];
    normals[i] = -normals[i];
    normals[i + 2] = -normals[i + 2];
  }
  return { ...mesh, positions, normals };
}

// The clubs of GRA get the same front as Nightclub: a canopy, a carpet and a rope.
const CLUB_FRONTS = new Set(["club", "patricia", "patio", "space", "darkalley"]);

export function buildStreetFront(door: Door): MeshData {
  // A door that faces away from the camera (across a road from it, say) is built facing
  // the camera, then turned round to face the right way.
  if (door.facing < 0) return turnRound(buildStreetFront({ ...door, facing: -door.facing }), door.x, door.z);
  if (door.id.startsWith("spot:stop_")) return buildShelter(door, SIGN_GREEN);
  if (door.id.startsWith("spot:keke_")) return buildShelter(door, SIGN_YELLOW);
  if (door.id === "spot:park" || door.id === "spot:track") return buildSignpost(door);
  if (CLUB_FRONTS.has(door.id)) return buildClubFront(door);
  if (door.id === "flyover" || door.id.startsWith("spot:agent_")) return buildSignpost(door);
  return buildDoorFront(door);
}

/** The club from the street: a dark doorway under a canopy, a strip of carpet, and a rope. */
function buildClubFront(door: Door): MeshData {
  const builder = new MeshBuilder();
  const { x, z } = door;
  const wall = z - 1.3; // the door's spot is this far out from the wall
  builder.box(x, wall + 1.2, 2.4, 1.2, 0, 0.12, STAGE);
  mat(builder, x - 0.9, x + 0.9, wall, wall + 3.4, 0.125, SIGN_RED);
  builder.box(x, wall + 0.07, 1.25, 0.07, 0.12, 3.0, SPEAKER);
  builder.box(x, wall + 0.1, 1.0, 0.05, 0.12, 2.6, shade(WALL, 0.6));
  builder.box(x, wall + 0.14, 1.3, 0.03, 2.65, 2.8, GOLD);
  // The canopy, and the name board above it, edged in gold.
  builder.box(x, wall + 1.1, 2.4, 1.1, 3.05, 3.2, SPEAKER);
  builder.box(x, wall + 2.22, 2.4, 0.02, 3.0, 3.25, GOLD);
  builder.box(x, wall + 0.12, 2.6, 0.06, 3.3, 4.5, WALL);
  builder.box(x, wall + 0.19, 2.45, 0.02, 3.42, 4.38, shade(WALL_BAND, 1.5));
  builder.box(x, wall + 0.215, 1.7, 0.012, 3.7, 4.1, GOLD);
  for (const side of [-1, 1]) {
    builder.box(x + side * 2.3, wall + 2.1, 0.05, 0.05, 0.12, 3.05, STEEL);
    builder.box(x + side * 1.2, wall + 2.6, 0.04, 0.04, 0.12, 1.05, GOLD);       // rope posts
    builder.box(x + side * 1.2, wall + 1.5, 0.02, 1.1, 0.85, 0.9, ROPE);
    builder.box(x + side * 3.3, wall + 0.07, 0.5, 0.05, 0.6, 2.6, shade(WALL_BAND, 1.2)); // poster boards
    builder.box(x + side * 3.3, wall + 0.13, 0.4, 0.012, 0.75, 2.45, hexToLinear(side < 0 ? NEON_PINK : NEON_BLUE));
  }
  return builder.build();
}
