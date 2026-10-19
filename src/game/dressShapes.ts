/**
 * Native wear drawn over the character: the agbada, senator and kaftan, Ankara prints,
 * the iro and buba with a gele, wrappers, and Benin coral beads (the chief's collar and
 * cap, the bride's crown).
 *
 * The character model only has a shirt, trousers and shoes to colour, so anything with
 * its own shape is built here, in metres, around where the model's bones stand at rest
 * (a `Fit`, measured from the model, so it fits any body). Each piece is hung on the bone
 * that should carry it (Character.tsx): a robe moves with the chest, a gele with the head,
 * coral bangles with the wrists.
 *
 * Patterns (Ankara, embroidery, coral) are coloured faces, not textures: the same way the
 * rest of the game is coloured, and nothing more to download.
 */
import type { MeshData } from "./districtGeometry";

export type V3 = [number, number, number];
type RGB = [number, number, number];

/** Where the body's joints are at rest, in metres, facing +z, feet at y = 0. */
export type Fit = {
  hips: V3;
  spine1: V3;
  spine2: V3;
  neck: V3;
  head: V3;
  /** Top of the head. */
  top: number;
  /** Knee and ankle heights. */
  knee: number;
  ankle: number;
  /** How far the shoulder joints are from the middle. */
  shoulder: number;
  leftHand: V3;
  rightHand: V3;
};

export type DressBone = "Hips" | "Spine1" | "Spine2" | "Head" | "LeftHand" | "RightHand";
export const DRESS_BONES: DressBone[] = ["Hips", "Spine1", "Spine2", "Head", "LeftHand", "RightHand"];

export type DressPart = { bone: DressBone; mesh: MeshData };

export type DressColours = { top: string; bottom: string; shoes: string };

/** Every kind of native wear there is. The server's outfits name one of these (wardrobe_service.py). */
export const DRESS_KINDS = [
  "agbada", "senator", "kaftan", "ankara_shirt", "chief",
  "iro_gele", "ankara_gown", "wrapper", "coral_bride",
] as const;
export type DressKind = (typeof DRESS_KINDS)[number];

/** A body of the usual shape, for when a model cannot be measured (and for the test viewer). */
export function standardFit(height: number): Fit {
  const k = height / 1.75;
  const at = (x: number, y: number, z = 0): V3 => [x * k, y * k, z * k];
  return {
    hips: at(0, 0.98), spine1: at(0, 1.12), spine2: at(0, 1.27), neck: at(0, 1.45), head: at(0, 1.55),
    top: 1.75 * k, knee: 0.5 * k, ankle: 0.09 * k, shoulder: 0.19 * k,
    leftHand: at(0.72, 1.42), rightHand: at(-0.72, 1.42),
  };
}

// ---- colour -------------------------------------------------------------------------

function rgb(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); // the scene works in linear colour
  });
  return [c[0], c[1], c[2]];
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (a: RGB, f: number): RGB => [a[0] * f, a[1] * f, a[2] * f];
const lightness = (a: RGB) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];

const GOLD = rgb("#c9a227");
const WHITE = rgb("#f2efe6");
const CORAL = rgb("#c4361f");
const CORAL_DARK = rgb("#8e1f12");
const CORAL_LIGHT = rgb("#e0583a");
const BRASS = rgb("#b58a2a");

/** A thread that shows on this cloth: gold on dark or bright cloth, deep brown on gold, white otherwise. */
function threadOn(cloth: RGB): RGB {
  const gold = Math.abs(cloth[0] - GOLD[0]) + Math.abs(cloth[1] - GOLD[1]) + Math.abs(cloth[2] - GOLD[2]) < 0.25;
  if (gold) return rgb("#4a2a12");
  return lightness(cloth) > 0.55 ? GOLD : mix(GOLD, WHITE, 0.25);
}

// ---- building ---------------------------------------------------------------------

class Builder {
  private p: number[] = [];
  private n: number[] = [];
  private c: number[] = [];
  private idx: number[] = [];

  vertex(pos: V3, normal: V3, colour: RGB): number {
    this.p.push(...pos);
    this.n.push(...normal);
    this.c.push(...colour);
    return this.p.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }

  build(): MeshData {
    return {
      positions: new Float32Array(this.p),
      normals: new Float32Array(this.n),
      colors: new Float32Array(this.c),
      uvs: new Float32Array((this.p.length / 3) * 2),
      indices: new Uint32Array(this.idx),
    };
  }
}

