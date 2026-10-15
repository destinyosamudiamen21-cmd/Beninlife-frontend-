import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import type { Look } from "../api/appearance";
import { Overhead, SprayedNotes } from "./BodyExtras";
import { Character } from "./Character";
import type { Collider, Point } from "./collision";
import {
  danceTurn,
  fightClock,
  moveNow,
  stepSpeed,
  type FightPose,
  type Hold,
} from "./fightMoves";
import { cameraView, playerDrag, playerFocus, playerStreet } from "./focus";
import {
  CAMERA_FOV,
  attachKeyboard,
  cameraInput,
  creatorInput,
  readMove,
  readTurn,
  turnCamera,
} from "./input";
import type { NetPlayer } from "./types";

const WALK_SPEED = 2; // m/s, a brisk walk for a 1.75 m person
const SPRINT_SPEED = 3.5; // must stay below server MAX_SPEED (4.5)
const SEND_INTERVAL = 0.1; // seconds, 10 updates per second
const RECONCILE_DISTANCE = 3; // metres of drift before the server wins
const DEAD_ZONE = 0.15; // ignore tiny drags
const MAX_FRAME_DT = 0.1; // cap a frozen tab's catch-up step
const TURN_SMOOTHING = 12;
const CAMERA_SMOOTHING = 5;
const YAW_SMOOTHING = 12; // how quickly the camera follows a swing round the player
const KEY_TURN = 1.9; // radians a second the camera swings while Q or E is held
const CLIMB_SMOOTHING = 14; // how quickly the body follows the height of the stairs under it
const COVERED_ZOOM = 1.15; // on a footbridge the camera stays under its roof

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
  /** True where the camera may be swung round the player: on the street. A room has only three walls. */
  orbit?: boolean;
};

function shortestAngle(from: number, to: number): number {
  const diff = to - from;
  return Math.atan2(Math.sin(diff), Math.cos(diff));
}

export function LocalPlayer({
  start,
  sendMove,
  takeServerPosition,
  look,
  customising,
  collider,
  fight,
  hold,
  said = "",
  out = false,
  spraying = false,
  orbit = false,
}: Props) {
  const bodyRef = useRef<Group>(null);
  const speedRef = useRef(0);
  const sendTimer = useRef(0);
  const cameraReady = useRef(false);
  const yawRef = useRef(orbit ? cameraInput.yaw : 0); // where the camera really is, a moment behind where it was asked to be
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useEffect(() => attachKeyboard(), []);

  // A body that has just been put down asks the ground where it stands, and so does one
  // that has just been let go from being held somewhere (a seat on the club's platform).
  // Without this, someone who left a footbridge by going home would come back out still
  // up in the air, and someone getting up from a booth would sink through its floor.
  const free = hold == null;
  useEffect(() => {
    const body = bodyRef.current;
    if (body && free)
      collider.resolve(
        body.position.x,
        body.position.z,
        body.position.x,
        body.position.z,
        spot
      );
  }, [collider, free]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    const dt = Math.min(delta, MAX_FRAME_DT);

    // 0. Which side the camera is on. Stood somewhere, in the creator or indoors it goes
    //    back to the front; otherwise it follows what the player asked for.
    const swinging = orbit && !hold && !customising;
    if (swinging) {
      const keys = readTurn();
      if (keys !== 0) turnCamera(keys * KEY_TURN * dt);
    }
    yawRef.current +=
      shortestAngle(yawRef.current, swinging ? cameraInput.yaw : 0) *
      (1 - Math.exp(-dt * YAW_SMOOTHING));
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
      body.rotation.y =
        hold.rot + (fight ? danceTurn(move, now - fight.started) : 0);
      speed = stepSpeed(move);
    } else if (customising) {
      facing = creatorInput.spin;
    } else {
      const input = readMove();
      const length = Math.hypot(input.x, input.z);
      if (length > DEAD_ZONE && dt > 0) {
        // A tout holding on to you slows you down until you shake them off.
        const pace =
          (input.sprint ? SPRINT_SPEED : WALK_SPEED) * playerDrag.factor;
        const fromX = body.position.x;
        const fromZ = body.position.z;
        // The stick is read as the screen shows it, so it is turned by the camera's angle:
        // "up" walks away from the camera, whichever side of the player the camera is on.
        const goX = (input.x * cos + input.z * sin) / length;
        const goZ = (input.z * cos - input.x * sin) / length;
        collider.resolve(
          fromX,
          fromZ,
          fromX + goX * pace * dt,
          fromZ + goZ * pace * dt,
          spot
        );
        body.position.x = spot.x;
        body.position.z = spot.z;
        // The animation follows how fast the player really moved: sliding along a wall
        // is slower than running free, and pushing straight into one is standing still.
        speed = Math.min(pace, Math.hypot(spot.x - fromX, spot.z - fromZ) / dt);
        facing = Math.atan2(goX, goZ);
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
      const drift = Math.hypot(
        server.x - body.position.x,
        server.z - body.position.z
      );
      if (drift > RECONCILE_DISTANCE) {
        body.position.x = server.x;
        body.position.z = server.z;
      }
    }

    // 3. Height. A footbridge lifts the player; the body follows a moment behind so
    //    stairs feel like stairs and not like a lift.
    const floor = hold ? hold.y : collider.height?.() ?? 0;
    body.position.y +=
      (floor - body.position.y) * (1 - Math.exp(-dt * CLIMB_SMOOTHING));
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
      cameraGoal.set(
        hold.lookX + hold.side,
        hold.lookY + hold.height,
        hold.lookZ + hold.distance
      );
      lookGoal.set(hold.lookX, hold.lookY, hold.lookZ);
    } else if (customising) {
      const wide = size.width > size.height;
      const shot = wide ? CREATOR_WIDE : CREATOR_TALL;
      const metresPerPixel =
        (shot.distance * VIEW_HEIGHT_PER_METRE) / size.height;
      const side = wide ? (CREATOR_PANEL_WIDTH / 2) * metresPerPixel : 0;
      cameraGoal.set(x + side, y + shot.height, z + shot.distance);
      lookGoal.set(x + side, y + shot.lookHeight, z);
    } else {
      const zoom = playerStreet.up
        ? Math.min(cameraInput.zoom, COVERED_ZOOM)
        : cameraInput.zoom;
      const lift =
        (CAMERA_HEIGHT - CAMERA_LOOK_HEIGHT) * Math.pow(zoom, CAMERA_LIFT);
      const back = CAMERA_DISTANCE * zoom;
      cameraGoal.set(
        x + sin * back,
        y + CAMERA_LOOK_HEIGHT + lift,
        z + cos * back
      );
      lookGoal.set(x, y + CAMERA_LOOK_HEIGHT, z);
    }

    if (cameraReady.current) {
      const ease = 1 - Math.exp(-dt * CAMERA_SMOOTHING);
      camera.position.lerp(cameraGoal, ease);
      lookNow.lerp(lookGoal, ease);
    } else {
      camera.position.copy(cameraGoal);
      lookNow.copy(lookGoal);
      cameraReady.current = true;
    }
    camera.lookAt(lookNow);

    // 5. Tell the server, 10 times a second, moving or not.
    sendTimer.current += dt;
    if (sendTimer.current >= SEND_INTERVAL) {
      sendTimer.current = 0;
      sendMove(body.position.x, body.position.z, body.rotation.y);
    }
  });

  return (
    <group ref={bodyRef} position={[start.x, 0, start.z]}>
      <Character speedRef={speedRef} look={look} fight={fight} />
      {spraying && <SprayedNotes />}
      <Overhead said={said} out={out} />
    </group>
  );
}
