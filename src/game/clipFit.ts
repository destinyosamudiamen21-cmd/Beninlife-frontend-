// Arithmetic on the numbers inside an animation, kept apart from the 3D library so it can
// be tested alone.

type Numbers = { [index: number]: number; readonly length: number };

/**
 * Takes the travelling out of a dance.
 *
 * Many downloaded dances wander: the dancer ends a step or two from where they began.
 * Played over and over that becomes a slide across the floor and a jump back at every
 * repeat, and in this game a dancer has to stay where the server has them standing.
 *
 * `times` are the seconds of each key and `values` are where the hips are at each one:
 * x, y, z, x, y, z ... Sideways (x) and forwards (z) are straightened so the dance ends
 * where it began, then centred on the spot. Up and down (y) is left alone: that is the
 * bounce of the dance itself.
 */
export function stayOnSpot(times: Numbers, values: Numbers): void {
  const keys = Math.min(times.length, Math.floor(values.length / 3));
  if (keys < 2) return;
  const first = times[0];
  const length = times[keys - 1] - first;
  const driftX = values[(keys - 1) * 3] - values[0];
  const driftZ = values[(keys - 1) * 3 + 2] - values[2];

  let sumX = 0,
    sumZ = 0;
  for (let key = 0; key < keys; key++) {
    const along = length > 0 ? (times[key] - first) / length : 0;
    values[key * 3] -= driftX * along;
    values[key * 3 + 2] -= driftZ * along;
    sumX += values[key * 3];
    sumZ += values[key * 3 + 2];
  }
  const middleX = sumX / keys,
    middleZ = sumZ / keys;
  for (let key = 0; key < keys; key++) {
    values[key * 3] -= middleX;
    values[key * 3 + 2] -= middleZ;
  }
}
