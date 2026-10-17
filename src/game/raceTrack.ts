// The race track on the GRA race field: a dirt oval on the open ground south of Okada
// Avenue, between the golf course and Reservation Road. Down the service road from Okada
// Avenue to the race desk at the edge of the field.
//
// The same numbers are in backend/app/services/race_service.py (TRACK): the server times the
// race from the checkpoints, the game draws the track from these. tools/check_race.py says so
// if the two have drifted apart.

export const TRACK = {
  /** Centres of the two bends, and how big they are. */
  westX: 90,
  eastX: 240,
  centreZ: -351,
  radius: 62,
  /** Metres of dirt either side of the centre line. */
  halfWidth: 7,
  /** The start and finish line, on the north straight. Racing goes east along it. */
  startX: 165,
  checkpoints: 16,
  /** Metres from a checkpoint at which it counts as passed. */
  checkpointReach: 13,
  /** Where you sign up for a race: the end of the service road. */
  desk: { x: 60, z: -268 },
};

export const LAP = 2 * (TRACK.eastX - TRACK.westX) + 2 * Math.PI * TRACK.radius;

/** The centre line, `s` metres round from the start line: where, and which way it runs. */
export function trackPoint(s: number): { x: number; z: number; heading: number } {
  const { westX, eastX, centreZ: cz, radius: r, startX } = TRACK;
  const straight = eastX - westX, arc = Math.PI * r;
  let d = ((s % LAP) + LAP) % LAP;
  // North straight, from the start line east to the east bend.
  const first = eastX - startX;
  if (d < first) return { x: startX + d, z: cz + r, heading: Math.PI / 2 };
  d -= first;
  if (d < arc) {
    const a = d / r;
    return { x: eastX + r * Math.sin(a), z: cz + r * Math.cos(a), heading: Math.PI / 2 + a };
  }
  d -= arc;
  if (d < straight) return { x: eastX - d, z: cz - r, heading: -Math.PI / 2 };
  d -= straight;
  if (d < arc) {
    const a = d / r;
    return { x: westX - r * Math.sin(a), z: cz - r * Math.cos(a), heading: -Math.PI / 2 + a };
  }
  d -= arc;
  return { x: westX + d, z: cz + r, heading: Math.PI / 2 };
}

/** The checkpoints, in order: the last one is the start line itself. */
export function checkpoints(): { x: number; z: number }[] {
  return Array.from({ length: TRACK.checkpoints }, (_, i) => {
    const p = trackPoint(((i + 1) * LAP) / TRACK.checkpoints);
    return { x: p.x, z: p.z };
  });
}

/** The starting grid: two by two behind the line, the player in pole. */
export function gridSlot(slot: number): { x: number; z: number; rot: number } {
  const row = Math.floor(slot / 2), side = slot % 2 === 0 ? 1 : -1;
  return { x: TRACK.startX - 7 - row * 9, z: TRACK.centreZ + TRACK.radius + side * 3, rot: Math.PI / 2 };
}

const LAUNCH = 2.6; // seconds a rival takes to get up to its race pace

/**
 * How far round a rival is, `t` seconds after the start: it pulls away from the grid, holds
 * its pace, and crosses the line at exactly its time. Then it rolls on and stops.
 */
export function rivalDistance(start: number, length: number, seconds: number, t: number): number {
  if (t <= 0) return start;
  const ramp = (u: number) => u - LAUNCH * (1 - Math.exp(-u / LAUNCH));
  const pace = (length - start) / ramp(seconds);
  if (t <= seconds) return start + pace * ramp(t);
  const after = Math.min(t - seconds, 6);
  return length + pace * (after - (after * after) / 12);
}

/** Where a rival on grid slot `slot` is, `s` metres round: its own side of the track,
 * drifting towards the middle on the bends like a racing line. */
export function rivalSpot(slot: number, s: number): { x: number; z: number; heading: number } {
  const p = trackPoint(s);
  const side = gridSlot(slot).z - (gridSlot(0).z + gridSlot(1).z) / 2;
  const lane = side * (0.6 + 0.4 * Math.cos((s / LAP) * Math.PI * 4));
  return { x: p.x - Math.cos(p.heading) * lane, z: p.z + Math.sin(p.heading) * lane, heading: p.heading };
}
