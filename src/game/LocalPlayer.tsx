import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import type { Look } from "../api/appearance";
import { Overhead, SprayedNotes } from "./BodyExtras";
import { Car, type CarMotion } from "./Car";
import { carParts, readCarLook } from "./carShapes";
import { holeAt, type Pothole, type Potholes } from "./potholes";
import { wadeFactor } from "./weather";
import { wrapAngle } from "./gestures";
import { doorSpot, drive, driveView, kmh, newCar, type Box, type CarState, type CarStats } from "./carPhysics";
import { carSound } from "./carSound";
import { Character } from "./Character";
import type { Collider, Point } from "./collision";
import { danceTurn, fightClock, moveNow, stepSpeed, type FightPose, type Hold } from "./fightMoves";
import { cameraView, playerDrag, playerFocus, playerStreet } from "./focus";
import { CAMERA_FOV, attachKeyboard, cameraInput, creatorInput, readMove, readPedals, readTurn, releasePedals, turnCamera, type View } from "./input";
import type { NetPlayer } from "./types";

const WALK_SPEED = 2;            // m/s, a brisk walk for a 1.75 m person
const SPRINT_SPEED = 3.5;        // must stay below server MAX_SPEED (4.5)
const SEND_INTERVAL = 0.1;       // seconds, 10 updates per second
const RECONCILE_DISTANCE = 3;    // metres of drift before the server wins
const DEAD_ZONE = 0.15;          // ignore tiny drags
const MAX_FRAME_DT = 0.1;        // cap a frozen tab's catch-up step
const TURN_SMOOTHING = 12;
const CAMERA_SMOOTHING = 5;
const YAW_SMOOTHING = 12;        // how quickly the camera follows a swing round the player
const KEY_TURN = 1.9;            // radians a second the camera swings while Q or E is held
const CLIMB_SMOOTHING = 14;      // how quickly the body follows the height of the stairs under it
const COVERED_ZOOM = 1.15;       // on a footbridge the camera stays under its roof

// Normal play: the camera sits behind the player and looks towards the horizon, so the
// street ahead is in view. Zooming out pulls it back and lifts it faster than it pulls
// back, which turns the view into an overhead look at the neighbourhood. Out on the
// street it can also be swung all the way round the player (cameraInput.yaw), and then
// "up" on the stick or the keyboard always means "away from the camera".
const CAMERA_HEIGHT = 2.5;
const CAMERA_DISTANCE = 5.2;
const CAMERA_LOOK_HEIGHT = 1.35;
const CAMERA_LIFT = 1.45;

// Character creator: a close shot that leaves room for the options panel.
const CREATOR_PANEL_WIDTH = 340; // must match .creator width in index.css
const CREATOR_WIDE = { height: 1.3, distance: 3.8, lookHeight: 0.95 };
const CREATOR_TALL = { height: 1.1, distance: 5.4, lookHeight: -0.3 };
const VIEW_HEIGHT_PER_METRE = 2 * Math.tan((CAMERA_FOV * Math.PI) / 360);

// At the wheel: the camera rides behind the car, a little higher and further back the
// faster it goes, and swings round behind it when it turns, a moment late.
const CHASE_BACK = 6.4;
const CHASE_HEIGHT = 2.5;
const CHASE_SWING = 3.2;          // how quickly the camera gets back behind the car
const CHASE_AHEAD = 4;            // metres in front of the car the camera looks at
const FOLLOW_RATE = 1.6;          // how quickly the camera swings back behind a player walking away from it
const FOLLOW_PAUSE_MS = 1500;     // after the player swings the camera by hand, it leaves it alone this long
const EYE_HEIGHT = 1.62;          // through the player's eyes
const SEAT_EYE = 0.66;            // in a car: eyes above the seat cushion
const DRIVE_RECONCILE = 30;       // metres the server must disagree by before it wins (the car moves fast)

