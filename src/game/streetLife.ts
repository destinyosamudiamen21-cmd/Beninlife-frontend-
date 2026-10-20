// What moves on a street: the crowd walking the market and the traffic on the main roads.
// This file is only the behaviour and the arithmetic of where everything is. It draws
// nothing and imports no 3D library, so all of it can be tested alone. CrowdAndTraffic.tsx
// does the drawing.

import { PLAYER_RADIUS, type Collider, type Point } from "./collision";
import type { DistrictData } from "./districtData";
import { CAR_TINTS, PERSON, VEHICLE_SIZES } from "./streetProps";
import { hexToLinear } from "./tint";
import { onBadRoad, wadeFactor, weatherNow } from "./weather";

// ---- how busy the street is: change these to tune it ---------------------------

const WALKERS = 240;          // people walking near the player at any moment
const VEHICLES = 60;          // the most vehicles moving near the player
const NEAR = 82;              // metres: the crowd lives inside this distance of the player
const FAR = 96;               // a walker further than this is moved to somewhere nearer
const QUIET_STREET = 0.1;     // how often a walker picks an ordinary street over a market
const BROWSE_EVERY = 18;      // seconds, on average, between stops to look at a stall
const TRAFFIC_NEAR = 130;     // metres: vehicles join the road at least this far from the player
const TRAFFIC_FAR = 240;      // and are taken off it when they get further away than this
const BUSY_CELL = 16;         // metres: the size of the squares used to find "is this a market?"
const MAIN_ROADS = ["trunk", "primary", "secondary", "tertiary"];
const CRUISE = [8.5, 6.0, 9.5, 6.5]; // metres a second: bus, keke, car, city bus
const MIX = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3]; // which kinds are on the road, and how many of each
const ACCELERATE = 2.4;
const BRAKE = 9;

// Colours people wear.
const SKIN_HEX = ["#a9714b", "#8d5a3b", "#774a2f", "#613a25", "#4b2c1c", "#35201a"];
const CLOTH_HEX = [
  "#2f6fd6", "#2f9e54", "#d64545", "#e88a2b", "#6a4fe0", "#d63f8c", "#2a9d8f", "#3a3d42",
  "#ede6d6", "#c79a2b", "#f2c200", "#8a2f3a", "#1f2a36", "#f1efe9",
];
const SKIN = SKIN_HEX.map(hexToLinear);
const CLOTH = CLOTH_HEX.map(hexToLinear);
const LOADS = ["#d6281f", "#e88a2b", "#f2c200", "#3f8a3a", "#f1efe9", "#7a5a3c", "#aab4ba"].map(hexToLinear);

// ---- shared with MarketPeople --------------------------------------------------

/**
 * The sellers and touts being drawn as full animated characters right now. The crowd
 * leaves these ones out, so nobody is drawn twice. `version` goes up on every change.
 */
export const drawnInFull = { ids: new Set<number>(), version: 0 };

// ---- small tools -------------------------------------------------------------

/** A repeatable stream of random numbers from 0 to 1. */
function randomStream(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A line to move along: its points, and how far along the line each point is. */
type Line = { p: number[]; far: number[]; length: number };

function makeLine(points: number[]): Line {
  const far = [0];
  for (let i = 2; i + 1 < points.length; i += 2) {
    far.push(far[far.length - 1] + Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]));
  }
  return { p: points, far, length: far[far.length - 1] };
}

type Spot = { x: number; z: number; ux: number; uz: number };
const spot: Spot = { x: 0, z: 0, ux: 1, uz: 0 };

/** Where `distance` metres along a line is, and which way the line runs there. */
function along(line: Line, distance: number, out: Spot): void {
  const d = Math.max(0, Math.min(line.length, distance));
  let low = 0, high = line.far.length - 2;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (line.far[middle] <= d) low = middle;
    else high = middle - 1;
  }
  const ax = line.p[low * 2], az = line.p[low * 2 + 1];
  const bx = line.p[low * 2 + 2], bz = line.p[low * 2 + 3];
  const span = line.far[low + 1] - line.far[low] || 1;
  const t = (d - line.far[low]) / span;
  out.x = ax + (bx - ax) * t;
  out.z = az + (bz - az) * t;
  out.ux = (bx - ax) / span;
  out.uz = (bz - az) / span;
}

/** A line moved sideways. Positive is to the right of the way the line runs. */
function shifted(points: number[], offset: number): number[] {
  const count = points.length / 2;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const before = Math.max(0, i - 1), after = Math.min(count - 1, i + 1);
    let ux = points[after * 2] - points[before * 2], uz = points[after * 2 + 1] - points[before * 2 + 1];
    const length = Math.hypot(ux, uz) || 1;
    ux /= length;
    uz /= length;
    out.push(points[i * 2] - uz * offset, points[i * 2 + 1] + ux * offset);
  }
  return out;
}

function reversed(points: number[]): number[] {
  const out: number[] = [];
  for (let i = points.length - 2; i >= 0; i -= 2) out.push(points[i], points[i + 1]);
  return out;
}

function turnTowards(from: number, to: number, most: number): number {
  let gap = to - from;
  while (gap > Math.PI) gap -= Math.PI * 2;
  while (gap < -Math.PI) gap += Math.PI * 2;
  return from + Math.max(-most, Math.min(most, gap));
}

// ---- types ---------------------------------------------------------------

type Walk = Line & {
  /** Half the width people spread over, in metres. */
  half: number;
  /** True in a market, false on an ordinary street. */
  busy: boolean;
  /** Other paths that can be stepped onto from this one's start and end. */
  startLinks: Join[];
  endLinks: Join[];
};
type Join = { to: number; at: number };
type Sample = { walk: number; at: number; x: number; z: number };

