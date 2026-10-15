// Every room a player can walk into besides their house, the fight club and Que Club: the
// museum, the hospital, the police station, the mall, the clubs and lounges of GRA, the
// golf course, the haunted house and the flyover.
//
// Each one is plain data: its size, its colours, the boxes it is built from, the things in
// it that can be used, and the people who are always there. VenueScene.tsx draws it,
// venueCollider() below says what a player bumps into, and the server (places.py) must
// agree on each room's id, width and depth. No 3D imports here, so it can be tested alone.
//
// Every room's back-left corner is (0, 0). x runs to the right, z towards the camera, and
// the way in is the middle of the front wall.

import type { Look } from "../api/appearance";
import { EDGE_MARGIN, PLAYER_RADIUS, buildCollider, type Collider } from "./collision";
import type { Building } from "./districtData";
import type { Herd } from "./zooAnimals";
import type { DanceMove } from "./fightMoves";
import { DIORAMA, STORIES, type Story } from "./museumStories";
import type { Near, Stand } from "./nearby";

// ---- the shapes of the data ---------------------------------------------------------------

/** A box standing in the room. `solid` boxes are walked round; `glow` boxes give their own light. */
export type Box = { x: number; z: number; hx: number; hz: number; y0: number; y1: number; c: string; solid?: boolean; glow?: boolean; glass?: boolean };

/** Something in the room that is used through the server: the bar, a doctor, a tee. */
export type Thing = { spot: string; name: string; verb?: string; x: number; z: number; hx: number; hz: number; reach?: number; stand?: Stand | "here"; distance?: number };

/** Something in the room that opens a panel of its own. */
export type Special =
  | { kind: "shop"; shop: string; name: string; x: number; z: number; reach: number }
  | { kind: "wardrobe"; name: string; x: number; z: number; reach: number }
  | { kind: "story"; story: Story; x: number; z: number; reach: number };

/** Someone who is always there. */
export type Person = { x: number; z: number; rot: number; look: Look; move?: DanceMove | "sit"; label?: string; ghost?: boolean };

/** In the haunted house: walk into the circle and something happens. Each one happens once a visit. */
export type Scare = { id: string; x: number; z: number; r: number; kind: "ghost" | "face" | "lights" | "slam" | "hands"; ghost?: { x: number; z: number; rot: number }; line?: string };

/** A sign: words on a board, on a wall or over a counter. */
export type Sign = { text: string; x: number; y: number; z: number; size: number; colour: string; back?: string; face?: "front" | "left" | "right" };

export type Lighting = "bright" | "warm" | "club" | "dark" | "night" | "day" | "aqua" | "cinema";

export type VenueKind =
  | "club" | "lounge" | "museum" | "haunted" | "mall" | "hospital" | "police" | "golf" | "cinema" | "food" | "shop" | "aquarium" | "flyover" | "zoo";

export type VenueLayout = {
  id: string;
  name: string;
  kind: VenueKind;
  width: number;
  depth: number;
  wallHeight: number;
  /** No ceiling and no walls: the sky above, and low edges round the sides. */
  open?: boolean;
  floor: string;
  floorAlt: string;
  wall: string;
  trim: string;
  sky: string;
  lighting: Lighting;
  /** Where a player stands after coming in. Must match the server. */
  entry: { x: number; z: number };
  boxes: Box[];
  things: Thing[];
  specials: Special[];
  people: Person[];
  signs: Sign[];
  scares?: Scare[];
  /** Lit tiles, as on Que Club's floor. */
  danceFloor?: { x: number; z: number; tile: number; tiles: number; colours: string[] };
  /** A screen that changes colour, as at the cinema. */
  screen?: { x: number; y: number; z: number; hx: number; hy: number };
  /** Fish swimming in the tanks, at the aquarium. */
  fish?: { minX: number; maxX: number; z: number; y0: number; y1: number; count: number }[];
  /** Club music while inside. */
  music?: boolean;
  /** Animals wandering their pens, at the zoo. */
  animals?: Herd[];
  /** Mist hanging in the air: how near it starts and how far it is thick, in metres. */
  mist?: { colour: string; near: number; far: number };
};

// ---- people --------------------------------------------------------------------------------

const SKINS = ["#4b2c1c", "#613a25", "#774a2f", "#8d5a3b", "#35201a", "#a9714b"];
const person = (body: "man" | "woman", skin: number, top: string, bottom: string, shoes = "#1d1d1f", hair = "#17120f"): Look => ({
  body, skin_tone: SKINS[skin % SKINS.length], hair_color: hair, top_color: top, bottom_color: bottom, shoe_color: shoes,
});
const POLICE = (skin: number, body: "man" | "woman" = "man") => person(body, skin, "#1b1d22", "#1b1d22", "#0d0d0f");
const WHITE_COAT = (skin: number, body: "man" | "woman" = "man") => person(body, skin, "#f4f4f1", "#2f4a6b", "#f2f2f2");
const NURSE = (skin: number) => person("woman", skin, "#dfe9f2", "#dfe9f2", "#f2f2f2");
const STAFF = (skin: number, colour: string, body: "man" | "woman" = "man") => person(body, skin, colour, "#1d1d1f");
const PARTY = [
  person("woman", 2, "#d63f8c", "#1d1d1f", "#ede6d6"),
  person("man", 0, "#ede6d6", "#2b3a55", "#ede6d6"),
  person("woman", 3, "#2a9d8f", "#ede6d6"),
  person("man", 1, "#6a4fe0", "#3a3d42"),
  person("woman", 4, "#c79a2b", "#1d1d1f", "#c79a2b"),
  person("man", 5, "#c0392b", "#1d1d1f", "#f2f2f2"),
];
const GHOST = person("woman", 0, "#e8ecef", "#e8ecef", "#e8ecef", "#e8ecef");

// ---- small builders --------------------------------------------------------------------------

/** A solid box: furniture, a counter, a wall. */
const solid = (x: number, z: number, hx: number, hz: number, y1: number, c: string, y0 = 0): Box => ({ x, z, hx, hz, y0, y1, c, solid: true });
/** A box to look at, not to bump into: a rug, a sign board, something on a shelf. */
const deco = (x: number, z: number, hx: number, hz: number, y0: number, y1: number, c: string): Box => ({ x, z, hx, hz, y0, y1, c });
const glow = (x: number, z: number, hx: number, hz: number, y0: number, y1: number, c: string): Box => ({ x, z, hx, hz, y0, y1, c, glow: true });

/** A table with four chairs round it. */
function tableSet(x: number, z: number, top: string, chair: string): Box[] {
  return [
    solid(x, z, 0.55, 0.55, 0.75, top),
    deco(x - 0.85, z, 0.22, 0.22, 0, 0.45, chair),
    deco(x + 0.85, z, 0.22, 0.22, 0, 0.45, chair),
    deco(x, z - 0.85, 0.22, 0.22, 0, 0.45, chair),
    deco(x, z + 0.85, 0.22, 0.22, 0, 0.45, chair),
  ];
}

/** A shelf of goods: a frame and rows of coloured packets. */
function shelf(x: number, z: number, hx: number, hz: number, frame: string, goods: string[], seed: number): Box[] {
  const boxes: Box[] = [solid(x, z, hx, hz, 1.9, frame)];
  for (let level = 0; level < 4; level++) {
    const y = 0.3 + level * 0.42;
    const count = Math.max(2, Math.round((hx * 2) / 0.45));
    for (let i = 0; i < count; i++) {
      const gx = x - hx + (i + 0.5) * ((hx * 2) / count);
      const colour = goods[(i + level * 3 + seed) % goods.length];
      boxes.push(deco(gx, z, (hx / count) * 0.8, hz + 0.04, y, y + 0.3, colour));
    }
  }
  return boxes;
}

/** A shelf that runs front to back (along z), stocked on both faces. */
function aisle(x: number, z: number, hz: number, frame: string, goods: string[], seed: number): Box[] {
  const boxes: Box[] = [solid(x, z, 0.45, hz, 1.9, frame)];
  const count = Math.max(2, Math.round((hz * 2) / 0.45));
  for (let level = 0; level < 4; level++) {
    const y = 0.3 + level * 0.42;
    for (let i = 0; i < count; i++) {
      const gz = z - hz + (i + 0.5) * ((hz * 2) / count);
      boxes.push(deco(x, gz, 0.49, (hz / count) * 0.8, y, y + 0.3, goods[(i + level * 3 + seed) % goods.length]));
    }
  }
  return boxes;
}

/** A sofa against something, facing +z (towards the camera) or -z. */
function sofa(x: number, z: number, hx: number, colour: string, facing: 1 | -1): Box[] {
  return [solid(x, z, hx, 0.45, 0.45, colour), deco(x, z - facing * 0.35, hx, 0.12, 0.45, 0.95, colour)];
}

/** A plant in a pot. */
const plant = (x: number, z: number): Box[] => [solid(x, z, 0.3, 0.3, 0.45, "#7a5a3c"), deco(x, z, 0.42, 0.42, 0.45, 1.6, "#3f7d3a")];

/** A wall inside a room, from (x0, z0) to (x1, z1): straight along x or z. */
function wall(x0: number, z0: number, x1: number, z1: number, height: number, colour: string, thick = 0.15): Box {
  return solid((x0 + x1) / 2, (z0 + z1) / 2, Math.max(thick, Math.abs(x1 - x0) / 2), Math.max(thick, Math.abs(z1 - z0) / 2), height, colour);
}

function room(base: Omit<VenueLayout, "entry" | "boxes" | "things" | "specials" | "people" | "signs"> & Partial<VenueLayout>): VenueLayout {
  return {
    entry: { x: base.width / 2, z: base.depth - 1.6 },
    boxes: [],
    things: [],
    specials: [],
    people: [],
    signs: [],
    ...base,
  };
}

// ---- clubs -----------------------------------------------------------------------------------

type ClubStyle = { floor: string; floorAlt: string; wall: string; trim: string; neon: string[]; sofa: string; motto: string };

const CLUB_STYLES: Record<string, ClubStyle> = {
  patricia: { floor: "#1a1012", floorAlt: "#221418", wall: "#2a1418", trim: "#c79a2b", neon: ["#ffcc33", "#ff3355", "#ffffff"], sofa: "#6e1423", motto: "Luxury. Gold. Champagne nights." },
  patio: { floor: "#121a14", floorAlt: "#17211a", wall: "#1d2a21", trim: "#7dff3a", neon: ["#7dff3a", "#00e5ff", "#ffe600"], sofa: "#2a4a30", motto: "Afrobeats under the palm trees" },
  space: { floor: "#0b0d1c", floorAlt: "#101330", wall: "#12143a", trim: "#9d4dff", neon: ["#9d4dff", "#00e5ff", "#ff2d95"], sofa: "#2a1d5a", motto: "Out of this world" },
  darkalley: { floor: "#0e0b0b", floorAlt: "#151010", wall: "#1c1414", trim: "#ff2d2d", neon: ["#ff2d2d", "#ff7a00", "#ffffff"], sofa: "#3a1010", motto: "Underground sound" },
};

