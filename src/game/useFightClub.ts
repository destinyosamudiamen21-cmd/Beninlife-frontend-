import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchClub,
  giveUpFight,
  startFight,
  throwMove,
  trainAtClub,
  type Club,
  type Fight,
  type MoveId,
} from "../api/arena";
import { ApiError } from "../api/request";
import { bagHold, fightHold, type Near } from "./arenaLayout";
import {
  newPose,
  setGuard,
  strike,
  type FightMove,
  type FightPose,
  type Hold,
} from "./fightMoves";

// How an exchange is played out, in seconds after the server answers.
const IMPACT = 0.28; // the punches land: health drops, heads snap back
const AFTERMATH = 0.75; // someone goes down, someone raises their arms
const NEXT_MOVE = 0.95; // the buttons come back
const BAG_PUNCHES: FightMove[] = ["jab", "jab", "heavy", "jab", "jab", "heavy"];
const BAG_BEAT = 0.6; // seconds from one punch on the bag to the next
const NOTICE_SECONDS = 5;

export type ClubSheet = "coach" | "ladder" | null;

/** Everything the fight club needs to remember while the player is inside it. */
export type FightClub = {
  /** The club as the server has it: the coach, the ladder, the player's record. */
  club: Club | null;
  /** The fight going on, as it should be shown right now. */
  fight: Fight | null;
  /** What the player is standing next to. */
  near: Near;
  setNear: (near: Near) => void;
  /** Which card is open over the game. */
  sheet: ClubSheet;
  openSheet: (sheet: ClubSheet) => void;
  /** Where the player is stood while they cannot walk, or null when they can. */
  hold: Hold | null;
  /** What each fighter's body is doing. The same two objects for the whole visit. */
  you: FightPose;
  them: FightPose;
  /** True while waiting for the server or for a move to play out. */
  busy: boolean;
  /** Something the coach said, shown for a few seconds. */
  notice: string;
  error: string;
  /** Walk in. Resolves false if the club could not be opened. */
  enter: () => Promise<boolean>;
  /** Walk out: forget everything. */
  leave: () => void;
  train: () => Promise<void>;
  challenge: (opponent: string) => Promise<void>;
  throwMove: (move: MoveId) => Promise<void>;
  giveUp: () => Promise<void>;
  /** The fight is over and its result has been read. */
  finish: () => Promise<void>;
};

type Callbacks = {
  /** The player's money changed. */
  onMoney: (money: number) => void;
  /** Put the player down somewhere in the gym. */
  onPlace: (spot: { x: number; z: number }) => void;
  /** Where to put them after a fight. */
  ringside: { x: number; z: number };
};

function words(problem: unknown, fallback: string): string {
  return problem instanceof Error ? problem.message : fallback;
}

/** The server no longer has the fight (it was restarted, say): there is nothing left to finish. */
function fightIsGone(problem: unknown): boolean {
  return problem instanceof ApiError && problem.status === 409;
}

/**
 * The fight club's state and the order things happen in. The server decides every
 * result; this plays each one out: who swings, who is hit, who goes down.
 */