export type Walker = {
  /** False while there is nowhere near the player for them to walk. */
  active: boolean;
  walk: number;
  at: number;
  /** +1 walks towards the end of the path, -1 towards its start. */
  heading: number;
  /** How far to one side of the path they keep, and where that is drifting to. */
  side: number;
  sideGoal: number;
  pace: number;
  /** Seconds left standing at a stall. */
  browsing: number;
  retry: number;
  x: number;
  z: number;
  rot: number;
  /** How fast they are really moving, which drives the legs. */
  speed: number;
  /** Where they are in their stride. */
  stride: number;
  size: number;
  /** Carrying a basin on their head. */
  loaded: boolean;
  /** What is on their mind: see `think`. */
  mind: Mind;
  /** Taken out of the crowd for now (squared up to the player, drawn in full elsewhere). */
  held: boolean;
};

// ---- minds ---------------------------------------------------------------------------
//
// Nobody in the crowd is just walking a line. Each person has a nature, and every half
// second or so they look round and decide what to do about what is going on near them: a
// fight draws a ring of people who want to see (and sends the nervous ones the other way),
// a car alarm or a siren makes heads turn, rain sends people hurrying or under the stall
// awnings, two people who meet may stop and gist, and a flashy car slowing down gets
// stared at. Then they go back to wherever they were going.

/** What sort of person: it decides what they do when something happens. */
export const TRAIT = { calm: 0, nosy: 1, nervous: 2, busy: 3 } as const;
/** What they are doing right now, besides walking. */
export const MODE = { walk: 0, watch: 1, flee: 2, shelter: 3, chat: 4, gawk: 5 } as const;

export type Mind = {
  trait: number;
  mode: number;
  /** When this stops (the street's own clock, seconds). */
  until: number;
  /** Where they are going or looking. */
  tx: number;
  tz: number;
  /** Seconds to the next look round. */
  think: number;
  /** How much faster than usual they walk right now. */
  hurry: number;
};

/** Something happening on the street that people react to. `until` is on the street's clock. */
export type StreetEvent = { kind: "fight" | "alarm" | "siren" | "show"; x: number; z: number; until: number };

/** Something is happening at (x, z) for `seconds`: everyone near takes notice. */
export function raiseEvent(life: StreetLife, kind: StreetEvent["kind"], x: number, z: number, seconds: number): void {
  // One of each kind in one place: a fight that goes on is the same fight, kept going.
  for (const known of life.events) {
    if (known.kind === kind && Math.hypot(known.x - x, known.z - z) < 6) {
      known.x = x;
      known.z = z;
      known.until = Math.max(known.until, life.time + seconds);
      return;
    }
  }
  life.events.push({ kind, x, z, until: life.time + seconds });
}

const NOTICE = { fight: 26, alarm: 20, siren: 18, show: 13 };

function newMind(random: () => number): Mind {
  const roll = random();
  const trait = roll < 0.42 ? TRAIT.calm : roll < 0.7 ? TRAIT.nosy : roll < 0.86 ? TRAIT.nervous : TRAIT.busy;
  return { trait, mode: MODE.walk, until: 0, tx: 0, tz: 0, think: random() * 0.6, hurry: 1 };
}

/** One look round: decide what to do about what is going on. */
function think(life: StreetLife, walker: Walker, index: number): void {
  const { random } = life;
  const mind = walker.mind;
  const now = life.time;
  if (mind.mode !== MODE.walk && now >= mind.until) mind.mode = MODE.walk;

  // The nearest thing worth noticing, the most dramatic first.
  let event: StreetEvent | null = null, gap = Infinity;
  for (const known of life.events) {
    if (known.until <= now) continue;
    const d = Math.hypot(known.x - walker.x, known.z - walker.z);
    if (d > NOTICE[known.kind]) continue;
    const rank = (known.kind === "fight" ? 0 : known.kind === "alarm" ? 1 : known.kind === "siren" ? 2 : 3) * 100 + d;
    if (rank < gap) {
      gap = rank;
      event = known;
    }
  }
  if (event) {
    const d = Math.hypot(event.x - walker.x, event.z - walker.z);
    const away = Math.atan2(walker.x - event.x, walker.z - event.z);
    if (event.kind === "fight") {
      if (mind.trait === TRAIT.nervous || (mind.trait === TRAIT.busy && random() < 0.5)) {
        if (mind.mode !== MODE.flee) setFlee(life, walker, event, 4 + random() * 3);
      } else if (mind.mode !== MODE.watch) {
        // Into the ring, on the side they came from, close enough to see and not to be hit.
        const angle = away + (random() - 0.5) * 0.9;
        const radius = 3.2 + random() * 2.6;
        mind.mode = MODE.watch;
        mind.tx = event.x + Math.sin(angle) * radius;
        mind.tz = event.z + Math.cos(angle) * radius;
        mind.until = event.until + random() * 2;
      }
      return;
    }
    if (event.kind === "alarm") {
      if (mind.trait === TRAIT.nervous && d < 10) setFlee(life, walker, event, 2.5 + random() * 2);
      else if (mind.mode === MODE.walk) look(mind, event, now + 1.5 + random() * 2);
      return;
    }
    if (event.kind === "siren") {
      if (mind.mode === MODE.walk) look(mind, event, now + 1.2 + random() * 1.5);
      return;
    }
    if (event.kind === "show" && mind.mode === MODE.walk && (mind.trait === TRAIT.nosy || random() < 0.3)) {
      look(mind, event, now + 2 + random() * 2.5);
      return;
    }
  }

  // Rain: hurry, or get under an awning until it eases off.
  const rain = weatherNow.rain;
  mind.hurry = rain > 0.25 && mind.mode === MODE.walk ? 1 + rain * 0.7 : 1;
  if (mind.mode === MODE.shelter && rain < 0.15) mind.mode = MODE.walk;
  if (rain > 0.35 && mind.mode === MODE.walk && life.walks[walker.walk].busy && random() < 0.08) {
    mind.mode = MODE.shelter;
    mind.until = now + 20 + random() * 40;
    walker.sideGoal = walker.side >= 0 ? life.walks[walker.walk].half : -life.walks[walker.walk].half;
    return;
  }

  // Meeting somebody: now and then two people stop and gist.
  if (mind.mode === MODE.walk && rain < 0.2 && mind.trait !== TRAIT.busy && random() < 0.025) {
    for (let k = 0; k < 6; k++) {
      const other = life.walkers[Math.floor(random() * life.walkers.length) % life.walkers.length];
      if (other === walker || !other.active || other.held || other.mind.mode !== MODE.walk) continue;
      if (Math.hypot(other.x - walker.x, other.z - walker.z) > 2.2) continue;
      const until = now + 4 + random() * 6;
      Object.assign(mind, { mode: MODE.chat, until, tx: other.x, tz: other.z });
      Object.assign(other.mind, { mode: MODE.chat, until, tx: walker.x, tz: walker.z });
      return;
    }
  }
  void index;
}

