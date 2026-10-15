// Where the game server is. In development it is port 8000 on the same computer (or the
// same Wi-Fi, from a phone). A deployed site says where in VITE_API_URL, set on Vercel:
// for example https://beninlife-api.onrender.com
const HOST = window.location.hostname;
const SET = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_URL ?? "").replace(/\/$/, "");

export const API_URL = SET || `http://${HOST}:8000`;
export const WS_URL = API_URL.replace(/^http/, "ws");
