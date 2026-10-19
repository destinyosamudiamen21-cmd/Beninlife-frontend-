// What a body does for each move: in a fight, on the dance floor, in a seat. Whoever is in
// charge writes a pose; the character reads it every frame. Nothing here touches the 3D
// library, so it can be tested alone.

/** The dances, and the other things a body does that are not fighting. */
export type DanceMove = "legwork" | "shaku" | "whine" | "bounce" | "groove" | "sit" | "lie" | "spray";

/** Everything a body can be seen doing. In a fight the first four are picked; the next three happen to you. */
export type FightMove = "jab" | "heavy" | "block" | "dodge" | "hit" | "ko" | "win" | DanceMove;

/**
 * What one fighter is doing right now. A plain object, not React state: the fight
 * changes it and the character reads it every frame, with no re-render in between.
 */
export type FightPose = {
  /** True while squared up to fight or to hit the bag: they stand guard, not at ease. */
  guard: boolean;
  /** The move being made, or null. */
  move: FightMove | null;
  /** When it started, in seconds on the clock below. */
  started: number;
};

/** Seconds since the page opened. One clock for everything in a fight. */
export function fightClock(): number {
  return performance.now() / 1000;
}

export function newPose(): FightPose {
  return { guard: false, move: null, started: 0 };
}

/** Start a move now. */
export function strike(pose: FightPose, move: FightMove): void {
  pose.move = move;
  pose.started = fightClock();
}

/** Square up, or stand at ease again. Either way, whatever move was going on is over. */
export function setGuard(pose: FightPose, guard: boolean): void {
  pose.guard = guard;
  pose.move = null;
}

/** How long each move takes. An animation file of another length is played to fit. */
export const MOVE_SECONDS: Record<FightMove, number> = {
  jab: 0.55,
  heavy: 0.85,
  block: 0.8,
  dodge: 0.7,
  hit: 0.6,
  ko: 2.0,
  win: 2.4,
  // These go on until something else is set, so the number is only the length of one round of the step.
  legwork: 0.5,
  shaku: 1.0,
  whine: 1.25,
  bounce: 0.67,
  groove: 1.0,
  sit: 0.5,
  lie: 0.9,
  spray: 0.8,
};

const DANCES: ReadonlySet<string> = new Set<DanceMove>(["legwork", "shaku", "whine", "bounce", "groove", "sit", "lie", "spray"]);

/** A move that does not end by itself: the body stays down, keeps celebrating, or keeps dancing. */
export function holds(move: FightMove): boolean {
  return move === "ko" || move === "win" || DANCES.has(move);
}

/**
 * The move for a pose the server names: what a player is seen doing while they dance, sit
 * or lie passed out. "out" is the knockout: flat on the floor. Anything unknown is no move.
 */
export function poseMove(pose: string): FightMove | null {
  if (pose === "out") return "ko";
  return DANCES.has(pose) ? (pose as DanceMove) : null;
}

/**
 * The moves that can have an animation file, in /public/models-glb: dance-legwork.glb,
 * dance-shaku.glb, dance-bounce.glb, dance-whine.glb, dance-groove.glb, and for resting
 * dance-sit.glb (Mixamo "Sitting Idle") and dance-lie.glb (Mixamo "Sleeping Idle" or
 * "Laying Idle"). Any file from Mixamo will do: the name of the file decides which move
 * it is. A move with no file is still done, by bodyShift below. (Spraying money has no
 * file: it is always done by bodyShift.)
 */
export const DANCE_CLIPS = ["legwork", "shaku", "bounce", "whine", "groove", "sit", "lie"] as const;

// The dances whose files have been found and loaded. The character writes to it; whoever
// turns a dancer or moves their feet reads it, so a body is never moved twice over.
const danceFiles = new Set<string>();

/** A dance's animation file has loaded: from now on the file does the dancing. */
export function danceFileReady(move: string): void {
  danceFiles.add(move);
}

export function hasDanceFile(move: FightMove | null): boolean {
  return move !== null && danceFiles.has(move);
}

