// The rooms of a house: which are finished, where their walls run, where the doorways
// between them are, and whether a new room can go somewhere. The server has the last word
// (home_service.py); the same arithmetic is done here first so the player sees it live.
// No 3D imports, so all of it can be tested alone.

import type { FloorFinish, Home, HomePlan, Paint, Room, RoomShape } from "../api/home";

export const DOOR = 2;          // cells: the narrowest doorway between two rooms, 1 m
export const WIDE_DOOR = 3;     // cells: the doorway where the shared wall has room for it, 1.5 m
/** How wide the doorway in a shared wall this many cells long is. Must match home_service.door_width. */
export function doorWidth(span: number): number {
  return span >= WIDE_DOOR + 2 ? WIDE_DOOR : DOOR;
}
export const ROOM_MIN = 4;      // cells on a side: 2 m ...
export const ROOM_MAX = 24;     // ... to 12 m
export const MAX_ROOMS = 16;
const PAINT_LABOUR = 5000;
const FLOOR_LABOUR = 5000;
const CELLS_A_BUCKET = 14;

type Rect = { x: number; z: number; w: number; d: number };

/**
 * The server's clock, as near as can be told: set from every answer about the house, so a
 * room being built finishes on screen when the server says it does, whatever the phone's
 * own clock thinks.
 */
export const serverClock = { offset: 0 };
export function syncClock(serverMs: number): void {
  if (serverMs > 0) serverClock.offset = serverMs - Date.now();
}
export function serverNow(): number {
  return Date.now() + serverClock.offset;
}

export function isDone(room: Room, now: number = serverNow()): boolean {
  return room.stage >= 4 && room.ready_ms <= now;
}

/** How far through the stage in hand the workers are, 0 to 1. 1 once it is done. */
export function stageProgress(room: Room, seconds: number, now: number = serverNow()): number {
  if (room.ready_ms <= now) return 1;
  const left = (room.ready_ms - now) / 1000;
  return Math.max(0, Math.min(1, 1 - left / Math.max(seconds, 1)));
}

/**
 * Where two rooms touch along a wall: a wall running front to back at x = line ("x"), or
 * across at z = line ("z"), from `from` to `to`. Null if they do not (a corner is not a wall).
 * Must match home_service.shared_edge.
 */
export function sharedEdge(a: Rect, b: Rect): { axis: "x" | "z"; line: number; from: number; to: number } | null {
  if (a.x + a.w === b.x || b.x + b.w === a.x) {
    const line = a.x + a.w === b.x ? b.x : a.x;
    const from = Math.max(a.z, b.z), to = Math.min(a.z + a.d, b.z + b.d);
    if (to > from) return { axis: "x", line, from, to };
  }
  if (a.z + a.d === b.z || b.z + b.d === a.z) {
    const line = a.z + a.d === b.z ? b.z : a.z;
    const from = Math.max(a.x, b.x), to = Math.min(a.x + a.w, b.x + b.w);
    if (to > from) return { axis: "z", line, from, to };
  }
  return null;
}

export type Doorway = { axis: "x" | "z"; line: number; first: number; width: number };

/** The openings between finished rooms on a floor. Must match home_service.doorways. */
export function doorways(rooms: Room[], floor: number, now: number = serverNow()): Doorway[] {
  const done = rooms.filter((room) => room.floor === floor && isDone(room, now)).sort((a, b) => a.id - b.id);
  const found: Doorway[] = [];
  for (let i = 0; i < done.length; i++) {
    for (let j = i + 1; j < done.length; j++) {
      const edge = sharedEdge(done[i], done[j]);
      if (!edge || edge.to - edge.from < DOOR) continue;
      const width = doorWidth(edge.to - edge.from);
      found.push({ axis: edge.axis, line: edge.line, first: edge.from + Math.floor((edge.to - edge.from - width) / 2), width });
    }
  }
  return found;
}

/** The finished room a cell is in, if any. */
export function roomAt(rooms: Room[], floor: number, cx: number, cz: number, now: number = serverNow()): Room | null {
  for (const room of rooms) {
    if (room.floor === floor && isDone(room, now) && cx >= room.x && cx < room.x + room.w && cz >= room.z && cz < room.z + room.d) return room;
  }
  return null;
}

