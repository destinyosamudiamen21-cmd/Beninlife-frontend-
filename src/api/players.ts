import { API_URL } from "./config";

export type Player = {
  id: string;
  username: string;
  money: number;
  pos_x: number;
  pos_z: number;
};

export async function joinGame(username: string): Promise<Player> {
  const res = await fetch(`${API_URL}/players/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 422
        ? "Username must be 3–20 characters"
        : "Could not join the city"
    );
  }
  return res.json();
}
