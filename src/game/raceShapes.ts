// The race field, built once: the dirt oval with its kerbs and start line, tyre walls on the
// bends, the grandstand, the race desk, the start gantry, flags, and a line of high-voltage
// pylons striding across the field with their cables sagging between them.

import { MeshBuilder, type MeshData } from "./districtGeometry";
import { LAP, TRACK, trackPoint } from "./raceTrack";
import { hexToLinear } from "./tint";

const Y = 0.1; // the track sits just above the grass and the roads

/** Where the pylons stand: off the track, one in the middle of the field. */
export const PYLONS: [number, number][] = [[12, -300], [165, -351], [318, -402]];
const PYLON_HEIGHT = 30;

export function buildRaceField(): { solid: MeshData; glow: MeshData } {
  const solid = new MeshBuilder();
  const glow = new MeshBuilder();
  const dirt = [hexToLinear("#9b5a33"), hexToLinear("#a7643a"), hexToLinear("#8f522e")];
  const line = hexToLinear("#7c4526");
  const kerbRed = hexToLinear("#c62828"), kerbWhite = hexToLinear("#f2f2f2");
  const tyre = hexToLinear("#1b1b1d"), tyreBand = hexToLinear("#e9e9e9");
  const { halfWidth: hw } = TRACK;
  const up: [number, number, number] = [0, 1, 0];

  // ---- the dirt: strips across the track, a little different each, and the worn racing line.
  const step = 3;
  for (let s = 0; s < LAP; s += step) {
    const a = trackPoint(s), b = trackPoint(Math.min(s + step, LAP));
    const na = { x: Math.cos(a.heading), z: -Math.sin(a.heading) }, nb = { x: Math.cos(b.heading), z: -Math.sin(b.heading) };
    const shade = dirt[Math.floor(s / step) % 3];
    solid.face([[a.x + na.x * hw, Y, a.z + na.z * hw], [a.x - na.x * hw, Y, a.z - na.z * hw], [b.x - nb.x * hw, Y, b.z - nb.z * hw], [b.x + nb.x * hw, Y, b.z + nb.z * hw]], shade, up);
    solid.face([[a.x + na.x * 1.5, Y + 0.01, a.z + na.z * 1.5], [a.x - na.x * 1.5, Y + 0.01, a.z - na.z * 1.5], [b.x - nb.x * 1.5, Y + 0.01, b.z - nb.z * 1.5], [b.x + nb.x * 1.5, Y + 0.01, b.z + nb.z * 1.5]], line, up);
  }

  // ---- kerbs on the inside of the bends, tyre walls round the outside.
  const bend = (s: number) => {
    const p = trackPoint(s);
    const q = trackPoint(s + 0.5);
    return Math.abs(p.heading - q.heading) > 1e-4;
  };
  for (let s = 0, i = 0; s < LAP; s += 2, i++) {
    if (!bend(s)) continue;
    const p = trackPoint(s);
    // Towards the middle of this bend is the inside.
    const cx = p.x > (TRACK.westX + TRACK.eastX) / 2 ? TRACK.eastX : TRACK.westX;
    const ix = (cx - p.x) / TRACK.radius, iz = (TRACK.centreZ - p.z) / TRACK.radius;
    const along = Math.atan2(Math.cos(p.heading), Math.sin(p.heading));
    solid.box(p.x + ix * (hw + 0.6), p.z + iz * (hw + 0.6), 1.0, 0.45, Y, Y + 0.08, i % 2 ? kerbRed : kerbWhite, along);
    if (i % 3 === 0) {
      const outX = p.x - ix * (hw + 2.5), outZ = p.z - iz * (hw + 2.5);
      for (let k = 0; k < 3; k++) solid.box(outX, outZ, 0.42, 0.42, k * 0.32, k * 0.32 + 0.3, k === 1 ? tyreBand : tyre);
    }
  }

  // ---- the start and finish line: a chequered band across the track.
  const sq = 0.9;
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k * sq < hw * 2; k++) {
      const z = TRACK.centreZ + TRACK.radius - hw + (k + 0.5) * sq;
      solid.box(TRACK.startX - sq / 2 + row * sq, z, sq / 2, sq / 2, Y, Y + 0.02, (row + k) % 2 ? kerbWhite : tyre);
    }
  }

  // ---- the start gantry over the line, with its five red lights.
  const north = TRACK.centreZ + TRACK.radius;
  const steel = hexToLinear("#3a3d42");
  for (const side of [-1, 1]) solid.box(TRACK.startX, north + side * (hw + 1.2), 0.3, 0.3, 0, 6.2, steel);
  solid.box(TRACK.startX, north, 0.35, hw + 1.5, 5.4, 6.4, steel);
  for (let k = 0; k < 5; k++) glow.box(TRACK.startX - 0.38, north - 2.4 + k * 1.2, 0.04, 0.35, 5.6, 6.2, hexToLinear("#ff2a2a"));

  // ---- the grandstand behind the north straight (the side of the field by Okada Avenue),
  //      its rows rising away from the track, and its roof.
  const concrete = hexToLinear("#b9b4aa"), seat = [hexToLinear("#1e5bb8"), hexToLinear("#f2c200"), hexToLinear("#c62828")];
  for (let tier = 0; tier < 5; tier++) {
    const z = north + hw + 6 + tier * 1.4;
    solid.box(165, z, 40, 0.7, 0, 0.6 + tier * 0.7, concrete);
    for (let k = 0; k < 40; k++) solid.box(126 + k * 2, z + 0.1, 0.45, 0.35, 0.6 + tier * 0.7, 1.05 + tier * 0.7, seat[(k + tier) % 3]);
  }
  solid.box(165, north + hw + 9, 41, 4.5, 6.6, 6.9, hexToLinear("#e9e6df"));
  for (const x of [126, 165, 204]) solid.box(x, north + hw + 12.6, 0.25, 0.25, 0, 6.6, steel);

  // ---- the race desk at the end of the service road: a kiosk under a striped awning.
  const { x: dx, z: dz } = TRACK.desk;
  solid.box(dx, dz - 3, 3, 1.8, 0, 2.6, hexToLinear("#f4f1ea"));
  solid.box(dx, dz - 1.4, 3, 0.4, 0, 1.1, hexToLinear("#c62828"));
  for (let k = 0; k < 6; k++) solid.box(dx - 2.75 + k * 1.1, dz - 1.2, 0.55, 1.6, 2.6, 2.8, k % 2 ? kerbRed : kerbWhite);
  glow.box(dx, dz - 1.15, 2.2, 0.03, 1.5, 2.2, hexToLinear("#ffd54f"));

  // ---- flags along the inside of the north straight, facing the grandstand.
  const flagColours = [kerbRed, hexToLinear("#1e5bb8"), hexToLinear("#f2c200"), hexToLinear("#2e7d32")];
  for (let k = 0; k < 10; k++) {
    const x = 100 + k * 14, z = north - hw - 3;
    solid.box(x, z, 0.06, 0.06, 0, 5, steel);
    solid.box(x + 0.7, z, 0.7, 0.03, 4.0, 4.9, flagColours[k % 4]);
  }

  // ---- the pylons: four legs leaning in, braced every few metres, cross-arms at the top.
  const lattice = hexToLinear("#6b7076");
  for (const [px, pz] of PYLONS) {
    const levels = 10;
    for (let level = 0; level < levels; level++) {
      const y0 = (level / levels) * PYLON_HEIGHT, y1 = ((level + 1) / levels) * PYLON_HEIGHT;
      const half = 3.2 * (1 - (level + 0.5) / levels) + 0.6;
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) solid.box(px + sx * half, pz + sz * half, 0.14, 0.14, y0, y1, lattice);
      solid.box(px, pz + half, half, 0.06, y1 - 0.25, y1, lattice);
      solid.box(px, pz - half, half, 0.06, y1 - 0.25, y1, lattice);
      solid.box(px + half, pz, 0.06, half, y1 - 0.25, y1, lattice);
      solid.box(px - half, pz, 0.06, half, y1 - 0.25, y1, lattice);
    }
    for (const y of [PYLON_HEIGHT * 0.78, PYLON_HEIGHT * 0.92]) solid.box(px, pz, 0.25, 7, y, y + 0.35, lattice);
    solid.box(px, pz, 0.12, 0.12, PYLON_HEIGHT, PYLON_HEIGHT + 3, lattice);
  }
  // Cables from arm to arm, sagging in the middle.
  const cable = hexToLinear("#2a2b2e");
  for (let i = 0; i + 1 < PYLONS.length; i++) {
    const [ax, az] = PYLONS[i], [bx, bz] = PYLONS[i + 1];
    for (const arm of [-6, 0, 6]) {
      for (const y of [PYLON_HEIGHT * 0.78, PYLON_HEIGHT * 0.92]) {
        const pieces = 16;
        for (let k = 0; k < pieces; k++) {
          const t0 = k / pieces, t1 = (k + 1) / pieces;
          const sag = (t: number) => 4 * 5 * t * (1 - t);
          const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0 + arm, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1 + arm;
          const ya = y - 0.1 - sag(t0), yb = y - 0.1 - sag(t1);
          solid.sheet([[x0, ya, z0], [x1, yb, z1], [x1, yb - 0.06, z1], [x0, ya - 0.06, z0]], cable, [0, 0, 1]);
        }
      }
    }
  }
  return { solid: solid.build(), glow: glow.build() };
}

/** The next checkpoint to drive through: two lit posts either side of the track. */
export function buildCheckpointGate(): MeshData {
  const gate = new MeshBuilder();
  const hw = TRACK.halfWidth + 1;
  for (const side of [-1, 1]) gate.box(0, side * hw, 0.25, 0.25, 0, 4.5, hexToLinear("#ffd54f"));
  gate.box(0, 0, 0.12, hw, 4.3, 4.5, hexToLinear("#ffd54f"));
  return gate.build();
}
