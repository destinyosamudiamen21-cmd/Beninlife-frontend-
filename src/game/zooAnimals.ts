// The animals at Ogba Zoo: what each one is built from, and how it wanders its pen. No 3D
// library here (MeshBuilder only), so all of it can be tested alone; Animals.tsx draws them.
//
// Each animal is a body and its legs. The body is one mesh; each leg is a box hung from
// the hip, swung back and forth while the animal walks. Measured in metres from the
// middle of the animal, facing +z (its nose), standing on the ground.
//
// A real model can stand in for any of them: put a .glb file in public/models/animals/,
// named after the animal (lion.glb, chimp.glb ...). If it is there, Animals.tsx shows it
// instead, at the height given here, playing its first animation.

import { MeshBuilder, type MeshData } from "./districtGeometry";
import { hexToLinear } from "./tint";

export type AnimalKind = "lion" | "lioness" | "chimp" | "croc" | "ostrich" | "peacock" | "tortoise" | "monkey";

/** One leg: where its hip is, how thick, how long, and its colour. It hangs straight down from the hip. */
export type Leg = { x: number; z: number; y: number; half: number; length: number; colour: string };

export type AnimalShape = {
  body: MeshData;
  legs: Leg[];
  /** How tall the animal stands, for scaling a real model to fit. */
  height: number;
  /** Metres a second when it walks. */
  speed: number;
  /** How far the legs swing, in radians, and how many strides a second at full speed. */
  swing: number;
  stride: number;
  /** Some animals lie down to rest (lions), some sit (chimps): how low the body goes, in metres. */
  rest: number;
};

type Part = [x: number, z: number, hx: number, hz: number, y0: number, y1: number, colour: string];

function build(parts: Part[]): MeshData {
  const builder = new MeshBuilder();
  for (const [x, z, hx, hz, y0, y1, colour] of parts) builder.box(x, z, hx, hz, y0, y1, hexToLinear(colour));
  return builder.build();
}

const four = (x: number, z: number, y: number, half: number, colour: string): Leg[] => [
  { x: -x, z, y, half, length: y, colour }, { x, z, y, half, length: y, colour },
  { x: -x, z: -z, y, half, length: y, colour }, { x, z: -z, y, half, length: y, colour },
];

const TAWNY = "#c8913f", TAWNY_LIGHT = "#e2b977", MANE = "#6b3a1a";

