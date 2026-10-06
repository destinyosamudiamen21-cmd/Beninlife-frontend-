import { API_URL } from "./config";

/** A refusal from the game server, with the server's own explanation when it gave one. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(
      0,
      "Can't reach the game server. Check your connection."
    );
  }

  if (!res.ok) {
    // The server explains refusals in plain words ("Something is already there"), so show
    // those. A crash (500 and up) explains nothing a player can use, so it gets the general message.
    let detail = "";
    if (res.status < 500) {
      try {
        const body = (await res.json()) as { detail?: unknown };
        if (typeof body.detail === "string") detail = body.detail;
      } catch {
        // No readable explanation: fall through to the general message.
      }
    }
    throw new ApiError(
      res.status,
      detail || "Something went wrong. Try again."
    );
  }
  return (await res.json()) as T;
}

export function sendJson(method: "POST" | "PUT", body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