/** One ring of a lathe: a height, the half width and half depth there, and how far forward its centre sits. */
type Ring = { y: number; rx: number; rz: number; dz?: number; dx?: number };

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * A garment turned round the body: an oval tube through the rings, top to bottom.
 * `paint(u, v)` colours each face: u goes round from the front (0) through the left
 * (0.25), the back (0.5) and the right (0.75); v goes from the top ring (0) to the
 * bottom (1). Each face has its own corners, so a pattern has sharp edges, and the
 * normals are the smooth ones of the surface, so the cloth still looks round.
 * `from` is the bone's position: everything is made relative to it.
 */
function lathe(b: Builder, given: Ring[], from: V3, paint: (u: number, v: number, metres: number) => RGB, segments = 72): void {
  // Rows every few centimetres, so a pattern down the cloth has rows to be drawn on.
  const rings: Ring[] = [given[0]];
  for (let i = 1; i < given.length; i++) {
    const a = given[i - 1], c = given[i];
    const rows = Math.max(1, Math.round(Math.hypot(a.y - c.y, (a.rx - c.rx)) / 0.02));
    for (let r = 1; r <= rows; r++) {
      const t = r / rows;
      rings.push({ y: a.y + (c.y - a.y) * t, rx: a.rx + (c.rx - a.rx) * t, rz: a.rz + (c.rz - a.rz) * t, dz: (a.dz ?? 0) + ((c.dz ?? 0) - (a.dz ?? 0)) * t, dx: (a.dx ?? 0) + ((c.dx ?? 0) - (a.dx ?? 0)) * t });
    }
  }
  const point = (ring: Ring, u: number): V3 => {
    const a = u * Math.PI * 2;
    return [Math.sin(a) * ring.rx + (ring.dx ?? 0) - from[0], ring.y - from[1], Math.cos(a) * ring.rz + (ring.dz ?? 0) - from[2]];
  };
  // How far down the garment each ring is, by length of cloth, so a pattern is not stretched.
  const along = [0];
  for (let i = 1; i < rings.length; i++) {
    const a = rings[i - 1], c = rings[i];
    along.push(along[i - 1] + Math.hypot(a.y - c.y, (a.rx + a.rz - c.rx - c.rz) / 2));
  }
  const total = along[along.length - 1] || 1;
  const normalAt = (i: number, u: number): V3 => {
    const ring = rings[i];
    const a = u * Math.PI * 2;
    const up = rings[Math.max(0, i - 1)], down = rings[Math.min(rings.length - 1, i + 1)];
    const round: V3 = [Math.cos(a) * ring.rx, 0, -Math.sin(a) * ring.rz];     // along the ring
    const pu = point(up, u), pd = point(down, u);
    const slope: V3 = [pd[0] - pu[0], pd[1] - pu[1], pd[2] - pu[2]];      // down the cloth
    const n: V3 = [round[1] * slope[2] - round[2] * slope[1], round[2] * slope[0] - round[0] * slope[2], round[0] * slope[1] - round[1] * slope[0]];
    // Outward: the same way as the point is from the middle.
    const out = [Math.sin(a), 0, Math.cos(a)];
    const sign = n[0] * out[0] + n[2] * out[2] < 0 ? -1 : 1;
    return norm([n[0] * sign, n[1] * sign, n[2] * sign]);
  };
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let s = 0; s < segments; s++) {
      const u0 = s / segments, u1 = (s + 1) / segments;
      const colour = paint((u0 + u1) / 2, (along[i] + along[i + 1]) / 2 / total, (along[i] + along[i + 1]) / 2);
      const corners: [number, number][] = [[i, u0], [i, u1], [i + 1, u1], [i + 1, u0]];
      const ids = corners.map(([r, u]) => b.vertex(point(rings[r], u), normalAt(r, u), colour));
      b.tri(ids[0], ids[2], ids[1]);
      b.tri(ids[0], ids[3], ids[2]);
    }
  }
}

/** A small faceted bead (an octahedron), for coral. */
function bead(b: Builder, at: V3, r: number, colour: RGB): void {
  const tips: V3[] = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
  const faces = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  for (const f of faces) {
    const corners = f.map((i) => tips[i]);
    const normal = norm([corners.reduce((s, c) => s + c[0], 0), corners.reduce((s, c) => s + c[1], 0), corners.reduce((s, c) => s + c[2], 0)]);
    const tint = shade(colour, 0.85 + 0.3 * Math.max(0, normal[1]));
    const ids = corners.map((c) => b.vertex([at[0] + c[0], at[1] + c[1], at[2] + c[2]], normal, tint));
    b.tri(ids[0], ids[1], ids[2]);
  }
}