const SHAPES: Record<AnimalKind, () => AnimalShape> = {
  lion: () => ({
    body: build([
      [0, 0, 0.36, 0.85, 0.55, 1.08, TAWNY],
      [0, 0.75, 0.42, 0.26, 0.62, 1.42, MANE],              // the mane
      [0, 1.02, 0.24, 0.2, 0.82, 1.28, TAWNY],              // the face
      [0, 1.24, 0.12, 0.08, 0.84, 1.02, TAWNY_LIGHT],      // the muzzle
      [-0.1, 1.22, 0.035, 0.02, 1.12, 1.17, "#1d1d1f"], [0.1, 1.22, 0.035, 0.02, 1.12, 1.17, "#1d1d1f"],
      [0, 1.33, 0.05, 0.03, 0.97, 1.02, "#2a1a14"],         // the nose
      [0, -1.15, 0.04, 0.32, 0.72, 0.8, TAWNY],             // the tail
      [0, -1.5, 0.08, 0.06, 0.66, 0.84, MANE],              // its tuft
    ]),
    legs: four(0.22, 0.6, 0.58, 0.09, TAWNY), height: 1.42, speed: 1.1, swing: 0.55, stride: 1.4, rest: 0.42,
  }),
  lioness: () => ({
    body: build([
      [0, 0, 0.32, 0.8, 0.52, 1.0, TAWNY],
      [0, 0.92, 0.2, 0.22, 0.8, 1.2, TAWNY],
      [0, 1.15, 0.11, 0.08, 0.82, 0.98, TAWNY_LIGHT],
      [-0.09, 1.12, 0.03, 0.02, 1.05, 1.1, "#1d1d1f"], [0.09, 1.12, 0.03, 0.02, 1.05, 1.1, "#1d1d1f"],
      [-0.14, 0.85, 0.05, 0.03, 1.18, 1.28, TAWNY], [0.14, 0.85, 0.05, 0.03, 1.18, 1.28, TAWNY],   // ears
      [0, -1.1, 0.035, 0.3, 0.7, 0.77, TAWNY], [0, -1.42, 0.07, 0.05, 0.64, 0.8, MANE],
    ]),
    legs: four(0.2, 0.56, 0.55, 0.08, TAWNY), height: 1.28, speed: 1.2, swing: 0.55, stride: 1.5, rest: 0.4,
  }),
  chimp: () => ({
    body: build([
      [0, 0, 0.26, 0.22, 0.6, 1.08, "#2b211c"],
      [0, 0.1, 0.17, 0.16, 1.05, 1.38, "#2b211c"],
      [0, 0.25, 0.12, 0.03, 1.08, 1.32, "#c9a27e"],          // the face
      [-0.2, 0.1, 0.05, 0.04, 1.2, 1.3, "#c9a27e"], [0.2, 0.1, 0.05, 0.04, 1.2, 1.3, "#c9a27e"],   // ears
      [-0.06, 0.28, 0.025, 0.01, 1.22, 1.26, "#1d1d1f"], [0.06, 0.28, 0.025, 0.01, 1.22, 1.26, "#1d1d1f"],
    ]),
    // Long arms in front, short legs behind: it walks on its knuckles.
    legs: [
      { x: -0.3, z: 0.12, y: 1.0, half: 0.07, length: 1.0, colour: "#2b211c" }, { x: 0.3, z: 0.12, y: 1.0, half: 0.07, length: 1.0, colour: "#2b211c" },
      { x: -0.15, z: -0.12, y: 0.62, half: 0.08, length: 0.62, colour: "#2b211c" }, { x: 0.15, z: -0.12, y: 0.62, half: 0.08, length: 0.62, colour: "#2b211c" },
    ],
    height: 1.38, speed: 1.4, swing: 0.6, stride: 1.8, rest: 0.35,
  }),
  monkey: () => ({
    body: build([
      [0, 0, 0.14, 0.24, 0.32, 0.56, "#8a6a4a"],
      [0, 0.26, 0.11, 0.11, 0.5, 0.72, "#8a6a4a"],
      [0, 0.36, 0.07, 0.02, 0.53, 0.66, "#d9b48a"],
      [0, -0.55, 0.025, 0.35, 0.5, 0.55, "#8a6a4a"],
    ]),
    legs: four(0.1, 0.16, 0.34, 0.04, "#7a5a3a"), height: 0.72, speed: 1.6, swing: 0.7, stride: 2.6, rest: 0.15,
  }),
  croc: () => ({
    body: build([
      [0, 0, 0.32, 1.1, 0.06, 0.38, "#4a5a2a"],
      [0, 0, 0.2, 1.0, 0.38, 0.44, "#3a4a22"],              // the ridged back
      [0, 1.45, 0.2, 0.42, 0.06, 0.28, "#4a5a2a"],          // the snout
      [-0.15, 1.15, 0.05, 0.05, 0.28, 0.36, "#d9d26a"], [0.15, 1.15, 0.05, 0.05, 0.28, 0.36, "#d9d26a"],   // eyes
      [0, 1.55, 0.21, 0.3, 0.14, 0.17, "#efeee8"],          // teeth along the jaw
      [0, -1.6, 0.18, 0.55, 0.06, 0.3, "#4a5a2a"], [0, -2.4, 0.1, 0.35, 0.06, 0.2, "#4a5a2a"],
      [0, 0, 0.3, 1.05, 0.02, 0.06, "#c9c08a"],             // the pale belly
    ]),
    legs: four(0.42, 0.65, 0.16, 0.07, "#3a4a22"), height: 0.44, speed: 0.45, swing: 0.5, stride: 1.0, rest: 0,
  }),
  ostrich: () => ({
    body: build([
      [0, 0, 0.3, 0.45, 1.0, 1.5, "#2a2420"],
      [0, -0.45, 0.26, 0.14, 1.15, 1.5, "#efeee8"],         // the white tail feathers
      [-0.31, 0, 0.02, 0.32, 1.15, 1.4, "#efeee8"], [0.31, 0, 0.02, 0.32, 1.15, 1.4, "#efeee8"],
      [0, 0.38, 0.055, 0.06, 1.4, 2.25, "#d9a58f"],          // the long neck
      [0, 0.46, 0.08, 0.14, 2.18, 2.34, "#d9a58f"],
      [0, 0.62, 0.05, 0.06, 2.2, 2.26, "#e2b657"],           // the beak
      [-0.07, 0.48, 0.015, 0.02, 2.27, 2.3, "#1d1d1f"], [0.07, 0.48, 0.015, 0.02, 2.27, 2.3, "#1d1d1f"],
    ]),
    legs: [
      { x: -0.13, z: 0, y: 1.02, half: 0.05, length: 1.02, colour: "#d9a58f" },
      { x: 0.13, z: 0, y: 1.02, half: 0.05, length: 1.02, colour: "#d9a58f" },
    ],
    height: 2.34, speed: 1.8, swing: 0.6, stride: 1.6, rest: 0.5,
  }),
  peacock: () => ({
    body: build([
      [0, 0, 0.13, 0.24, 0.36, 0.62, "#1f4fa8"],
      [0, 0.2, 0.05, 0.05, 0.58, 0.9, "#1f6fd6"],
      [0, 0.25, 0.05, 0.08, 0.86, 0.97, "#1f6fd6"],
      [0, 0.34, 0.025, 0.03, 0.89, 0.92, "#c79a2b"],
      [0, 0.24, 0.01, 0.03, 0.97, 1.06, "#1f6fd6"],          // the crest
      // The tail, fanned up behind, with its eyes.
      [0, -0.34, 0.75, 0.03, 0.3, 1.5, "#2f8a5a"],
      [0, -0.36, 0.6, 0.02, 0.45, 1.35, "#3fae6a"],
      ...[-0.5, -0.25, 0, 0.25, 0.5].flatMap((x, i): Part[] => [
        [x, -0.39, 0.07, 0.01, 0.95 + (i % 2) * 0.22, 1.09 + (i % 2) * 0.22, "#1f4fa8"],
        [x, -0.4, 0.035, 0.01, 0.99 + (i % 2) * 0.22, 1.05 + (i % 2) * 0.22, "#e2b657"],
      ]),
    ]),
    legs: [
      { x: -0.06, z: 0, y: 0.38, half: 0.02, length: 0.38, colour: "#8a7a6a" },
      { x: 0.06, z: 0, y: 0.38, half: 0.02, length: 0.38, colour: "#8a7a6a" },
    ],
    height: 1.5, speed: 0.7, swing: 0.5, stride: 2.2, rest: 0.2,
  }),
  tortoise: () => ({
    body: build([
      [0, 0, 0.36, 0.45, 0.12, 0.42, "#6b5a3a"],
      [0, 0, 0.28, 0.36, 0.42, 0.5, "#7d6a44"],
      [0, 0.55, 0.08, 0.12, 0.14, 0.26, "#8a8a6a"],
    ]),
    legs: four(0.3, 0.32, 0.14, 0.07, "#8a8a6a"), height: 0.5, speed: 0.12, swing: 0.4, stride: 0.8, rest: 0,
  }),
};