function club(id: string, name: string, width: number, depth: number): VenueLayout {
  const style = CLUB_STYLES[id];
  const mid = width / 2;
  const floorZ = depth * 0.43;
  const tiles = 4, tile = 1.6;
  const barZ = depth * 0.46, barHz = depth * 0.21;
  const boxes: Box[] = [
    // The DJ on a stage against the back wall, between two stacks of speakers.
    solid(mid, 1.6, 3.0, 1.0, 0.5, "#1d1d22"),
    solid(mid, 1.4, 1.4, 0.4, 1.4, "#26262c", 0.5),
    glow(mid, 1.0, 1.3, 0.05, 1.42, 1.48, style.neon[0]),
    solid(mid - 4.3, 1.3, 0.55, 0.5, 2.6, "#151518"),
    solid(mid + 4.3, 1.3, 0.55, 0.5, 2.6, "#151518"),
    // The bar down the left wall, bottles lit behind it.
    solid(3.3, barZ, 0.4, barHz, 1.1, "#2b2b30"),
    glow(3.72, barZ, 0.02, barHz, 1.0, 1.06, style.neon[1]),
    deco(1.0, barZ, 0.25, barHz, 0, 2.4, "#1d1d22"),
    glow(1.27, barZ, 0.02, barHz - 0.3, 1.3, 1.36, style.neon[0]),
    glow(1.27, barZ, 0.02, barHz - 0.3, 1.9, 1.96, style.neon[2]),
    // Booths down the right wall.
    ...[0.3, 0.5, 0.7].flatMap((f) => [solid(width - 0.9, depth * f, 0.45, 1.3, 0.5, style.sofa), solid(width - 2.2, depth * f, 0.5, 0.6, 0.6, "#2b2b30")]),
    // Neon strips along the walls and a light truss over the floor.
    glow(mid, 0.05, mid - 0.5, 0.03, 3.6, 3.7, style.neon[0]),
    glow(0.05, depth / 2, 0.03, depth / 2 - 0.5, 3.0, 3.1, style.neon[1]),
    glow(width - 0.05, depth / 2, 0.03, depth / 2 - 0.5, 3.0, 3.1, style.neon[2]),
    deco(mid, floorZ, 3.8, 0.06, 5.0, 5.12, "#3a3d42"),
  ];
  if (id === "space") {
    // Stars on the ceiling, and a planet over the DJ.
    for (let i = 0; i < 40; i++) boxes.push(glow((i * 7.3) % width, (i * 4.1) % depth, 0.05, 0.05, 5.6, 5.65, "#ffffff"));
    boxes.push(glow(mid, 0.2, 1.4, 0.05, 3.9, 5.2, "#6a4fe0"));
  }
  if (id === "patio") {
    // Palms in pots and a pergola over the bar: it feels outdoors.
    for (const [x, z] of [[1.4, depth - 2.5], [width - 1.4, depth - 2.5], [mid - 6, 2.5], [mid + 6, 2.5]]) boxes.push(...plant(x, z));
    for (let z = barZ - barHz; z <= barZ + barHz; z += 1.5) boxes.push(deco(2.6, z, 1.8, 0.06, 3.3, 3.4, "#6b4226"));
  }
  if (id === "darkalley") {
    // Brick and graffiti: painted panels on the back wall.
    for (let i = 0; i < 6; i++) boxes.push(deco(2 + i * 3.6, 0.06, 1.4, 0.03, 0.4, 2.2, ["#ff2d2d", "#ffe600", "#00e5ff", "#7dff3a", "#ff7a00", "#d63f8c"][i]));
  }
  const dancers: Person[] = [
    { x: mid - 1.6, z: floorZ - 1.6, rot: 0.5, look: PARTY[0], move: "shaku" },
    { x: mid + 1.6, z: floorZ - 0.8, rot: -0.4, look: PARTY[1], move: "legwork" },
    { x: mid - 0.8, z: floorZ + 1.6, rot: 2.6, look: PARTY[2], move: "whine" },
    { x: mid + 0.8, z: floorZ + 2.0, rot: 3.0, look: PARTY[3], move: "bounce" },
  ];
  return room({
    id, name, kind: "club", width, depth, wallHeight: 6, floor: style.floor, floorAlt: style.floorAlt, wall: style.wall, trim: style.trim,
    sky: "#07060b", lighting: "club", music: true, boxes,
    danceFloor: { x: mid, z: floorZ, tile, tiles, colours: style.neon.concat(["#ffe600", "#ff7a00", "#00e5ff"]) },
    things: [
      { spot: `${id}_dance`, name: "Dance Floor", verb: "", x: mid, z: floorZ, hx: (tile * tiles) / 2, hz: (tile * tiles) / 2, reach: 0.9, stand: "here", distance: 6 },
      { spot: `${id}_bar`, name: "Bar", verb: "", x: 3.3, z: barZ, hx: 0.4, hz: barHz, reach: 1.5, stand: { x: 4.4, z: barZ, rot: -Math.PI / 2 } },
      { spot: `${id}_dj`, name: "DJ Booth", verb: "", x: mid, z: 1.6, hx: 3.0, hz: 1.0, reach: 1.4 },
    ],
    people: [
      ...dancers,
      { x: 1.9, z: barZ, rot: Math.PI / 2, look: STAFF(1, "#1d1d1f") },
      { x: mid, z: 1.3, rot: 0, look: STAFF(2, style.trim), move: "bounce", label: "DJ" },
      { x: mid + 2.4, z: depth - 1.2, rot: Math.PI, look: STAFF(0, "#111114"), label: "Bouncer" },
      { x: width - 1.0, z: depth * 0.5, rot: -Math.PI / 2, look: PARTY[4], move: "sit" },
      { x: width - 1.0, z: depth * 0.7, rot: -Math.PI / 2, look: PARTY[5], move: "sit" },
    ],
    signs: [
      { text: name.toUpperCase(), x: mid, y: 4.6, z: 0.12, size: 1.1, colour: style.neon[0] },
      { text: style.motto, x: mid, y: 3.95, z: 0.12, size: 0.42, colour: "#ffffff" },
    ],
  });
}

// ---- lounges -----------------------------------------------------------------------------------

type LoungeStyle = { floor: string; floorAlt: string; wall: string; trim: string; sofa: string; table: string; motto: string };

const LOUNGE_STYLES: Record<string, LoungeStyle> = {
  greyfield: { floor: "#3a3530", floorAlt: "#433d37", wall: "#5b5550", trim: "#c79a2b", sofa: "#2f3a4a", table: "#6b4226", motto: "Grills · Cocktails · Live band on Fridays" },
  driveway: { floor: "#2a2a2e", floorAlt: "#323238", wall: "#3a3a42", trim: "#00e5ff", sofa: "#1f2f55", table: "#2b2b30", motto: "Lifestyle · Food · Vibes" },
  mandela: { floor: "#3b2a1c", floorAlt: "#452f1f", wall: "#55402a", trim: "#e2b657", sofa: "#6b3a1a", table: "#4f3a28", motto: "Pepper soup · Grills · Football on the big screen" },
  zzone: { floor: "#1b1f2a", floorAlt: "#212636", wall: "#262c3d", trim: "#ffe600", sofa: "#3a1d5a", table: "#2b2b30", motto: "Snooker · Games · Chilled drinks" },
};

function lounge(id: string, name: string): VenueLayout {
  const width = 22, depth = 16;
  const style = LOUNGE_STYLES[id];
  const boxes: Box[] = [
    // The bar down the left wall.
    solid(2.8, 7, 0.4, 3.6, 1.1, "#2b2b30"),
    deco(0.8, 7, 0.25, 3.6, 0, 2.3, "#1d1d22"),
    glow(1.07, 7, 0.02, 3.2, 1.4, 1.46, style.trim),
    // A big screen on the back wall.
    deco(11, 0.1, 3.4, 0.06, 1.6, 3.7, "#111114"),
    glow(11, 0.17, 3.2, 0.02, 1.7, 3.6, "#1f8a4c"),
    // Warm pendant lights over the tables.
    ...[7, 11, 15, 19].map((x) => glow(x, 8, 0.18, 0.18, 3.3, 3.5, "#ffd9a0")),
    ...plant(21, 1), ...plant(21, 15), ...plant(6, 15),
    glow(width / 2, 0.06, width / 2 - 0.6, 0.02, 3.9, 3.95, style.trim),
  ];
  // Tables in the middle, sofas along the right wall.
  for (const [x, z] of [[8, 5], [13, 5], [8, 10.5], [13, 10.5]]) boxes.push(...tableSet(x, z, style.table, style.sofa));
  boxes.push(...sofa(19.8, 4.5, 1.6, style.sofa, -1), ...sofa(19.8, 10, 1.6, style.sofa, -1));
  boxes.push(solid(18.3, 4.5, 0.6, 0.6, 0.55, style.table), solid(18.3, 10, 0.6, 0.6, 0.55, style.table));
  const things: Thing[] = [
    { spot: `${id}_table`, name: "Table", verb: "Sit at the", x: 10.5, z: 7.8, hx: 3.6, hz: 4, reach: 0.9, stand: "here" },
    { spot: `${id}_bar`, name: "Bar", verb: "", x: 2.8, z: 7, hx: 0.4, hz: 3.6, reach: 1.4, stand: { x: 3.9, z: 7, rot: -Math.PI / 2 } },
  ];
  const people: Person[] = [
    { x: 1.6, z: 7, rot: Math.PI / 2, look: STAFF(3, "#1d1d1f") },
    { x: 8.85, z: 5, rot: -Math.PI / 2, look: PARTY[1], move: "sit" },
    { x: 13, z: 10.5 + 0.85, rot: Math.PI, look: PARTY[2], move: "sit" },
    { x: 19.8, z: 10.3, rot: Math.PI, look: PARTY[4], move: "sit" },
    { x: 15.5, z: 8, rot: 2.2, look: STAFF(4, "#efeee8", "woman"), label: "Waiter" },
  ];
  if (id === "zzone") {
    boxes.push(solid(17, 13.2, 1.3, 0.75, 0.85, "#1f6b3a"), deco(17, 13.2, 1.45, 0.9, 0.7, 0.86, "#6b4226"));
    for (let i = 0; i < 3; i++) boxes.push(solid(5 + i * 1.4, 14.6, 0.5, 0.45, 1.7, "#26262c"), glow(5 + i * 1.4, 14.13, 0.4, 0.02, 1.0, 1.55, ["#00e5ff", "#ff2d95", "#ffe600"][i]));
    things.push({ spot: "zzone_snooker", name: "Snooker table", verb: "Play at the", x: 17, z: 13.2, hx: 1.3, hz: 0.75, reach: 1.2 });
    people.push({ x: 17, z: 12, rot: 0, look: PARTY[5] });
  }
  return room({
    id, name, kind: "lounge", width, depth, wallHeight: 4.2, floor: style.floor, floorAlt: style.floorAlt, wall: style.wall, trim: style.trim,
    sky: "#120f0c", lighting: "warm", boxes, things, people,
    signs: [
      { text: name, x: 11, y: 4.15, z: 0.12, size: 0.65, colour: style.trim },
      { text: style.motto, x: 11, y: 1.3, z: 0.18, size: 0.3, colour: "#ffffff" },
    ],
  });
}