/** The player is at the wheel of this car. A new `key` is a new trip. */
export type Driving = {
  key: number;
  look: string;              // "model|colour|plate"
  stats: CarStats;
  x: number;
  z: number;
  heading: number;
  /** The street: buildings, trees, poles. */
  ground: Collider | null;
  /** The other vehicles round it, read every step. */
  boxes?: () => readonly Box[];
  /** On a race grid: the brakes stay on until this moment (Date.now() milliseconds). */
  holdUntil?: number;
  /** The holes in this district's roads. */
  holes?: Potholes;
};

// No brake: at a standstill the brake pedal means reverse.
const HELD = { gas: 0, brake: 0, steer: 0, horn: false };
// The camera behind the player keeps in front of walls: it is probed out from the player in
// steps this long, as a ball this wide.
const CAMERA_PROBE_STEP = 0.4;
const CAMERA_PROBE_RADIUS = 0.25;
const CAMERA_NEAREST = 1.6;   // closer than this to the player, the camera rises ...
const CAMERA_RISE = 1.4;       // ... this many metres for every metre short
const cameraProbe = { x: 0, z: 0 };
const HOLD_BRAKING = 14;   // m/s², a firm stop: 60 km/h to nothing in about a second and a quarter

// Scratch vectors, reused every frame so the render loop allocates nothing.
const cameraGoal = new Vector3();
const lookGoal = new Vector3();
const lookNow = new Vector3();
const spot: Point = { x: 0, z: 0 };

/** A collider that can also lift the player: the street's is one, where it has a footbridge. */
type Ground = Collider & {
  height?: () => number;
  street?: (out: { x: number; z: number; up: boolean }) => void;
};

type Props = {
  start: { x: number; z: number };
  sendMove: (x: number, z: number, rot: number) => void;
  takeServerPosition: () => NetPlayer | null;
  look: Look | null;
  customising: boolean;
  /** Knows where the walls, trees and the edge of the district are. */
  collider: Ground;
  /** On the street: the buildings and stalls (not the traffic) the camera keeps in front of. */
  cameraBlockers?: Collider | null;
  /** What the player's body is doing besides walking: in a fight, on the dance floor, passed out. */
  fight?: FightPose | null;
  /** Set while the player is stood somewhere and cannot walk: in the ring, at the bag, on the dance floor. */
  hold?: Hold | null;
  /** What they just said out loud, shown over their head, or "". */
  said?: string;
  /** True when they have passed out. */
  out?: boolean;
  /** True while they are spraying money. */
  spraying?: boolean;
  /** True where the camera may be swung round the player: on the street, and at home, where walls in the way are cut down. */
  orbit?: boolean;
  /** True while the house is being built or arranged: the player stands still and the build camera has the view. */
  frozen?: boolean;
  /** Set while the player is driving. */
  driving?: Driving | null;
  /** Set while the player is a passenger: where the car they are in is now. */
  riding?: (() => { x: number; z: number; rot: number } | null) | null;
  /** The car a passenger sits in, "model|colour|plate": where their seat is, for the view from inside. */
  ridingLook?: string;
  /** From behind the player, or through their eyes. */
  view?: View;
  /** Indoors, the room the camera must stay in when it is swung round: its walls (x from 0 to width,
   *  z from 0 to depth) and its ceiling. The front (z = depth) is open, as the room is drawn. */
  room?: { width: number; depth: number; height: number } | null;
};

const ROOM_PAD = 0.35;   // metres the camera keeps from a wall
const CEILING_PAD = 0.3; // ... and from the ceiling

/** Where a pair of eyes in a car's seat is, in the world: the driver's seat, or the one beside it. */
function seatEye(look: string, x: number, z: number, heading: number, passenger: boolean, out: Vector3): void {
  const seat = carParts(readCarLook(look).model).seat;
  const side = passenger ? -seat.x : seat.x;
  out.set(
    x + side * Math.cos(heading) + (seat.z + 0.05) * Math.sin(heading),
    seat.y + SEAT_EYE,
    z - side * Math.sin(heading) + (seat.z + 0.05) * Math.cos(heading),
  );
}

function shortestAngle(from: number, to: number): number {
  const diff = to - from;
  return Math.atan2(Math.sin(diff), Math.cos(diff));
}

