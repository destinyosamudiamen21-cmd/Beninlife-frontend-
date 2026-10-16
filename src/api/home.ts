import { withRooms } from "../game/homeRooms";
import { request, sendJson } from "./request";

export type PlacedItem = {
  id: number;
  item: string;
  floor: number;
  /** The corner cell nearest the back-left of the room. */
  x: number;
  z: number;
  /** Quarter turns, 0 to 3. */
  rot: number;
  /** Came with the house: sells for nothing. */
  gift: boolean;
};

export type FurnitureOption = {
  id: string;
  name: string;
  price: number;
  /** Cells across and front-to-back before turning. */
  w: number;
  d: number;
  /** False for things you walk over, like a rug. */
  solid: boolean;
  group: string;
};

/**
 * Something that comes with a room and stays where it is: a roommate, or the door to the
 * bathroom down the corridor. What it can be used for is decided by the server, under its id.
 */
export type Fixture = {
  id: string;
  name: string;
  kind: "person" | "door";
  /** The cell it stands in, downstairs. */
  x: number;
  z: number;
  /** Quarter turns, 0 to 3. At 0 a person faces the front of the room. */
  rot: number;
  /** Which of the stock looks a person wears. */
  look: number;
};

/** The plot the house stands on, in cells. Rooms are built inside it. */
export type Lot = { min_x: number; max_x: number; min_z: number; max_z: number };

export type BillLine = { name: string; qty: number; unit: number; total: number };
/** What one stage of building a room costs, line by line, and how long the workers take. */
export type Bill = { stage: number; title: string; lines: BillLine[]; total: number; seconds: number };

/** One room of the house. Built in four stages; `done` once the last one is over. */
export type Room = {
  id: number;
  floor: number;
  x: number;
  z: number;
  w: number;
  d: number;
  name: string;
  /** A paint id, and a floor finish id. */
  wall: string;
  ground: string;
  /** Stages paid for, 1 to 4. */
  stage: number;
  /** When the stage in hand is done, by the server's clock (ms). */
  ready_ms: number;
  done: boolean;
  starter: boolean;
  next_bill: Bill | null;
};

export type Paint = { id: string; name: string; hex: string; price: number };
export type FloorFinish = { id: string; name: string; a: string; b: string; tile: number; price: number };

export type HomePlan = {
  kind: string;
  name: string;
  /** Metres per cell. */
  cell: number;
  /** One per storey: the size the house came as. */
  floors: { w: number; d: number }[];
  /** A strip of cells: bottom step at the front (largest z), top step at the back. */
  stairs: { x: number; z: number; w: number; d: number } | null;
  /** On the back wall. */
  door: { x: number; w: number };
  fixtures: Fixture[];
  lot: Lot;
  /** False for a hostel room: nobody builds onto Hall 4. */
  buildable: boolean;
};

export type Home = {
  plan: HomePlan;
  items: PlacedItem[];
  catalogue: FurnitureOption[];
  money: number;
  rooms: Room[];
  paints: Paint[];
  finishes: FloorFinish[];
  /** The server's clock when this was read, in ms: rooms being built are timed by it. */
  now_ms: number;
  /** Said once, after an old house was rebuilt into rooms. */
  note: string;
};

export type HomeChange = { items: PlacedItem[]; money: number; rooms: Room[]; now_ms: number };

export type RoomShape = { floor: number; x: number; z: number; w: number; d: number };
export type RoomQuote = { why: string | null; bills: Bill[]; total: number };

export type Spot = { floor: number; x: number; z: number; rot: number };

export function fetchHome(playerId: string): Promise<Home> {
  return request<Home>(`/players/${playerId}/home`).then(withRooms);
}

export function buyItem(playerId: string, item: string, spot: Spot): Promise<HomeChange> {
  return request<HomeChange>(`/players/${playerId}/home/items`, sendJson("POST", { item, ...spot }));
}

export function moveItem(playerId: string, itemId: number, spot: Spot): Promise<HomeChange> {
  return request<HomeChange>(`/players/${playerId}/home/items/${itemId}`, sendJson("PUT", spot));
}

export function sellItem(playerId: string, itemId: number): Promise<HomeChange> {
  return request<HomeChange>(`/players/${playerId}/home/items/${itemId}`, { method: "DELETE" });
}

export function quoteRoom(playerId: string, room: RoomShape & { name: string }): Promise<RoomQuote> {
  return request<RoomQuote>(`/players/${playerId}/home/rooms/quote`, sendJson("POST", room));
}

/** Start building a room: pays for the foundation. */
export function buildRoom(playerId: string, room: RoomShape & { name: string }): Promise<HomeChange> {
  return request<HomeChange>(`/players/${playerId}/home/rooms`, sendJson("POST", room));
}

/** Pay for the next stage of a room being built, once the last one is done. */
export function nextStage(playerId: string, roomId: number): Promise<HomeChange> {
  return request<HomeChange>(`/players/${playerId}/home/rooms/${roomId}/stage`, sendJson("POST", {}));
}

/** Paint a room, lay a new floor in it, or name it. */
export function finishRoom(playerId: string, roomId: number, change: { wall?: string; ground?: string; name?: string }): Promise<HomeChange> {
  return request<HomeChange>(`/players/${playerId}/home/rooms/${roomId}`, sendJson("PUT", change));
}

export function demolishRoom(playerId: string, roomId: number): Promise<HomeChange> {
  return request<HomeChange>(`/players/${playerId}/home/rooms/${roomId}`, { method: "DELETE" });
}