// ---- the National Museum ------------------------------------------------------------------------

function museum(): VenueLayout {
  const width = 34, depth = 26;
  const bronze = "#8a5a2b", plinth = "#e9dfc9", wood = "#6b4226";
  const boxes: Box[] = [];
  const specials: Special[] = [];
  // The model of the old city in the middle: the moat, the wall, the wards and the palace.
  const cx = 17, cz = 11;
  boxes.push(solid(cx, cz, 4.4, 3.6, 0.8, "#4f3a28"));
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    boxes.push(deco(cx + Math.cos(a) * 3.5, cz + Math.sin(a) * 2.8, 0.42, 0.42, 0.8, 0.86, "#2a4a5a"));   // the moat
    boxes.push(deco(cx + Math.cos(a) * 3.0, cz + Math.sin(a) * 2.35, 0.36, 0.36, 0.8, 1.05, "#a0522d"));  // the wall
  }
  for (const [x, z] of [[-1.6, -1], [1.5, -1.1], [-1.8, 1], [1.7, 1.1], [0, 1.6], [-0.2, -1.7]]) boxes.push(deco(cx + x, cz + z, 0.35, 0.3, 0.8, 1.05, "#c79a6b")); // wards
  boxes.push(deco(cx, cz, 1.0, 0.8, 0.8, 1.2, "#b5651d"), deco(cx, cz, 0.7, 0.5, 1.2, 1.35, "#8b4513")); // the palace
  for (const [x, z] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]) boxes.push(deco(cx + x, cz + z, 0.1, 0.1, 1.2, 1.75, "#8b4513")); // turrets
  for (const [x, z] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]) boxes.push(deco(cx + x, cz + z, 0.07, 0.12, 1.75, 1.85, bronze)); // brass birds
  specials.push({ kind: "story", story: DIORAMA, x: cx, z: cz + 4.2, reach: 1.6 });

  // The cases round the walls: back wall, then left and right walls. Each has its story.
  const spots: [number, number, "back" | "left" | "right" | "free"][] = [
    [4, 1.2, "back"], [8.5, 1.2, "back"], [13, 1.2, "back"], [21, 1.2, "back"], [25.5, 1.2, "back"], [30, 1.2, "back"],
    [1.2, 6, "left"], [1.2, 11, "left"], [1.2, 16, "left"],
    [32.8, 6, "right"], [32.8, 11, "right"], [32.8, 16, "right"],
    [8, 18, "free"], [26, 18, "free"], [17, 1.2, "back"],
  ];
  STORIES.forEach((story, index) => {
    const [x, z, side] = spots[index % spots.length];
    // A plinth with something bronze on it, and a wall plaque behind.
    boxes.push(solid(x, z, 0.55, 0.55, 1.0, plinth));
    if (index % 3 === 0) boxes.push(deco(x, z, 0.22, 0.2, 1.0, 1.55, bronze), deco(x, z, 0.26, 0.24, 1.0, 1.12, "#c0392b"));           // a commemorative head with coral
    else if (index % 3 === 1) boxes.push(deco(x, z, 0.35, 0.05, 1.0, 1.75, bronze), deco(x, z + 0.06, 0.22, 0.02, 1.25, 1.55, "#5a3a1a")); // a plaque on a stand
    else boxes.push(deco(x, z, 0.12, 0.12, 1.0, 1.85, "#efe6d0"), deco(x, z, 0.2, 0.2, 1.55, 1.7, "#c0392b"));                               // an ivory figure
    if (side === "back") boxes.push(deco(x, 0.08, 0.9, 0.05, 1.6, 2.8, wood), deco(x, 0.14, 0.75, 0.02, 1.7, 2.7, bronze));
    if (side === "left") boxes.push(deco(0.08, z, 0.05, 0.9, 1.6, 2.8, wood), deco(0.14, z, 0.02, 0.75, 1.7, 2.7, bronze));
    if (side === "right") boxes.push(deco(width - 0.08, z, 0.05, 0.9, 1.6, 2.8, wood), deco(width - 0.14, z, 0.02, 0.75, 1.7, 2.7, bronze));
    const out = side === "back" || side === "free" ? [0, 1.3] : side === "left" ? [1.3, 0] : [-1.3, 0];
    specials.push({ kind: "story", story, x: x + out[0], z: z + out[1], reach: 1.3 });
  });

  // Queen Idia's mask, big, in its own case at the back.
  boxes.push(solid(17, 4.2, 0.7, 0.7, 1.1, "#1d1d22"), deco(17, 4.2, 0.32, 0.12, 1.1, 2.0, "#efe6d0"), deco(17, 4.2, 0.36, 0.14, 1.85, 2.05, "#c0392b"));
  boxes.push({ x: 17, z: 4.2, hx: 0.72, hz: 0.72, y0: 1.1, y1: 2.3, c: "#bfe3ff", glass: true });
  // The front desk and the shop either side of the way in.
  boxes.push(solid(26, 22.2, 2.4, 0.5, 1.05, wood), solid(7.5, 22.2, 2.4, 0.5, 1.05, wood));
  boxes.push(...shelf(5.2, 24.9, 2.2, 0.3, wood, [bronze, "#c0392b", "#efe6d0", "#2a4a5a"], 1));
  // Benches for sitting with the stories.
  boxes.push(solid(11, 15.5, 1.2, 0.3, 0.45, wood), solid(23, 15.5, 1.2, 0.3, 0.45, wood));
  specials.push({ kind: "shop", shop: "museumshop", name: "Museum shop", x: 7.5, z: 23.3, reach: 1.4 });
  return room({
    id: "museum", name: "National Museum", kind: "museum", width, depth, wallHeight: 5.5,
    floor: "#b39b7a", floorAlt: "#a88f6e", wall: "#e9dfc9", trim: "#8a5a2b", sky: "#2a2420", lighting: "bright",
    boxes, specials,
    things: [{ spot: "museum_desk", name: "Front desk", verb: "Talk to the", x: 26, z: 22.2, hx: 2.4, hz: 0.5, reach: 1.4 }],
    people: [
      { x: 26, z: 21.3, rot: 0, look: STAFF(2, "#2f4a6b", "woman"), label: "Curator" },
      { x: 7.5, z: 21.3, rot: 0, look: STAFF(1, "#c0392b"), label: "Shop" },
      { x: 9, z: 3, rot: Math.PI, look: PARTY[2] },
      { x: 2.8, z: 11, rot: -Math.PI / 2, look: PARTY[1] },
      { x: 11, z: 15.5, rot: Math.PI, look: PARTY[3], move: "sit" },
    ],
    signs: [
      { text: "THE BENIN KINGDOM", x: 17, y: 4.3, z: 0.12, size: 0.8, colour: "#8a5a2b" },
      { text: "Igodomigodo · Edo · Benin — a thousand years of history", x: 17, y: 3.6, z: 0.12, size: 0.32, colour: "#3a2a1a" },
      { text: "Front desk · Guided tours", x: 26, y: 2.4, z: 22.2, size: 0.3, colour: "#3a2a1a", back: "#e9dfc9" },
      { text: "Museum shop", x: 7.5, y: 2.4, z: 22.2, size: 0.3, colour: "#3a2a1a", back: "#e9dfc9" },
      { text: "Queen Idia", x: 17, y: 2.6, z: 4.2, size: 0.3, colour: "#3a2a1a", back: "#e9dfc9" },
    ],
  });
}

// ---- the Old Residency: a haunted house ----------------------------------------------------------

