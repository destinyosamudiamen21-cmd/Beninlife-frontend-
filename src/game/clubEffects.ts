// What happens in the air of a club when somebody spends: notes raining down over whoever is
// spraying, bottles coming through the crowd with sparklers, confetti when someone takes the
// club over. The HUD hears it from the server and drops it in here; ClubShow.tsx draws it.
// No 3D imports here, so it can be tested alone.

export type ShowKind = "spray" | "bottle" | "gold" | "ace" | "takeover" | "floor" | "hype" | "shoutout" | "song" | "table";

/** Something to show, where (in the room's own metres), and when (performance.now()). */
export type ShowEvent = { kind: ShowKind; x: number; z: number; amount: number; name: string; at: number };

export const clubShow = { events: [] as ShowEvent[], version: 0 };

/** Drop something into the show. The oldest go once there are more than a few. */
export function showEvent(kind: ShowKind, x: number, z: number, amount = 0, name = ""): void {
  clubShow.events.push({ kind, x, z, amount, name, at: performance.now() });
  if (clubShow.events.length > 24) clubShow.events.splice(0, clubShow.events.length - 24);
  clubShow.version += 1;
}

/** How many notes fly for an amount sprayed: more money, more paper. */
export function notesFor(amount: number): number {
  return Math.round(Math.max(24, Math.min(170, amount / 3000)));
}

/** A note in the air. All plain numbers: the drawing reads them every frame. */
export type Note = { live: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; turn: number; landed: number };

/** Throw `count` notes into the air above (x, z), into free places in `notes`. */
export function throwNotes(notes: Note[], x: number, z: number, count: number, random: () => number = Math.random): void {
  let thrown = 0;
  for (const note of notes) {
    if (thrown >= count) break;
    if (note.live) continue;
    const angle = random() * Math.PI * 2, reach = random() * 0.9;
    note.live = true;
    note.x = x + Math.cos(angle) * reach;
    note.z = z + Math.sin(angle) * reach;
    note.y = 2.2 + random() * 1.4;
    note.vx = Math.cos(angle) * (0.4 + random() * 0.8);
    note.vz = Math.sin(angle) * (0.4 + random() * 0.8);
    note.vy = 0.6 + random() * 1.3;          // thrown up first
    note.spin = random() * Math.PI * 2;
    note.turn = (random() - 0.5) * 9;
    note.landed = 0;
    thrown++;
  }
}

const GRAVITY = 2.4;        // paper falls slowly
const DRAG = 1.6;
const LIE = 9;              // seconds a note lies on the floor before it is gone (picked up)

/** Move every note on by `dt` seconds: up, then fluttering down, then lying on the floor. */
export function stepNotes(notes: Note[], dt: number, time: number): void {
  for (const note of notes) {
    if (!note.live) continue;
    if (note.y <= 0.02) {
      note.landed += dt;
      if (note.landed > LIE) note.live = false;
      continue;
    }
    note.vy -= GRAVITY * dt;
    note.vy = Math.max(note.vy, -0.9);       // paper does not drop like a stone
    note.vx -= note.vx * DRAG * dt;
    note.vz -= note.vz * DRAG * dt;
    const flutter = Math.sin(time * 6 + note.spin * 3) * 0.6;
    note.x += (note.vx + flutter * 0.4) * dt;
    note.z += (note.vz + Math.cos(time * 5 + note.spin) * 0.25) * dt;
    note.y = Math.max(0.015, note.y + note.vy * dt);
    note.spin += note.turn * dt;
  }
}
