// How a car moves: pedals and steering in, where it is and which way it faces out. No 3D
// imports, so it can be tested alone.
//
// It is the "bicycle" model every driving game starts from: the car turns about a point
// on its back axle, as tightly as the front wheels are turned and the wheelbase allows.
// The engine pulls hardest from a standstill and less as the car nears its top speed; air
// and the road slow it when the pedals are off; the brakes stop it, and holding the brake
// once it has stopped puts it in reverse. Steering goes lighter as the car goes faster, so
// it does not spin at speed.
//
// The car hits things as two circles, one round each axle, each as wide as the car.

import type { Collider, Point } from "./collision";

export const GAME_TOP_KMH = 160;     // the fastest anything goes in town. The server allows a little more.
const REVERSE_TOP = 6;               // metres a second
const REVERSE_PULL = 3.2;            // m/s² backing up
const BRAKE = 9.5;                   // m/s² with the brake pedal all the way down
const ROLLING = 0.35;                // m/s² the road takes off a car rolling
const ENGINE_BRAKE = 0.5;            // ... and the engine, when the gas is off
const AIR = 0.00055;                 // ... and the air, times speed squared
const STEER_LOCK = 0.55;             // radians the front wheels turn at walking pace
const STEER_RATE = 2.6;              // radians a second the wheels can be turned
const GRIP = 7.5;                    // m/s² sideways the tyres hold before the car would slide
const STOPPED = 0.25;                // m/s below which the car counts as standing still

export type CarStats = {
  pull: number;       // m/s² from a standstill
  top: number;        // m/s
  grip?: number;      // m/s² sideways before the tyres let go: more on a supercar's wide tyres
  wheelbase: number;
  length: number;
  width: number;
  wheelR: number;
};

/** What the dealership says (0–100 km/h and top speed) turned into numbers for the road. */
export function statsFor(zeroTo100: number, topKmh: number, shape: { wheelbase: number; length: number; width: number; radius: number }): CarStats {
  return {
    // A car does 0–100 in its quoted time pulling a little harder at first than at the end.
    pull: (27.78 / Math.max(zeroTo100, 2.3)) * 1.06,
    // Everyday cars all top out at the town's 160 km/h. The supercars go past it, a little
    // for every km/h the maker claims over 250: the hypercar reaches about 228.
    top: (topKmh <= 250 ? Math.min(topKmh, GAME_TOP_KMH) : GAME_TOP_KMH + (topKmh - 250) * 0.4) / 3.6,
    grip: GRIP * (1 + Math.max(0, 4.5 - zeroTo100) * 0.12),
    wheelbase: shape.wheelbase,
    length: shape.length,
    width: shape.width,
    wheelR: shape.radius,
  };
}

export type CarState = {
  x: number;
  z: number;
  heading: number;   // radians; the car's nose points along (sin, cos), like a walking body
  speed: number;     // m/s along the heading; negative when reversing
  steer: number;     // radians the front wheels are turned, + is left
  spin: number;      // radians the wheels have rolled
  brake: number;     // how hard the brake lights are on, 0..1
  hit: number;       // how hard it hit something this step (m/s lost), 0 for nothing
};

export type Pedals = {
  gas: number;       // 0..1
  brake: number;     // 0..1 (also reverse once stopped)
  steer: number;     // -1 right .. 1 left
};

export function newCar(x: number, z: number, heading: number): CarState {
  return { x, z, heading, speed: 0, steer: 0, spin: 0, brake: 0, hit: 0 };
}

/** Something on the road to bump into besides the street itself: a bus, a parked car. */
export type Box = { x: number; z: number; ux: number; uz: number; halfLong: number; halfWide: number };

const out: Point = { x: 0, z: 0 };

/** How far a circle at (x, z) is inside a box, and which way is out. Null if it is not. */
function outOfBox(box: Box, x: number, z: number, r: number): { dx: number; dz: number } | null {
  const rx = x - box.x, rz = z - box.z;
  const along = rx * box.ux + rz * box.uz;
  const across = -rx * box.uz + rz * box.ux;
  const overAlong = box.halfLong + r - Math.abs(along);
  const overAcross = box.halfWide + r - Math.abs(across);
  if (overAlong <= 0 || overAcross <= 0) return null;
  if (overAcross < overAlong) {
    const side = across >= 0 ? 1 : -1;
    return { dx: -box.uz * side * overAcross, dz: box.ux * side * overAcross };
  }
  const side = along >= 0 ? 1 : -1;
  return { dx: box.ux * side * overAlong, dz: box.uz * side * overAlong };
}