function haunted(): VenueLayout {
  const width = 26, depth = 26;
  const wood = "#2a1d14", dust = "#3a3530", sheet = "#cfcac0";
  const boxes: Box[] = [
    // The way through is a maze of rooms: the walls below leave one path, front to back.
    wall(0, 19, 18, 19, 3.6, dust),
    wall(8, 13, 26, 13, 3.6, dust),
    wall(0, 7, 18, 7, 3.6, dust),
    wall(13, 19, 13, 23, 3.6, dust),
    wall(6, 7, 6, 11, 3.6, dust),
    wall(20, 2, 20, 7, 3.6, dust),
    // An old piano, chairs under white sheets, a long dining table, a coffin.
    solid(3, 21.5, 1.3, 0.6, 1.2, "#120d0a"),
    ...[[8, 22.8], [11.8, 21.4], [16, 22.5]].map(([x, z]) => solid(x, z, 0.45, 0.45, 1.0, sheet)),
    solid(14, 16, 3.0, 0.8, 0.8, wood),
    ...[11.5, 13, 14.5, 16].flatMap((x) => [deco(x, 14.8, 0.25, 0.25, 0, 1.2, wood), deco(x, 17.2, 0.25, 0.25, 0, 1.2, wood)]),
    solid(4, 10, 1.1, 0.45, 0.7, "#1a1210"),
    deco(4, 10, 1.15, 0.5, 0.7, 0.78, "#3a2a1a"),
    // Portraits on the walls, a fallen chandelier, cobwebs.
    ...[[4, 0.1], [10, 0.1], [16, 0.1]].map(([x, z]) => deco(x, z, 0.6, 0.05, 1.5, 2.5, "#3a2a1a")),
    deco(22, 9.5, 1.2, 1.2, 0, 0.4, "#5a4a2a"),
    deco(22, 9.5, 0.1, 0.1, 0.4, 3.0, "#3a3530"),
    // The way out at the back left: a door with a faint green light over it.
    deco(2.5, 0.08, 1.0, 0.08, 0, 2.4, "#120d0a"),
    glow(2.5, 0.12, 0.5, 0.03, 2.55, 2.7, "#2dff6a"),
    // Bloody handprints on the walls, a rocking chair, a broken mirror, a doll in the corner.
    ...[[0.06, 16.5], [0.06, 17.2], [0.06, 9.4]].map(([x, z]) => deco(x, z, 0.02, 0.18, 1.1, 1.38, "#6a0a0a")),
    ...[[25.94, 4.5], [25.94, 5.1], [25.94, 21]].map(([x, z]) => deco(x, z, 0.02, 0.18, 1.2, 1.48, "#6a0a0a")),
    ...[[10.8, 13.17], [11.5, 13.17]].map(([x, z]) => deco(x, z, 0.18, 0.02, 1.0, 1.28, "#6a0a0a")),
    solid(23.5, 23.5, 0.45, 0.45, 1.0, "#2a1d14"), deco(23.5, 23.1, 0.45, 0.06, 1.0, 1.7, "#2a1d14"),
    deco(25.9, 15, 0.04, 0.7, 1.1, 2.3, "#8a9aa2"), deco(25.88, 15.2, 0.04, 0.05, 1.2, 2.2, "#1a1a1a"),
    deco(1.0, 12.4, 0.15, 0.12, 0, 0.42, "#cfc6b4"), deco(1.0, 12.4, 0.1, 0.1, 0.42, 0.6, "#e8d9c4"),
    ...[[12, 18.6], [19, 12.6], [5, 6.6], [22, 1]].map(([x, z]) => deco(x, z, 0.5, 0.04, 3.0, 3.5, "#bfbab0")),
    // Blood on the floor by the coffin, and candles.
    deco(5.5, 11.5, 0.7, 0.4, 0.004, 0.01, "#5a0a0a"),
    ...[[8.5, 16], [19.5, 16], [11, 4], [24, 20]].map(([x, z]) => glow(x, z, 0.04, 0.04, 0.9, 1.05, "#ffb347")),
  ];
  return room({
    id: "haunted", name: "The Old Residency", kind: "haunted", width, depth, wallHeight: 3.6,
    floor: "#2a1f17", floorAlt: "#251b14", wall: "#3a332c", trim: "#1a1410", sky: "#020203", lighting: "dark",
    boxes,
    things: [{ spot: "haunt_exit", name: "Way out", verb: "Run for the", x: 2.5, z: 0.6, hx: 1.0, hz: 0.5, reach: 1.6 }],
    scares: [
      { id: "piano", x: 5, z: 21, r: 2.2, kind: "slam", line: "The piano lid slams shut behind you." },
      { id: "sheet", x: 10.5, z: 20.5, r: 1.8, kind: "ghost", ghost: { x: 16, z: 21.5, rot: -Math.PI / 2 }, line: "One of the sheets is standing up." },
      { id: "table", x: 20, z: 16, r: 2.2, kind: "lights", line: "The candles go out. Someone is breathing." },
      { id: "dining", x: 9.5, z: 16, r: 1.8, kind: "face", line: "" },
      { id: "corridor", x: 15, z: 10, r: 3.0, kind: "hands", line: "Something grabs your ankle." },
      { id: "coffin", x: 5.5, z: 9.5, r: 2.0, kind: "ghost", ghost: { x: 4, z: 10, rot: 0 }, line: "The coffin lid is open now." },
      { id: "last", x: 9, z: 3.5, r: 2.0, kind: "face", line: "" },
    ],
    people: [{ x: -100, z: -100, rot: 0, look: GHOST, ghost: true }],
    signs: [
      { text: "THE OLD RESIDENCY · 1898", x: 10, y: 3.0, z: 0.12, size: 0.4, colour: "#8a1a1a" },
      { text: "GET OUT", x: 22, y: 2.0, z: 13.2, size: 0.55, colour: "#8a0a0a" },
      { text: "EXIT", x: 2.5, y: 3.0, z: 0.12, size: 0.35, colour: "#2dff6a" },
      { text: "HELP ME", x: 4, y: 1.9, z: 19.17, size: 0.5, colour: "#7a0a0a" },
      { text: "SHE IS STILL HERE", x: 12, y: 2.2, z: 7.17, size: 0.42, colour: "#7a0a0a" },
    ],
    mist: { colour: "#0a0c0b", near: 2.5, far: 15 },
  });
}

// ---- Stop & Shop Mall ----------------------------------------------------------------------------

function mall(): VenueLayout {
  const width = 38, depth = 26;
  const boxes: Box[] = [
    // Shop fronts along the back: the boutique (left), the supermarket (right).
    // Glass shop fronts: a low wall, glass above it, and the shop's name over the top.
    wall(0, 9, 10.8, 9, 0.9, "#e8e4dc"), wall(16.2, 9, 21.8, 9, 0.9, "#e8e4dc"), wall(27.2, 9, 38, 9, 0.9, "#e8e4dc"),
    ...[[5.4, 5.4], [19, 2.8], [32.6, 5.4]].map(([x, half]) => ({ x, z: 9, hx: half, hz: 0.06, y0: 0.9, y1: 3.3, c: "#bfe3ff", glass: true }) as Box),
    deco(19, 9, 19, 0.16, 3.3, 4.2, "#e8e4dc"),
    wall(14, 0, 14, 9, 4.2, "#d8d2c6"), wall(24, 0, 24, 9, 4.2, "#d8d2c6"),
    glow(6, 9.2, 5.5, 0.04, 3.4, 3.9, "#d63f8c"), glow(31, 9.2, 6.5, 0.04, 3.4, 3.9, "#2f9e54"), glow(19, 9.2, 2.6, 0.04, 3.4, 3.9, "#2f6fd6"),
    // In the boutique: rails of clothes, mannequins, a mirror, two changing rooms.
    ...[[3, 3], [3, 6], [9, 3]].flatMap(([x, z]) => [solid(x, z, 1.4, 0.12, 1.6, "#9a9d9f"),
      ...[0, 1, 2, 3, 4, 5].map((i) => deco(x - 1.15 + i * 0.46, z, 0.18, 0.25, 0.7, 1.55, ["#c0392b", "#1f2f55", "#efeee8", "#e2b657", "#6a3d9a", "#1f8a4c"][i]))]),
    solid(9.5, 6.5, 0.3, 0.3, 1.8, "#efeee8"), deco(9.5, 6.5, 0.32, 0.22, 0.9, 1.6, "#b8860b"),
    solid(11.5, 6.5, 0.3, 0.3, 1.8, "#efeee8"), deco(11.5, 6.5, 0.32, 0.22, 0.9, 1.6, "#1f2f55"),
    deco(0.08, 3, 0.04, 0.8, 0.3, 2.3, "#bfe3ff"),
    solid(1.2, 7.8, 1.1, 0.06, 2.4, "#6b4226"), deco(1.2, 8.3, 1.1, 0.02, 0.2, 2.2, "#7a1f2b"),
    // The supermarket: shelves and a till.
    ...shelf(28, 3, 2.6, 0.4, "#9a9d9f", ["#d64545", "#f2c200", "#2f6fd6", "#2f9e54", "#ede6d6", "#e88a2b"], 0),
    ...shelf(34, 3, 2.6, 0.4, "#9a9d9f", ["#c9a36a", "#d63f8c", "#2a9d8f", "#f2c200", "#3a3d42"], 2),
    ...shelf(31, 6.2, 4.5, 0.4, "#9a9d9f", ["#e88a2b", "#ede6d6", "#2f6fd6", "#d64545"], 4),
    solid(27, 8.0, 1.0, 0.4, 1.0, "#3a3d42"),
    // The arcade in the middle shop: lit cabinets.
    ...[16, 17.5, 19, 20.5, 22].map((x) => solid(x, 1.2, 0.55, 0.5, 1.9, "#1d1d22")).concat(
      [16, 17.5, 19, 20.5, 22].map((x, i) => glow(x, 1.72, 0.45, 0.02, 1.0, 1.75, ["#00e5ff", "#ff2d95", "#ffe600", "#7dff3a", "#9d4dff"][i]))),
    solid(19, 5.5, 0.9, 0.9, 1.4, "#26262c"), glow(19, 5.5, 0.7, 0.7, 1.4, 1.45, "#00e5ff"),
    // The concourse: a fountain, planters, benches; the food court at the front right.
    solid(19, 15, 2.0, 2.0, 0.5, "#b9bcc0"), glow(19, 15, 1.7, 1.7, 0.5, 0.52, "#5ab8e8"), deco(19, 15, 0.25, 0.25, 0.5, 1.6, "#d9e7f2"),
    ...plant(12, 15), ...plant(26, 15),
    solid(8, 12.5, 1.4, 0.3, 0.45, "#6b4226"), solid(30, 12.5, 1.4, 0.3, 0.45, "#6b4226"),
    solid(34, 17.5, 3.2, 0.5, 1.05, "#c0392b"), glow(34, 16.9, 3.0, 0.02, 2.4, 3.0, "#f2c200"),
    ...tableSet(29, 21, "#efeee8", "#c0392b"), ...tableSet(33, 21.5, "#efeee8", "#c0392b"), ...tableSet(25, 22, "#efeee8", "#c0392b"),
  ];
  return room({
    id: "mall", name: "Stop & Shop Mall", kind: "mall", width, depth, wallHeight: 6,
    floor: "#ece8e0", floorAlt: "#e2ddd3", wall: "#f2efe9", trim: "#2f9e54", sky: "#d9e4ec", lighting: "bright",
    boxes,
    things: [
      { spot: "mall_food", name: "Food court", verb: "Order at the", x: 34, z: 17.5, hx: 3.2, hz: 0.5, reach: 1.5 },
      { spot: "mall_arcade", name: "Arcade", verb: "Play in the", x: 19, z: 3.5, hx: 3.3, hz: 2.5, reach: 0.8, stand: "here" },
    ],
    specials: [
      { kind: "wardrobe", name: "The boutique", x: 6, z: 5, reach: 3.2 },
      { kind: "shop", shop: "stopshop", name: "Stop & Shop supermarket", x: 30, z: 5.5, reach: 3.2 },
    ],
    people: [
      { x: 6, z: 7.6, rot: Math.PI, look: STAFF(2, "#d63f8c", "woman"), label: "Boutique" },
      { x: 27, z: 7.3, rot: Math.PI, look: STAFF(1, "#2f9e54"), label: "Till" },
      { x: 34, z: 18.4, rot: Math.PI, look: STAFF(3, "#f2c200"), label: "Food court" },
      { x: 22, z: 17, rot: 2.5, look: PARTY[0] },
      { x: 15, z: 12, rot: 0.6, look: PARTY[3] },
      { x: 29, z: 21.85, rot: Math.PI, look: PARTY[5], move: "sit" },
      { x: 17.5, z: 2.4, rot: Math.PI, look: PARTY[1] },
    ],
    signs: [
      { text: "BOUTIQUE", x: 6, y: 4.6, z: 9.25, size: 0.6, colour: "#d63f8c", face: "front" },
      { text: "ARCADE", x: 19, y: 4.6, z: 9.25, size: 0.55, colour: "#2f6fd6", face: "front" },
      { text: "STOP & SHOP", x: 31, y: 4.6, z: 9.25, size: 0.6, colour: "#2f9e54", face: "front" },
      { text: "Food court · Shawarma · Ice cream", x: 34, y: 3.3, z: 16.85, size: 0.3, colour: "#3a2a1a", face: "front" },
      { text: "Changing rooms", x: 1.2, y: 2.65, z: 7.9, size: 0.26, colour: "#3a2a1a", face: "front" },
    ],
  });
}

// ---- UBTH -------------------------------------------------------------------------------------------