const cache = new Map<AnimalKind, AnimalShape>();

/** The shape of one kind of animal. Built once and shared by every animal of that kind. */
export function animalShape(kind: AnimalKind): AnimalShape {
  let shape = cache.get(kind);
  if (!shape) {
    shape = SHAPES[kind]();
    cache.set(kind, shape);
  }
  return shape;
}

// ---- wandering ------------------------------------------------------------------------------

/** A pen: the patch of ground an animal keeps to, in the room's metres. */
export type Pen = { minX: number; minZ: number; maxX: number; maxZ: number };

/** Animals of one kind in one pen. */
export type Herd = { kind: AnimalKind; pen: Pen; count: number };

/** One animal's walk: where it is, where it is going, and whether it is resting. */
export type Wander = {
  x: number;
  z: number;
  rot: number;
  goalX: number;
  goalZ: number;
  /** Seconds left standing still (or lying down) before it sets off again. */
  pause: number;
  /** 0 standing, 1 walking at full speed: the legs swing with it. */
  pace: number;
  /** How far through its stride, in radians. */
  step: number;
  seed: number;
};

/** A small random number generator, so every visit to the zoo starts the same. */
function random(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function startWander(pen: Pen, index: number): Wander {
  const seed = index * 7.31 + 1;
  const x = pen.minX + 0.5 + random(seed) * (pen.maxX - pen.minX - 1);
  const z = pen.minZ + 0.5 + random(seed + 1) * (pen.maxZ - pen.minZ - 1);
  return { x, z, rot: random(seed + 2) * Math.PI * 2, goalX: x, goalZ: z, pause: random(seed + 3) * 4, pace: 0, step: 0, seed };
}

const TURN_RATE = 2.2;   // radians a second

/** Move one animal on by `dt` seconds: walk to a spot in its pen, stand a while, pick another. */
export function stepWander(walk: Wander, pen: Pen, shape: AnimalShape, dt: number): void {
  if (walk.pause > 0) {
    walk.pause -= dt;
    walk.pace = Math.max(0, walk.pace - dt * 3);
    if (walk.pause <= 0) {
      walk.seed += 3;
      walk.goalX = pen.minX + 0.6 + random(walk.seed) * (pen.maxX - pen.minX - 1.2);
      walk.goalZ = pen.minZ + 0.6 + random(walk.seed + 1) * (pen.maxZ - pen.minZ - 1.2);
    }
    walk.step += walk.pace * shape.stride * Math.PI * 2 * dt;
    return;
  }
  const dx = walk.goalX - walk.x, dz = walk.goalZ - walk.z;
  const gap = Math.hypot(dx, dz);
  if (gap < 0.3) {
    walk.seed += 5;
    walk.pause = 2 + random(walk.seed) * 7;   // a long rest now and then
    return;
  }
  // Turn towards the goal first, then walk, so nobody slides sideways.
  const want = Math.atan2(dx, dz);
  let turn = Math.atan2(Math.sin(want - walk.rot), Math.cos(want - walk.rot));
  turn = Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, turn));
  walk.rot += turn;
  const facing = Math.cos(want - walk.rot) > 0.9;
  walk.pace = Math.min(1, walk.pace + dt * (facing ? 3 : -3));
  const move = Math.min(gap, shape.speed * walk.pace * dt);
  walk.x += Math.sin(walk.rot) * move;
  walk.z += Math.cos(walk.rot) * move;
  walk.step += walk.pace * shape.stride * Math.PI * 2 * dt;
}

/** How far a leg is swung, for the legs on each side in turn. */
export function legSwing(walk: Wander, shape: AnimalShape, index: number): number {
  const opposite = index % 2 === 0 ? 0 : Math.PI;
  const diagonal = index >= 2 ? Math.PI : 0;
  return Math.sin(walk.step + opposite + diagonal) * shape.swing * walk.pace;
}
