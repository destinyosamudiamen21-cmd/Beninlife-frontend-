// The camera over the city map: where it looks, how much it shows and which way it is
// turned. All plain arithmetic, so it can be tested without the 3D library. The map on
// screen (CityMap.tsx) and its buttons (MapPanel.tsx) share the one view kept here, the
// same way the game's own camera shares input.ts.

import { wrapAngle } from "./gestures";
import { CAMERA_FOV } from "./input";

/** What the map camera is showing. */
export type MapView = {
  /** The spot on the ground in the middle of the screen. */
  x: number;
  z: number;
  /** Metres of ground from the top of the screen to the bottom, at that spot. Smaller is closer. */
  span: number;
  /** Which way it is turned: 0 has north at the top, and a positive angle turns the world clockwise. */
  yaw: number;
};

export type MapEdge = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export const MIN_SPAN = 160; // close enough to see one street
export const MAX_SPAN = 3400; // the whole city
export const CITY_SPAN = 1500; // further out than this, the map shows districts and not single places
const NEAR_PITCH = 0.72; // radians above the horizon when close: buildings stand up
const FAR_PITCH = 1.12; // ... and when far: almost a plan

/** The view the map is easing towards, and the view it has reached. Controls write `goal`. */
export const mapView: { now: MapView; goal: MapView } = {
  now: { x: 0, z: 0, span: 900, yaw: 0 },
  goal: { x: 0, z: 0, span: 900, yaw: 0 },
};

/** How steeply the camera looks down: steeper the further out it is. */
export function pitchFor(span: number): number {
  const t =
    Math.log(Math.min(MAX_SPAN, Math.max(MIN_SPAN, span)) / MIN_SPAN) /
    Math.log(MAX_SPAN / MIN_SPAN);
  return NEAR_PITCH + (FAR_PITCH - NEAR_PITCH) * t;
}

/** Where to put the camera for a view. `out` is filled in and handed back: [x, y, z]. */
export function cameraSpot(
  view: MapView,
  out: [number, number, number] = [0, 0, 0]
): [number, number, number] {
  const distance = view.span / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360));
  const pitch = pitchFor(view.span);
  const flat = distance * Math.cos(pitch);
  out[0] = view.x + Math.sin(view.yaw) * flat;
  out[1] = distance * Math.sin(pitch);
  out[2] = view.z + Math.cos(view.yaw) * flat;
  return out;
}

export function clampView(view: MapView, edge: MapEdge): void {
  view.span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, view.span));
  view.x = Math.min(edge.maxX, Math.max(edge.minX, view.x));
  view.z = Math.min(edge.maxZ, Math.max(edge.minZ, view.z));
  view.yaw = wrapAngle(view.yaw);
}

/**
 * Slide the map under a finger that moved (dx, dy) pixels on a screen `height` pixels
 * tall: the ground follows the finger, whichever way the map is turned.
 */
export function panBy(
  view: MapView,
  dx: number,
  dy: number,
  height: number
): void {
  const perPixel = view.span / Math.max(height, 1);
  const sin = Math.sin(view.yaw),
    cos = Math.cos(view.yaw);
  // Ground further up the screen is further away, so a pixel up the screen covers more of it.
  const deep = perPixel / Math.sin(pitchFor(view.span));
  view.x += -dx * perPixel * cos - dy * deep * sin;
  view.z += dx * perPixel * sin - dy * deep * cos;
}

/** Zoom by a factor: less than 1 goes closer. */
export function zoomBy(view: MapView, factor: number): void {
  if (Number.isFinite(factor) && factor > 0) view.span *= factor;
}

export function turnBy(view: MapView, by: number): void {
  if (Number.isFinite(by)) view.yaw = wrapAngle(view.yaw + by);
}

/** Move `now` a step towards `goal`. Returns true while there is still some way to go. */
export function easeView(now: MapView, goal: MapView, amount: number): boolean {
  now.x += (goal.x - now.x) * amount;
  now.z += (goal.z - now.z) * amount;
  now.span *= Math.pow(goal.span / now.span, amount); // zoom eases by ratio, so it feels even at every distance
  now.yaw = wrapAngle(now.yaw + wrapAngle(goal.yaw - now.yaw) * amount);
  return (
    Math.abs(goal.x - now.x) > 0.5 ||
    Math.abs(goal.z - now.z) > 0.5 ||
    Math.abs(goal.span / now.span - 1) > 0.002
  );
}

/** Jump straight to a view, with no easing: for when the map is first opened. */
export function showAt(x: number, z: number, span: number, yaw = 0): void {
  for (const view of [mapView.now, mapView.goal]) {
    view.x = x;
    view.z = z;
    view.span = span;
    view.yaw = yaw;
  }
}

/** Glide to a spot. Left-out values stay as they are. */
export function flyTo(x: number, z: number, span?: number): void {
  mapView.goal.x = x;
  mapView.goal.z = z;
  if (span !== undefined) mapView.goal.span = span;
}