function hospital(): VenueLayout {
  const width = 32, depth = 22;
  const green = "#2f6f5e", bed = "#f4f4f1", curtain = "#9fd3c7";
  const boxes: Box[] = [
    // Consulting room (back left) and ward (back right), behind partitions with gaps to walk in.
    wall(0, 9, 4, 9, 2.1, "#dfe9e4"), wall(7, 9, 12, 9, 2.1, "#dfe9e4"), wall(12, 0, 12, 9, 2.1, "#dfe9e4"),
    wall(16, 9, 19, 9, 2.1, "#dfe9e4"), wall(22, 9, 32, 9, 2.1, "#dfe9e4"), wall(16, 0, 16, 9, 2.1, "#dfe9e4"),
    // The doctor's desk, a couch, a chart on the wall.
    solid(6, 3, 1.2, 0.6, 0.8, "#6b4226"), solid(2, 6.5, 0.6, 1.2, 0.6, "#dfe9f2"), deco(6, 0.08, 0.5, 0.04, 1.4, 2.2, "#f4f4f1"),
    // The ward: four beds with curtains between them.
    ...[18.5, 22, 25.5, 29].flatMap((x) => [solid(x, 3, 0.55, 1.1, 0.6, bed), deco(x, 2.1, 0.55, 0.2, 0.6, 0.75, "#ffffff"), deco(x + 1.6, 3, 0.03, 1.2, 0.2, 2.2, curtain)]),
    // The pharmacy window on the right wall, the canteen at the front right.
    solid(31.4, 14, 0.5, 2.2, 1.1, green), deco(31.9, 14, 0.06, 2.0, 1.1, 2.6, "#bfe3ff"),
    solid(27.5, 20.2, 2.6, 0.5, 1.0, "#c79a2b"), ...tableSet(23, 17, "#efeee8", "#2f6f5e"),
    // Reception at the front left, and rows of waiting chairs.
    solid(5, 17.5, 2.6, 0.6, 1.1, green), deco(5, 17.5, 2.6, 0.62, 1.1, 1.15, "#efeee8"),
    ...[12, 14.5].flatMap((z) => [solid(14, z, 3.5, 0.3, 0.45, "#35557a"), deco(14, z - 0.3, 3.5, 0.06, 0.45, 0.9, "#35557a")]),
    glow(16, 9.15, 1.4, 0.03, 2.5, 2.9, "#c8432b"),
    ...plant(1, 20.5), ...plant(10.5, 20.8),
  ];
  return room({
    id: "ubth", name: "UBTH", kind: "hospital", width, depth, wallHeight: 4,
    floor: "#e9eef0", floorAlt: "#dde4e7", wall: "#f4f7f6", trim: green, sky: "#cfe0e6", lighting: "bright",
    boxes,
    things: [
      { spot: "ubth_reception", name: "Reception", verb: "Go to", x: 5, z: 17.5, hx: 2.6, hz: 0.6, reach: 1.4 },
      { spot: "ubth_doctor", name: "Consulting room", verb: "See the doctor in the", x: 6, z: 4.2, hx: 1.6, hz: 1.4, reach: 1.0 },
      { spot: "ubth_ward", name: "Ward", verb: "Rest in the", x: 23.8, z: 4.5, hx: 6.5, hz: 2.2, reach: 0.8, stand: { x: 22, z: 3.4, y: 0.6, rot: Math.PI } },
      { spot: "ubth_pharmacy", name: "Pharmacy", verb: "Go to the", x: 31.4, z: 14, hx: 0.5, hz: 2.2, reach: 1.4 },
      { spot: "ubth_canteen", name: "Canteen", verb: "Eat at the", x: 27.5, z: 20.2, hx: 2.6, hz: 0.5, reach: 1.4 },
    ],
    people: [
      { x: 5, z: 16.6, rot: 0, look: NURSE(2), label: "Reception" },
      { x: 6, z: 2.2, rot: 0, look: WHITE_COAT(1), label: "Dr Osaze" },
      { x: 22, z: 6, rot: 2.4, look: NURSE(4), label: "Nurse" },
      { x: 25.5, z: 3.2, rot: Math.PI, look: person("man", 3, "#9fd3c7", "#9fd3c7"), move: "sit" },
      { x: 12.5, z: 12, rot: Math.PI, look: PARTY[2], move: "sit" },
      { x: 15.5, z: 14.5, rot: Math.PI, look: PARTY[1], move: "sit" },
      { x: 31, z: 14, rot: -Math.PI / 2, look: WHITE_COAT(5, "woman"), label: "Pharmacy" },
      { x: 27.5, z: 21, rot: Math.PI, look: STAFF(0, "#c79a2b", "woman") },
    ],
    signs: [
      { text: "UNIVERSITY OF BENIN TEACHING HOSPITAL", x: 16, y: 3.5, z: 0.12, size: 0.42, colour: green },
      { text: "Consulting", x: 9.5, y: 1.75, z: 9.2, size: 0.3, colour: green, face: "front" },
      { text: "Ward", x: 26, y: 1.75, z: 9.2, size: 0.3, colour: green, face: "front" },
      { text: "Reception · Card", x: 5, y: 2.2, z: 17.5, size: 0.3, colour: "#ffffff", back: green },
      { text: "Pharmacy", x: 31.3, y: 2.9, z: 14, size: 0.3, colour: "#ffffff", back: green, face: "left" },
      { text: "Canteen", x: 27.5, y: 2.2, z: 20.2, size: 0.3, colour: "#3a2a1a", back: "#f2c200" },
    ],
  });
}

// ---- Central Police Station ---------------------------------------------------------------------------

function police(): VenueLayout {
  const width = 22, depth = 16;
  const blue = "#1f3a6b";
  const boxes: Box[] = [
    // The counter of the charge room across the room, with a gap at the right end.
    solid(8.5, 7, 8.5, 0.5, 1.15, "#6b4226"),
    deco(8.5, 7, 8.5, 0.52, 1.15, 1.2, "#3a2a1a"),
    // The cell at the back right, behind bars.
    ...Array.from({ length: 12 }, (_, i) => solid(14 + i * 0.6, 4.2, 0.04, 0.04, 2.8, "#5a5f66")),
    wall(14, 0, 14, 4.2, 3.6, "#cfd3cc"),
    solid(19.5, 1.2, 1.5, 0.45, 0.45, "#5a5f66"),
    // Desks behind the counter, a filing cabinet, the notice board.
    solid(4, 3, 1.1, 0.6, 0.78, "#6b4226"), solid(9, 3, 1.1, 0.6, 0.78, "#6b4226"), solid(1, 1, 0.5, 0.4, 1.4, "#5a5f66"),
    deco(6, 0.08, 2.2, 0.04, 1.3, 2.6, "#c9b48a"),
    ...[[4.8, 0.12], [6.3, 0.12], [7.4, 0.12]].map(([x, z]) => deco(x, z, 0.35, 0.02, 1.6, 2.3, "#f4f4f1")),
    // Benches along the front wall for people waiting.
    solid(4, 14.8, 2.5, 0.3, 0.45, "#6b4226"), solid(17, 14.8, 2.5, 0.3, 0.45, "#6b4226"),
    glow(11, 0.08, 1.2, 0.02, 3.0, 3.2, "#2f6fd6"),
  ];
  return room({
    id: "police", name: "Central Police Station", kind: "police", width, depth, wallHeight: 3.8,
    floor: "#8d8a80", floorAlt: "#858277", wall: "#cfd3cc", trim: blue, sky: "#2a2c30", lighting: "bright",
    boxes,
    things: [{ spot: "police_desk", name: "Charge room", verb: "Go to the", x: 8.5, z: 7, hx: 8.5, hz: 0.5, reach: 1.3 }],
    people: [
      { x: 6, z: 6.1, rot: 0, look: POLICE(1), label: "Desk officer" },
      { x: 9, z: 2.3, rot: 0, look: POLICE(3), move: "sit" },
      { x: 13, z: 5.4, rot: -0.6, look: POLICE(0, "woman") },
      { x: 18, z: 2.0, rot: 0, look: person("man", 2, "#c0392b", "#2b3a55"), label: "In the cell" },
      { x: 4, z: 14.8, rot: Math.PI, look: PARTY[1], move: "sit" },
    ],
    signs: [
      { text: "NIGERIA POLICE FORCE", x: 11, y: 3.35, z: 0.12, size: 0.45, colour: blue },
      { text: "BAIL IS FREE", x: 11, y: 2.6, z: 0.12, size: 0.5, colour: "#c0392b" },
      { text: "Police is your friend · Report misconduct to the Complaint Response Unit", x: 11, y: 2.05, z: 0.12, size: 0.24, colour: "#1d1d1f" },
      { text: "CHARGE ROOM", x: 8.5, y: 1.9, z: 7.55, size: 0.3, colour: "#ffffff", back: blue, face: "front" },
      { text: "CELL", x: 17.5, y: 3.0, z: 4.25, size: 0.3, colour: "#ffffff", back: "#5a5f66", face: "front" },
    ],
  });
}

// ---- GRA Golf Club --------------------------------------------------------------------------------------