function look(mind: Mind, event: StreetEvent, until: number): void {
  mind.mode = MODE.gawk;
  mind.tx = event.x;
  mind.tz = event.z;
  mind.until = until;
}

function setFlee(life: StreetLife, walker: Walker, event: StreetEvent, seconds: number): void {
  const walk = life.walks[walker.walk];
  along(walk, Math.min(walk.length, walker.at + 1), spot);
  // Along the path, whichever way leads away.
  const ahead = (walker.x - event.x) * spot.ux + (walker.z - event.z) * spot.uz;
  walker.heading = ahead >= 0 ? 1 : -1;
  walker.mind.mode = MODE.flee;
  walker.mind.until = life.time + seconds;
  walker.browsing = 0;
}

/** Somebody in the crowd takes off away from (x, z): let go if they were held, running along their path. */
export function sendFleeing(life: StreetLife, index: number, x: number, z: number, seconds = 6): void {
  const walker = life.walkers[index];
  if (!walker) return;
  walker.held = false;
  setFlee(life, walker, { kind: "fight", x, z, until: life.time + seconds }, seconds);
}

/** The look of somebody in the crowd, as the full character draws them: picked out to fight. */
export function walkerLook(life: StreetLife, index: number): { body: "man" | "woman"; skin_tone: string; top_color: string; bottom_color: string } {
  return life.looks[index] ?? { body: "man", skin_tone: SKIN_HEX[2], top_color: CLOTH_HEX[0], bottom_color: CLOTH_HEX[7] };
}

/** The person in the crowd nearest (x, z), within `reach` metres, or -1. */
export function nearestWalker(life: StreetLife, x: number, z: number, reach: number): number {
  let best = -1, bestGap = reach;
  life.walkers.forEach((walker, index) => {
    if (!walker.active || walker.held) return;
    const gap = Math.hypot(walker.x - x, walker.z - z);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  });
  return best;
}

type Lane = Line & { next: Join[]; twin: number };

export type Vehicle = {
  /** False while it waits, out of sight, for a clear road to come in on. */
  active: boolean;
  lane: number;
  at: number;
  speed: number;
  cruise: number;
  /** 0 yellow bus, 1 keke, 2 car, 3 city bus. */
  kind: number;
  /** Which paint, for cars. */
  paint: number;
  /** Seconds left stopped to pick people up. */
  loading: number;
  halfLong: number;
  halfWide: number;
  x: number;
  z: number;
  /** The way it points. */
  ux: number;
  uz: number;
};

export type StreetLife = {
  walkers: Walker[];
  vehicles: Vehicle[];
  walks: Walk[];
  lanes: Lane[];
  samples: Sample[];
  /** Samples sorted into squares, for finding somewhere to walk near the player. */
  sampleCells: Map<number, number[]>;
  busyCells: Set<number>;
  /** Places along the lanes where a vehicle can join the traffic. */
  joins: Sample[];
  random: () => number;
  time: number;
  /** What is going on that people notice. */
  events: StreetEvent[];
  /** How each walker is dressed, for drawing one of them in full. Filled in by peopleColours. */
  looks: { body: "man" | "woman"; skin_tone: string; top_color: string; bottom_color: string }[];
};

export type StreetLifeOptions = { walkers?: number; vehicles?: number; seed?: number };

// ---- making a street -------------------------------------------------------

const SAMPLE_CELL = 12;
const cellKey = (x: number, z: number, size: number) => (Math.floor(x / size) + 4096) * 8192 + (Math.floor(z / size) + 4096);

/** The street being shown now: whoever needs to look into it (a test, or a debugging session) can. */
export const currentStreet: { life: StreetLife | null } = { life: null };