/** A string of beads round an oval: `tilt` drops the front below the back, as a necklace hangs. */
function beadRing(b: Builder, centre: V3, rx: number, rz: number, count: number, r: number, tilt: number, from: V3, colourAt: (i: number) => RGB): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const front = (Math.cos(a) + 1) / 2;
    bead(b, [
      centre[0] + Math.sin(a) * rx - from[0],
      centre[1] - tilt * front - from[1],
      centre[2] + Math.cos(a) * rz - from[2],
    ], r, colourAt(i));
  }
}

/** A string of beads round the wrist, at rest the arm points out sideways (x). */
function bangle(b: Builder, hand: V3, side: 1 | -1, from: V3): void {
  const at: V3 = [hand[0] - side * 0.07, hand[1], hand[2]];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    bead(b, [at[0] - from[0], at[1] + Math.cos(a) * 0.042 - from[1], at[2] + Math.sin(a) * 0.042 - from[2]], 0.012, i % 2 ? CORAL : CORAL_DARK);
  }
}

// ---- patterns ---------------------------------------------------------------------

/** Ankara: bold repeating motifs: a ring with a diamond inside, a dot between, on a ground.
 * `across` motifs round the body; rows of them every `tall` metres down. */
function ankara(ground: RGB, ink: RGB, accent: RGB, across: number, tall = 0.2): (u: number, v: number, metres: number) => RGB {
  return (u, _v, metres) => {
    const row = Math.floor(metres / tall);
    const shift = row % 2 ? 0.5 : 0;                 // every other row sits between the last
    const x = ((u * across + shift) % 1) - 0.5;
    const y = ((metres / tall) % 1) - 0.5;
    const ring = Math.hypot(x, y);
    if (Math.abs(x) + Math.abs(y) < 0.17) return accent;
    if (ring > 0.27 && ring < 0.4) return ink;
    if (Math.abs(x) > 0.44 && Math.abs(y) > 0.44) return ink;
    return ground;
  };
}

/** Plain cloth with embroidery down the front, round the neck and along the hem. */
function embroidered(cloth: RGB, thread: RGB, chest: number, hem = 0.03, placket = 0.022): (u: number, v: number) => RGB {
  return (u, v) => {
    const front = Math.min(u, 1 - u); // 0 at the front
    if (v < 0.07) return thread;                                  // the neckline
    if (v > 1 - hem) return thread;                               // the hem
    if (front < placket && v < chest) return thread;              // the placket down the chest
    if (v < chest && front < 0.09 && Math.floor(v * 40) % 4 === 0) return mix(cloth, thread, 0.7); // the pattern beside it
    return shade(cloth, 0.97 + 0.06 * Math.sin(u * Math.PI * 24)); // the folds
  };
}

const plain = (cloth: RGB) => (u: number) => shade(cloth, 0.95 + 0.07 * Math.sin(u * Math.PI * 30));

// ---- the garments -------------------------------------------------------------------