/** Any room at all at a cell, finished or still going up. */
export function anyRoomAt(rooms: Room[], floor: number, cx: number, cz: number): Room | null {
  for (const room of rooms) {
    if (room.floor === floor && cx >= room.x && cx < room.x + room.w && cz >= room.z && cz < room.z + room.d) return room;
  }
  return null;
}

/** Is a rectangle of cells wholly inside one finished room? */
export function insideOneRoom(rooms: Room[], floor: number, x: number, z: number, w: number, d: number, now: number = serverNow()): Room | null {
  for (const room of rooms) {
    if (room.floor !== floor || !isDone(room, now)) continue;
    if (x >= room.x && z >= room.z && x + w <= room.x + room.w && z + d <= room.z + room.d) return room;
  }
  return null;
}

/**
 * One stretch of wall, one cell thick in the drawing's sense: the side of `room` that faces
 * out along `out` (+1 or -1 on its axis). `inner` is true where another finished room is on
 * the other side. A wall "x" runs front to back at x = line; a wall "z" runs across at z = line.
 */
export type WallRun = {
  axis: "x" | "z";
  line: number;
  from: number;
  to: number;
  room: Room;
  out: 1 | -1;
  inner: boolean;
};

/**
 * The walls of every room on a floor, split where the doorways are and where what is on
 * the other side changes. A shared wall is two runs, one for each room, so each side can
 * be painted its own colour.
 */
export function wallRuns(rooms: Room[], floor: number, now: number = serverNow()): WallRun[] {
  const here = rooms.filter((room) => room.floor === floor);
  const doors = doorways(rooms, floor, now);
  const isDoorway = (axis: "x" | "z", line: number, cell: number) =>
    doors.some((door) => door.axis === axis && door.line === line && cell >= door.first && cell < door.first + door.width);
  const runs: WallRun[] = [];

  for (const room of here) {
    const finished = isDone(room, now);
    const edges: { axis: "x" | "z"; line: number; from: number; to: number; out: 1 | -1 }[] = [
      { axis: "z", line: room.z, from: room.x, to: room.x + room.w, out: -1 },
      { axis: "z", line: room.z + room.d, from: room.x, to: room.x + room.w, out: 1 },
      { axis: "x", line: room.x, from: room.z, to: room.z + room.d, out: -1 },
      { axis: "x", line: room.x + room.w, from: room.z, to: room.z + room.d, out: 1 },
    ];
    for (const edge of edges) {
      let start = edge.from;
      let current: boolean | null = null; // inner or not, for the run being gathered
      const flush = (end: number) => {
        if (current !== null && end > start) runs.push({ ...edge, from: start, to: end, room, inner: current });
      };
      for (let cell = edge.from; cell < edge.to; cell++) {
        if (finished && isDoorway(edge.axis, edge.line, cell)) {
          flush(cell);
          current = null;
          start = cell + 1;
          continue;
        }
        // The cell just beyond the wall: is a finished room there?
        const bx = edge.axis === "x" ? (edge.out > 0 ? edge.line : edge.line - 1) : cell;
        const bz = edge.axis === "z" ? (edge.out > 0 ? edge.line : edge.line - 1) : cell;
        const inner = finished && roomAt(rooms, floor, bx, bz, now) !== null;
        if (current === null) {
          current = inner;
          start = cell;
        } else if (inner !== current) {
          flush(cell);
          current = inner;
          start = cell;
        }
      }
      flush(edge.to);
    }
  }
  return runs;
}

/** Cells of wall a room would need: its outline, less what it shares. Must match the server. */
export function newWall(rooms: Room[], shape: RoomShape, ignoreId: number | null = null): number {
  let shared = 0;
  for (const other of rooms) {
    if (other.floor !== shape.floor || other.id === ignoreId) continue;
    const edge = sharedEdge(shape, other);
    if (edge) shared += edge.to - edge.from;
  }
  return Math.max(0, 2 * (shape.w + shape.d) - shared);
}

