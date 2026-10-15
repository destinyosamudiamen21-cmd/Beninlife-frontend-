import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelAction,
  fetchActions,
  fetchLife,
  finishAction,
  startAction,
  wakeUp,
  type ActionMenu,
  type Finished,
  type Life,
} from "../api/life";
import { ApiError } from "../api/request";
import { newPose, poseMove, setGuard, strike, type FightPose, type Hold } from "./fightMoves";
import { playerFocus } from "./focus";
import { holdAt, type Near } from "./nearby";

const LATE = 0.15;           // seconds after the end to ask the server, so the first ask is rarely early
const EARLY_RETRY = 0.5;     // seconds to wait when the server says "not finished yet"
const EARLY_TRIES = 8;
const LOST_RETRY = 3;        // seconds before trying again when the server could not be reached
const LOST_TRIES = 5;
const RESULT_SECONDS = 4.5;  // how long "what you gained" stays on screen
const ERROR_SECONDS = 5;
const LOOK_EVERY = 20;       // seconds between looks at the clock while nothing is going on
const TOO_EARLY = 425;       // the server's status for "its time is not up yet"

/**
 * Everything about a player's needs and what they are doing: with the things in their
 * house, and with anything else in the world that can be used (see nearby.ts).
 */
export type HomeLife = {
  /** Needs, clock and skills as the server has them. Null until first loaded. */
  life: Life | null;
  /** The kinds of furniture that can be used. */
  usable: ReadonlySet<string>;
  /** The thing the player is standing at. */
  near: Near | null;
  setNear: (thing: Near | null) => void;
  /** The open list of what can be done with a thing, or null. */
  menu: ActionMenu | null;
  /** Where the player is stood while they use something or lie passed out, or null when they can walk. */
  hold: Hold | null;
  /** What the player's body is doing meanwhile. The same object for the life of the game: the character reads it every frame. */
  pose: FightPose;
  /** Goes up by one each time a timer is started: the progress bar restarts on it. */
  run: number;
  /** What the last thing they finished did to them, shown for a few seconds. */
  result: Finished | null;
  /** Passed out: the moment "Wake up" will start to work, on the page's own clock (performance.now()). Null when on their feet. */
  wakeAt: number | null;
  /** True while waiting for the server. */
  busy: boolean;
  error: string;
  /** Ask the server how the player is. Safe to call at any time. */
  load: () => Promise<void>;
  /** Open the list for the thing the player is standing at, or for the one given (a button that names it). */
  openMenu: (thing?: Near) => Promise<void>;
  closeMenu: () => void;
  /** Ask the server for the open list again: something that stood in the way may have changed. */
  refreshMenu: () => void;
  start: (action: string) => Promise<void>;
  /** Stop part way. Nothing is gained. */
  stop: () => Promise<void>;
  /** Get up after passing out. */
  wake: () => Promise<void>;
  /** The player walked out of wherever they were. */
  leave: () => void;
};

type Callbacks = {
  /** The player's money changed. */
  onMoney: (money: number) => void;
  /** Things happened since the last look: a missed class, money from home. */
  onNews?: (lines: string[]) => void;
  /** A ride put them down somewhere else in the district. */
  onMoved?: (spot: { district: string; x: number; z: number }) => void;
  /** Something was finished: other screens may want to look again. */
  onDone?: (finished: Finished) => void;
};

function words(problem: unknown, fallback: string): string {
  return problem instanceof Error ? problem.message : fallback;
}

function status(problem: unknown): number {
  return problem instanceof ApiError ? problem.status : -1;
}

/**
 * A player's needs, and the order things happen in when they use something: pick it,
 * wait out its time, collect what it gives. The server keeps the time and decides what
 * is given; this only waits and shows it.
 */
