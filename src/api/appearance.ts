import { API_URL } from "./config";

export type Look = {
  body: string;
  skin_tone: string;
  hair_color: string;
  top_color: string;
  bottom_color: string;
  shoe_color: string;
};

export type LookOptions = {
  bodies: { id: string; label: string }[];
  skin_tones: string[];
  hair_colors: string[];
  top_colors: string[];
  bottom_colors: string[];
  shoe_colors: string[];
  defaults: Look;
};

export type LookState = { look: Look; customised: boolean };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new Error("Can't reach the game server. Check your connection.");
  }
  if (!res.ok) {
    throw new Error(
      res.status === 422
        ? "That look isn't available."
        : "Something went wrong. Try again."
    );
  }
  return (await res.json()) as T;
}

export function fetchLookOptions(): Promise<LookOptions> {
  return request<LookOptions>("/appearance/options");
}

export function fetchLookState(playerId: string): Promise<LookState> {
  return request<LookState>(`/players/${playerId}/appearance`);
}

export function saveLook(playerId: string, look: Look): Promise<Look> {
  return request<Look>(`/players/${playerId}/appearance`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(look),
  });
}