function golf(): VenueLayout {
  const width = 64, depth = 44;
  const fairway = "#4f9a3a", rough = "#3f7d2f", sand = "#e3d3a1", water = "#3a7fa8";
  const boxes: Box[] = [
    // Rough at the edges, sand traps, a pond, three greens with flags.
    deco(32, 2, 32, 2, 0, 0.02, rough), deco(2, 22, 2, 22, 0, 0.02, rough), deco(62, 22, 2, 22, 0, 0.02, rough),
    deco(20, 12, 3, 1.5, 0, 0.03, sand), deco(44, 20, 2.5, 2, 0, 0.03, sand), deco(30, 30, 2, 1.2, 0, 0.03, sand),
    deco(52, 9, 5, 3, 0, 0.025, water),
    ...[[12, 8], [36, 6], [56, 30]].flatMap(([x, z]) => [deco(x, z, 3, 3, 0, 0.035, "#6cc04a"), solid(x, z, 0.03, 0.03, 2.2, "#efeee8"), deco(x + 0.3, z, 0.3, 0.02, 1.8, 2.15, "#c0392b")]),
    // The tee: a raised square with markers, and a rack of clubs.
    deco(8, 38, 2.2, 2.2, 0, 0.12, "#6cc04a"), deco(6.8, 37, 0.1, 0.1, 0.12, 0.3, "#efeee8"), deco(9.2, 37, 0.1, 0.1, 0.12, 0.3, "#efeee8"),
    solid(4.5, 40, 0.6, 0.3, 1.0, "#3a3d42"),
    // The clubhouse at the front right: a veranda with tables, the bar inside.
    solid(54, 40.5, 8, 2.5, 3.2, "#efe6d0"), deco(54, 37.5, 8.6, 1.2, 3.1, 3.3, "#8a4a32"),
    ...[47, 50, 53, 56, 59, 61.5].map((x) => solid(x, 36.6, 0.1, 0.1, 3.1, "#efe6d0")),
    ...tableSet(50, 34.5, "#efeee8", "#6b4226"), ...tableSet(56, 34.5, "#efeee8", "#6b4226"),
    // Golf carts by the path, and trees round the course.
    ...[[40, 40], [43, 40]].flatMap(([x, z]) => [solid(x, z, 0.7, 1.2, 1.0, "#efeee8"), deco(x, z, 0.75, 1.25, 1.8, 1.9, "#2f6f5e"), deco(x, z - 0.9, 0.05, 0.05, 1.0, 1.8, "#3a3d42")]),
    ...[[3, 4], [18, 3], [27, 18], [40, 12], [60, 14], [3, 30], [24, 41], [46, 28], [62, 3], [33, 38]].flatMap(([x, z]) => [
      solid(x, z, 0.3, 0.3, 2.2, "#5a3a26"), deco(x, z, 1.6, 1.6, 2.2, 4.6, "#2e6b2a")]),
  ];
  return room({
    id: "golf", name: "GRA Golf Club", kind: "golf", width, depth, wallHeight: 1.0, open: true,
    floor: fairway, floorAlt: "#4a9236", wall: "#3f5a2f", trim: "#efe6d0", sky: "#8ec5ea", lighting: "day",
    boxes,
    things: [
      { spot: "golf_tee", name: "First tee", verb: "Step up to the", x: 8, z: 38, hx: 2.2, hz: 2.2, reach: 0.8, stand: "here", distance: 7 },
      { spot: "golf_house", name: "Clubhouse", verb: "Sit at the", x: 53, z: 34.5, hx: 6, hz: 1.6, reach: 1.0, stand: "here" },
    ],
    people: [
      { x: 12, z: 10, rot: 0.8, look: person("man", 1, "#efeee8", "#2b2b30", "#f2f2f2") },
      { x: 36.5, z: 7.5, rot: -0.6, look: person("woman", 3, "#d63f8c", "#efeee8", "#f2f2f2") },
      { x: 10, z: 39.5, rot: Math.PI, look: STAFF(2, "#2f6f5e"), label: "Caddie" },
      { x: 50, z: 35.4, rot: Math.PI, look: PARTY[1], move: "sit" },
      { x: 56.85, z: 34.5, rot: -Math.PI / 2, look: PARTY[4], move: "sit" },
      { x: 54, z: 38.6, rot: Math.PI, look: STAFF(0, "#efeee8"), label: "Clubhouse" },
    ],
    signs: [
      { text: "GRA GOLF CLUB · Benin City", x: 54, y: 3.7, z: 43.1, size: 0.55, colour: "#2f6f5e", face: "front" },
      { text: "Hole 1 · Par 4", x: 8, y: 1.5, z: 35.6, size: 0.3, colour: "#ffffff", back: "#2f6f5e", face: "front" },
    ],
  });
}

// ---- Kada Cinemas -------------------------------------------------------------------------------------------

function cinema(): VenueLayout {
  const width = 26, depth = 22;
  const red = "#8a1a2b";
  const boxes: Box[] = [
    // The hall at the back, behind a wall with a way in at each end.
    wall(3, 11, 23, 11, 2.4, "#2a1a1e"),
    // Rows of seats facing the screen.
    ...[3.5, 5.5, 7.5, 9.3].flatMap((z) => [solid(13, z, 8.5, 0.35, 0.5, red), deco(13, z + 0.35, 8.5, 0.08, 0.5, 1.0, red)]),
    // The lobby: ticket booth, snack bar with a popcorn machine, posters.
    solid(5, 16, 2.4, 0.6, 1.1, "#1d1d22"), deco(5, 15.3, 2.4, 0.05, 1.1, 2.6, "#bfe3ff"),
    solid(20.5, 16.5, 3, 0.6, 1.05, "#c79a2b"), solid(22.5, 15.4, 0.5, 0.4, 1.9, "#d64545"), glow(22.5, 15.4, 0.42, 0.42, 1.2, 1.8, "#ffe9a0"),
    ...[2.5, 7.5, 17.5, 22.5].map((x, i) => glow(x, 21.0 - (i % 2) * 0.01, 0.9, 0.04, 0.4, 2.2, ["#d63f8c", "#2f6fd6", "#e88a2b", "#2f9e54"][i])),
    ...plant(1, 20.5), ...plant(25, 20.5),
  ];
  return room({
    id: "kada", name: "Kada Cinemas", kind: "cinema", width, depth, wallHeight: 5,
    floor: "#2a1a22", floorAlt: "#24161d", wall: "#3a1f28", trim: "#c79a2b", sky: "#0b0809", lighting: "cinema",
    boxes,
    screen: { x: 13, y: 2.9, z: 0.15, hx: 9.5, hy: 2.1 },
    things: [
      { spot: "kada_screen", name: "Cinema hall", verb: "Take a seat in the", x: 13, z: 6.4, hx: 8.5, hz: 3.4, reach: 0.6, stand: "here" },
      { spot: "kada_snacks", name: "Snack bar", verb: "Buy at the", x: 20.5, z: 16.5, hx: 3, hz: 0.6, reach: 1.4 },
    ],
    people: [
      { x: 5, z: 16.9, rot: Math.PI, look: STAFF(3, "#8a1a2b", "woman"), label: "Tickets" },
      { x: 20.5, z: 15.6, rot: 0, look: STAFF(1, "#c79a2b"), label: "Snacks" },
      ...[[9, 5.5], [15, 5.5], [11, 7.5], [17, 3.5]].map(([x, z], i) => ({ x, z, rot: Math.PI, look: PARTY[i], move: "sit" as const })),
    ],
    signs: [
      { text: "NOW SHOWING · KADA CINEMAS", x: 13, y: 2.0, z: 11.2, size: 0.32, colour: "#ffe9a0", face: "front" },
      { text: "Tickets", x: 5, y: 2.9, z: 15.3, size: 0.32, colour: "#ffffff", face: "front" },
      { text: "Popcorn · Drinks", x: 20.5, y: 2.3, z: 16.0, size: 0.3, colour: "#3a2a1a", back: "#c79a2b", face: "front" },
    ],
  });
}

// ---- Burger King -----------------------------------------------------------------------------------------------

function burger(): VenueLayout {
  const width = 16, depth = 13;
  const boxes: Box[] = [
    solid(8, 3.4, 5.5, 0.55, 1.05, "#d2691e"), deco(8, 3.4, 5.5, 0.57, 1.05, 1.1, "#efeee8"),
    deco(8, 1.2, 6, 0.6, 0, 1.0, "#9a9d9f"), solid(3, 0.8, 1.2, 0.5, 1.6, "#b9bcc0"), solid(12, 0.8, 1.5, 0.5, 1.0, "#3a3d42"),
    ...[4, 8, 12].map((x, i) => glow(x, 0.1, 1.6, 0.03, 2.3, 3.3, ["#f2c200", "#e88a2b", "#d64545"][i])),
    ...tableSet(4, 8.5, "#d64545", "#f2c200"), ...tableSet(8, 9, "#d64545", "#f2c200"), ...tableSet(12, 8.5, "#d64545", "#f2c200"),
    solid(15.4, 6, 0.4, 2.0, 0.45, "#d64545"),
  ];
  return room({
    id: "burgerking", name: "Burger King", kind: "food", width, depth, wallHeight: 3.8,
    floor: "#b0563a", floorAlt: "#a24f35", wall: "#f2e2c4", trim: "#d64545", sky: "#3a2a1a", lighting: "bright",
    boxes,
    things: [{ spot: "bk_counter", name: "Counter", verb: "Order at the", x: 8, z: 3.4, hx: 5.5, hz: 0.55, reach: 1.4 }],
    people: [
      { x: 6, z: 2.6, rot: 0, look: STAFF(2, "#d64545", "woman"), label: "Cashier" },
      { x: 10, z: 2.6, rot: 0, look: STAFF(4, "#d64545") },
      { x: 4.85, z: 8.5, rot: -Math.PI / 2, look: PARTY[3], move: "sit" },
      { x: 8, z: 9.85, rot: Math.PI, look: PARTY[0], move: "sit" },
    ],
    signs: [
      { text: "BURGER KING", x: 8, y: 3.5, z: 0.12, size: 0.55, colour: "#d64545" },
      { text: "Whopper · Fries · Shakes", x: 8, y: 2.05, z: 0.12, size: 0.28, colour: "#3a2a1a" },
    ],
  });
}

// ---- supermarkets ----------------------------------------------------------------------------------------------

function supermarket(id: string, name: string, shop: string, width: number, depth: number, brand: string): VenueLayout {
  const goods = ["#d64545", "#f2c200", "#2f6fd6", "#2f9e54", "#ede6d6", "#e88a2b", "#d63f8c", "#c9a36a"];
  const boxes: Box[] = [];
  const aisles = Math.floor((width - 6) / 4);
  for (let i = 0; i < aisles; i++) boxes.push(...aisle(5 + i * 4, depth * 0.38, depth * 0.24, "#c9ccd0", goods, i * 2));
  // Back wall shelves: fridges glowing cold.
  boxes.push(deco(width / 2, 0.45, width / 2 - 1, 0.4, 0, 2.2, "#d9e7f2"), glow(width / 2, 0.88, width / 2 - 1.2, 0.02, 0.3, 2.0, "#e8f6ff"));
  // Tills at the front.
  for (let i = 0; i < 3; i++) boxes.push(solid(5 + i * 4, depth - 4.2, 1.0, 0.45, 1.0, "#3a3d42"), deco(5 + i * 4 + 0.6, depth - 4.2, 0.2, 0.2, 1.0, 1.35, "#1d1d1f"));
  boxes.push(...plant(1, depth - 1.2), glow(width / 2, 0.06, width / 2 - 1, 0.02, 3.3, 3.5, brand));
  return room({
    id, name, kind: "shop", width, depth, wallHeight: 4.2,
    floor: "#ece8e0", floorAlt: "#e3dfd6", wall: "#f4f2ee", trim: brand, sky: "#d9e4ec", lighting: "bright",
    boxes,
    specials: [{ kind: "shop", shop, name, x: width / 2, z: depth * 0.38, reach: depth * 0.3 }],
    people: [
      { x: 5, z: depth - 3.3, rot: Math.PI, look: STAFF(1, brand, "woman"), label: "Till" },
      { x: 9, z: depth - 3.3, rot: Math.PI, look: STAFF(3, brand) },
      { x: 7, z: depth * 0.38, rot: 1.2, look: PARTY[2] },
      { x: width - 6, z: depth * 0.3, rot: -0.4, look: PARTY[5] },
    ],
    signs: [
      { text: name.toUpperCase(), x: width / 2, y: 3.8, z: 0.12, size: 0.7, colour: brand },
      { text: "Prices on the shelf · Pay at the till", x: width / 2, y: 3.0, z: 0.12, size: 0.28, colour: "#3a3d42" },
    ],
  });
}

