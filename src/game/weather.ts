// The weather over Benin: when it rains, and where the water stands on the roads. The same
// sums as backend/app/services/weather_service.py, from the server's clock, so everyone sees
// the same shower at the same moment and nothing has to be sent while it rains.
//
// Where the water goes is here too: the low stretch of Ugbowo–Lagos Road in front of the
// university floods every time it rains (poor drainage), and the road out past Isihor
// towards Oluku is so broken up that brown water stands in it whatever the weather.
// No 3D imports here, so it can be tested alone.

export const SLOT_MS = 20 * 60_000;
const RAIN_ODDS = 0.3;
const START_WITHIN_MS = 8 * 60_000;
const SHORTEST_MS = 6 * 60_000;
const LONGEST_EXTRA_MS = 8 * 60_000;
const RAMP_IN_MS = 60_000;
const RAMP_OUT_MS = 90_000;
const FILL_MS = 4 * 60_000;
const DRAIN_MS = 10 * 60_000;

/** A number from 0 to 1 from two whole numbers: the same 32-bit sums as weather_service._unit. */
export function unit(n: number, salt: number): number {
  let x = (Math.imul(n, 0x9e3779b1) + Math.imul(salt, 0x85ebca77)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** The shower in one slot of the day: [starts, ends, strength], or null. */
export function shower(slot: number): [number, number, number] | null {
  if (unit(slot, 1) >= RAIN_ODDS) return null;
  const start = slot * SLOT_MS + Math.floor(unit(slot, 2) * START_WITHIN_MS);
  const end = start + SHORTEST_MS + Math.floor(unit(slot, 3) * LONGEST_EXTRA_MS);
  return [start, end, 0.55 + 0.45 * unit(slot, 4)];
}

/** How hard it is raining at a moment of the server's clock: 0 to 1. */
export function rainAt(ms: number): number {
  const slot = Math.floor(ms / SLOT_MS);
  let best = 0;
  for (const k of [slot - 1, slot]) {
    const found = shower(k);
    if (!found) continue;
    const [start, end, strength] = found;
    if (ms < start || ms > end + RAMP_OUT_MS) continue;
    const rise = Math.min(1, (ms - start) / RAMP_IN_MS);
    const fall = ms <= end ? 1 : Math.max(0, 1 - (ms - end) / RAMP_OUT_MS);
    best = Math.max(best, strength * Math.min(rise, fall));
  }
  return best;
}

/** How full the low roads are: 0 dry, 1 knee deep. */
export function floodAt(ms: number): number {
  const slot = Math.floor(ms / SLOT_MS);
  let best = 0;
  for (const k of [slot - 1, slot]) {
    const found = shower(k);
    if (!found) continue;
    const [start, end, strength] = found;
    if (ms < start) continue;
    const level = ms <= end
      ? Math.min(1, (ms - start) / FILL_MS) * strength
      : Math.max(0, Math.min(1, (end - start) / FILL_MS) * strength - (ms - end) / DRAIN_MS);
    best = Math.max(best, level);
  }
  return best;
}

// ---- where the water stands ---------------------------------------------------------------

/**
 * A stretch of road that floods: a line along the road, how far either side of the line the
 * water spreads, and how deep it gets at its worst (metres). `always` is water that is there
 * in the dry too (the broken road past Isihor), as a share of its depth.
 */
export type FloodZone = { name: string; p: number[]; half: number; depth: number; always: number };

export const FLOOD_ZONES: Record<string, FloodZone[]> = {
  uniben: [
    // Ugbowo–Lagos Road in front of the university: both carriageways and the middle.
    {
      name: "Ugbowo Road",
      p: [262, 56.5, 192, 62.4, 120, 66.2, 60.4, 68.0, 8.9, 69.4, -35.0, 72.0, -113.8, 83.3, -150, 89.9],
      half: 12.5, depth: 0.42, always: 0,
    },
  ],
};

/**
 * A flooded road as a flat strip along its line: positions (x, 0, z), a colour with alpha
 * for each point (the water thins out at the ends and the edges), and triangles. The water
 * is raised to its level when drawn.
 */
export function waterRibbon(p: number[], half: number): { positions: Float32Array; colors: Float32Array; indices: Uint32Array } {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let walked = 0;
  const lengths = [0];
  for (let i = 0; i + 3 < p.length; i += 2) {
    walked += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
    lengths.push(walked);
  }
  const count = p.length / 2;
  for (let i = 0; i < count; i++) {
    const before = Math.max(0, i - 1), after = Math.min(count - 1, i + 1);
    let ux = p[after * 2] - p[before * 2], uz = p[after * 2 + 1] - p[before * 2 + 1];
    const length = Math.hypot(ux, uz) || 1;
    ux /= length;
    uz /= length;
    const fade = Math.max(0, Math.min(1, lengths[i] / 40, (walked - lengths[i]) / 40));
    for (const side of [-1, -0.55, 0, 0.55, 1]) {
      positions.push(p[i * 2] - uz * half * side, 0, p[i * 2 + 1] + ux * half * side);
      colors.push(1, 1, 1, fade * (0.25 + 0.75 * (1 - Math.abs(side) ** 3)));
    }
  }
  for (let i = 0; i + 1 < count; i++) {
    for (let j = 0; j < 4; j++) {
      const a = i * 5 + j, b = a + 1, c = a + 5, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(colors), indices: new Uint32Array(indices) };
}

/** The broken road from Isihor towards Oluku: deep holes, one after another, full of brown water. */
export type BadRoad = { name: string; p: number[]; half: number };

export const BAD_ROADS: Record<string, BadRoad[]> = {
  uniben: [
    { name: "Isihor towards Oluku", p: [-172, 96.8, -206.8, 99.8, -247.0, 106.8, -288.8, 115.4, -330, 127.2], half: 11.5 },
  ],
};

function nearestOn(p: number[], x: number, z: number): { gap: number; along: number; length: number } {
  let best = Infinity, bestAlong = 0, walked = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
    const dx = bx - ax, dz = bz - az;
    const span = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (span * span)));
    const gap = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (gap < best) {
      best = gap;
      bestAlong = walked + span * t;
    }
    walked += span;
  }
  return { gap: best, along: bestAlong, length: walked };
}

