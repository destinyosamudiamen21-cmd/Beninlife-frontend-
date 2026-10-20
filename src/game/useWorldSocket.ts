import { useCallback, useEffect, useRef, useState } from "react";
import { authToken } from "../api/auth";
import { WS_URL } from "../api/config";
import type { NetPlayer, ParkedCar, RosterEntry, WorldEvent } from "./types";

const MAX_RETRY_MS = 10_000;
const CLOSE_REPLACED = 4001;
const CLOSE_NOT_FOUND = 4404;
const CLOSE_SIGN_IN = 4401; // the server wants a sign-in this page does not have: trying again will not help

/**
 * Where the player is: out on the street, inside their own house, somewhere nobody else
 * is (the fight club: a room each to themselves), or in a room everyone shares, which is
 * "venue:" and its name ("venue:club").
 */
export type Place = "street" | "home" | "private" | `venue:${string}`;

// The server says which kind of place each list is about, in the same words.
type ServerMessage =
  | { type: "roster"; place?: string; players: RosterEntry[]; cars?: ParkedCar[]; street_taken?: number[] }
  | { type: "snapshot"; place?: string; players: NetPlayer[] }
  | WorldEvent;

const SETTLE_MS = 1500; // after walking through a door, how long the server's idea of where we stand is not trusted

/**
 * The live connection to the world: who is here, where they are, and what is said.
 * `onEvent` is called for everything else the server sends (speech, messages, call set-up).
 */
export function useWorldSocket(playerId: string, onEvent?: (event: WorldEvent) => void) {
  const socketRef = useRef<WebSocket | null>(null);
  const playersRef = useRef<Map<string, NetPlayer>>(new Map());
  const selfServerRef = useRef<NetPlayer | null>(null);
  const placeRef = useRef<Place>("street");
  const quietUntil = useRef(0); // the server's word on where we stand is ignored until then
  const [remotes, setRemotes] = useState<RosterEntry[]>([]);
  const [parked, setParked] = useState<ParkedCar[]>([]);   // the cars standing on this street, ours too
  const [streetTaken, setStreetTaken] = useState<number[]>([]);   // parked street cars somebody drove off in
  const [connected, setConnected] = useState(false);

  // Kept in a ref so the socket always calls the newest version of it without reconnecting.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retryTimer: number | undefined;
    let attempt = 0;
    let disposed = false;
    let opened = false; // has this page been connected before?

    const handleMessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as ServerMessage;

      // News of the place we have just left can still be on its way when we walk through
      // a door. Who is in the club is not who is in the street: drop what is not about here.
      if ((msg.type === "roster" || msg.type === "snapshot") && msg.place !== undefined && msg.place !== placeRef.current) return;

      if (msg.type === "roster") {
        setRemotes(
          msg.players
            .filter((p) => p.id !== playerId)
            .sort((a, b) => a.id.localeCompare(b.id)),
        );
        setParked(msg.cars ?? []);
        setStreetTaken((was) => {
          const now = msg.street_taken ?? [];
          return was.length === now.length && was.every((value, i) => value === now[i]) ? was : now;
        });
        return;
      }

      if (msg.type === "snapshot") {
        const next = new Map<string, NetPlayer>();
        for (const p of msg.players) {
          if (p.id !== playerId) next.set(p.id, p);
          else if (performance.now() >= quietUntil.current) selfServerRef.current = p;
        }
        playersRef.current = next;
        return;
      }

      onEventRef.current?.(msg);
    };

    const connect = () => {
      if (disposed) return;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

      // A page that was connected before asks to carry on where it was. A page that has
      // just been opened starts at the beginning, like the game it is about to draw.
      const query = new URLSearchParams();
      if (opened) query.set("resume", "1");
      const token = authToken();
      if (token) query.set("token", token);
      const asked = query.toString();
      const socket = new WebSocket(`${WS_URL}/ws/${playerId}${asked ? `?${asked}` : ""}`);
      ws = socket;
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        opened = true;
        // Until our own first move has reached it, the server has us wherever it put us
        // (at the door, say). We know better where we were standing.
        quietUntil.current = performance.now() + SETTLE_MS;
        setConnected(true);
        // A new connection starts on the street. If the player is indoors, say so again:
        // the server remembers where they were standing and lets them back in from there.
        if (placeRef.current !== "street") {
          socket.send(JSON.stringify({ type: "place", place: placeRef.current }));
        }
      };
      socket.onmessage = handleMessage;
      socket.onclose = (event) => {
        if (ws !== socket) return; // an older socket closing must not disturb the current one
        setConnected(false);
        selfServerRef.current = null;
        if (disposed) return;
        if (event.code === CLOSE_REPLACED || event.code === CLOSE_NOT_FOUND || event.code === CLOSE_SIGN_IN) return;

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

  const send = useCallback((message: object) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const sendMove = useCallback((x: number, z: number, rot: number) => send({ type: "move", x, z, rot }), [send]);

  /** Tell the server the player went indoors or came back out, so others stop or start seeing them. */
  const sendPlace = useCallback(
    (place: Place) => {
      placeRef.current = place;
      selfServerRef.current = null;
      quietUntil.current = performance.now() + SETTLE_MS;
      // The people who were around are not in the new place. Forget where they were, or
      // they would be drawn there for the moment before the server's next word arrives.
      playersRef.current = new Map();
      if (place !== "street") setParked([]);
      send({ type: "place", place });
    },
    [send],
  );

  /** Say something out loud. Everyone near enough hears it. */
  const say = useCallback((text: string) => send({ type: "say", text }), [send]);

  /** Pass one step of setting up a voice call to a player standing near. */
  const signal = useCallback((to: string, data: Record<string, unknown>) => send({ type: "rtc", to, data }), [send]);

  /** The server's latest view of this player. Each snapshot is handed out once, while fresh. */
  const takeServerPosition = useCallback((): NetPlayer | null => {
    const latest = selfServerRef.current;
    selfServerRef.current = null;
    return latest;
  }, []);

  return { playersRef, remotes, parked, streetTaken, connected, sendMove, sendPlace, takeServerPosition, say, signal };
}