/**
 * How fast the legs go while the body stays on the spot, in metres a second of walking.
 * A dance with no animation file borrows the walk or the run for its feet and moves the
 * rest of the body in bodyShift below. A dance with a file needs neither.
 */
export function stepSpeed(move: FightMove | null): number {
  if (hasDanceFile(move)) return 0;
  if (move === "legwork") return 3.2;  // running on the spot
  if (move === "shaku") return 2.2;    // a quick walk
  if (move === "groove") return 1.2;   // a slow two-step
  return 0;
}

/** How far a dancer has turned from the way they were facing, in radians, `t` seconds in. */
export function danceTurn(move: FightMove | null, t: number): number {
  if (hasDanceFile(move)) return 0; // the file turns them as much as the dance calls for
  switch (move) {
    case "legwork": return 0.5 * Math.sin(Math.PI * t);
    case "shaku": return 0.35 * Math.sin(Math.PI * t);
    case "whine": return 0.8 * t;               // slowly, all the way round
    case "bounce": return 0.25 * Math.sin(1.5 * Math.PI * t);
    case "groove": return 0.4 * Math.sin(0.5 * Math.PI * t);
    default: return 0;
  }
}

/** Is the pose in the middle of a move at time `now`? */
export function moveNow(pose: FightPose, now: number): FightMove | null {
  if (!pose.move) return null;
  return holds(pose.move) || now - pose.started < MOVE_SECONDS[pose.move] ? pose.move : null;
}

/** The animation files a fighter can have, in /public/models-glb: fight-idle.glb, fight-jab.glb ... */
export const FIGHT_CLIPS = ["idle", "jab", "heavy", "block", "dodge", "hit", "ko", "win"] as const;

/**
 * The name of the animation a move is played from: "fight-jab", "dance-legwork". Null for
 * a move that never has a file (sitting down, spraying money).
 */
export function clipFor(move: FightMove): string | null {
  if ((DANCE_CLIPS as readonly string[]).includes(move)) return `dance-${move}`;
  if ((FIGHT_CLIPS as readonly string[]).includes(move)) return `fight-${move}`;
  return null;
}

/** How far the whole body is moved and tipped, on top of whatever animation is playing. */
export type BodyShift = {
  /** Metres towards the way the fighter faces. */
  forward: number;
  /** Metres to the fighter's left. */
  side: number;
  /** Metres up. */
  lift: number;
  /** Tipping forward (positive) or back, in radians. */
  lean: number;
  /** Tipping sideways, in radians. */
  roll: number;
};

const swing = (t: number, seconds: number): number => Math.sin(Math.PI * Math.max(0, Math.min(1, t / seconds)));
const ease = (t: number, seconds: number): number => {
  const p = Math.max(0, Math.min(1, t / seconds));
  return p * p * (3 - 2 * p);
};

/**
 * Where a move puts the body `t` seconds in.
 *
 * With an animation file the body only steps in and out: the file does the rest. Without
 * one the body itself is tipped and dropped, so a fight can still be read: a lunge is a
 * punch, a lean back is a guard, lying down is a knockout.
 */