export function createStreetLife(district: DistrictData, options: StreetLifeOptions = {}): StreetLife {
  const random = randomStream(options.seed ?? 20261006);

  // Where people walk.
  const walks: Walk[] = [];
  for (const walk of district.walks ?? []) {
    if (walk.p.length < 4) continue;
    const line = makeLine(walk.p);
    if (line.length < 4) continue;
    walks.push({ ...line, half: walk.h, busy: walk.m === 1, startLinks: [], endLinks: [] });
  }

  const samples: Sample[] = [];
  const sampleCells = new Map<number, number[]>();
  walks.forEach((walk, index) => {
    for (let at = 1; at < walk.length; at += 3) {
      along(walk, at, spot);
      const key = cellKey(spot.x, spot.z, SAMPLE_CELL);
      const cell = sampleCells.get(key);
      if (cell) cell.push(samples.length);
      else sampleCells.set(key, [samples.length]);
      samples.push({ walk: index, at, x: spot.x, z: spot.z });
    }
  });

  // Where one path ends beside another, a walker may carry on along the other.
  const joinsNear = (x: number, z: number, self: number): Join[] => {
    const best = new Map<number, { at: number; gap: number }>();
    const cx = Math.floor(x / SAMPLE_CELL), cz = Math.floor(z / SAMPLE_CELL);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        for (const index of sampleCells.get((ix + 4096) * 8192 + (iz + 4096)) ?? []) {
          const sample = samples[index];
          if (sample.walk === self) continue;
          const gap = Math.hypot(sample.x - x, sample.z - z);
          if (gap > 3.2) continue;
          const known = best.get(sample.walk);
          if (!known || gap < known.gap) best.set(sample.walk, { at: sample.at, gap });
        }
      }
    }
    return [...best.entries()].map(([to, found]) => ({ to, at: found.at }));
  };
  walks.forEach((walk, index) => {
    walk.startLinks = joinsNear(walk.p[0], walk.p[1], index);
    walk.endLinks = joinsNear(walk.p[walk.p.length - 2], walk.p[walk.p.length - 1], index);
  });

  // Where the stalls are thick, traffic crawls and buses stop to load.
  const stallCount = new Map<number, number>();
  const stalls = district.stalls ?? [];
  for (let i = 0; i + 3 < stalls.length; i += 4) {
    const key = cellKey(stalls[i], stalls[i + 1], BUSY_CELL);
    stallCount.set(key, (stallCount.get(key) ?? 0) + 1);
  }
  const busyCells = new Set<number>();
  for (const [key, count] of stallCount) if (count >= 3) busyCells.add(key);

  // Where vehicles drive: one lane each way on a two-way road, keeping right, and two
  // lanes side by side on a wide one-way road.
  const lanes: Lane[] = [];
  const addLane = (points: number[], twin: number) => {
    const line = makeLine(points);
    if (line.length >= 12) lanes.push({ ...line, next: [], twin });
  };
  for (const road of district.roads) {
    if (!MAIN_ROADS.includes(road.t) || road.y || road.p.length < 4) continue;
    if (road.o) {
      if (road.w >= 8) {
        addLane(shifted(road.p, road.w * 0.22), -1);
        addLane(shifted(road.p, -road.w * 0.22), -1);
      } else {
        addLane(road.p, -1);
      }
    } else {
      const first = lanes.length;
      addLane(shifted(road.p, road.w / 4), first + 1);
      if (lanes.length > first) addLane(shifted(reversed(road.p), road.w / 4), first);
      if (lanes.length === first + 1) lanes[first].twin = -1;
    }
  }

  const start: Spot = { x: 0, z: 0, ux: 1, uz: 0 };
  lanes.forEach((lane, index) => {
    along(lane, lane.length, spot);
    const endX = spot.x, endZ = spot.z, endUx = spot.ux, endUz = spot.uz;
    // First choice: a lane that starts where this one ends.
    lanes.forEach((other, to) => {
      if (to === index || to === lane.twin) return;
      along(other, 0, start);
      if (Math.hypot(start.x - endX, start.z - endZ) < 14 && start.ux * endUx + start.uz * endUz > -0.2) {
        lane.next.push({ to, at: 0 });
      }
    });
    // Otherwise: a lane that passes by, as at a junction with a road that carries straight on.
    if (lane.next.length === 0) {
      lanes.forEach((other, to) => {
        if (to === index || to === lane.twin) return;
        let bestAt = -1, bestGap = 13;
        for (let at = 0; at < other.length - 8; at += 4) {
          along(other, at, start);
          const gap = Math.hypot(start.x - endX, start.z - endZ);
          if (gap < bestGap && start.ux * endUx + start.uz * endUz > -0.3) {
            bestGap = gap;
            bestAt = at;
          }
        }
        if (bestAt >= 0) lane.next.push({ to, at: bestAt });
      });
    }
  });
  const joins: Sample[] = [];
  lanes.forEach((lane, index) => {
    for (let at = 0; at < lane.length - 10; at += 20) {
      along(lane, at, spot);
      joins.push({ walk: index, at, x: spot.x, z: spot.z });
    }
  });

  const life: StreetLife = {
    walkers: [], vehicles: [], walks, lanes, samples, sampleCells, busyCells, joins, random, time: 0, events: [], looks: [],
  };

  const walkerCount = walks.length > 0 ? options.walkers ?? WALKERS : 0;
  for (let i = 0; i < walkerCount; i++) {
    life.walkers.push({
      active: false, walk: 0, at: 0, heading: 1, side: 0, sideGoal: 0,
      pace: 0.8 + random() * 0.7, browsing: 0, retry: random() * 0.5,
      x: 0, z: -9999, rot: 0, speed: 0, stride: random() * 6.283,
      size: 0.9 + random() * 0.16, loaded: random() < 0.26, mind: newMind(random), held: false,
    });
  }

  currentStreet.life = life;
  const vehicleCount = lanes.length > 0 ? options.vehicles ?? VEHICLES : 0;
  for (let i = 0; i < vehicleCount; i++) {
    const kind = MIX[Math.floor(random() * MIX.length) % MIX.length];
    const size = VEHICLE_SIZES[kind];
    life.vehicles.push({
      active: false, lane: 0, at: 0, speed: 0, cruise: CRUISE[kind] * (0.85 + random() * 0.3), kind,
      paint: Math.floor(random() * (CAR_TINTS.length / 3)), loading: 0,
      halfLong: size.halfLong, halfWide: size.halfWide, x: 0, z: -9999, ux: 1, uz: 0,
    });
  }
  return life;
}

// ---- the crowd -------------------------------------------------------------

/** Put a walker on a path somewhere between `nearest` and `furthest` metres from the player. */
function placeWalker(life: StreetLife, walker: Walker, px: number, pz: number, nearest: number, furthest: number): void {
  const { random } = life;
  walker.active = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const angle = random() * Math.PI * 2;
    const reach = Math.sqrt(nearest * nearest + random() * (furthest * furthest - nearest * nearest));
    const cell = life.sampleCells.get(cellKey(px + Math.cos(angle) * reach, pz + Math.sin(angle) * reach, SAMPLE_CELL));
    if (!cell) continue;
    const sample = life.samples[cell[Math.floor(random() * cell.length) % cell.length]];
    const walk = life.walks[sample.walk];
    if (!walk.busy && random() > QUIET_STREET) continue;
    const gap = Math.hypot(sample.x - px, sample.z - pz);
    if (gap < nearest * 0.8 || gap > furthest + SAMPLE_CELL) continue;

    walker.active = true;
    walker.walk = sample.walk;
    walker.at = sample.at;
    walker.heading = random() < 0.5 ? 1 : -1;
    walker.side = (random() * 2 - 1) * walk.half;
    walker.sideGoal = walker.side;
    walker.browsing = 0;
    along(walk, walker.at, spot);
    walker.x = spot.x - spot.uz * walker.side;
    walker.z = spot.z + spot.ux * walker.side;
    walker.rot = Math.atan2(spot.ux * walker.heading, spot.uz * walker.heading);
    walker.speed = 0;
    walker.mind.mode = MODE.walk;
    walker.mind.hurry = 1;
    return;
  }
}