/**
 * One step of driving. Changes `car` in place. `ground` keeps it out of buildings, trees and
 * poles; `boxes` are the vehicles round it.
 */
export function drive(car: CarState, pedals: Pedals, stats: CarStats, dt: number, ground: Collider | null, boxes: readonly Box[] = []): void {
  car.hit = 0;
  const v = car.speed;

  // 1. Pedals.
  let accel = 0;
  if (pedals.gas > 0.02) {
    if (v < -STOPPED) accel = BRAKE * pedals.gas;                         // gas while reversing: stop first
    // The engine pulls less as the car nears its top speed, and always beats the road and the air below it.
    else accel = pedals.gas * (stats.pull * Math.max(0, 1 - (v / stats.top) ** 3) + (v < stats.top ? ROLLING + AIR * v * v : 0));
  }
  if (pedals.brake > 0.02) {
    if (v > STOPPED) accel -= BRAKE * pedals.brake;
    else accel -= REVERSE_PULL * pedals.brake * Math.max(0, 1 - (Math.min(0, v) / -REVERSE_TOP) ** 2);
  }
  // The road and the air, always against the way it is going.
  const drag = ROLLING + AIR * v * v + (pedals.gas <= 0.02 ? ENGINE_BRAKE : 0);
  let speed = v + accel * dt;
  if (Math.abs(speed) <= drag * dt && pedals.gas <= 0.02 && pedals.brake <= 0.02) speed = 0;
  else speed -= Math.sign(speed) * drag * dt;
  // Braking to a stop does not carry straight on into reverse in the same moment.
  if (v > STOPPED && speed < 0) speed = 0;
  if (v < -STOPPED && speed > 0) speed = 0;
  car.speed = Math.max(-REVERSE_TOP, Math.min(stats.top, speed));
  car.brake = pedals.brake > 0.02 && car.speed > -STOPPED ? 1 : 0;

  // 2. Steering: the wheels follow the hands a moment behind. At speed they turn only as
  //    far as the tyres can hold the corner: a car at 100 km/h cannot turn like one parking.
  const vv = car.speed * car.speed;
  const lock = Math.min(STEER_LOCK, vv > 0.01 ? Math.atan(((stats.grip ?? GRIP) * stats.wheelbase) / vv) : STEER_LOCK);
  const want = Math.max(-1, Math.min(1, pedals.steer)) * lock;
  const step = STEER_RATE * dt;
  car.steer += Math.max(-step, Math.min(step, want - car.steer));

  // 3. Move: turn about the back axle.
  const yawRate = (car.speed * Math.tan(car.steer)) / stats.wheelbase;
  car.heading += yawRate * dt;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const fromX = car.x, fromZ = car.z;
  car.x += fx * car.speed * dt;
  car.z += fz * car.speed * dt;
  car.spin += (car.speed * dt) / stats.wheelR;

  // 4. Bump into things: a circle round each axle, as wide as the car.
  const r = stats.width / 2;
  const reach = stats.wheelbase / 2;
  let pushX = 0, pushZ = 0;
  for (const end of [1, -1]) {
    const cx = car.x + fx * reach * end, cz = car.z + fz * reach * end;
    let px = 0, pz = 0;
    if (ground) {
      const bx = fromX + fx * reach * end, bz = fromZ + fz * reach * end;
      if (ground.resolve(bx, bz, cx, cz, out, r)) { px = out.x - cx; pz = out.z - cz; }
    }
    for (const box of boxes) {
      if (Math.abs(box.x - cx) > 9 || Math.abs(box.z - cz) > 9) continue;
      const away = outOfBox(box, cx + px, cz + pz, r);
      if (away) { px += away.dx; pz += away.dz; }
    }
    if (Math.abs(px) > Math.abs(pushX)) pushX = px;
    if (Math.abs(pz) > Math.abs(pushZ)) pushZ = pz;
  }
  if (pushX !== 0 || pushZ !== 0) {
    car.x += pushX;
    car.z += pushZ;
    // Hitting something head on stops the car; scraping along it only slows it.
    const len = Math.hypot(pushX, pushZ);
    const square = len > 0 ? Math.abs((pushX * fx + pushZ * fz) / len) : 0;
    const lost = Math.abs(car.speed) * (0.25 + 0.7 * square);
    car.hit = lost;
    car.speed -= Math.sign(car.speed) * lost;
    if (square > 0.6) car.speed *= -0.15; // a little bounce back off a wall
  }
}

