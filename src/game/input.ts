// Shared input state. Controls write to it; the render loop reads it once per frame.
// Plain module values, not React state, so 60 updates a second never re-render React.

import { wrapAngle } from "./gestures";

export const CAMERA_FOV = 55;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 10;

export const touchInput = { x: 0, z: 0, sprint: false };
/**
 * `zoom` is how far back the camera sits. `yaw` is how far it has been swung round the
 * player, in radians: 0 looks north (the way the game always used to), and a positive
 * angle carries the camera round towards the east.
 */
export const cameraInput = { zoom: 1, yaw: 0 };
export const creatorInput = { spin: 0 };

export function setZoom(value: number): void {
  cameraInput.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** Swing the camera round the player by this many radians. */
export function turnCamera(by: number): void {
  if (Number.isFinite(by)) cameraInput.yaw = wrapAngle(cameraInput.yaw + by);
}

/** Put the camera back behind the player, looking north. */
export function faceNorth(): void {
  cameraInput.yaw = 0;
}

export function releaseTouch(): void {
  touchInput.x = 0;
  touchInput.z = 0;
  touchInput.sprint = false;
}

// ---- keyboard ----------------------------------------------------------

const held = new Set<string>();
let shiftHeld = false;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.metaKey || isTyping(event.target)) return;
  held.add(event.code);
  shiftHeld = event.shiftKey;
}

function onKeyUp(event: KeyboardEvent): void {
  held.delete(event.code);
  shiftHeld = event.shiftKey;
}

function clearKeys(): void {
  held.clear();
  shiftHeld = false;
}

export function attachKeyboard(): () => void {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearKeys);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", clearKeys);
    clearKeys();
  };
}

// ---- combined movement -------------------------------------------------

export type MoveInput = { x: number; z: number; sprint: boolean };

const move: MoveInput = { x: 0, z: 0, sprint: false };

/**
 * Which way the player wants to go, as the screen sees it: x is to the right and z is
 * towards the bottom. Keyboard wins when a movement key is down; otherwise the touch drag drives.
 */
export function readMove(): MoveInput {
  let x = 0;
  let z = 0;
  if (held.has("KeyW") || held.has("ArrowUp")) z -= 1;
  if (held.has("KeyS") || held.has("ArrowDown")) z += 1;
  if (held.has("KeyA") || held.has("ArrowLeft")) x -= 1;
  if (held.has("KeyD") || held.has("ArrowRight")) x += 1;

  if (x !== 0 || z !== 0) {
    move.x = x;
    move.z = z;
    move.sprint = shiftHeld;
  } else {
    move.x = touchInput.x;
    move.z = touchInput.z;
    move.sprint = touchInput.sprint;
  }
  return move;
}

/** Q and E look round: 1 while the view should turn left, -1 right, 0 for neither or both. */
export function readTurn(): number {
  return (held.has("KeyQ") ? 1 : 0) - (held.has("KeyE") ? 1 : 0);
}