export function LocalPlayer({
  start, sendMove, takeServerPosition, look, customising, collider, cameraBlockers = null, fight, hold, said = "", out = false, spraying = false, orbit = false, frozen = false,
  driving = null, riding = null, ridingLook = "", view = "third", room = null,
}: Props) {
  const bodyRef = useRef<Group>(null);
  const speedRef = useRef(0);
  const sendTimer = useRef(0);
  const cameraReady = useRef(false);
  const yawRef = useRef(orbit ? cameraInput.yaw : 0);   // where the camera really is, a moment behind where it was asked to be
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useEffect(() => attachKeyboard(), []);

  // ---- the car, while driving ----
  const carRef = useRef<CarState | null>(null);
  const statsRef = useRef<CarStats | null>(null);
  const motion = useMemo<CarMotion>(() => ({ spin: 0, steer: 0, brake: 0 }), []);
  const drivingKey = driving ? driving.key : null;
  const jolt = useRef(0);                       // how hard the car is shaking from the last hole, 0..1.5
  const lastHole = useRef<Pothole | null>(null);
  useEffect(() => {
    const body = bodyRef.current;
    if (driving) {
      // In: the body goes where the car is, and the engine starts.
      carRef.current = newCar(driving.x, driving.z, driving.heading);
      statsRef.current = driving.stats;
      if (body) {
        body.position.set(driving.x, 0, driving.z);
        body.rotation.y = driving.heading;
      }
      yawRef.current = driving.heading + Math.PI;
      driveView.active = true;
      carSound.start();
      return;
    }
    // Out: the player steps out of the driver's door, and the camera stays where it was.
    const car = carRef.current, stats = statsRef.current;
    if (car && stats && body) {
      const door = doorSpot(car, stats);
      collider.resolve(car.x, car.z, door.x, door.z, spot);
      body.position.set(spot.x, 0, spot.z);
      body.rotation.y = car.heading;
      cameraInput.yaw = Math.atan2(Math.sin(car.heading + Math.PI), Math.cos(car.heading + Math.PI));
      yawRef.current = cameraInput.yaw;
    }
    carRef.current = null;
    driveView.active = false;
    driveView.kmh = 0;
    carSound.stop();
    releasePedals();
    // `driving` itself is read through drivingKey: a new object for the same trip changes nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivingKey]);
  useEffect(() => () => {
    carSound.stop();
    driveView.active = false;
  }, []);

  // A body that has just been put down asks the ground where it stands, and so does one
  // that has just been let go from being held somewhere (a seat on the club's platform).
  // Without this, someone who left a footbridge by going home would come back out still
  // up in the air, and someone getting up from a booth would sink through its floor.
  const free = hold == null;
  useEffect(() => {
    const body = bodyRef.current;
    if (body && free) collider.resolve(body.position.x, body.position.z, body.position.x, body.position.z, spot);
  }, [collider, free]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    const dt = Math.min(delta, MAX_FRAME_DT);

    const car = carRef.current;
    if (riding && !driving) {
      // A passenger: the body is in the car, the camera rides behind it, and nothing is sent.
      const at = riding();
      if (at) {
        const ease = 1 - Math.exp(-dt * 10);
        body.position.x += (at.x - body.position.x) * ease;
        body.position.z += (at.z - body.position.z) * ease;
        body.rotation.y += shortestAngle(body.rotation.y, at.rot) * ease;
      }
      const x = body.position.x, z = body.position.z;
      playerFocus.x = x;
      playerFocus.y = 0;
      playerFocus.z = z;
      playerStreet.x = x;
      playerStreet.z = z;
      playerStreet.up = false;
      speedRef.current = 0;
      yawRef.current += shortestAngle(yawRef.current, body.rotation.y + Math.PI) * (1 - Math.exp(-dt * CHASE_SWING));
      const yaw = yawRef.current;
      cameraView.yaw = yaw;
      const zoom = cameraInput.zoom;
      if (view === "first" && ridingLook) {
        // From the passenger seat, looking out of the windscreen.
        const heading = body.rotation.y;
        seatEye(ridingLook, x, z, heading, true, cameraGoal);
        lookGoal.set(cameraGoal.x + Math.sin(heading) * 20, cameraGoal.y - 0.6, cameraGoal.z + Math.cos(heading) * 20);
        camera.position.copy(cameraGoal);
        lookNow.copy(lookGoal);
        camera.lookAt(lookNow);
        cameraReady.current = true;
        return;
      }
      cameraGoal.set(x + Math.sin(yaw) * CHASE_BACK * zoom, CHASE_HEIGHT * Math.pow(zoom, 0.85), z + Math.cos(yaw) * CHASE_BACK * zoom);
      lookGoal.set(x - Math.sin(yaw) * CHASE_AHEAD, 1.0, z - Math.cos(yaw) * CHASE_AHEAD);
      const ease = 1 - Math.exp(-dt * CAMERA_SMOOTHING * 1.6);
      camera.position.lerp(cameraGoal, cameraReady.current ? ease : 1);
      lookNow.lerp(lookGoal, cameraReady.current ? ease : 1);
      cameraReady.current = true;
      camera.lookAt(lookNow);
      return;
    }
    if (driving && car) {
      // At the wheel.
      const held = driving.holdUntil !== undefined && Date.now() < driving.holdUntil;
      const input = held ? HELD : readPedals();
      drive(car, input, driving.stats, dt, driving.ground, driving.boxes?.() ?? []);
      // Held (pulled over by the police, or on the start line): the car is brought to a stop, not
      // left to roll on. Done here, not with the pedal, which would reverse it once it stops.
      if (held && car.speed !== 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), HOLD_BRAKING * dt);
      // Flood water: the car ploughs through it, slow, whatever the pedal says.
      const wade = wadeFactor(car.x, car.z);
      if (wade < 1) {
        const most = driving.stats.top * wade * 0.6;
        if (Math.abs(car.speed) > most) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed) - most, 16 * dt);
      }
      // Benin roads: a wheel into a pothole jolts the car, costs it speed and bangs. Slowly
      // through it is a bump; fast through a deep one hurts.
      if (driving.holes) {
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        const half = driving.stats.wheelbase / 2, side = driving.stats.width * 0.38;
        let hit: Pothole | null = null;
        for (const [a, b] of [[half, side], [half, -side], [-half, side], [-half, -side]]) {
          hit = holeAt(driving.holes, car.x + fx * a + fz * b, car.z + fz * a - fx * b);
          if (hit) break;
        }
        if (hit && hit !== lastHole.current && Math.abs(car.speed) > 2.5) {
          const hard = Math.min(1, Math.abs(car.speed) / 16) * (hit.deep ? 1.4 : 1);
          car.speed *= 1 - (hit.deep ? 0.3 : 0.16) * Math.min(1, hard + 0.3);
          jolt.current = Math.max(jolt.current, hard);
          carSound.thud(2.5 + hard * 7);
        }
        lastHole.current = hit;
      }
      jolt.current *= Math.exp(-dt * 7);
      if (car.hit > 2.5) carSound.thud(car.hit);
      if (input.horn) carSound.hornOn();
      else carSound.hornOff();
      carSound.update(car.speed, input.gas);
      motion.spin = car.spin;
      motion.steer = car.steer;
      motion.brake = car.brake;
      // Only a big disagreement with the server wins: a car covers metres between two messages.
      const server = takeServerPosition();
      if (server && Math.hypot(server.x - car.x, server.z - car.z) > DRIVE_RECONCILE) {
        car.x = server.x;
        car.z = server.z;
        car.speed = 0;
      }
      // The car bounces on its springs after a hole.
      const bounce = jolt.current * 0.07 * Math.sin(performance.now() / 22);
      body.position.set(car.x, bounce, car.z);
      body.rotation.y = car.heading;
      speedRef.current = 0;
      driveView.kmh = kmh(car);
      driveView.x = car.x;
      driveView.z = car.z;
      driveView.heading = car.heading;
      driveView.gear = car.speed < -0.3 ? "R" : Math.abs(car.speed) < 0.3 ? (input.brake > 0 ? "R" : "N") : "D";
      playerFocus.x = car.x;
      playerFocus.y = 0;
      playerFocus.z = car.z;
      playerStreet.x = car.x;
      playerStreet.z = car.z;
      playerStreet.up = false;

      // From the driver's seat: the dashboard, the wheel and the road through the windscreen.
      if (view === "first") {
        seatEye(driving.look, car.x, car.z, car.heading, false, cameraGoal);
        cameraGoal.y += bounce * 1.6;
        lookGoal.set(cameraGoal.x + Math.sin(car.heading) * 20, cameraGoal.y - 0.7 + bounce * 4, cameraGoal.z + Math.cos(car.heading) * 20);
        camera.position.copy(cameraGoal);
        lookNow.copy(lookGoal);
        camera.lookAt(lookNow);
        yawRef.current = car.heading + Math.PI;
        cameraView.yaw = yawRef.current;
        cameraReady.current = true;
        sendTimer.current += dt;
        if (sendTimer.current >= SEND_INTERVAL) {
          sendTimer.current = 0;
          sendMove(car.x, car.z, car.heading);
        }
        return;
      }
      // The chase camera.
      yawRef.current += shortestAngle(yawRef.current, car.heading + Math.PI) * (1 - Math.exp(-dt * CHASE_SWING));
      const yaw = yawRef.current;
      cameraView.yaw = yaw;
      const zoom = cameraInput.zoom;
      const fast = Math.min(Math.abs(car.speed), 40);
      const back = (CHASE_BACK + fast * 0.05) * zoom;
      const up = CHASE_HEIGHT * Math.pow(zoom, 0.85) + fast * 0.015;
      cameraGoal.set(car.x + Math.sin(yaw) * back, up + bounce * 2, car.z + Math.cos(yaw) * back);
      lookGoal.set(car.x - Math.sin(yaw) * CHASE_AHEAD, 1.0, car.z - Math.cos(yaw) * CHASE_AHEAD);
      if (cameraReady.current) {
        const ease = 1 - Math.exp(-dt * CAMERA_SMOOTHING * 1.6);
        camera.position.lerp(cameraGoal, ease);
        lookNow.lerp(lookGoal, ease);
      } else {
        camera.position.copy(cameraGoal);
        lookNow.copy(lookGoal);
        cameraReady.current = true;
      }
      camera.lookAt(lookNow);

      sendTimer.current += dt;
      if (sendTimer.current >= SEND_INTERVAL) {
        sendTimer.current = 0;
        sendMove(car.x, car.z, car.heading);
      }
      return;
    }

    // 0. Which side the camera is on. Stood somewhere, in the creator or indoors it goes
    //    back to the front; otherwise it follows what the player asked for.
    const swinging = orbit && !hold && !customising && !frozen;
    if (swinging) {
      const keys = readTurn();
      if (keys !== 0) turnCamera(keys * KEY_TURN * dt);
    }
    yawRef.current += shortestAngle(yawRef.current, swinging ? cameraInput.yaw : 0) * (1 - Math.exp(-dt * YAW_SMOOTHING));
    const yaw = yawRef.current;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    cameraView.yaw = yaw;

    // 1. Movement. While the creator is open the player stands still and can be spun.
    let speed = 0;
    let facing: number | null = null;

    if (hold) {
      // Stood on the spot: in the ring, at the bag, on the dance floor. A dancer turns as
      // they dance, and their feet go though they stay where they are.
      const now = fightClock();
      const move = fight ? moveNow(fight, now) : null;
      body.position.x = hold.x;
      body.position.z = hold.z;
      body.rotation.y = hold.rot + (fight ? danceTurn(move, now - fight.started) : 0);
      speed = stepSpeed(move);
    } else if (customising) {
      facing = creatorInput.spin;
    } else if (!frozen) {
      const input = readMove();
      const length = Math.hypot(input.x, input.z);
      if (length > DEAD_ZONE && dt > 0) {
        // A tout holding on to you slows you down until you shake them off.
        const pace = (input.sprint ? SPRINT_SPEED : WALK_SPEED) * playerDrag.factor * wadeFactor(playerFocus.x, playerFocus.z);
        const fromX = body.position.x;
        const fromZ = body.position.z;
        // The stick is read as the screen shows it, so it is turned by the camera's angle:
        // "up" walks away from the camera, whichever side of the player the camera is on.
        const goX = (input.x * cos + input.z * sin) / length;
        const goZ = (input.z * cos - input.x * sin) / length;
        collider.resolve(fromX, fromZ, fromX + goX * pace * dt, fromZ + goZ * pace * dt, spot);
        body.position.x = spot.x;
        body.position.z = spot.z;
        // The animation follows how fast the player really moved: sliding along a wall
        // is slower than running free, and pushing straight into one is standing still.
        speed = Math.min(pace, Math.hypot(spot.x - fromX, spot.z - fromZ) / dt);
        facing = Math.atan2(goX, goZ);
        // Walking away from the camera, it swings round behind them, as in most phone games.
        // Walking sideways it stays put (or they would walk in circles), and for a moment
        // after they turn it by hand it leaves it where they put it.
        const away = Math.max(0, -input.z / length);
        if (swinging && view === "third" && away > 0.3 && performance.now() - cameraInput.turnedAt > FOLLOW_PAUSE_MS) {
          const behind = facing + Math.PI;
          cameraInput.yaw = wrapAngle(cameraInput.yaw + shortestAngle(cameraInput.yaw, behind) * (1 - Math.exp(-dt * FOLLOW_RATE * away)));
        }
      }
    }

    if (facing !== null) {
      const turn = 1 - Math.exp(-dt * TURN_SMOOTHING);
      body.rotation.y += shortestAngle(body.rotation.y, facing) * turn;
    }
    speedRef.current = speed;

    // 2. Server check. Each snapshot is used once, while it is fresh.
    const server = takeServerPosition();
    if (server) {
      const drift = Math.hypot(server.x - body.position.x, server.z - body.position.z);
      if (drift > RECONCILE_DISTANCE) {
        body.position.x = server.x;
        body.position.z = server.z;
      }
    }

    // 3. Height. A footbridge lifts the player; the body follows a moment behind so
    //    stairs feel like stairs and not like a lift.
    const floor = hold ? hold.y : (collider.height?.() ?? 0);
    body.position.y += (floor - body.position.y) * (1 - Math.exp(-dt * CLIMB_SMOOTHING));
    if (Math.abs(floor - body.position.y) < 0.002) body.position.y = floor;

    // 4. Camera.
    const { x, y, z } = body.position;
    playerFocus.x = x;
    playerFocus.y = y;
    playerFocus.z = z;
    playerStreet.x = x;
    playerStreet.z = z;
    playerStreet.up = false;
    if (!hold) collider.street?.(playerStreet);

    if (hold) {
      cameraGoal.set(hold.lookX + hold.side, hold.lookY + hold.height, hold.lookZ + hold.distance);
      lookGoal.set(hold.lookX, hold.lookY, hold.lookZ);
    } else if (customising) {
      const wide = size.width > size.height;
      const shot = wide ? CREATOR_WIDE : CREATOR_TALL;
      const metresPerPixel = (shot.distance * VIEW_HEIGHT_PER_METRE) / size.height;
      const side = wide ? (CREATOR_PANEL_WIDTH / 2) * metresPerPixel : 0;
      cameraGoal.set(x + side, y + shot.height, z + shot.distance);
      lookGoal.set(x + side, y + shot.lookHeight, z);
    } else if (view === "first") {
      // Through their eyes: where the camera would be looking from behind, but from their head.
      cameraGoal.set(x, y + EYE_HEIGHT, z);
      lookGoal.set(x - sin * 10, y + EYE_HEIGHT - 0.25, z - cos * 10);
      if (facing === null) body.rotation.y = yaw + Math.PI;
    } else {
      const zoom = playerStreet.up ? Math.min(cameraInput.zoom, COVERED_ZOOM) : cameraInput.zoom;
      const lift = (CAMERA_HEIGHT - CAMERA_LOOK_HEIGHT) * Math.pow(zoom, CAMERA_LIFT);
      const back = CAMERA_DISTANCE * zoom;
      cameraGoal.set(x + sin * back, y + CAMERA_LOOK_HEIGHT + lift, z + cos * back);
      lookGoal.set(x, y + CAMERA_LOOK_HEIGHT, z);
      if (!room && !playerStreet.up && cameraBlockers) {
        // Outside: a building (or a stall) between the player and the camera would fill the
        // screen. Walk out from the player towards where the camera wants to be, a short step at
        // a time, and stop just short of the first solid thing: the camera sits in front of it.
        const reach = Math.hypot(cameraGoal.x - x, cameraGoal.z - z);
        if (reach > 0.5) {
          const steps = Math.ceil(reach / CAMERA_PROBE_STEP);
          let lastX = x, lastZ = z, blockedAt = -1;
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const px = x + (cameraGoal.x - x) * t, pz = z + (cameraGoal.z - z) * t;
            if (cameraBlockers.resolve(lastX, lastZ, px, pz, cameraProbe, CAMERA_PROBE_RADIUS) &&
                Math.hypot(cameraProbe.x - px, cameraProbe.z - pz) > 0.05) {
              blockedAt = (i - 1) / steps;
              break;
            }
            lastX = px;
            lastZ = pz;
          }
          if (blockedAt >= 0) {
            // In front of the wall, always. With little room there, it rises instead and
            // looks down over the player's shoulder.
            cameraGoal.x = x + (cameraGoal.x - x) * blockedAt;
            cameraGoal.z = z + (cameraGoal.z - z) * blockedAt;
            const short = CAMERA_NEAREST - blockedAt * reach;
            if (short > 0) cameraGoal.y += short * CAMERA_RISE;
          }
        }
      }
      if (room) {
        // Swung round indoors, the camera stays inside the walls and under the ceiling, so
        // the player can look round the room instead of at the back of a wall. Out past the
        // open front it may go (that is where the room is seen from when nobody turns).
        cameraGoal.x = Math.min(room.width - ROOM_PAD, Math.max(ROOM_PAD, cameraGoal.x));
        cameraGoal.z = Math.max(ROOM_PAD, cameraGoal.z);
        if (cameraGoal.z < room.depth) cameraGoal.y = Math.min(cameraGoal.y, room.height - CEILING_PAD);
      }
    }

    if (frozen) {
      cameraReady.current = false; // coming back from building, the camera jumps straight back behind the player
    } else if (cameraReady.current) {
      const ease = 1 - Math.exp(-dt * CAMERA_SMOOTHING);
      camera.position.lerp(cameraGoal, ease);
      lookNow.lerp(lookGoal, ease);
    } else {
      camera.position.copy(cameraGoal);
      lookNow.copy(lookGoal);
      cameraReady.current = true;
    }
    if (!frozen) camera.lookAt(lookNow);
    cameraView.x = camera.position.x;
    cameraView.y = camera.position.y;
    cameraView.z = camera.position.z;

    // 5. Tell the server, 10 times a second, moving or not.
    sendTimer.current += dt;
    if (sendTimer.current >= SEND_INTERVAL) {
      sendTimer.current = 0;
      sendMove(body.position.x, body.position.z, body.rotation.y);
    }
  });

  return (
    <group ref={bodyRef} position={[start.x, 0, start.z]}>
      {/* Kept loaded while driving, only hidden, so getting out does not wait for the body again. */}
      <group visible={!driving && !riding && (view !== "first" || Boolean(hold) || customising)}>
        <Character speedRef={speedRef} look={look} fight={fight} />
      </group>
      {driving && <Car look={driving.look} motion={motion} driver={view === "first" ? null : look} />}
      {spraying && !driving && <SprayedNotes />}
      <Overhead said={said} out={out} />
    </group>
  );
}