function stepWalker(life: StreetLife, walker: Walker, dt: number, px: number, pz: number, index = 0): void {
  const { random } = life;
  if (walker.held) {
    walker.speed = 0;
    return;
  }
  if (!walker.active) {
    walker.retry -= dt;
    if (walker.retry <= 0) {
      walker.retry = 0.4 + random() * 0.8;
      // The very first time, fill the street right up to the player. After that, people
      // only ever appear in the distance.
      placeWalker(life, walker, px, pz, life.time < 2 ? 5 : NEAR * 0.6, NEAR);
    }
    return;
  }
  if (Math.hypot(walker.x - px, walker.z - pz) > FAR) {
    placeWalker(life, walker, px, pz, NEAR * 0.6, NEAR);
    return;
  }

  const mind = walker.mind;
  mind.think -= dt;
  if (mind.think <= 0) {
    mind.think = 0.35 + random() * 0.5;
    think(life, walker, index);
  }
  if (mind.mode === MODE.watch || mind.mode === MODE.gawk || mind.mode === MODE.chat) {
    // Off the path to watch, or standing still to look or talk: face what has their attention.
    let gx = walker.x, gz = walker.z;
    if (mind.mode === MODE.watch) {
      gx = mind.tx;
      gz = mind.tz;
    }
    const dx = gx - walker.x, dz = gz - walker.z;
    const gap = Math.hypot(dx, dz);
    const step = Math.min(gap, walker.pace * 2.2 * dt);
    if (gap > 0.05) {
      walker.x += (dx / gap) * step;
      walker.z += (dz / gap) * step;
    }
    let facing = Math.atan2(dx, dz);
    if (gap < 0.3 || mind.mode !== MODE.watch) {
      // There: turn to the fight (for a watcher, the middle of the ring is where they came from, plus the radius).
      const event = life.events.find((known) => known.until > life.time && Math.hypot(known.x - walker.x, known.z - walker.z) < 9);
      const fx = mind.mode === MODE.watch && event ? event.x : mind.tx, fz = mind.mode === MODE.watch && event ? event.z : mind.tz;
      facing = Math.atan2(fx - walker.x, fz - walker.z);
    }
    walker.speed = dt > 0 ? step / dt : 0;
    walker.rot = turnTowards(walker.rot, facing, 6 * dt);
    // Bouncing on their toes to see over the others.
    walker.stride += (walker.speed > 0.1 ? walker.speed * 3.4 : mind.mode === MODE.watch ? 2.2 : 0) * dt / walker.size;
    return;
  }

  let walk = life.walks[walker.walk];
  let facing = walker.rot;
  const hurry = mind.mode === MODE.flee ? 2.6 : mind.hurry;
  if (mind.mode === MODE.shelter) {
    walker.browsing = Math.max(walker.browsing, 0.5);
  }
  if (walker.browsing > 0) {
    walker.browsing -= dt;
  } else {
    walker.at += walker.heading * walker.pace * hurry * dt;
    if (walker.at <= 0 || walker.at >= walk.length) {
      // The end of this path: step onto one that passes here, or turn back.
      const links = walker.at <= 0 ? walk.startLinks : walk.endLinks;
      if (links.length > 0 && random() < 0.7) {
        const link = links[Math.floor(random() * links.length) % links.length];
        walker.walk = link.to;
        walker.at = link.at;
        walker.heading = random() < 0.5 ? 1 : -1;
        walk = life.walks[walker.walk];
        walker.sideGoal = (random() * 2 - 1) * walk.half;
      } else {
        walker.at = Math.max(0, Math.min(walk.length, walker.at));
        walker.heading = -walker.heading;
      }
    }
    if (walk.busy && random() < dt / BROWSE_EVERY) walker.browsing = 2 + random() * 5;
    if (random() < dt * 0.25) walker.sideGoal = (random() * 2 - 1) * walk.half;
  }
  walker.side += Math.max(-0.4 * dt, Math.min(0.4 * dt, walker.sideGoal - walker.side));

  along(walk, walker.at, spot);
  let goalX = spot.x - spot.uz * walker.side;
  let goalZ = spot.z + spot.ux * walker.side;
  if (walker.browsing > 0) {
    // Looking at a stall: turn to face the nearer edge of the path.
    const towards = walker.side >= 0 ? 1 : -1;
    facing = Math.atan2(-spot.uz * towards, spot.ux * towards);
  }

  // Nobody walks through the player: they step round.
  const fromPlayer = Math.hypot(goalX - px, goalZ - pz);
  if (fromPlayer < 0.8) {
    const push = (0.8 - fromPlayer) / (fromPlayer || 1);
    goalX += (goalX - px || 0.01) * push;
    goalZ += (goalZ - pz || 0.01) * push;
  }

  const dx = goalX - walker.x, dz = goalZ - walker.z;
  const gap = Math.hypot(dx, dz);
  const step = Math.min(gap, walker.pace * 1.8 * Math.max(1, hurry) * wadeFactor(walker.x, walker.z) * dt);
  if (gap > 1e-4) {
    walker.x += (dx / gap) * step;
    walker.z += (dz / gap) * step;
    if (walker.browsing <= 0 && step > 0.2 * dt) facing = Math.atan2(dx, dz);
  }
  walker.speed = dt > 0 ? step / dt : 0;
  walker.rot = turnTowards(walker.rot, facing, 5 * dt);
  walker.stride += walker.speed * dt * 3.4 / walker.size;
}

// ---- the traffic -----------------------------------------------------------

function laneIsClear(life: StreetLife, lane: number, at: number, room: number): boolean {
  for (const other of life.vehicles) {
    if (other.active && other.lane === lane && Math.abs(other.at - at) < room + other.halfLong) return false;
  }
  return true;
}