/** Every piece of one kind of native wear, on this body, in these colours. Unknown kinds wear nothing. */
export function dressParts(kind: string | undefined | null, fit: Fit, colours: DressColours): DressPart[] {
  const builders = new Map<DressBone, Builder>();
  const on = (bone: DressBone): Builder => {
    let b = builders.get(bone);
    if (!b) builders.set(bone, (b = new Builder()));
    return b;
  };
  const bones: Record<DressBone, V3> = {
    Hips: fit.hips, Spine1: fit.spine1, Spine2: fit.spine2, Head: fit.head, LeftHand: fit.leftHand, RightHand: fit.rightHand,
  };
  const top = rgb(colours.top), bottom = rgb(colours.bottom);
  const thread = threadOn(top);
  const neckY = fit.neck[1] - 0.02;
  const chestY = fit.spine2[1];
  const waistY = fit.spine1[1] - 0.03;
  const hipY = fit.hips[1];
  const s = fit.shoulder;
  // Below the hips the legs come forward as people walk and stand: give them room in front.
  const legRoom = (rings: Ring[]): Ring[] =>
    rings.map((r) => (r.y < hipY - 0.02 ? { ...r, dz: (r.dz ?? 0) + 0.04, rz: r.rz + 0.035 } : r));
  const headR = (fit.top - fit.head[1]) * 0.5 + 0.018;   // about 0.1 m, and room for hair under a cap

  // The robe-like shapes share a top: round the neck, out over the shoulders.
  const shoulders = (rx: number): Ring[] => [
    { y: neckY + 0.02, rx: 0.075, rz: 0.07 },
    { y: neckY - 0.02, rx: s * 0.75, rz: 0.12 },
    { y: chestY + 0.09, rx: s + rx, rz: 0.165 },
  ];

  switch (kind) {
    case "agbada": {
      // The big robe: wide over the shoulders and arms, falling to the shins, with a heavy
      // embroidered chest. Trousers (the model's own) show beneath. And a fila on the head.
      lathe(on("Spine1"), legRoom([
        ...shoulders(0.15),
        { y: chestY - 0.06, rx: s + 0.17, rz: 0.17 },
        { y: hipY, rx: s + 0.19, rz: 0.19 },
        { y: fit.knee, rx: s + 0.21, rz: 0.22 },
        { y: fit.ankle + 0.22, rx: s + 0.23, rz: 0.24 },
      ]), bones.Spine1, embroidered(top, thread, 0.32, 0.03, 0.016));
      fila(on("Head"), fit, headR, shade(top, 0.8), thread, bones.Head);
      break;
    }
    case "senator":
    case "kaftan": {
      const long = kind === "kaftan";
      lathe(on("Spine1"), legRoom([
        ...shoulders(0.04),
        { y: chestY - 0.05, rx: s + 0.03, rz: 0.15 },
        { y: waistY, rx: s * 0.95, rz: 0.15 },
        { y: hipY - 0.05, rx: s + 0.02, rz: 0.16 },
        { y: long ? fit.knee - 0.08 : hipY - 0.26, rx: s + (long ? 0.08 : 0.05), rz: long ? 0.2 : 0.17 },
      ]), bones.Spine1, embroidered(top, thread, long ? 0.3 : 0.5, 0.02, long ? 0.015 : 0.02));
      if (long) fila(on("Head"), fit, headR, shade(top, 0.75), thread, bones.Head);
      break;
    }
    case "ankara_shirt": {
      lathe(on("Spine1"), legRoom([
        ...shoulders(0.05),
        { y: chestY - 0.05, rx: s + 0.04, rz: 0.15 },
        { y: hipY - 0.04, rx: s + 0.04, rz: 0.16 },
      ]), bones.Spine1, ankara(top, bottom, GOLD, 7));
      break;
    }
    case "chief": {
      // A Benin chief: a white wrapper tied high on the chest, the coral collar over the
      // shoulders, a beaded coral cap, and coral at the wrists.
      lathe(on("Hips"), legRoom([
        { y: chestY + 0.02, rx: s * 0.95, rz: 0.15 },
        { y: waistY, rx: s * 0.95, rz: 0.16 },
        { y: hipY - 0.05, rx: s + 0.06, rz: 0.19 },
        { y: fit.knee, rx: s + 0.08, rz: 0.21 },
        { y: fit.ankle + 0.04, rx: s + 0.12, rz: 0.24 },
      ]), bones.Hips, (u, v) => (v < 0.06 ? shade(WHITE, 0.9) : Math.abs(u - 0.18) < 0.012 ? shade(WHITE, 0.82) : plain(WHITE)(u)));
      coralCollar(on("Spine2"), fit, bones.Spine2, 4);
      coralCap(on("Head"), fit, headR, bones.Head, false);
      bangle(on("LeftHand"), fit.leftHand, 1, bones.LeftHand);
      bangle(on("RightHand"), fit.rightHand, -1, bones.RightHand);
      break;
    }
    case "iro_gele": {
      // Iro and buba: a loose blouse, a wrapper tied at the waist with its end tucked in at
      // the hip, and the gele: tied high and wide.
      lathe(on("Spine1"), legRoom([
        ...shoulders(0.03),
        { y: chestY - 0.06, rx: s + 0.02, rz: 0.18, dz: 0.015 },
        { y: waistY, rx: s * 0.95, rz: 0.14 },
        { y: hipY - 0.04, rx: s + 0.05, rz: 0.17 },
      ]), bones.Spine1, embroidered(top, thread, 0.25, 0.04, 0.0));
      lathe(on("Hips"), legRoom([
        { y: waistY - 0.02, rx: s * 0.9, rz: 0.15 },
        { y: hipY - 0.06, rx: s + 0.03, rz: 0.18 },
        { y: fit.knee, rx: s + 0.04, rz: 0.19 },
        { y: fit.ankle + 0.03, rx: s + 0.08, rz: 0.22 },
      ]), bones.Hips, (u, v) => (Math.abs(u - 0.2) < 0.015 ? shade(bottom, 0.75) : v < 0.05 ? shade(bottom, 0.8) : plain(bottom)(u)));
      gele(on("Head"), fit, headR, top, thread, bones.Head);
      break;
    }
    case "ankara_gown": {
      // Fitted to the hips, then out to the floor.
      lathe(on("Hips"), legRoom([
        ...shoulders(0.02),
        { y: chestY - 0.06, rx: s + 0.0, rz: 0.18, dz: 0.015 },
        { y: waistY, rx: s * 0.82, rz: 0.13 },
        { y: hipY - 0.05, rx: s + 0.04, rz: 0.17 },
        { y: fit.knee, rx: s + 0.03, rz: 0.17 },
        { y: fit.ankle + 0.02, rx: s + 0.17, rz: 0.28 },
      ]), bones.Hips, ankara(top, bottom, GOLD, 8, 0.22));
      headwrap(on("Head"), fit, headR, bottom, bones.Head);
      break;
    }
    case "wrapper": {
      lathe(on("Hips"), legRoom([
        { y: waistY - 0.02, rx: s * 0.9, rz: 0.15 },
        { y: hipY - 0.06, rx: s + 0.03, rz: 0.18 },
        { y: fit.knee, rx: s + 0.04, rz: 0.19 },
        { y: fit.ankle + 0.03, rx: s + 0.08, rz: 0.22 },
      ]), bones.Hips, (u, v) => (Math.floor(v * 14) % 5 === 0 ? shade(bottom, 0.7) : Math.abs(u - 0.2) < 0.015 ? shade(bottom, 0.75) : plain(bottom)(u)));
      headwrap(on("Head"), fit, headR, top, bones.Head);
      break;
    }
    case "coral_bride": {
      // An Edo bride: coral wrapper tied above the chest, the coral collar, the beaded crown, coral at the wrists.
      lathe(on("Hips"), legRoom([
        { y: chestY + 0.04, rx: s * 0.9, rz: 0.15 },
        { y: waistY, rx: s * 0.82, rz: 0.13 },
        { y: hipY - 0.05, rx: s + 0.04, rz: 0.17 },
        { y: fit.knee, rx: s + 0.04, rz: 0.18 },
        { y: fit.ankle + 0.03, rx: s + 0.1, rz: 0.23 },
      ]), bones.Hips, (u, v) => {
        const net = (Math.floor(u * 96) + Math.floor(v * 48)) % 2 === 0;
        return v < 0.05 ? CORAL_DARK : net ? CORAL : CORAL_LIGHT;
      });
      coralCollar(on("Spine2"), fit, bones.Spine2, 5);
      coralCap(on("Head"), fit, headR, bones.Head, true);
      bangle(on("LeftHand"), fit.leftHand, 1, bones.LeftHand);
      bangle(on("RightHand"), fit.rightHand, -1, bones.RightHand);
      break;
    }
    default:
      return [];
  }
  return DRESS_BONES.filter((bone) => builders.get(bone) && !builders.get(bone)!.empty).map((bone) => ({ bone, mesh: builders.get(bone)!.build() }));
}

