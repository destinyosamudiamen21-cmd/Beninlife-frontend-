import { useEffect, useRef, useState } from "react";
import { WS_URL } from "../api/config";
import type { NetPlayer, RosterEntry } from "./types";

const MAX_RETRY_MS = 10_000;
const CLOSE_REPLACED = 4001;
const CLOSE_NOT_FOUND = 4404;

/** Where the player is: out on the street, or inside their own house. */
export type Place = "street" | "home";

type ServerMessage =
  | { type: "roster"; players: RosterEntry[] }
  | { type: "snapshot"; players: NetPlayer[] };

export function useWorldSocket(playerId: string) {
  const socketRef = useRef<WebSocket | null>(null);
  const playersRef = useRef<Map<string, NetPlayer>>(new Map());
  const selfServerRef = useRef<NetPlayer | null>(null);
  const placeRef = useRef<Place>("street");
  const [remotes, setRemotes] = useState<RosterEntry[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retryTimer: number | undefined;
    let attempt = 0;
    let disposed = false;

    const handleMessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as ServerMessage;

      if (msg.type === "roster") {
        setRemotes(
          msg.players
            .filter((p) => p.id !== playerId)
            .sort((a, b) => a.id.localeCompare(b.id))
        );
        return;
      }

      if (msg.type === "snapshot") {
        const next = new Map<string, NetPlayer>();
        for (const p of msg.players) {
          if (p.id === playerId) selfServerRef.current = p;
          else next.set(p.id, p);
        }
        playersRef.current = next;
      }
    };

    const connect = () => {
      if (disposed) return;
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING)
      )
        return;

      const socket = new WebSocket(`${WS_URL}/ws/${playerId}`);
      ws = socket;
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
        // A new connection starts on the street. If the player is indoors, say so again.
        if (placeRef.current !== "street") {
          socket.send(
            JSON.stringify({ type: "place", place: placeRef.current })
          );
        }
      };
      socket.onmessage = handleMessage;
      socket.onclose = (event) => {
        if (ws !== socket) return; // an older socket closing must not disturb the current one
        setConnected(false);
        selfServerRef.current = null;
        if (disposed) return;
        if (event.code === CLOSE_REPLACED || event.code === CLOSE_NOT_FOUND)
          return;

        const delay = Math.min(1000 * 2 ** attempt, MAX_RETRY_MS);
        attempt += 1;
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      window.clearTimeout(retryTimer);
      attempt = 0;
      connect();
    };

    connect();
    window.addEventListener("pageshow", onPageShow);

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      window.removeEventListener("pageshow", onPageShow);
      ws?.close();
    };
  }, [playerId]);

  const sendMove = (x: number, z: number, rot: number) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "move", x, z, rot }));
    }
  };

  /** Tell the server the player went indoors or came back out, so others stop or start seeing them. */
  const sendPlace = (place: Place) => {
    placeRef.current = place;
    selfServerRef.current = null;
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "place", place }));
    }
  };

  /** The server's latest view of this player. Each snapshot is handed out once, while fresh. */
  const takeServerPosition = (): NetPlayer | null => {
    const latest = selfServerRef.current;
    selfServerRef.current = null;
    return latest;
  };

  return {
    playersRef,
    remotes,
    connected,
    sendMove,
    sendPlace,
    takeServerPosition,
  };
}