function enterLane(life: StreetLife, vehicle: Vehicle, lane: number, at: number): void {
  vehicle.active = true;
  vehicle.lane = lane;
  vehicle.at = at;
  along(life.lanes[lane], at, spot);
  vehicle.x = spot.x;
  vehicle.z = spot.z;
  vehicle.ux = spot.ux;
  vehicle.uz = spot.uz;
}

function stepVehicle(life: StreetLife, vehicle: Vehicle, dt: number, px: number, pz: number): void {
  const { random, lanes } = life;
  if (!vehicle.active) {
    // Waiting to join the traffic. To begin with the roads fill up all around the player;
    // after that, vehicles only ever appear in the distance.
    if (life.joins.length === 0) return;
    const join = life.joins[Math.floor(random() * life.joins.length) % life.joins.length];
    const gap = Math.hypot(join.x - px, join.z - pz);
    const nearest = life.time < 2 ? 12 : TRAFFIC_NEAR;
    if (gap > nearest && gap < TRAFFIC_FAR - 20 && laneIsClear(life, join.walk, join.at, 16)) {
      enterLane(life, vehicle, join.walk, join.at);
      vehicle.speed = vehicle.cruise * 0.6;
    }
    return;
  }
  if (Math.hypot(vehicle.x - px, vehicle.z - pz) > TRAFFIC_FAR) {
    vehicle.active = false;
    vehicle.speed = 0;
    vehicle.loading = 0;
    vehicle.z = -9999;
    return;
  }

  const lane = lanes[vehicle.lane];
  const busy = life.busyCells.has(cellKey(vehicle.x, vehicle.z, BUSY_CELL));
  let limit = vehicle.cruise * (busy ? 0.5 : 1);
  // Water on the road, the broken road past Isihor, and rain: everything crawls, and a
  // queue builds up behind whoever is crawling.
  limit *= wadeFactor(vehicle.x, vehicle.z) * (1 - 0.25 * weatherNow.rain);
  if (onBadRoad(weatherNow.district, vehicle.x, vehicle.z)) limit *= 0.4;
  // A siren coming: pull over a little and slow right down.
  for (const event of life.events) {
    if (event.kind === "siren" && event.until > life.time && Math.hypot(event.x - vehicle.x, event.z - vehicle.z) < 30) limit *= 0.45;
  }

  // Whatever is in front in this lane, or just into the next one.
  let room = Infinity, leaderSpeed = 0;
  const left = lane.length - vehicle.at;
  for (const other of life.vehicles) {
    if (other === vehicle || !other.active) continue;
    let gap = Infinity;
    if (other.lane === vehicle.lane && other.at > vehicle.at) {
      gap = other.at - vehicle.at;
    } else if (left < 30) {
      for (const link of lane.next) {
        if (other.lane === link.to && other.at >= link.at) gap = Math.min(gap, left + other.at - link.at);
      }
    }
    gap -= other.halfLong + vehicle.halfLong;
    if (gap < room) {
      room = gap;
      leaderSpeed = other.speed;
    }
  }
  if (room < 1.5) limit = 0;
  else if (room < 3 + vehicle.speed * 1.4) limit = Math.min(limit, leaderSpeed);

  // The player. Nothing drives into someone standing in the road.
  const dx = px - vehicle.x, dz = pz - vehicle.z;
  const ahead = dx * vehicle.ux + dz * vehicle.uz;
  const aside = Math.abs(-dx * vehicle.uz + dz * vehicle.ux);
  if (ahead > -vehicle.halfLong && ahead < vehicle.halfLong + 2.4 + vehicle.speed * 0.8 && aside < vehicle.halfWide + 0.8) {
    limit = 0;
  }

  // Buses and kekes stop wherever there are people to pick up. Everyone behind waits.
  if (vehicle.loading > 0) {
    vehicle.loading -= dt;
    limit = 0;
  } else if (busy && vehicle.kind < 2 && vehicle.speed > 1.5 && random() < dt / 16) {
    vehicle.loading = 3 + random() * 6;
  }

  if (vehicle.speed < limit) vehicle.speed = Math.min(limit, vehicle.speed + ACCELERATE * dt);
  else vehicle.speed = Math.max(limit, vehicle.speed - BRAKE * dt);

  vehicle.at += vehicle.speed * dt;
  if (vehicle.at >= lane.length) {
    if (lane.next.length > 0) {
      const link = lane.next[Math.floor(random() * lane.next.length) % lane.next.length];
      vehicle.lane = link.to;
      vehicle.at = link.at + (vehicle.at - lane.length);
    } else {
      // The end of the road: it will join the traffic again somewhere else.
      vehicle.active = false;
      vehicle.speed = 0;
      vehicle.loading = 0;
      vehicle.z = -9999;
      return;
    }
  }

  along(lanes[vehicle.lane], vehicle.at, spot);
  // Glide to the new line and turn smoothly, so a change of lane is not a jump.
  const ease = Math.min(1, dt * 5);
  const slide = Math.min(1, dt * 4 + (vehicle.speed * dt) / 6);
  vehicle.x += (spot.x - vehicle.x) * slide;
  vehicle.z += (spot.z - vehicle.z) * slide;
  let ux = vehicle.ux + (spot.ux - vehicle.ux) * ease, uz = vehicle.uz + (spot.uz - vehicle.uz) * ease;
  const length = Math.hypot(ux, uz);
  if (length > 1e-6) {
    ux /= length;
    uz /= length;
    vehicle.ux = ux;
    vehicle.uz = uz;
  }
}

/** Move the whole street on by `dt` seconds, given where the player is. */
export function stepStreetLife(life: StreetLife, dt: number, px: number, pz: number): void {
  life.walkers.forEach((walker, index) => stepWalker(life, walker, dt, px, pz, index));
  for (const vehicle of life.vehicles) stepVehicle(life, vehicle, dt, px, pz);
  life.time += dt;
  if (life.events.length > 0) life.events = life.events.filter((event) => event.until > life.time);
}