export function useFightClub(
  playerId: string,
  { onMoney, onPlace, ringside }: Callbacks
): FightClub {
  const [club, setClub] = useState<Club | null>(null);
  const [fight, setFight] = useState<Fight | null>(null);
  const [near, setNear] = useState<Near>(null);
  const [sheet, openSheet] = useState<ClubSheet>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const you = useMemo(newPose, []);
  const them = useMemo(newPose, []);

  // Each walk through the door is a new visit. An answer from the server that arrives
  // after the player has walked out again belongs to a visit that is over, and is dropped.
  const visit = useRef(0);
  // Everything waiting to happen. Leaving, or the page closing, cancels the lot.
  const timers = useRef<number[]>([]);
  const later = useCallback((seconds: number, work: () => void) => {
    timers.current.push(window.setTimeout(work, seconds * 1000));
  }, []);
  const cancelTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);
  useEffect(() => cancelTimers, [cancelTimers]);

  const say = useCallback(
    (text: string) => {
      setNotice(text);
      later(NOTICE_SECONDS, () =>
        setNotice((current) => (current === text ? "" : current))
      );
    },
    [later]
  );

  /** Stand both fighters in the ring, guards up. */
  const squareUp = useCallback(
    (started: Fight) => {
      setGuard(you, true);
      setGuard(them, true);
      setFight(started);
      setHold(fightHold("you"));
      openSheet(null);
    },
    [you, them]
  );

  const enter = useCallback(async () => {
    try {
      const loaded = await fetchClub(playerId);
      setClub(loaded);
      onMoney(loaded.money);
      setError("");
      setBusy(false);
      // A fight left unfinished is still on: straight back into the ring.
      if (loaded.fight) {
        squareUp(loaded.fight);
      } else {
        setFight(null);
        setHold(null);
      }
      return true;
    } catch (problem) {
      console.error("Could not open the fight club:", problem);
      return false;
    }
  }, [playerId, onMoney, squareUp]);

  const leave = useCallback(() => {
    visit.current += 1;
    cancelTimers();
    setGuard(you, false);
    setGuard(them, false);
    setClub(null);
    setFight(null);
    setHold(null);
    setNear(null);
    openSheet(null);
    setBusy(false);
    setNotice("");
    setError("");
  }, [cancelTimers, you, them]);

  const train = useCallback(async () => {
    if (busy || near?.kind !== "bag") return;
    const bag = near.bag;
    const thisVisit = visit.current;
    setBusy(true);
    setError("");
    try {
      const next = await trainAtClub(playerId);
      onMoney(next.money);
      if (visit.current !== thisVisit) return; // walked out while paying: the session is paid for, that is all
      // Paid for: now the player works the bag, and the coach speaks when they are done.
      setGuard(you, true);
      setHold(bagHold(bag));
      BAG_PUNCHES.forEach((punch, index) =>
        later(0.35 + index * BAG_BEAT, () => strike(you, punch))
      );
      later(0.35 + BAG_PUNCHES.length * BAG_BEAT + 0.3, () => {
        setGuard(you, false);
        setHold(null);
        setClub(next);
        setBusy(false);
        say(next.lines.join(" "));
      });
    } catch (problem) {
      if (visit.current !== thisVisit) return;
      setBusy(false);
      say(words(problem, "Could not train."));
    }
  }, [busy, near, playerId, onMoney, you, later, say]);

  const challenge = useCallback(
    async (opponent: string) => {
      if (busy) return;
      const thisVisit = visit.current;
      setBusy(true);
      setError("");
      try {
        const started = await startFight(playerId, opponent);
        onMoney(started.money);
        if (visit.current === thisVisit) squareUp(started);
      } catch (problem) {
        if (visit.current === thisVisit)
          setError(words(problem, "Could not start the fight."));
      } finally {
        if (visit.current === thisVisit) setBusy(false);
      }
    },
    [busy, playerId, onMoney, squareUp]
  );

  /** Out of the ring, back on the gym floor, with the club as it now stands. */
  const stepDown = useCallback(
    (next: Club | null) => {
      cancelTimers();
      setGuard(you, false);
      setGuard(them, false);
      setFight(null);
      setHold(null);
      setBusy(false);
      onPlace(ringside);
      if (next) {
        setClub(next);
        onMoney(next.money);
        say(next.lines[0] ?? "");
      }
    },
    [cancelTimers, you, them, onPlace, ringside, onMoney, say]
  );

  const finish = useCallback(async () => {
    const thisVisit = visit.current;
    setBusy(true); // one press is enough: a second must not put the player down twice
    let next: Club | null = null;
    try {
      next = await fetchClub(playerId);
    } catch (problem) {
      console.error("Could not refresh the fight club:", problem);
    }
    if (visit.current === thisVisit) stepDown(next);
  }, [playerId, stepDown]);

  const throwOne = useCallback(
    async (move: MoveId) => {
      if (busy || !fight || fight.over) return;
      setBusy(true);
      setError("");
      try {
        const next = await throwMove(playerId, move);
        // Both swing at once. The server may have changed the move: too tired, they cover up.
        if (next.your_move) strike(you, next.your_move);
        if (next.their_move) strike(them, next.their_move);
        later(IMPACT, () => {
          if (next.you_hurt) strike(you, "hit");
          if (next.them_hurt) strike(them, "hit");
          setFight(next);
          onMoney(next.money);
        });
        if (next.over) {
          later(AFTERMATH, () => {
            if (next.result === "win") {
              if (next.knockout) strike(them, "ko");
              strike(you, "win");
            } else if (next.result === "loss") {
              if (next.knockout) strike(you, "ko");
              strike(them, "win");
            }
          });
        }
        later(NEXT_MOVE, () => setBusy(false));
      } catch (problem) {
        if (fightIsGone(problem)) {
          await finish(); // nothing to fight on with: out of the ring, never stuck in it
          return;
        }
        setError(words(problem, "The bell did not ring. Try again."));
        setBusy(false);
      }
    },
    [busy, fight, playerId, you, them, later, onMoney, finish]
  );

  const giveUp = useCallback(async () => {
    if (busy || !fight || fight.over) return;
    setBusy(true);
    try {
      stepDown(await giveUpFight(playerId));
    } catch (problem) {
      if (fightIsGone(problem)) {
        await finish();
        return;
      }
      setError(words(problem, "Could not leave the ring."));
      setBusy(false);
    }
  }, [busy, fight, playerId, stepDown, finish]);

  return {
    club,
    fight,
    near,
    setNear,
    sheet,
    openSheet,
    hold,
    you,
    them,
    busy,
    notice,
    error,
    enter,
    leave,
    train,
    challenge,
    throwMove: throwOne,
    giveUp,
    finish,
  };
}