// ---- the Aquarium Gallery ---------------------------------------------------------------------------------------

function aquarium(): VenueLayout {
  const width = 22, depth = 30;
  const boxes: Box[] = [
    // Tanks down both walls and across the back, glowing blue.
    glow(0.4, 15, 0.3, 13.5, 0.2, 3.6, "#1e6fa8"), glow(21.6, 15, 0.3, 13.5, 0.2, 3.6, "#1e6fa8"), glow(11, 0.4, 10.5, 0.3, 0.2, 3.6, "#1a5f92"),
    // Coral and rocks in the tanks.
    ...[3, 8, 13, 18, 23, 27].flatMap((z, i) => [deco(0.5, z, 0.25, 0.8, 0.2, 0.9 + (i % 2) * 0.4, ["#ff7a59", "#e88a2b", "#d63f8c"][i % 3]), deco(21.5, z + 1.5, 0.25, 0.8, 0.2, 0.8 + ((i + 1) % 2) * 0.5, ["#d63f8c", "#ff7a59", "#7dff3a"][i % 3])]),
    // The glass tunnel down the middle.
    ...[8, 10, 12, 14, 16, 18, 20].flatMap((z) => [solid(7.6, z, 0.06, 0.06, 3.2, "#9fd3e8"), solid(14.4, z, 0.06, 0.06, 3.2, "#9fd3e8")]),
    { x: 7.4, z: 14, hx: 0.05, hz: 6.6, y0: 0, y1: 3.2, c: "#4fb2e8", glass: true },
    { x: 14.6, z: 14, hx: 0.05, hz: 6.6, y0: 0, y1: 3.2, c: "#4fb2e8", glass: true },
    { x: 11, z: 14, hx: 3.6, hz: 6.6, y0: 3.2, y1: 3.3, c: "#4fb2e8", glass: true },
    glow(4, 14, 3.2, 6.6, 0.02, 0.04, "#0f3f6a"), glow(18, 14, 3.2, 6.6, 0.02, 0.04, "#0f3f6a"),
    solid(11, 25, 1.6, 0.35, 0.45, "#2b2b30"), solid(11, 3.2, 2.0, 0.35, 0.45, "#2b2b30"),
  ];
  return room({
    id: "aquarium", name: "Aquarium Gallery", kind: "aquarium", width, depth, wallHeight: 4,
    floor: "#10283d", floorAlt: "#0e2336", wall: "#0b1c2c", trim: "#4fb2e8", sky: "#020a12", lighting: "aqua",
    boxes,
    fish: [
      { minX: 0.2, maxX: 0.6, z: 15, y0: 0.6, y1: 3.2, count: 14 },
      { minX: 21.4, maxX: 21.8, z: 15, y0: 0.6, y1: 3.2, count: 14 },
      { minX: 1, maxX: 21, z: 0.4, y0: 0.6, y1: 3.2, count: 18 },
      { minX: 0.5, maxX: 7.2, z: 14, y0: 0.6, y1: 3.0, count: 10 },
      { minX: 14.8, maxX: 21.5, z: 14, y0: 0.6, y1: 3.0, count: 10 },
    ],
    things: [
      { spot: "aqua_tunnel", name: "Glass tunnel", verb: "Walk the", x: 11, z: 14, hx: 3.2, hz: 6.4, reach: 0.4, stand: "here" },
      { spot: "aqua_tank", name: "Big tank", verb: "Take pictures at the", x: 11, z: 1.2, hx: 10, hz: 0.6, reach: 1.6 },
    ],
    people: [
      { x: 11, z: 3.2, rot: Math.PI, look: PARTY[0], move: "sit" },
      { x: 9.5, z: 12, rot: 0.3, look: PARTY[1] },
      { x: 12.5, z: 12, rot: -0.3, look: PARTY[4] },
      { x: 18, z: 24, rot: 1.8, look: STAFF(2, "#4fb2e8"), label: "Guide" },
    ],
    signs: [
      { text: "AQUARIUM GALLERY · GRA", x: 11, y: 3.75, z: 29.85, size: 0.45, colour: "#4fb2e8", face: "front" },
      { text: "Mind the glass", x: 11, y: 3.5, z: 21, size: 0.3, colour: "#bfe3ff", face: "front" },
    ],
  });
}

// ---- the Ikpoba Hill flyover --------------------------------------------------------------------------------------

function flyover(): VenueLayout {
  const width = 130, depth = 18;
  const boxes: Box[] = [];
  // The deck's edges: concrete barriers painted in black and white blocks, as on the real one.
  for (let x = 0; x < width; x += 1.6) {
    const colour = Math.floor(x / 1.6) % 2 ? "#f2f2f2" : "#151517";
    boxes.push(solid(x + 0.8, 0.35, 0.8, 0.3, 1.0, colour), solid(x + 0.8, depth - 0.35, 0.8, 0.3, 1.0, colour));
  }
  // Lane lines and the kerb down the middle.
  for (let x = 2; x < width; x += 6) boxes.push(deco(x, 6, 1.5, 0.08, 0, 0.015, "#f2f2f2"), deco(x, 12, 1.5, 0.08, 0, 0.015, "#f2f2f2"));
  boxes.push(solid(width / 2, 9, width / 2 - 2, 0.25, 0.3, "#9a9d9f"));
  // Lamp posts down the kerb, lit.
  for (let x = 10; x < width; x += 18) boxes.push(solid(x, 9, 0.1, 0.1, 7, "#3a3d42"), deco(x, 9, 1.2, 0.1, 6.9, 7.0, "#3a3d42"), glow(x - 1.1, 9, 0.35, 0.18, 6.75, 6.9, "#ffd27a"), glow(x + 1.1, 9, 0.35, 0.18, 6.75, 6.9, "#ffd27a"));
  // Parked cars with people round them, a suya man's wheelbarrow with its grill glowing.
  boxes.push(solid(40, 14.5, 2.0, 0.9, 1.4, "#2f4a6b"), solid(70, 3.6, 2.0, 0.9, 1.4, "#b23a2f"), solid(95, 14.6, 2.0, 0.9, 1.4, "#e8e6df"));
  boxes.push(solid(60, 15.6, 0.9, 0.5, 0.8, "#5a5f66"), glow(60, 15.6, 0.75, 0.38, 0.8, 0.88, "#ff6a1a"));
  boxes.push(deco(61.2, 15.7, 0.3, 0.3, 0, 0.7, "#c0392b"));
  return room({
    id: "flyover", name: "Ikpoba Hill Flyover", kind: "flyover", width, depth, wallHeight: 1.0, open: true,
    floor: "#3b3d41", floorAlt: "#37393d", wall: "#9a9d9f", trim: "#f2f2f2", sky: "#16203a", lighting: "night",
    entry: { x: 6, z: 9 },
    boxes,
    things: [
      { spot: "flyover_rail", name: "The rail", verb: "Lean on", x: width / 2, z: 1.2, hx: width / 2 - 2, hz: 0.5, reach: 1.2, stand: "here", distance: 5.5 },
      { spot: "flyover_suya", name: "Suya man", verb: "Buy from the", x: 60, z: 15.6, hx: 0.9, hz: 0.5, reach: 1.6 },
    ],
    people: [
      { x: 60, z: 14.6, rot: 0, look: person("man", 5, "#efeee8", "#3a3d42"), label: "Mallam Suya" },
      { x: 30, z: 1.4, rot: Math.PI, look: PARTY[0] }, { x: 31.2, z: 1.4, rot: Math.PI, look: PARTY[1] },
      { x: 52, z: 16.6, rot: 0, look: PARTY[2] }, { x: 80, z: 1.4, rot: Math.PI, look: PARTY[3] },
      { x: 41, z: 12.8, rot: 2.6, look: PARTY[4] }, { x: 70, z: 5.4, rot: -0.4, look: PARTY[5] },
      { x: 104, z: 16.6, rot: 0, look: PARTY[1] }, { x: 105.2, z: 16.6, rot: 0, look: PARTY[4] },
    ],
    signs: [{ text: "IKPOBA HILL", x: 3, y: 2.2, z: 9, size: 0.5, colour: "#f2f2f2", back: "#2f6f5e", face: "right" }],
  });
}

// ---- all of them --------------------------------------------------------------------------------------------------


// ---- Ogba Zoo & Nature Park ---------------------------------------------------------------------------
// Benin City's zoo, off the Airport Road: lions, chimpanzees on their island, crocodiles in
// the pond, ostriches and peacocks, tortoises, and picnic tables under the trees. The
// pens are fenced low enough to see over; the animals keep to them.

function fence(minX: number, minZ: number, maxX: number, maxZ: number, height: number, colour: string): Box[] {
  return [wall(minX, minZ, maxX, minZ, height, colour, 0.06), wall(minX, maxZ, maxX, maxZ, height, colour, 0.06),
    wall(minX, minZ, minX, maxZ, height, colour, 0.06), wall(maxX, minZ, maxX, maxZ, height, colour, 0.06)];
}

