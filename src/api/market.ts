import { request, sendJson } from "./request";

export type ShopItem = { id: string; name: string; price: number };

export type Shop = {
  id: string;
  name: string;
  /** Prices are this player's prices: they depend on street sense. */
  items: ShopItem[];
  /** How the seller sizes the player up. */
  note: string;
  money: number;
};

export type Bag = {
  lines: { name: string; count: number }[];
  total: number;
  money: number;
};

export type Purchase = {
  bought: string;
  paid: number;
  money: number;
  bag: Bag;
};

export function fetchShop(playerId: string, shopId: string): Promise<Shop> {
  return request<Shop>(`/players/${playerId}/market/${shopId}`);
}

export function buyFromShop(
  playerId: string,
  shop: string,
  item: string
): Promise<Purchase> {
  return request<Purchase>(
    `/players/${playerId}/market/buy`,
    sendJson("POST", { shop, item })
  );
}

export function fetchBag(playerId: string): Promise<Bag> {
  return request<Bag>(`/players/${playerId}/bag`);
}