export function useHomeLife(playerId: string, callbacks: Callbacks): HomeLife {
  const [life, setLife] = useState<Life | null>(null);
  const [near, setNearState] = useState<Near | null>(null);
  const [menu, setMenu] = useState<ActionMenu | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<Finished | null>(null);
  const [wakeAt, setWakeAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // One pose for the life of the game: the character reads it every frame, so it is changed in place.
  const pose = useMemo(newPose, []);
  const alive = useRef(true);
  const waiting = useRef<number | null>(null);      // the timer that ends the action in progress
  const clearing = useRef<number | null>(null);     // the timer that takes the result or error off screen
  const working = useRef(false);                    // a request is in flight (a ref, so two taps cannot both pass)
  const version = useRef(0);                        // goes up each time the server's word on the player is taken in
  const chosen = useRef<Near | null>(null);         // the thing the open list is for
  const collect = useRef<(earlyTries: number, lostTries: number) => void>(() => {});
  // Kept in a ref so nothing below has to be rebuilt when the game hands in new functions.
  const told = useRef(callbacks);
  useEffect(() => {
    told.current = callbacks;
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (waiting.current !== null) window.clearTimeout(waiting.current);
      if (clearing.current !== null) window.clearTimeout(clearing.current);
    };
  }, []);

  // The same set for as long as the list says the same thing, so nothing downstream
  // is rebuilt every time a need changes.
  const usableKinds = life ? life.usable.join(",") : "";
  const usable = useMemo(() => new Set(usableKinds ? usableKinds.split(",") : []), [usableKinds]);

  /** Show a result or an error for a few seconds, then take it away. */
  const showBriefly = useCallback((finished: Finished | null, problem: string) => {
    if (clearing.current !== null) window.clearTimeout(clearing.current);
    setResult(finished);
    setError(problem);
    clearing.current = window.setTimeout(
      () => {
        clearing.current = null;
        if (!alive.current) return;
        setResult(null);
        setError("");
      },
      (finished ? RESULT_SECONDS : ERROR_SECONDS) * 1000,
    );
  }, []);

  /** Wait `seconds`, then ask the server for what the action gives. */
  const waitFor = useCallback((seconds: number, earlyTries: number, lostTries: number) => {
    if (waiting.current !== null) window.clearTimeout(waiting.current);
    waiting.current = window.setTimeout(() => {
      waiting.current = null;
      collect.current(earlyTries, lostTries);
    }, Math.max(0, seconds) * 1000);
  }, []);

  /** Take in what the server says about the player, and wait out anything in progress. */
  const takeIn = useCallback(
    (loaded: Life) => {
      version.current += 1;
      setLife(loaded);
      told.current.onMoney(loaded.money);
      if (loaded.news.length > 0) told.current.onNews?.(loaded.news);

      // What their body is doing: flat on the floor, dancing, sitting, or nothing.
      const out = loaded.out_left !== null;
      const move = out ? "ko" : poseMove(loaded.doing?.pose ?? "");
      if (move) {
        if (pose.move !== move) strike(pose, move);
      } else if (pose.move) {
        setGuard(pose, false);
      }
      setWakeAt(out ? performance.now() + (loaded.out_left ?? 0) * 1000 : null);

      if (loaded.doing || out) {
        // Busy or out cold: they stay where they are. (After a refresh nothing is holding
        // them yet, so hold them where they stand.)
        setHold((current) => current ?? holdAt(null, playerFocus.x, playerFocus.z));
      } else {
        setHold(null);
      }
      if (loaded.doing) {
        setRun((count) => count + 1);
        waitFor(loaded.doing.seconds_left + LATE, EARLY_TRIES, LOST_TRIES);
      } else if (waiting.current !== null) {
        // Nothing is in progress, so nothing may be waited for.
        window.clearTimeout(waiting.current);
        waiting.current = null;
      }
    },
    [pose, waitFor],
  );

  // Kept in a ref so the timer always calls the newest version of it.
  useEffect(() => {
    collect.current = (earlyTries, lostTries) => {
      finishAction(playerId)
        .then((finished) => {
          if (!alive.current) return;
          takeIn(finished.life);
          showBriefly(finished, "");
          if (finished.moved) told.current.onMoved?.(finished.moved);
          told.current.onDone?.(finished);
        })
        .catch((problem: unknown) => {
          if (!alive.current) return;
          const code = status(problem);
          if (code === TOO_EARLY && earlyTries > 0) {
            waitFor(EARLY_RETRY, earlyTries - 1, lostTries);
            return;
          }
          if (code === 409) {
            // The server has nothing in progress: it was finished or stopped elsewhere.
            fetchLife(playerId).then((loaded) => alive.current && takeIn(loaded)).catch(() => alive.current && setHold(null));
            return;
          }
          showBriefly(null, words(problem, "Could not finish that."));
          if (lostTries > 0) {
            waitFor(LOST_RETRY, earlyTries, lostTries - 1);
            return;
          }
          // Whatever went wrong, the player is never left standing there unable to move.
          setHold(null);
          setGuard(pose, false);
        });
    };
  });

  const load = useCallback(async () => {
    const asked = version.current;
    try {
      const loaded = await fetchLife(playerId);
      // A slow answer can arrive after the player has started something. It describes
      // the moment before that, so it is thrown away: acting on it would stop the wait
      // for an action the server is still running.
      if (alive.current && version.current === asked) takeIn(loaded);
    } catch (problem) {
      // The game still works without it: the bars are just not shown.
      console.error("Could not load the player's needs:", problem);
    }
  }, [playerId, takeIn]);

  // The player's clock creeps forward while they walk about, and things come due on it
  // (a class, an allowance). Looking now and then keeps the clock on screen right and
  // brings the news. A hidden tab does not look: time away is not lived.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden && waiting.current === null && !working.current) void load();
    }, LOOK_EVERY * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  const setNear = useCallback((thing: Near | null) => setNearState(thing), []);

  const openMenu = useCallback(
    async (thing?: Near) => {
      const target = thing ?? near;
      if (!target || working.current) return;
      working.current = true;
      setBusy(true);
      try {
        const loaded = await fetchActions(playerId, target.target);
        if (!alive.current) return;
        chosen.current = target;
        setMenu(loaded);
      } catch (problem) {
        if (alive.current) showBriefly(null, words(problem, "Could not use that."));
      } finally {
        working.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [near, playerId, showBriefly],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const refreshMenu = useCallback(() => {
    const thing = chosen.current;
    if (!thing) return;
    fetchActions(playerId, thing.target)
      .then((loaded) => alive.current && setMenu((open) => (open ? loaded : open)))
      .catch(() => {});
  }, [playerId]);

  const start = useCallback(
    async (action: string) => {
      const thing = chosen.current;
      if (!menu || !thing || working.current) return;
      if ((!thing.standAt || thing.key.startsWith("item:")) && near?.key !== thing.key) {
        // They walked off while the list was open. Being held "at the sofa" from across the room would look wrong.
        setMenu(null);
        showBriefly(null, `Go back to ${thing.name} first.`);
        return;
      }
      working.current = true;
      setBusy(true);
      try {
        const started = await startAction(playerId, thing.target, action);
        if (!alive.current) return;
        // Stand them where the thing says, or where they are, facing it.
        setHold(started.doing ? holdAt(thing, playerFocus.x, playerFocus.z, action) : null);
        if (clearing.current !== null) window.clearTimeout(clearing.current);
        setResult(null);
        setError("");
        setMenu(null);
        takeIn(started);
      } catch (problem) {
        if (!alive.current) return;
        showBriefly(null, words(problem, "Could not start that."));
        const code = status(problem);
        if (code === 409 || code === 0) {
          // The server says something is already in progress (another tab, perhaps), or they
          // are not where the thing is, or the answer never arrived and it may have started.
          // Ask how things stand, so the wait and its Stop button appear if there is one.
          setMenu(null);
          void load();
          return;
        }
        // What stood in the way may have changed (money, the pot): show the list afresh.
        fetchActions(playerId, thing.target).then((loaded) => alive.current && setMenu(loaded)).catch(() => {});
      } finally {
        working.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [load, menu, near, playerId, showBriefly, takeIn],
  );

  const stop = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const stopped = await cancelAction(playerId);
      if (alive.current) takeIn(stopped);
    } catch (problem) {
      if (alive.current) showBriefly(null, words(problem, "Could not stop."));
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }, [playerId, showBriefly, takeIn]);

  const wake = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const woken = await wakeUp(playerId);
      if (alive.current) takeIn(woken);
    } catch (problem) {
      if (!alive.current) return;
      if (status(problem) === TOO_EARLY) {
        // The page's clock ran ahead of the server's. Ask how long is really left.
        void load();
      } else {
        showBriefly(null, words(problem, "Could not get up."));
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }, [load, playerId, showBriefly, takeIn]);

  const leave = useCallback(() => {
    setNearState(null);
    setMenu(null);
    chosen.current = null;
  }, []);

  return {
    life, usable, near, setNear, menu, hold, pose, run, result, wakeAt, busy, error,
    load, openMenu, closeMenu, refreshMenu, start, stop, wake, leave,
  };
}
