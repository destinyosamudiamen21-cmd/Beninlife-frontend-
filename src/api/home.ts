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

export type HomePlan = {
  kind: string;
  name: string;
  /** Metres per cell. */
  cell: number;
  floors: { w: number; d: number }[];
  /** A strip of cells: bottom step at the front (largest z), top step at the back. */
  stairs: { x: number; z: number; w: number; d: number } | null;
  /** On the back wall. */
  door: { x: number; w: number };
  fixtures: Fixture[];
};

export type Home = {
  plan: HomePlan;
  items: PlacedItem[];
  catalogue: FurnitureOption[];
  money: number;
};

export type HomeChange = { items: PlacedItem[]; money: number };

export type Spot = { floor: number; x: number; z: number; rot: number };

export function fetchHome(playerId: string): Promise<Home> {
  return request<Home>(`/players/${playerId}/home`);
}

export function buyItem(
  playerId: string,
  item: string,
  spot: Spot
): Promise<HomeChange> {
  return request<HomeChange>(
    `/players/${playerId}/home/items`,
    sendJson("POST", { item, ...spot })
  );
}

export function moveItem(
  playerId: string,
  itemId: number,
  spot: Spot
): Promise<HomeChange> {
  return request<HomeChange>(
    `/players/${playerId}/home/items/${itemId}`,
    sendJson("PUT", spot)
  );
}

export function sellItem(
  playerId: string,
  itemId: number
): Promise<HomeChange> {
  return request<HomeChange>(`/players/${playerId}/home/items/${itemId}`, {
    method: "DELETE",
  });
}