// ---- the player and the traffic --------------------------------------------

/**
 * The street's own collider with the moving vehicles added, so the player cannot walk
 * through a bus. A vehicle the player is somehow already inside never traps them.
 */
export function trafficCollider(base: Collider, life: StreetLife): Collider {
  const pushed: Point = { x: 0, z: 0 };
  const depthInside = (vehicle: Vehicle, x: number, z: number): number => {
    const dx = x - vehicle.x, dz = z - vehicle.z;
    const alongIt = Math.abs(dx * vehicle.ux + dz * vehicle.uz) - vehicle.halfLong - PLAYER_RADIUS;
    const acrossIt = Math.abs(-dx * vehicle.uz + dz * vehicle.ux) - vehicle.halfWide - PLAYER_RADIUS;
    return Math.max(alongIt, acrossIt); // negative when overlapping
  };

  const resolve = (fromX: number, fromZ: number, toX: number, toZ: number, out: Point): boolean => {
    let hit = base.resolve(fromX, fromZ, toX, toZ, out);
    for (const vehicle of life.vehicles) {
      if (!vehicle.active || Math.abs(vehicle.x - out.x) > 7 || Math.abs(vehicle.z - out.z) > 7) continue;
      if (depthInside(vehicle, out.x, out.z) >= 0 || depthInside(vehicle, fromX, fromZ) < -0.05) continue;

      // Slide out through whichever side is nearer.
      const dx = out.x - vehicle.x, dz = out.z - vehicle.z;
      const alongIt = dx * vehicle.ux + dz * vehicle.uz;
      const acrossIt = -dx * vehicle.uz + dz * vehicle.ux;
      const overAlong = vehicle.halfLong + PLAYER_RADIUS - Math.abs(alongIt);
      const overAcross = vehicle.halfWide + PLAYER_RADIUS - Math.abs(acrossIt);
      let wantX: number, wantZ: number;
      if (overAcross < overAlong) {
        const side = acrossIt >= 0 ? 1 : -1;
        wantX = out.x - vehicle.uz * side * overAcross;
        wantZ = out.z + vehicle.ux * side * overAcross;
      } else {
        const side = alongIt >= 0 ? 1 : -1;
        wantX = out.x + vehicle.ux * side * overAlong;
        wantZ = out.z + vehicle.uz * side * overAlong;
      }
      // The street has the last word: never pushed out of a bus and into a wall.
      base.resolve(fromX, fromZ, wantX, wantZ, pushed);
      if (depthInside(vehicle, pushed.x, pushed.z) < -0.02) {
        out.x = fromX;
        out.z = fromZ;
      } else {
        out.x = pushed.x;
        out.z = pushed.z;
      }
      hit = true;
    }
    return hit;
  };

  return { resolve, size: base.size };
}

// ---- where to draw everything ---------------------------------------------
//
// Each thing drawn many times needs 16 numbers saying where it is and which way it is
// turned. These functions write those numbers straight into the lists the 3D engine reads.

function hide(out: Float32Array, slot: number): void {
  const o = slot * 16;
  out.fill(0, o, o + 16);
  out[o + 13] = -1000;
  out[o + 15] = 1;
}

/**
 * One part of a person. They stand at (x, z) facing (fx, fz). The part hangs from a
 * point `right` metres to their right and `up` metres above the ground, and swings
 * forward and back from there by `swing`.
 */
function part(out: Float32Array, slot: number, x: number, z: number, fx: number, fz: number, size: number, right: number, up: number, swing: number): void {
  const o = slot * 16;
  const c = Math.cos(swing) * size, s = Math.sin(swing) * size;
  out[o] = fz * size; out[o + 1] = 0; out[o + 2] = -fx * size; out[o + 3] = 0;
  out[o + 4] = s * fx; out[o + 5] = c; out[o + 6] = s * fz; out[o + 7] = 0;
  out[o + 8] = c * fx; out[o + 9] = -s; out[o + 10] = c * fz; out[o + 11] = 0;
  out[o + 12] = x + right * size * fz; out[o + 13] = up * size; out[o + 14] = z - right * size * fx; out[o + 15] = 1;
}

/** The lists for the five shapes a person is made of. Legs and arms hold two entries per person. */
export type PeopleSlots = { body: Float32Array; head: Float32Array; legs: Float32Array; arms: Float32Array; loads: Float32Array };

function person(out: PeopleSlots, slot: number, x: number, z: number, rot: number, size: number, stride: number, moving: number): void {
  const fx = Math.sin(rot), fz = Math.cos(rot);
  const swing = Math.sin(stride) * 0.55 * moving;
  part(out.body, slot, x, z, fx, fz, size, 0, 0, 0);
  part(out.head, slot, x, z, fx, fz, size, 0, 0, 0);
  part(out.legs, slot * 2, x, z, fx, fz, size, -PERSON.legGap, PERSON.hip, swing);
  part(out.legs, slot * 2 + 1, x, z, fx, fz, size, PERSON.legGap, PERSON.hip, -swing);
  part(out.arms, slot * 2, x, z, fx, fz, size, -PERSON.armGap, PERSON.shoulder, -swing * 0.8);
  part(out.arms, slot * 2 + 1, x, z, fx, fz, size, PERSON.armGap, PERSON.shoulder, swing * 0.8);
}

function noPerson(out: PeopleSlots, slot: number): void {
  hide(out.body, slot);
  hide(out.head, slot);
  hide(out.legs, slot * 2);
  hide(out.legs, slot * 2 + 1);
  hide(out.arms, slot * 2);
  hide(out.arms, slot * 2 + 1);
}

/**
 * The strip of ground between the player and the camera. (x, z) is the player; (ux, uz)
 * points from the player towards the camera and is one metre long; the strip runs from
 * `near` to `far` metres along it.
 */
export type ClearView = { x: number; z: number; ux: number; uz: number; near: number; far: number };

/** Is a spot in that strip? */
export function inClearView(clear: ClearView, x: number, z: number): boolean {
  const dx = x - clear.x, dz = z - clear.z;
  const along = dx * clear.ux + dz * clear.uz;
  return along > clear.near && along < clear.far && Math.abs(dx * clear.uz - dz * clear.ux) < 0.9;
}

