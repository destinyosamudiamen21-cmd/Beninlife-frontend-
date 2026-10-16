// Build mode: what the camera does, where a tap on the floor goes, and the arithmetic of
// moving a piece or a room about by a cell at a time. No 3D imports.

import type { FurnitureOption, Home, PlacedItem, Room, RoomShape, Spot } from "../api/home";
import { whyNot } from "./homeDecor";
import { footprint } from "./homeLayout";
import { isDone, whyNoRoom } from "./homeRooms";

/** The build camera: looking down at (x, z) from `dist` metres away, turned by `yaw`. Written by gestures and buttons. */
export const buildCam = { x: 0, z: 0, dist: 18, yaw: 0, pitch: 0.95 };

/** Where taps on the house go while building. HomeScene calls it; the build panel sets it. Metres. */
export const buildInput: { onTap: ((x: number, z: number) => void) | null } = { onTap: null };

/** What the scene draws on top of the house while building. */
export type BuildView = {
  /** A piece being put down, green where it fits and red where it does not. */
  ghost: { option: FurnitureOption; spot: Spot; ok: boolean } | null;
  /** A room being laid out. */
  room: { shape: RoomShape; ok: boolean } | null;
  /** The piece picked out, and the piece being moved (drawn as the ghost instead). */
  selected: number | null;
  moving: number | null;
  /** The room picked out for painting, and the paint and floor being tried on it. */
  selectedRoom: number | null;
  preview: { roomId: number; wall?: string; ground?: string } | null;
};

export const EMPTY_VIEW: BuildView = { ghost: null, room: null, selected: null, moving: null, selectedRoom: null, preview: null };

/** Look at the middle of the house from the front: where building starts. */
export function frameHouse(home: Home, floor: number): void {
  const rooms = home.rooms.filter((room) => room.floor === floor);
  const cell = home.plan.cell;
  if (rooms.length === 0) return;
  const minX = Math.min(...rooms.map((room) => room.x)), maxX = Math.max(...rooms.map((room) => room.x + room.w));
  const minZ = Math.min(...rooms.map((room) => room.z)), maxZ = Math.max(...rooms.map((room) => room.z + room.d));
  buildCam.x = ((minX + maxX) / 2) * cell;
  buildCam.z = ((minZ + maxZ) / 2) * cell;
  buildCam.dist = Math.max(12, Math.min(30, Math.max(maxX - minX, maxZ - minZ) * cell * 1.6));
  buildCam.yaw = 0;
}

/** The cell steps that "up" and "right" on the screen mean, for the way the camera is turned. */
export function screenSteps(yaw: number): { up: [number, number]; right: [number, number] } {
  const quarter = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
  // Camera at yaw 0 looks towards -z: up the screen is -z, right is +x.
  const ups: [number, number][] = [[0, -1], [-1, 0], [0, 1], [1, 0]];
  const rights: [number, number][] = [[1, 0], [0, -1], [-1, 0], [0, 1]];
  return { up: ups[quarter], right: rights[quarter] };
}

/** The cell a point in metres is in. */
export function cellAt(home: Home, x: number, z: number): { cx: number; cz: number } {
  return { cx: Math.floor(x / home.plan.cell), cz: Math.floor(z / home.plan.cell) };
}

/** A spot for a piece with its middle as near as can be to cell (cx, cz). */
export function centredSpot(option: FurnitureOption, rot: number, floor: number, cx: number, cz: number): Spot {
  const { w, d } = footprint(option, rot);
  return { floor, x: cx - Math.floor((w - 1) / 2), z: cz - Math.floor((d - 1) / 2), rot };
}

/** Why a piece cannot go at a spot, while building (nobody is standing in the way). */
export function pieceProblem(home: Home, option: FurnitureOption, spot: Spot, moving: number | null): string | null {
  return whyNot(home.plan, home.items, home.catalogue, option, spot, moving, null, null, home.rooms);
}

/**
 * The free spot for a piece nearest a cell, looking outwards ring by ring. Falls back to
 * the cell itself (where it will show red) if nothing nearby fits.
 */
export function nearestFreeSpot(home: Home, option: FurnitureOption, rot: number, floor: number, cx: number, cz: number, moving: number | null): Spot {
  for (let ring = 0; ring <= 24; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const spot = centredSpot(option, rot, floor, cx + dx, cz + dz);
        if (!pieceProblem(home, option, spot, moving)) return spot;
      }
    }
  }
  return centredSpot(option, rot, floor, cx, cz);
}

/** The piece at a point on the floor, if any: something standing there before a rug under it. */
export function pieceAt(home: Home, floor: number, x: number, z: number): PlacedItem | null {
  const options = new Map(home.catalogue.map((option) => [option.id, option]));
  const { cx, cz } = cellAt(home, x, z);
  let best: PlacedItem | null = null;
  for (const item of home.items) {
    if (item.floor !== floor) continue;
    const option = options.get(item.item);
    if (!option) continue;
    const { w, d } = footprint(option, item.rot);
    if (cx < item.x || cx >= item.x + w || cz < item.z || cz >= item.z + d) continue;
    const bestOption = best ? options.get(best.item) : null;
    if (!best || (option.solid && !bestOption?.solid)) best = item;
  }
  return best;
}

/**
 * A place for a new room of size w x d against the house, as near as can be to cell
 * (cx, cz). Tries every spot along the outside of every finished room. Null if none fits.
 */
export function roomSpotNear(home: Home, floor: number, w: number, d: number, cx: number, cz: number): RoomShape | null {
  const found: { shape: RoomShape | null; gap: number } = { shape: null, gap: Infinity };
  const consider = (shape: RoomShape) => {
    if (whyNoRoom(home.plan, home.rooms, shape)) return;
    const gap = Math.hypot(shape.x + shape.w / 2 - cx, shape.z + shape.d / 2 - cz);
    if (gap < found.gap) {
      found.shape = shape;
      found.gap = gap;
    }
  };
  for (const room of home.rooms) {
    if (room.floor !== floor || !isDone(room)) continue;
    for (let z = room.z - d + 2; z <= room.z + room.d - 2; z++) {
      consider({ floor, x: room.x - w, z, w, d });
      consider({ floor, x: room.x + room.w, z, w, d });
    }
    for (let x = room.x - w + 2; x <= room.x + room.w - 2; x++) {
      consider({ floor, x, z: room.z + room.d, w, d });
      consider({ floor, x, z: room.z - d, w, d });
    }
  }
  return found.shape;
}

/** The room a point is in, finished or not. */
export function roomUnder(rooms: Room[], floor: number, cx: number, cz: number): Room | null {
  return rooms.find((room) => room.floor === floor && cx >= room.x && cx < room.x + room.w && cz >= room.z && cz < room.z + room.d) ?? null;
}

export const naira = (amount: number) => `₦${amount.toLocaleString()}`;

/** "1:05" from seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
