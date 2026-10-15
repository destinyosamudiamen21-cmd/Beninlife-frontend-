import { API_URL } from "./config";
import type { Player } from "./players";

// The sign-in token lives in this browser only. It is kept in localStorage so a player who
// comes back is still signed in; a browser that will not store it (a private window)
// simply asks them to sign in again next time.
const KEY = "beninlife.token";
let token: string | null = null;
try {
  token = window.localStorage.getItem(KEY);
} catch {
  token = null;
}

export function authToken(): string | null {
  return token;
}

function keep(next: string | null): void {
  token = next;
  try {
    if (next) window.localStorage.setItem(KEY, next);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Not stored: they stay signed in until the page closes.
  }
}

/** The header every request about the player carries. Empty when nobody is signed in. */
export function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type SignedIn = { token: string; email: string; player: Player };

async function post(path: string, body: unknown): Promise<SignedIn> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach the game server. Check your connection.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const answer = (await res.json()) as { detail?: unknown };
      if (typeof answer.detail === "string") detail = answer.detail;
      // FastAPI's own "this field is wrong" answer is a list: say which field in plain words.
      else if (Array.isArray(answer.detail)) {
        const field = String((answer.detail[0] as { loc?: unknown[] })?.loc?.slice(-1)[0] ?? "");
        detail = field === "password" ? "A password is at least 8 characters." : field === "username" ? "A username is 3 to 20 characters." : "Check what you typed.";
      }
    } catch {
      // nothing readable
    }
    throw new Error(detail || "Something went wrong. Try again.");
  }
  const signed = (await res.json()) as SignedIn;
  keep(signed.token);
  return signed;
}

export function register(email: string, password: string, username: string): Promise<SignedIn> {
  return post("/auth/register", { email, password, username });
}

export function signIn(email: string, password: string): Promise<SignedIn> {
  return post("/auth/login", { email, password });
}

/** Who this browser is signed in as, or null. */
export async function whoAmI(): Promise<SignedIn | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/auth/me`, { headers: authHeaders() });
    if (res.status === 401) {
      keep(null);
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as SignedIn;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  const was = authHeaders();
  keep(null);
  try {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", headers: was });
  } catch {
    // Signed out here either way.
  }
}
