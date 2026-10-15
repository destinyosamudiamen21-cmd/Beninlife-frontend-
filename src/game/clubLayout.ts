// The arithmetic of the club: where everything stands, what a player bumps into, what
// they are near enough to use, and what the dance floor's lights do. No 3D imports here,
// so all of it can be tested alone.
//
// The room is the same size on the server (places.py: 26 m by 20 m). The back-left
// corner is (0, 0) and the camera looks in from the front.

import {
  EDGE_MARGIN,
  PLAYER_RADIUS,
  buildCollider,
  type Collider,
} from "./collision";
import type { Building } from "./districtData";
import type { Near, Stand } from "./nearby";

export const CLUB = {
  name: "Que Club",
  width: 26,
  depth: 20,
  wallHeight: 6.5,
  /** Where a player stands after coming in: the front, in the middle. Must match the server. */
  door: { x: 13, z: 18.4 },
  /** The dance floor: four tiles by four. */
  floor: { x: 13, z: 8.6, tile: 1.6, tiles: 4 },
  /** The DJ on a low stage against the back wall, with a stack of speakers each side. */
  dj: { x: 13, z: 1.7, halfX: 3.0, halfZ: 1.1, stage: 0.5 },
  speakers: [
    { x: 8.9, z: 1.5 },
    { x: 17.1, z: 1.5 },
  ],
  /** The bar down the left wall. People stand on the room side of the counter. */
  bar: {
    x: 3.3,
    z: 9.2,
    halfX: 0.38,
    halfZ: 4.2,
    stools: 4.35,
    keeper: { x: 1.8, z: 9.2 },
  },
  /** The VIP platform down the right wall, behind a rope with one way in. */
  vip: {
    minX: 19.6,
    maxX: 25.7,
    minZ: 3.4,
    maxZ: 15.2,
    floor: 0.3,
    gate: { z: 9.3, half: 0.8 },
  },
  /** The middle of each booth. A sofa runs round three sides of a low table. */
  booths: [
    { x: 23.6, z: 5.3 },
    { x: 23.6, z: 9.3 },
    { x: 23.6, z: 13.3 },
  ],
  bouncer: { x: 19.0, z: 10.9 },
};

const half = (CLUB.floor.tile * CLUB.floor.tiles) / 2;
/** The edges of the dance floor, in metres. */
export const DANCE = {
  minX: CLUB.floor.x - half,
  maxX: CLUB.floor.x + half,
  minZ: CLUB.floor.z - half,
  maxZ: CLUB.floor.z + half,
};

// ---- the dance floor's lights ----------------------------------------------------------

export const TILE_COUNT = CLUB.floor.tiles * CLUB.floor.tiles;
export const BEATS_PER_SECOND = 2; // 120 to the minute, the same as the music

/** Which tile a spot is on, 0 to 15 counting across then towards the camera, or -1 if it is off the floor. */
export function tileAt(x: number, z: number): number {
  if (x < DANCE.minX || x >= DANCE.maxX || z < DANCE.minZ || z >= DANCE.maxZ)
    return -1;
  const column = Math.floor((x - DANCE.minX) / CLUB.floor.tile);
  const row = Math.floor((z - DANCE.minZ) / CLUB.floor.tile);
  return row * CLUB.floor.tiles + column;
}

/** The middle of a tile, in metres. */
export function tileCentre(index: number): { x: number; z: number } {
  const column = index % CLUB.floor.tiles,
    row = Math.floor(index / CLUB.floor.tiles);
  return {
    x: DANCE.minX + (column + 0.5) * CLUB.floor.tile,
    z: DANCE.minZ + (row + 0.5) * CLUB.floor.tile,
  };
}

/** The colours the tiles go through. Change these to restyle the floor. */
export const TILE_COLOURS = [
  "#ff2d95",
  "#00e5ff",
  "#ffe600",
  "#7dff3a",
  "#ff7a00",
  "#9d4dff",
];

/**
 * What one tile shows at a moment: an index into TILE_COLOURS, and how bright (0 to 1).
 * The colours march across the floor a step every beat, in a pattern that changes every
 * eight beats, and every tile dips and comes back up on the beat.
 */
