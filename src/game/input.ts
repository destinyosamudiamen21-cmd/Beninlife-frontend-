// Shared input state. Controls write to it; the render loop reads it once per frame.
// Plain module values, not React state, so 60 updates a second never re-render React.

export const CAMERA_FOV = 55;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 10;

export const touchInput = { x: 0, z: 0, sprint: false };
export const cameraInput = { zoom: 1 };
export const creatorInput = { spin: 0 };

export function setZoom(value: number): void {
  cameraInput.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
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

/** Keyboard wins when a movement key is down; otherwise the touch drag drives. */
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
