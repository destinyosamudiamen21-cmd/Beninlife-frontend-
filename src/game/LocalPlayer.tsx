import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import type { Look } from "../api/appearance";
import { Character } from "./Character";
import type { Collider, Point } from "./collision";
import { playerFocus } from "./focus";
import {
  CAMERA_FOV,
  attachKeyboard,
  cameraInput,
  creatorInput,
  readMove,
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

// Normal play: the camera sits behind the player and looks towards the horizon, so the
// street ahead is in view. Zooming out pulls it back and lifts it faster than it pulls
// back, which turns the view into an overhead look at the neighbourhood.
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

type Props = {
  start: { x: number; z: number };
  sendMove: (x: number, z: number, rot: number) => void;
  takeServerPosition: () => NetPlayer | null;
  look: Look | null;
  customising: boolean;
  /** Knows where the walls, trees and the edge of the district are. */
  collider: Collider;
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
}: Props) {
  const bodyRef = useRef<Group>(null);
  const speedRef = useRef(0);
  const sendTimer = useRef(0);
  const cameraReady = useRef(false);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useEffect(() => attachKeyboard(), []);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    const dt = Math.min(delta, MAX_FRAME_DT);

    // 1. Movement. While the creator is open the player stands still and can be spun.
    let speed = 0;
    let facing: number | null = null;

    if (customising) {
      facing = creatorInput.spin;
    } else {
      const input = readMove();
      const length = Math.hypot(input.x, input.z);
      if (length > DEAD_ZONE && dt > 0) {
        const pace = input.sprint ? SPRINT_SPEED : WALK_SPEED;
        const fromX = body.position.x;
        const fromZ = body.position.z;
        collider.resolve(
          fromX,
          fromZ,
          fromX + (input.x / length) * pace * dt,
          fromZ + (input.z / length) * pace * dt,
          spot
        );
        body.position.x = spot.x;
        body.position.z = spot.z;
        // The animation follows how fast the player really moved: sliding along a wall
        // is slower than running free, and pushing straight into one is standing still.
        speed = Math.min(pace, Math.hypot(spot.x - fromX, spot.z - fromZ) / dt);
        facing = Math.atan2(input.x, input.z);
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

    // 3. Camera.
    const { x, z } = body.position;
    playerFocus.x = x;
    playerFocus.z = z;
    if (customising) {
      const wide = size.width > size.height;
      const shot = wide ? CREATOR_WIDE : CREATOR_TALL;
      const metresPerPixel =
        (shot.distance * VIEW_HEIGHT_PER_METRE) / size.height;
      const side = wide ? (CREATOR_PANEL_WIDTH / 2) * metresPerPixel : 0;
      cameraGoal.set(x + side, shot.height, z + shot.distance);
      lookGoal.set(x + side, shot.lookHeight, z);
    } else {
      const zoom = cameraInput.zoom;
      const lift =
        (CAMERA_HEIGHT - CAMERA_LOOK_HEIGHT) * Math.pow(zoom, CAMERA_LIFT);
      cameraGoal.set(x, CAMERA_LOOK_HEIGHT + lift, z + CAMERA_DISTANCE * zoom);
      lookGoal.set(x, CAMERA_LOOK_HEIGHT, z);
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

    // 4. Tell the server, 10 times a second, moving or not.
    sendTimer.current += dt;
    if (sendTimer.current >= SEND_INTERVAL) {
      sendTimer.current = 0;
      sendMove(body.position.x, body.position.z, body.rotation.y);
    }
  });

  return (
    <group ref={bodyRef} position={[start.x, 0, start.z]}>
      <Character speedRef={speedRef} look={look} />
    </group>
  );
}