export function tileLook(
  index: number,
  seconds: number
): { colour: number; glow: number } {
  const beat = seconds * BEATS_PER_SECOND;
  const step = Math.floor(beat);
  const column = index % CLUB.floor.tiles,
    row = Math.floor(index / CLUB.floor.tiles);
  const pattern = Math.floor(step / 8) % 3;
  let place: number;
  if (pattern === 0) place = column + row; // diagonal stripes
  else if (pattern === 1)
    place = Math.max(Math.abs(column - 1.5), Math.abs(row - 1.5)) | 0;
  // rings from the middle
  else place = (column * 3 + row * 5) % 7; // scattered
  const colour =
    (((place + step) % TILE_COLOURS.length) + TILE_COLOURS.length) %
    TILE_COLOURS.length;
  const pulse = 1 - (beat - step); // 1 on the beat, falling to 0
  return { colour, glow: 0.45 + 0.4 * pulse };
}

// ---- what a player bumps into -----------------------------------------------------------

function solid(x: number, z: number, halfX: number, halfZ: number): Building {
  return { r: [x, z, halfX, halfZ, 0], f: 1, s: 0, k: "flat" };
}

/** Everything solid on the club's floor, with the rope across the way in to VIP up or down. */
function clubWalls(roped: boolean): Collider {
  const { dj, bar, speakers, booths, bouncer } = CLUB;
  const area = CLUB.vip;
  const solids: Building[] = [
    solid(dj.x, dj.z, dj.halfX, dj.halfZ),
    solid(bar.x, bar.z, bar.halfX, bar.halfZ),
    solid(bar.keeper.x, bar.keeper.z, 0.28, 0.28),
    // The flap at each end of the counter: customers stay on their side of it.
    solid(
      (bar.x - bar.halfX) / 2,
      bar.z - bar.halfZ,
      (bar.x - bar.halfX) / 2,
      0.1
    ),
    solid(
      (bar.x - bar.halfX) / 2,
      bar.z + bar.halfZ,
      (bar.x - bar.halfX) / 2,
      0.1
    ),
    solid(bouncer.x, bouncer.z, 0.3, 0.3),
    ...speakers.map((speaker) => solid(speaker.x, speaker.z, 0.55, 0.5)),
    // The rope along the edge of the VIP platform, in two runs with the way in between them.
    solid(
      area.minX,
      (area.minZ + area.gate.z - area.gate.half) / 2,
      0.08,
      (area.gate.z - area.gate.half - area.minZ) / 2
    ),
    solid(
      area.minX,
      (area.gate.z + area.gate.half + area.maxZ) / 2,
      0.08,
      (area.maxZ - area.gate.z - area.gate.half) / 2
    ),
    solid(
      (area.minX + area.maxX) / 2,
      area.minZ,
      (area.maxX - area.minX) / 2,
      0.08
    ),
    solid(
      (area.minX + area.maxX) / 2,
      area.maxZ,
      (area.maxX - area.minX) / 2,
      0.08
    ),
    // Each booth: the table, and the sofa along the wall behind it.
    ...booths.flatMap((booth) => [
      solid(booth.x, booth.z, 0.55, 0.75),
      solid(25.1, booth.z, 0.45, 1.5),
    ]),
  ];
  if (roped) solids.push(solid(area.minX, area.gate.z, 0.08, area.gate.half));

  // The collider keeps players EDGE_MARGIN inside its bounds. Setting the bounds this far
  // outside the walls makes that land exactly a body's width from each wall.
  const reach = EDGE_MARGIN - PLAYER_RADIUS;
  return buildCollider({
    id: "club",
    name: CLUB.name,
    attribution: "",
    bounds: {
      minX: -reach,
      maxX: CLUB.width + reach,
      minZ: -reach,
      maxZ: CLUB.depth + reach,
    },
    spawn: [CLUB.door.x, CLUB.door.z],
    floorHeight: CLUB.wallHeight,
    buildings: solids,
    roads: [],
    areas: [],
    gates: [],
    pillars: [],
    trees: [],
    labels: [],
  });
}

/**
 * What a player bumps into in the club, as the same kind of collider the street uses.
 * With a booth the way in to VIP is open. Without one the rope is across it, but only
 * one way: someone whose booth has just run out can always walk out, and not back in.
 * It also knows how high the floor is under the player: the VIP platform is a step up.
 */
export function clubCollider(
  vip: boolean
): Collider & { height: () => number } {
  const open = clubWalls(false);
  const roped = vip ? open : clubWalls(true);
  let atX = CLUB.door.x,
    atZ = CLUB.door.z;
  return {
    size: roped.size,
    resolve(fromX, fromZ, toX, toZ, out) {
      const inside = fromX > CLUB.vip.minX;
      const blocked = (inside ? open : roped).resolve(
        fromX,
        fromZ,
        toX,
        toZ,
        out
      );
      atX = out.x;
      atZ = out.z;
      return blocked;
    },
    height: () => clubFloorAt(atX, atZ),
  };
}