/** Why a room cannot be built there, or null if it can. Must match home_service.check_room. */
export function whyNoRoom(plan: HomePlan, rooms: Room[], shape: RoomShape, now: number = serverNow()): string | null {
  if (!plan.buildable) return "You cannot build onto a hostel room. Rent a place of your own first.";
  if (rooms.length >= MAX_ROOMS) return `A house can have ${MAX_ROOMS} rooms at most.`;
  if (rooms.some((room) => !isDone(room, now))) return "The workers are still on the room you are building. Finish that one first.";
  if (shape.floor < 0 || shape.floor >= plan.floors.length) return "This house does not have that floor.";
  if (shape.w < ROOM_MIN || shape.d < ROOM_MIN || shape.w > ROOM_MAX || shape.d > ROOM_MAX) {
    return `A room is ${ROOM_MIN * plan.cell} m to ${ROOM_MAX * plan.cell} m on each side.`;
  }
  const lot = plan.lot;
  if (shape.x < lot.min_x || shape.z < lot.min_z || shape.x + shape.w > lot.max_x || shape.z + shape.d > lot.max_z) {
    return "That goes past the edge of your plot.";
  }
  for (const room of rooms) {
    if (room.floor !== shape.floor) continue;
    const apartX = shape.x + shape.w <= room.x || room.x + room.w <= shape.x;
    const apartZ = shape.z + shape.d <= room.z || room.z + room.d <= shape.z;
    if (!apartX && !apartZ) return "That is on top of a room you already have.";
  }
  const touching = rooms.some((room) => {
    if (room.floor !== shape.floor || !isDone(room, now)) return false;
    const edge = sharedEdge(shape, room);
    return edge !== null && edge.to - edge.from >= DOOR;
  });
  if (!touching) return "A new room has to share a wall with a finished room, at least 1 m of it, for the doorway.";
  if (shape.floor > 0) {
    for (let cx = shape.x; cx < shape.x + shape.w; cx++) {
      for (let cz = shape.z; cz < shape.z + shape.d; cz++) {
        if (!roomAt(rooms, shape.floor - 1, cx, cz, now)) return "An upstairs room has to stand on rooms downstairs.";
      }
    }
  }
  return null;
}

/** Painting a room. Must match home_service.paint_price. */
export function paintPrice(room: Rect, paint: Paint): number {
  const buckets = Math.max(1, Math.ceil((2 * (room.w + room.d)) / CELLS_A_BUCKET));
  return buckets * paint.price + PAINT_LABOUR;
}

/** Laying a new floor. Must match home_service.floor_price. */
export function floorPrice(room: Rect, finish: FloorFinish): number {
  return room.w * room.d * finish.price + FLOOR_LABOUR;
}

/** Room sizes offered when building, in cells, smallest first. */
export const ROOM_SIZES: { w: number; d: number; label: string }[] = [
  { w: 4, d: 4, label: "2 × 2 m · store" },
  { w: 6, d: 4, label: "3 × 2 m · small" },
  { w: 6, d: 6, label: "3 × 3 m · bedroom" },
  { w: 8, d: 6, label: "4 × 3 m · room" },
  { w: 8, d: 8, label: "4 × 4 m · big room" },
  { w: 10, d: 8, label: "5 × 4 m · parlour" },
  { w: 12, d: 10, label: "6 × 5 m · hall" },
];

/**
 * A house as the game uses it, whatever the server sent. A server from before houses had
 * rooms sends none: each storey is then one room, finished, on a plot just its size.
 */
export function withRooms(home: Home): Home {
  const plan = home.plan;
  const width = Math.max(...plan.floors.map((floor) => floor.w));
  const depth = Math.max(...plan.floors.map((floor) => floor.d));
  const rooms: Room[] = home.rooms?.length
    ? home.rooms
    : plan.floors.map((floor, index) => ({
        id: -1 - index, floor: index, x: 0, z: 0, w: floor.w, d: floor.d, name: "Room", wall: "cream", ground: "tiles_brown",
        stage: 4, ready_ms: 0, done: true, starter: true, next_bill: null,
      }));
  return {
    ...home,
    plan: { ...plan, lot: plan.lot ?? { min_x: 0, max_x: width, min_z: 0, max_z: depth }, buildable: plan.buildable ?? false },
    rooms,
    paints: home.paints ?? [],
    finishes: home.finishes ?? [],
    now_ms: home.now_ms ?? 0,
    note: home.note ?? "",
  };
}
