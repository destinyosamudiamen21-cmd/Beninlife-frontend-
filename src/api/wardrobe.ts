import { request, sendJson } from "./request";

export type Outfit = {
  id: string;
  name: string;
  price: number;
  top: string;
  bottom: string;
  shoes: string;
  /** How many of it the player has. */
  owned: number;
};

export type Wardrobe = {
  outfits: Outfit[];
  /** The boutique outfit the player has on, or null. */
  wearing: string | null;
  money: number;
  /** Buying and selling only happen in the mall. */
  in_shop: boolean;
};

export function fetchWardrobe(playerId: string): Promise<Wardrobe> {
  return request<Wardrobe>(`/players/${playerId}/wardrobe`);
}

export function buyOutfit(playerId: string, outfit: string): Promise<Wardrobe> {
  return request<Wardrobe>(`/players/${playerId}/wardrobe/buy`, sendJson("POST", { outfit }));
}

export function sellOutfit(playerId: string, outfit: string): Promise<Wardrobe> {
  return request<Wardrobe>(`/players/${playerId}/wardrobe/sell`, sendJson("POST", { outfit }));
}

/** Change into an outfit. Allowed in the mall's changing room or at home. */
export function wearOutfit(playerId: string, outfit: string): Promise<Wardrobe> {
  return request<Wardrobe>(`/players/${playerId}/wardrobe/wear`, sendJson("POST", { outfit }));
}