/** The fila: a soft cap, folded over to one side. */
function fila(b: Builder, fit: Fit, headR: number, cloth: RGB, thread: RGB, from: V3): void {
  const crown = fit.top - 0.035;
  lathe(b, [
    { y: crown - 0.015, rx: headR + 0.012, rz: headR + 0.022, dz: -0.005 },
    { y: crown + 0.07, rx: headR + 0.018, rz: headR + 0.026, dz: -0.008 },
    { y: crown + 0.12, rx: headR + 0.01, rz: headR + 0.02, dz: -0.01, dx: 0.035 },
    { y: crown + 0.1, rx: headR * 0.55, rz: headR * 0.7, dz: -0.01, dx: 0.1 },
    { y: crown + 0.07, rx: 0.015, rz: 0.02, dz: -0.01, dx: 0.13 },
  ], [from[0], from[1], from[2]], (u, v) => (v < 0.08 ? thread : shade(cloth, u > 0.5 ? 0.88 : 1.04)), 32);
}

/** The gele: a band round the head, rising into a wide, pleated fan at the back and sides. */
function gele(b: Builder, fit: Fit, headR: number, cloth: RGB, thread: RGB, from: V3): void {
  const base = fit.top - 0.075;   // tied across the forehead
  lathe(b, [
    { y: base - 0.01, rx: headR + 0.01, rz: headR + 0.02, dz: -0.01 },
    { y: base + 0.07, rx: headR + 0.03, rz: headR + 0.04, dz: -0.02 },
    { y: base + 0.14, rx: headR + 0.08, rz: headR + 0.05, dz: -0.035 },
    { y: base + 0.21, rx: headR + 0.14, rz: headR + 0.05, dz: -0.06 },
    { y: base + 0.24, rx: headR + 0.15, rz: headR + 0.03, dz: -0.07 },
    { y: base + 0.2, rx: headR * 0.5, rz: 0.03, dz: -0.06 },
  ], from, (u, v) => {
    const pleat = Math.floor(u * 26) % 2 === 0;
    if (v < 0.08) return thread;
    return shade(cloth, pleat ? 1.1 : 0.8);
  }, 52);
}