export function bodyShift(move: FightMove | null, t: number, animated: boolean, out: BodyShift): void {
  out.forward = out.side = out.lift = out.lean = out.roll = 0;
  if (!move) return;
  const seconds = MOVE_SECONDS[move];

  switch (move) {
    case "jab":
      out.forward = 0.2 * swing(t, seconds);
      if (!animated) out.lean = 0.14 * swing(t, seconds);
      break;
    case "heavy":
      out.forward = 0.38 * swing(t, seconds);
      if (!animated) {
        out.lean = 0.3 * swing(t, seconds);
        out.roll = -0.12 * swing(t, seconds);
      }
      break;
    case "block":
      out.forward = -0.08 * swing(t, seconds);
      if (!animated) out.lean = -0.1 * swing(t, seconds);
      break;
    case "dodge":
      out.side = 0.3 * swing(t, seconds);
      out.forward = -0.12 * swing(t, seconds);
      if (!animated) out.roll = 0.3 * swing(t, seconds);
      break;
    case "hit":
      out.forward = -0.22 * swing(t, seconds);
      if (!animated) out.lean = -0.24 * swing(t, seconds);
      break;
    case "ko":
      // Staggers back, then goes down and stays down.
      out.forward = -0.45 * ease(t, 0.5);
      if (!animated) {
        out.lean = (-Math.PI / 2) * ease(t - 0.15, 0.7);
        out.lift = 0.12 * ease(t - 0.15, 0.7); // lying on the back, not sunk into the floor
      }
      break;
    case "win":
      if (!animated) out.lift = 0.14 * Math.abs(Math.sin(t * 6));
      break;
    // The dances. Two beats a second, as near as makes no difference to the music. With an
    // animation file the file is the dance, and the body is left alone.
    case "legwork":
      if (animated) break;
      // Quick feet and a low, forward lean, rocking from one foot to the other.
      out.lift = 0.05 * Math.abs(Math.sin(4 * Math.PI * t));
      out.side = 0.12 * Math.sin(2 * Math.PI * t);
      out.lean = 0.14;
      out.roll = 0.07 * Math.sin(4 * Math.PI * t);
      break;
    case "shaku":
      if (animated) break;
      // A half-step side to side, shoulders dipping with it.
      out.side = 0.18 * Math.sin(2 * Math.PI * t);
      out.lift = 0.04 * Math.abs(Math.sin(4 * Math.PI * t));
      out.lean = 0.2 + 0.05 * Math.sin(4 * Math.PI * t);
      out.roll = 0.1 * Math.sin(2 * Math.PI * t);
      break;
    case "whine":
      if (animated) break;
      // Knees bent, the waist going round in a slow circle.
      out.lift = -0.12 + 0.03 * Math.sin(4 * Math.PI * t);
      out.side = 0.1 * Math.sin(1.6 * Math.PI * t);
      out.forward = 0.08 * Math.cos(1.6 * Math.PI * t);
      out.roll = 0.14 * Math.sin(1.6 * Math.PI * t);
      out.lean = 0.1;
      break;
    case "bounce":
      if (animated) break;
      out.lift = 0.12 * Math.abs(Math.sin(3 * Math.PI * t));
      out.roll = 0.08 * Math.sin(1.5 * Math.PI * t);
      break;
    case "groove":
      if (animated) break;
      // The owambe two-step: an easy sway from foot to foot, shoulders following.
      out.side = 0.16 * Math.sin(Math.PI * t);
      out.lift = 0.03 * Math.abs(Math.sin(2 * Math.PI * t));
      out.roll = 0.09 * Math.sin(Math.PI * t);
      out.lean = 0.05;
      break;
    case "sit":
      // Down into the seat and leaning back. The seat hides how the legs fold. A file
      // (Sitting Idle) bends the knees and lowers the hips itself.
      if (animated) break;
      out.lift = -0.42 * ease(t, seconds);
      out.lean = -0.14 * ease(t, seconds);
      break;
    case "lie":
      // Lying back: the body tips over backwards from the feet, so whoever puts a player on
      // a bed stands them at its foot, facing away from the pillow. A little lift, so the
      // back rests on the mattress and does not sink into it.
      if (animated) {
        out.lift = 0.05;
        break;
      }
      out.lean = (-Math.PI / 2) * ease(t, seconds);
      out.lift = 0.14 * ease(t, seconds);
      break;
    case "spray":
      // Leaning in, one note after another.
      out.forward = 0.06;
      out.lean = 0.12 + 0.05 * Math.sin(5 * Math.PI * t);
      out.lift = 0.03 * Math.abs(Math.sin(2.5 * Math.PI * t));
      break;
  }
}

/**
 * A fighter held on the spot: where they stand, the way they face, and where the camera
 * looks from. While a hold is set the player cannot walk.
 */
export type Hold = {
  x: number;
  z: number;
  /** Height of the floor they stand on. */
  y: number;
  rot: number;
  /** What the camera looks at, and how far back, how high and how far to the right it sits from there. */
  lookX: number;
  lookZ: number;
  lookY: number;
  distance: number;
  height: number;
  side: number;
};