/**
 * How deep the water is at a spot (metres), given how full the roads are. The water is
 * deepest in the middle of a zone and thins out at its ends and edges.
 */
export function waterDepthAt(district: string, x: number, z: number, flood: number): number {
  let deepest = 0;
  for (const zone of FLOOD_ZONES[district] ?? []) {
    const at = nearestOn(zone.p, x, z);
    if (at.gap > zone.half) continue;
    const edge = 1 - (at.gap / zone.half) ** 4;
    const ends = Math.min(1, at.along / 40, (at.length - at.along) / 40);
    const level = Math.max(zone.always, flood);
    deepest = Math.max(deepest, zone.depth * level * edge * Math.max(0, ends));
  }
  return deepest;
}

/** Is this spot on the broken road past Isihor? */
export function onBadRoad(district: string, x: number, z: number): boolean {
  for (const road of BAD_ROADS[district] ?? []) if (nearestOn(road.p, x, z).gap <= road.half) return true;
  return false;
}

/**
 * The weather right now, for everything that is not drawn by the weather itself: the car
 * (slowed by water), the walker (wading), the traffic (crawling) and the crowd (running for
 * cover). WeatherLayer.tsx keeps it up to date every frame.
 */
export const weatherNow = { rain: 0, flood: 0, district: "", serverMs: 0 };

/** How much water slows anything at (x, z): 1 is not at all, lower is slower. */
export function wadeFactor(x: number, z: number): number {
  const depth = waterDepthAt(weatherNow.district, x, z, weatherNow.flood);
  return depth <= 0.03 ? 1 : Math.max(0.3, 1 - depth * 1.6);
}