/** A simple head wrap: close to the head, a knot at the back. */
function headwrap(b: Builder, fit: Fit, headR: number, cloth: RGB, from: V3): void {
  const base = fit.top - 0.04;
  lathe(b, [
    { y: base - 0.01, rx: headR + 0.012, rz: headR + 0.022, dz: -0.005 },
    { y: base + 0.06, rx: headR + 0.025, rz: headR + 0.035, dz: -0.015 },
    { y: base + 0.1, rx: headR * 0.6, rz: headR * 0.7, dz: -0.03 },
    { y: base + 0.105, rx: 0.01, rz: 0.01, dz: -0.03 },
  ], from, (u) => shade(cloth, Math.floor(u * 16) % 2 ? 1.04 : 0.86), 32);
  for (let i = 0; i < 3; i++) bead(b, [-from[0], base + 0.05 - i * 0.02 - from[1], -headR - 0.06 - from[2]], 0.035, shade(cloth, 0.9));
}

/** The coral collar: rows of coral beads lying on the shoulders, wider row by row. */
function coralCollar(b: Builder, fit: Fit, from: V3, rows: number): void {
  const y = fit.neck[1] - 0.03;
  for (let r = 0; r < rows; r++) {
    const rx = 0.09 + r * 0.034, rz = 0.085 + r * 0.026;
    const count = Math.round((rx + rz) * 105);
    beadRing(b, [0, y - r * 0.016, 0.01], rx, rz, count, 0.017, 0.045 + r * 0.016, from,
      (i) => (r % 2 ? (i % 3 ? CORAL : CORAL_DARK) : i % 6 === 0 ? BRASS : CORAL));
  }
}

/** The coral cap: a dome of coral netting. The bride's is taller, a crown with a peak. */
function coralCap(b: Builder, fit: Fit, headR: number, from: V3, crown: boolean): void {
  const base = fit.top - 0.04;
  const lift = crown ? 0.1 : 0.0;
  const rings: Ring[] = [
    { y: base - 0.01, rx: headR + 0.016, rz: headR + 0.026, dz: -0.005 },
    { y: base + 0.05, rx: headR + 0.02, rz: headR + 0.03, dz: -0.01 },
    { y: base + 0.09 + lift * 0.5, rx: headR * (crown ? 0.9 : 0.8), rz: headR * (crown ? 0.95 : 0.85), dz: -0.012 },
    { y: base + 0.11 + lift, rx: headR * (crown ? 0.45 : 0.4), rz: headR * (crown ? 0.5 : 0.45), dz: -0.012 },
    { y: base + 0.115 + lift, rx: 0.01, rz: 0.01, dz: -0.012 },
  ];
  lathe(b, rings, from, (u, v) => {
    const net = (Math.floor(u * 40) + Math.floor(v * 12)) % 2 === 0;
    return v < 0.1 ? BRASS : net ? CORAL : CORAL_DARK;
  }, 40);
  // Strands of beads hanging at the sides of the face, and a bead on top.
  for (const side of [1, -1]) {
    for (let i = 0; i < (crown ? 6 : 3); i++) {
      bead(b, [side * (headR + 0.025) - from[0], base - 0.01 - i * 0.022 - from[1], 0.015 - from[2]], 0.011, i % 2 ? CORAL_DARK : CORAL);
    }
  }
  bead(b, [-from[0], base + 0.13 + lift - from[1], -0.012 - from[2]], crown ? 0.03 : 0.022, CORAL_LIGHT);
}
