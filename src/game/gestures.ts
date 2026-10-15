// The arithmetic of two fingers on a screen: how far apart they are and which way the
// line between them points. Pinching changes the first and twisting changes the second.
// The game's camera and the city map both use it. No React and no 3D in here, so it can
// be tested on its own.

export type Point = { x: number; y: number };

const TURN = Math.PI * 2;

/** An angle brought into the range -π to π. */
export function wrapAngle(angle: number): number {
  const wrapped = ((((angle + Math.PI) % TURN) + TURN) % TURN) - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/** How far apart two fingers are, in pixels. Never less than 1, so it is safe to divide by. */
export function spread(a: Point, b: Point): number {
  return Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
}

/** Which way the line from one finger to the other points. It grows as the fingers turn clockwise. */
export function bearing(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** The short way round from one bearing to another: positive is clockwise on the screen. */
export function turned(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** The point half way between two fingers. */
export function middle(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Tells a twist from the small wobble every pinch has. Feed it each change in bearing;
 * it gives back how much of that change is a real turn. Nothing comes back until the
 * fingers have turned `start` radians in total, and after that all of it does.
 */
export function twistFilter(start: number): {
  feed: (change: number) => number;
  reset: () => void;
} {
  let total = 0;
  let turning = false;
  return {
    feed(change: number): number {
      if (turning) return change;
      total += change;
      if (Math.abs(total) < start) return 0;
      turning = true;
      return total - Math.sign(total) * start; // only the part past the threshold, so the view does not jump
    },
    reset(): void {
      total = 0;
      turning = false;
    },
  };
}