/** How high the floor is at a spot: the VIP platform is a step up. */
export function clubFloorAt(x: number, z: number): number {
  const area = CLUB.vip;
  return x > area.minX && x < area.maxX && z > area.minZ && z < area.maxZ
    ? area.floor
    : 0;
}

// ---- what a player can use ----------------------------------------------------------------

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
const QUARTER = Math.PI / 2;

/** On the dance floor: where they are if they are on it, or else the nearest place on it. Facing the room. */
function onTheFloor(x: number, z: number): Stand {
  return {
    x: clamp(x, DANCE.minX + 0.5, DANCE.maxX - 0.5),
    z: clamp(z, DANCE.minZ + 0.5, DANCE.maxZ - 0.5),
    rot: 0,
  };
}

/** At the bar: on the room side of the counter, level with where they were, facing it. */
function atTheBar(_x: number, z: number): Stand {
  const { bar } = CLUB;
  return {
    x: bar.stools,
    z: clamp(z, bar.z - bar.halfZ + 0.6, bar.z + bar.halfZ - 0.6),
    rot: -QUARTER,
  };
}

/** In a booth: on the sofa of the nearest one, beside the table, facing the room. */
function inABooth(x: number, z: number): Stand {
  let best = CLUB.booths[1];
  // From outside VIP (they pressed the button from the dance floor) it is the middle booth.
  if (x > CLUB.vip.minX) {
    for (const booth of CLUB.booths)
      if (Math.abs(booth.z - z) < Math.abs(best.z - z)) best = booth;
  }
  // On the front of the sofa, to one side of the table. It is open floor as far as walking
  // goes (the sofa is only solid further back), so standing up again leaves nobody stuck.
  const side = z >= best.z ? 1 : -1;
  return { x: 24.2, z: best.z + side * 1.15, y: CLUB.vip.floor, rot: -QUARTER };
}

/** The four things in the club that can be used. The ids are the server's (places.py). */
export const CLUB_THINGS: Near[] = [
  {
    key: "spot:dance",
    target: { spot: "dance" },
    name: "Dance Floor",
    verb: "",
    x: CLUB.floor.x,
    z: CLUB.floor.z,
    halfX: half,
    halfZ: half,
    reach: 0.9,
    standAt: onTheFloor,
    distance: 6.2,
  },
  {
    key: "spot:bar",
    target: { spot: "bar" },
    name: "Bar",
    verb: "",
    x: CLUB.bar.x,
    z: CLUB.bar.z,
    halfX: CLUB.bar.halfX,
    halfZ: CLUB.bar.halfZ,
    reach: 1.5,
    standAt: atTheBar,
  },
  {
    key: "spot:vip",
    target: { spot: "vip" },
    name: "VIP Booth",
    verb: "",
    x: (CLUB.vip.minX + CLUB.vip.maxX) / 2,
    z: (CLUB.vip.minZ + CLUB.vip.maxZ) / 2,
    halfX: (CLUB.vip.maxX - CLUB.vip.minX) / 2,
    halfZ: (CLUB.vip.maxZ - CLUB.vip.minZ) / 2,
    reach: 0.7,
    standAt: inABooth,
    distance: 5.4,
  },
  {
    key: "spot:dj",
    target: { spot: "dj" },
    name: "DJ Booth",
    verb: "",
    x: CLUB.dj.x,
    z: CLUB.dj.z,
    halfX: CLUB.dj.halfX,
    halfZ: CLUB.dj.halfZ,
    reach: 1.3,
  },
];

export function clubThing(spot: string): Near | null {
  return CLUB_THINGS.find((thing) => thing.key === `spot:${spot}`) ?? null;
}

// ---- the people who work there, and the regulars -------------------------------------------

export type Regular = {
  x: number;
  z: number;
  rot: number;
  move: "legwork" | "shaku" | "whine" | "bounce";
  look: number;
  delay: number;
};

/** People who are always on the dance floor, so it is never empty. One to a tile, leaving most tiles free. */
export const REGULARS: Regular[] = [
  { ...tileCentre(0), rot: 0.6, move: "shaku", look: 0, delay: 0 },
  { ...tileCentre(3), rot: -0.5, move: "legwork", look: 1, delay: 0.3 },
  { ...tileCentre(6), rot: 0.2, move: "whine", look: 2, delay: 0.1 },
  { ...tileCentre(13), rot: 2.6, move: "bounce", look: 3, delay: 0.2 },
];