/**
 * The walking crowd, into slots 0 to walkers - 1. Anyone standing between the player
 * and the camera is left out, so the crowd never blocks the view of the player.
 */
export function writeWalkers(life: StreetLife, out: PeopleSlots, clear?: ClearView): void {
  life.walkers.forEach((walker, slot) => {
    const inTheWay = clear !== undefined && inClearView(clear, walker.x, walker.z);
    if (!walker.active || inTheWay || walker.held) {
      noPerson(out, slot);
      hide(out.loads, slot);
      return;
    }
    person(out, slot, walker.x, walker.z, walker.rot, walker.size, walker.stride, Math.min(1, walker.speed / 1.1));
    if (walker.loaded) part(out.loads, slot, walker.x, walker.z, Math.sin(walker.rot), Math.cos(walker.rot), walker.size, 0, PERSON.crown, 0);
    else hide(out.loads, slot);
  });
}

/** Someone who stands in one place: a seller behind a stall, a tout waiting at the kerb. */
export type Standing = { id: number; x: number; z: number; rot: number; speed: number; hidden?: boolean };

/** People standing about, into the slots after the walkers. Those drawn in full elsewhere are left out. */
export function writeStanding(people: Standing[], first: number, from: number, to: number, out: PeopleSlots, time: number): void {
  for (let i = from; i < to; i++) {
    const one = people[i];
    const slot = first + i;
    if (one.hidden || drawnInFull.ids.has(one.id)) {
      noPerson(out, slot);
      continue;
    }
    const size = 0.92 + ((one.id * 37) % 13) / 100;
    person(out, slot, one.x, one.z, one.rot, size, time * 7 + one.id, Math.min(1, one.speed / 1.1));
  }
}

/** The moving vehicles of one kind, in order. Returns how many were written. */
export function writeVehicles(life: StreetLife, kind: number, out: Float32Array): number {
  let slot = 0;
  for (const vehicle of life.vehicles) {
    if (vehicle.kind !== kind) continue;
    if (!vehicle.active) {
      hide(out, slot++);
      continue;
    }
    const o = slot * 16;
    out[o] = vehicle.ux; out[o + 1] = 0; out[o + 2] = vehicle.uz; out[o + 3] = 0;
    out[o + 4] = 0; out[o + 5] = 1; out[o + 6] = 0; out[o + 7] = 0;
    out[o + 8] = -vehicle.uz; out[o + 9] = 0; out[o + 10] = vehicle.ux; out[o + 11] = 0;
    out[o + 12] = vehicle.x; out[o + 13] = 0; out[o + 14] = vehicle.z; out[o + 15] = 1;
    slot++;
  }
  return slot;
}

// ---- what everyone wears ---------------------------------------------------

/** Colours for each of a person's shapes: red, green and blue from 0 to 1, one set per slot. */
export type PeopleColours = { body: Float32Array; head: Float32Array; legs: Float32Array; arms: Float32Array; loads: Float32Array };

type Dressed = { look: { skin_tone: string; top_color: string; bottom_color: string } };

/** Colours for the walkers, then for the people standing, in the same slots the positions use. */
export function peopleColours(life: StreetLife, standing: Dressed[]): PeopleColours {
  const walkers = life.walkers.length;
  const total = walkers + standing.length;
  const colours: PeopleColours = {
    body: new Float32Array(total * 3), head: new Float32Array(total * 3), legs: new Float32Array(total * 6),
    arms: new Float32Array(total * 6), loads: new Float32Array(Math.max(1, walkers) * 3),
  };
  const put = (list: Float32Array, slot: number, colour: { r: number; g: number; b: number }) => {
    list[slot * 3] = colour.r;
    list[slot * 3 + 1] = colour.g;
    list[slot * 3 + 2] = colour.b;
  };
  const dress = (slot: number, skin: { r: number; g: number; b: number }, top: { r: number; g: number; b: number },
    bottom: { r: number; g: number; b: number }, sleeves: boolean) => {
    put(colours.body, slot, top);
    put(colours.head, slot, skin);
    put(colours.legs, slot * 2, bottom);
    put(colours.legs, slot * 2 + 1, bottom);
    put(colours.arms, slot * 2, sleeves ? top : skin);
    put(colours.arms, slot * 2 + 1, sleeves ? top : skin);
  };

  const random = randomStream(77);
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length) % list.length];
  for (let slot = 0; slot < walkers; slot++) {
    const top = Math.floor(random() * CLOTH.length) % CLOTH.length;
    const skin = Math.floor(random() * SKIN.length) % SKIN.length;
    // One in three wears a gown or a wrapper: the same cloth from shoulder to ankle.
    const gown = random() < 0.33;
    const bottom = gown ? top : Math.floor(random() * CLOTH.length) % CLOTH.length;
    dress(slot, SKIN[skin], CLOTH[top], CLOTH[bottom], random() < 0.3);
    put(colours.loads, slot, pick(LOADS));
    life.looks[slot] = { body: gown ? "woman" : "man", skin_tone: SKIN_HEX[skin], top_color: CLOTH_HEX[top], bottom_color: CLOTH_HEX[bottom] };
  }
  standing.forEach((one, index) => {
    dress(walkers + index, hexToLinear(one.look.skin_tone), hexToLinear(one.look.top_color), hexToLinear(one.look.bottom_color), false);
  });
  return colours;
}

/** How many moving vehicles there are of each kind, and the paint of each. */
export function vehicleColours(life: StreetLife, kind: number): Float32Array {
  const list: number[] = [];
  for (const vehicle of life.vehicles) {
    if (vehicle.kind !== kind) continue;
    if (kind === 2) list.push(CAR_TINTS[vehicle.paint * 3], CAR_TINTS[vehicle.paint * 3 + 1], CAR_TINTS[vehicle.paint * 3 + 2]);
    else list.push(1, 1, 1);
  }
  return new Float32Array(list);
}