function zoo(): VenueLayout {
  const width = 72, depth = 60;
  const grass = "#5b9a3c", path = "#d9c08a", water = "#3a7fa8", rock = "#8a7a66", rail = "#3a3d42";
  const tree = (x: number, z: number, size = 1.8): Box[] => [solid(x, z, 0.28, 0.28, 2.6, "#5a3a26"), deco(x, z, size, size, 2.4, 2.4 + size * 1.6, "#2e6b2a")];
  const boxes: Box[] = [
    // The paths: one along the front of the pens, one down the middle, one by the gate.
    deco(36, 26, 34, 2.4, 0, 0.02, path), deco(36, 41, 2.4, 17, 0, 0.02, path), deco(36, 53, 10, 3, 0, 0.02, path),

    // The lions: a big pen with a high fence, rocks to lie on and a den at the back.
    // A low wall, and wire mesh above it you can see through.
    ...fence(3, 4, 25, 22, 1.0, rail), ...fence(3, 4, 25, 22, 3.0, "#9aa3a8").map((box) => ({ ...box, solid: false, glass: true, y0: 1.0 })),
    deco(14, 13, 10.5, 8.5, 0, 0.03, "#a89a5a"),
    solid(8, 8, 2.2, 1.6, 1.1, rock), solid(19, 15, 1.6, 1.2, 0.7, rock), solid(14, 5.2, 3, 1, 2.0, "#6a5a48"), deco(14, 6.25, 1.0, 0.05, 0, 1.4, "#1d1d1f"),
    ...tree(21, 7, 2.2),

    // The chimpanzees: an island of trees in a moat.
    deco(37, 13, 7.5, 7.5, 0, 0.02, water), deco(37, 13, 5, 5, 0, 0.06, grass),
    ...fence(29, 5, 45, 21, 1.1, rail),
    ...tree(35, 11, 1.6), ...tree(39.5, 14.5, 1.4), solid(37, 16, 0.12, 0.12, 3.2, "#6b4226"), deco(37, 16, 1.4, 0.05, 2.8, 2.9, "#6b4226"),

    // The crocodiles: a pond with a sandy bank.
    deco(59, 13, 9, 8, 0, 0.02, "#c9b07a"), deco(61, 11, 6, 5, 0, 0.03, water),
    ...fence(49, 4, 69, 22, 1.1, rail),

    // Ostriches and peacocks, and the tortoises, behind the path.
    deco(14, 39, 10.5, 7.5, 0, 0.03, "#8fb85a"), ...fence(3, 31, 25, 47, 1.3, "#6b4226"),
    solid(6, 44, 1.5, 1.0, 2.0, "#8a5a3c"), deco(6, 44, 1.7, 1.2, 2.0, 2.3, "#c9a36a"),
    deco(14, 53, 7, 3.5, 0, 0.03, "#a89a5a"), ...fence(6, 49, 22, 57, 0.6, "#6b4226"),

    // The middle: a fountain, benches, and a statue of a lion.
    solid(36, 34, 2, 2, 0.6, "#bfb8a8"), deco(36, 34, 1.6, 1.6, 0.6, 0.62, water), solid(36, 34, 0.3, 0.3, 1.6, "#bfb8a8"),
    ...[[31, 30], [41, 30], [31, 38], [41, 38]].map(([x, z]) => solid(x, z, 0.9, 0.25, 0.45, "#6b4226")),

    // The picnic ground under the trees, and the suya stand.
    ...tableSet(55, 34, "#6b4226", "#8a5a3c"), ...tableSet(62, 34, "#6b4226", "#8a5a3c"), ...tableSet(55, 41, "#6b4226", "#8a5a3c"),
    ...tableSet(62, 41, "#6b4226", "#8a5a3c"),
    solid(66, 47, 2.2, 0.8, 1.0, "#c0392b"), deco(66, 47, 2.4, 1.0, 2.2, 2.35, "#efe6d0"), glow(65, 47, 0.4, 0.3, 1.0, 1.2, "#ff7a2b"),
    ...tree(51, 30), ...tree(68, 30), ...tree(51, 46), ...tree(59, 49, 2.2),

    // The gate: a ticket booth, and trees along the fence.
    solid(30, 54, 2.2, 1.2, 2.4, "#c79a2b"), deco(30, 54, 2.5, 1.5, 2.4, 2.6, "#6b4226"), deco(30, 55.25, 1.2, 0.04, 1.2, 1.9, "#bfe3ff"),
    ...tree(4, 28, 1.6), ...tree(68, 26, 1.6), ...tree(26, 58, 1.4), ...tree(46, 58, 1.4), ...tree(2, 56, 2.0), ...tree(70, 56, 2.0),
  ];
  return room({
    id: "zoo", name: "Ogba Zoo & Nature Park", kind: "zoo", width, depth, wallHeight: 1.6, open: true,
    floor: grass, floorAlt: "#56933a", wall: "#6b4226", trim: "#c79a2b", sky: "#8ec5ea", lighting: "day",
    boxes,
    things: [
      { spot: "zoo_gate", name: "Ticket booth", verb: "Go to the", x: 30, z: 55.6, hx: 2.2, hz: 0.4, reach: 1.2 },
      { spot: "zoo_lions", name: "Lion enclosure", verb: "Watch the", x: 14, z: 22.6, hx: 8, hz: 0.4, reach: 1.4, stand: "here" },
      { spot: "zoo_chimps", name: "Chimpanzee island", verb: "Watch the", x: 37, z: 21.6, hx: 6, hz: 0.4, reach: 1.4, stand: "here" },
      { spot: "zoo_crocs", name: "Crocodile pond", verb: "Watch the", x: 59, z: 22.6, hx: 8, hz: 0.4, reach: 1.4, stand: "here" },
      { spot: "zoo_birds", name: "Ostriches and peacocks", verb: "Visit the", x: 14, z: 30.4, hx: 8, hz: 0.4, reach: 1.4, stand: "here" },
      { spot: "zoo_picnic", name: "Picnic ground", verb: "Sit at the", x: 58.5, z: 37.5, hx: 5, hz: 5, reach: 0.6, stand: "here" },
    ],
    animals: [
      { kind: "lion", pen: { minX: 5, minZ: 7, maxX: 23, maxZ: 20 }, count: 1 },
      { kind: "lioness", pen: { minX: 5, minZ: 7, maxX: 23, maxZ: 20 }, count: 2 },
      { kind: "chimp", pen: { minX: 33, minZ: 9, maxX: 41, maxZ: 17 }, count: 3 },
      { kind: "monkey", pen: { minX: 33, minZ: 9, maxX: 41, maxZ: 17 }, count: 2 },
      { kind: "croc", pen: { minX: 52, minZ: 8, maxX: 67, maxZ: 19 }, count: 3 },
      { kind: "ostrich", pen: { minX: 5, minZ: 33, maxX: 23, maxZ: 45 }, count: 2 },
      { kind: "peacock", pen: { minX: 5, minZ: 33, maxX: 23, maxZ: 45 }, count: 3 },
      { kind: "tortoise", pen: { minX: 8, minZ: 50.5, maxX: 20, maxZ: 55.5 }, count: 3 },
    ],
    people: [
      { x: 30, z: 55.9, rot: 0, look: STAFF(1, "#2f6f5e"), label: "Tickets" },
      { x: 66, z: 48.2, rot: Math.PI, look: STAFF(3, "#c0392b", "woman"), label: "Suya" },
      { x: 12, z: 24.2, rot: Math.PI, look: PARTY[2] },
      { x: 13, z: 24.4, rot: Math.PI, look: person("man", 4, "#2f6fd6", "#1d1d1f"), label: undefined },
      { x: 39, z: 23.5, rot: Math.PI, look: PARTY[0] },
      { x: 55.85, z: 34, rot: -Math.PI / 2, look: PARTY[3], move: "sit" },
      { x: 54.15, z: 34, rot: Math.PI / 2, look: PARTY[4], move: "sit" },
      { x: 20, z: 28.5, rot: Math.PI, look: STAFF(0, "#6b8a3a"), label: "Zookeeper" },
    ],
    signs: [
      { text: "OGBA ZOO & NATURE PARK", x: 36, y: 3.2, z: 59.4, size: 0.6, colour: "#ffffff", back: "#2f6f5e", face: "front" },
      { text: "LIONS · Do not feed", x: 14, y: 1.6, z: 22.3, size: 0.3, colour: "#ffffff", back: "#8a1a1a", face: "front" },
      { text: "CHIMPANZEE ISLAND", x: 37, y: 1.5, z: 21.3, size: 0.3, colour: "#ffffff", back: "#2f6f5e", face: "front" },
      { text: "CROCODILES · Keep your hands in", x: 59, y: 1.5, z: 22.3, size: 0.3, colour: "#ffffff", back: "#8a1a1a", face: "front" },
      { text: "OSTRICHES & PEACOCKS", x: 14, y: 1.7, z: 30.8, size: 0.3, colour: "#ffffff", back: "#6b4226", face: "front" },
      { text: "TORTOISES", x: 14, y: 0.95, z: 57.2, size: 0.25, colour: "#ffffff", back: "#6b4226", face: "front" },
      { text: "TICKETS ₦1,500", x: 30, y: 2.0, z: 55.3, size: 0.3, colour: "#1d1d1f", back: "#f2c200", face: "front" },
      { text: "PICNIC · SUYA", x: 66, y: 2.6, z: 48.1, size: 0.3, colour: "#ffffff", back: "#c0392b", face: "front" },
    ],
  });
}

export const VENUES: Record<string, VenueLayout> = Object.fromEntries(
  [
    museum(), police(), supermarket("hallmark", "Hallmark Supermarket", "hallmark", 24, 18, "#c8432b"),
    hospital(), mall(),
    supermarket("shoprite", "ShopRite", "shoprite", 28, 20, "#d62828"), burger(), cinema(),
    lounge("zzone", "Zzone"), lounge("greyfield", "Greyfield"), lounge("driveway", "Driveway Lifestyle"), lounge("mandela", "Mandela Lounge"),
    aquarium(),
    club("patricia", "Club Patricia", 26, 20), club("patio", "Patio Club", 26, 20), club("space", "Space Club", 26, 20),
    club("darkalley", "Club Dark Alley", 24, 18),
    haunted(), golf(), flyover(), zoo(),
  ].map((layout) => [layout.id, layout]),
);

export function isVenue(id: string): boolean {
  return id in VENUES;
}

// ---- what a player bumps into, and what they can use ------------------------------------------------------------

/** Everything solid in a room, as the same kind of collider the street uses. */
export function venueCollider(layout: VenueLayout): Collider {
  const solids: Building[] = layout.boxes
    .filter((box) => box.solid && box.y0 < 1.5)
    .map((box) => ({ r: [box.x, box.z, box.hx, box.hz, 0], f: 1, s: 0, k: "flat" }));
  const reach = EDGE_MARGIN - PLAYER_RADIUS;
  return buildCollider({
    id: layout.id,
    name: layout.name,
    attribution: "",
    bounds: { minX: -reach, maxX: layout.width + reach, minZ: -reach, maxZ: layout.depth + reach },
    spawn: [layout.entry.x, layout.entry.z],
    floorHeight: layout.wallHeight,
    buildings: solids,
    roads: [],
    areas: [],
    gates: [],
    pillars: [],
    trees: [],
    labels: [],
  });
}

/** The things in a room that are used through the server, in the shape the rest of the game uses. */
export function venueThings(layout: VenueLayout): Near[] {
  return layout.things.map((thing) => {
    const stand = thing.stand;
    return {
      key: `spot:${thing.spot}`,
      target: { spot: thing.spot },
      name: thing.name,
      verb: thing.verb,
      x: thing.x,
      z: thing.z,
      halfX: thing.hx,
      halfZ: thing.hz,
      reach: thing.reach ?? 1.2,
      standAt: stand === undefined ? undefined : stand === "here" ? (x: number, z: number) => ({ x, z }) : () => stand,
      distance: thing.distance,
    };
  });
}

/** The special thing a player at (x, z) is standing at, or null. */
export function nearestSpecial(layout: VenueLayout, x: number, z: number): Special | null {
  let best: Special | null = null;
  let bestGap = Infinity;
  for (const special of layout.specials) {
    const gap = Math.hypot(special.x - x, special.z - z);
    if (gap < special.reach && gap < bestGap) {
      best = special;
      bestGap = gap;
    }
  }
  return best;
}

/** The scare a player at (x, z) has just walked into, of those not yet seen. */
export function scareAt(layout: VenueLayout, x: number, z: number, seen: ReadonlySet<string>): Scare | null {
  for (const scare of layout.scares ?? []) {
    if (!seen.has(scare.id) && Math.hypot(scare.x - x, scare.z - z) < scare.r) return scare;
  }
  return null;
}