/** Where the driver stands after getting out: beside their door, on the car's left. */
export function doorSpot(car: CarState, stats: CarStats): { x: number; z: number } {
  const side = stats.width / 2 + 0.55;
  // The car's left is +x when it faces +z: (cos, -sin) of the heading.
  return {
    x: car.x + Math.cos(car.heading) * side + Math.sin(car.heading) * 0.3,
    z: car.z - Math.sin(car.heading) * side + Math.cos(car.heading) * 0.3,
  };
}

/** Speed for the dial: km/h, never negative. */
export function kmh(car: CarState): number {
  return Math.round(Math.abs(car.speed) * 3.6);
}

/** The car being driven, for the dial and anything else outside the 3D that wants to know. */
export const driveView = { active: false, kmh: 0, x: 0, z: 0, heading: 0, gear: "P" };

/**
 * A collider that also keeps a walking player (or a car) out of the cars standing on the
 * street. `boxes` is read at every step, so cars that come and go are always up to date.
 */
export function withCars(base: Collider, boxes: () => readonly Box[]): Collider {
  const resolve = (fromX: number, fromZ: number, toX: number, toZ: number, out: Point, radius?: number): boolean => {
    let hit = base.resolve(fromX, fromZ, toX, toZ, out, radius);
    const r = radius ?? 0.35;
    for (const box of boxes()) {
      if (Math.abs(box.x - out.x) > 8 || Math.abs(box.z - out.z) > 8) continue;
      if (outOfBox(box, fromX, fromZ, r - 0.05)) continue;   // already inside one (it was parked on them): let them walk out
      const away = outOfBox(box, out.x, out.z, r);
      if (!away) continue;
      out.x += away.dx;
      out.z += away.dz;
      hit = true;
    }
    return hit;
  };
  return { resolve, size: base.size };
}

/** A car standing at (x, z) facing `heading`, as a box to bump into. */
export function carBox(x: number, z: number, heading: number, length: number, width: number): Box {
  return { x, z, ux: Math.sin(heading), uz: Math.cos(heading), halfLong: length / 2, halfWide: width / 2 };
}

/**
 * Where a player's cars stand at home: side by side on the open ground to the left of the
 * house, noses out towards the edge of the plot. As many as fit, up to `count`. The lot is
 * in cells (see homeRooms.ts); the spots are in metres.
 */
export function carParkSpots(
  lot: { min_x: number; max_z: number }, cell: number, count: number,
  rooms: readonly { floor: number; x: number; z: number; w: number; d: number }[] = [],
): { x: number; z: number; rot: number }[] {
  const width = -lot.min_x * cell;          // metres of open ground left of the house
  if (width < 5.5) return [];
  const depth = lot.max_z * cell;
  const fits = Math.max(0, Math.floor((depth - 1.2) / 3.3));
  const spots: { x: number; z: number; rot: number }[] = [];
  for (let i = 0; i < fits && spots.length < count; i++) {
    const x = -width / 2, z = 2.4 + i * 3.3;
    // A room built out over the car park takes that space.
    const covered = rooms.some((room) =>
      room.floor === 0 && x - 2.7 < (room.x + room.w) * cell && x + 2.7 > room.x * cell && z - 1.2 < (room.z + room.d) * cell && z + 1.2 > room.z * cell);
    if (!covered) spots.push({ x, z, rot: -Math.PI / 2 });
  }
  return spots;
}

/** Does a circle at (x, z) of radius r touch this box? */
export function touchesBox(box: Box, x: number, z: number, r: number): boolean {
  return outOfBox(box, x, z, r) !== null;
}
