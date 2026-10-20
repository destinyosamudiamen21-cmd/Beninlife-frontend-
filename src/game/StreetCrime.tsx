import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { MoveId } from "../api/arena";
import {
  fetchCrime,
  fetchStreetCars,
  sellHotCar,
  startStreetFight,
  stealCar,
  streetPunch,
  walkAway,
  type ChopShop,
  type HotCar,
  type Stolen,
  type StreetCar,
  type StreetFight,
} from "../api/crime";
import { Car } from "./Car";
import { carBox, type Box } from "./carPhysics";
import { carParts, readCarLook } from "./carShapes";
import { Character } from "./Character";
import type { DistrictData } from "./districtData";
import { newPose, setGuard, strike, type FightPose, type Hold } from "./fightMoves";
import { playerFocus } from "./focus";
import { nearestWalker, raiseEvent, sendFleeing, walkerLook, type StreetLife } from "./streetLife";

const DRAW_WITHIN = 70;       // metres: parked cars further off are not drawn (a phone draws few cars)
const CAR_REACH = 3.4;        // metres from a parked car's middle to break into it
const FIGHT_REACH = 2.4;      // metres from somebody in the crowd to square up to them
const CHOP_REACH = 14;        // metres from a chop shop to sell to it, at the wheel
const BREAK_SECONDS = 2.6;    // fiddling with the lock
const MOVE_NAMES: { id: MoveId; name: string; note: string }[] = [
  { id: "jab", name: "Jab", note: "Quick" },
  { id: "heavy", name: "Heavy", note: "Hard, slow" },
  { id: "block", name: "Guard", note: "Parry" },
  { id: "dodge", name: "Slip", note: "Dodge a heavy" },
];
const CROWD_SHOUTS = ["Wahala dey o!", "Beat am!", "Na fight! Na fight!", "Separate them!", "Oya film am!", "E don happen!"];

/** A car alarm: two tones going up and down, for a couple of seconds. */
function alarmSound(): void {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  try {
    const context = new Context();
    const tone = context.createOscillator();
    const volume = context.createGain();
    tone.type = "sawtooth";
    volume.gain.value = 0.04;
    tone.connect(volume).connect(context.destination);
    const now = context.currentTime;
    for (let i = 0; i < 10; i++) {
      tone.frequency.setValueAtTime(900, now + i * 0.28);
      tone.frequency.linearRampToValueAtTime(1500, now + i * 0.28 + 0.14);
      tone.frequency.linearRampToValueAtTime(900, now + i * 0.28 + 0.28);
    }
    tone.start();
    tone.stop(now + 2.8);
    window.setTimeout(() => void context.close(), 3200);
  } catch {
    // no sound: the words on the screen say it
  }
}

export type StreetFightState = {
  index: number;            // the walker squared up to
  x: number;
  z: number;
  rot: number;              // which way they face (towards the player)
  data: StreetFight | null; // null while the server is deciding what they do
};

type Options = {
  playerId: string;
  district: DistrictData | null;
  life: StreetLife | null;
  /** On the street, nothing over it (no map, no panel). */
  onStreet: boolean;
  /** Something else has the player's hands full: no new buttons. */
  busy: boolean;
  /** The car being driven: its id (below zero for a stolen one), or null on foot. */
  drivingId: number | null;
  /** The spots in this district standing empty: somebody drove off in the car (from the live world). */
  taken: readonly number[];
  onMoney: (money: number) => void;
  flash: (text: string) => void;
  shout: (text: string) => void;
  /** At the wheel of a stolen car: the game puts them in it. */
  onStolen: (stolen: Stolen) => Promise<void>;
  /** The stolen car is gone from under them (sold). */
  onCarGone: () => void;
};

/**
 * The rough side of the street, as the page sees it: the cars parked along the side streets
 * and whether the player is standing at one, the people in the crowd and whether the
 * player has squared up to one, the chop shops, and how wanted they are.
 */
export function useStreetCrime(o: Options) {
  const { playerId, district, life, onStreet, drivingId, taken } = o;
  const [cars, setCars] = useState<StreetCar[]>([]);
  const [stars, setStars] = useState(0);
  const [hot, setHot] = useState<HotCar | null>(null);
  const [chops, setChops] = useState<ChopShop[]>([]);
  const [nearCar, setNearCar] = useState<StreetCar | null>(null);
  const [nearChop, setNearChop] = useState<ChopShop | null>(null);
  const [nearWalker, setNearWalker] = useState(-1);
  const [breaking, setBreaking] = useState(0);
  const [fight, setFight] = useState<StreetFightState | null>(null);
  const [working, setWorking] = useState(false);
  const me = useMemo<FightPose>(() => newPose(), []);
  const them = useMemo<FightPose>(() => newPose(), []);
  const latest = useRef(o);
  latest.current = o;

  // The cars on this district's side streets, and what the server knows of this player.
  const districtId = district?.id;
  useEffect(() => {
    if (!districtId) return;
    let live = true;
    fetchStreetCars(districtId).then((loaded) => live && setCars(loaded.cars)).catch(() => setCars([]));
    return () => {
      live = false;
    };
  }, [districtId]);
  useEffect(() => {
    let live = true;
    fetchCrime(playerId)
      .then((crime) => {
        if (!live) return;
        setStars(crime.stars);
        setHot(crime.hot_car);
        setChops(crime.chops);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [playerId]);

  const takenSet = useMemo(() => new Set(taken), [taken]);
  const standing = useMemo(() => cars.filter((car) => !takenSet.has(car.i)), [cars, takenSet]);
  const standingRef = useRef(standing);
  standingRef.current = standing;
  /** The parked cars as solid boxes, for walking and driving into. */
  const boxes = useCallback((): Box[] => standingRef.current.map((car) => {
    const shape = carParts(readCarLook(car.look).model);
    return carBox(car.x, car.z, car.rot, shape.length, shape.width);
  }), []);

  // What the player is standing at, looked at a few times a second.
  const onFoot = drivingId === null;
  useEffect(() => {
    if (!onStreet) {
      setNearCar(null);
      setNearChop(null);
      setNearWalker(-1);
      return;
    }
    const check = () => {
      const x = playerFocus.x, z = playerFocus.z;
      let car: StreetCar | null = null;
      if (onFoot) {
        let best = CAR_REACH;
        for (const one of standingRef.current) {
          const gap = Math.hypot(one.x - x, one.z - z);
          if (gap < best) {
            best = gap;
            car = one;
          }
        }
      }
      setNearCar((was) => (was?.i === car?.i ? was : car));
      const chop = !onFoot && hot && drivingId === hot.car_id
        ? chops.find((shop) => shop.district === districtId && Math.hypot(shop.x - x, shop.z - z) < CHOP_REACH) ?? null
        : null;
      setNearChop((was) => (was?.id === chop?.id ? was : chop));
      setNearWalker(onFoot && life && !car ? nearestWalker(life, x, z, FIGHT_REACH) : -1);
    };
    check();
    const timer = window.setInterval(check, 250);
    return () => window.clearInterval(timer);
  }, [onStreet, onFoot, hot, drivingId, chops, districtId, life]);

  // ---- breaking into a car ----
  const breakIn = useCallback(() => {
    const car = nearCar;
    if (!car || !district || breaking > 0 || working) return;
    const fromX = playerFocus.x, fromZ = playerFocus.z;
    const started = performance.now();
    setBreaking(0.01);
    const timer = window.setInterval(() => {
      const moved = Math.hypot(playerFocus.x - fromX, playerFocus.z - fromZ) > 1.6;
      if (moved || latest.current.busy) {
        window.clearInterval(timer);
        setBreaking(0);
        latest.current.flash("You walked away from the car.");
        return;
      }
      const done = (performance.now() - started) / 1000 / BREAK_SECONDS;
      if (done < 1) {
        setBreaking(Math.max(0.01, done));
        return;
      }
      window.clearInterval(timer);
      setBreaking(0);
      setWorking(true);
      stealCar(playerId, district.id, car.i)
        .then(async (stolen) => {
          setStars(stolen.stars);
          if (!stolen.ok) {
            alarmSound();
            if (life) raiseEvent(life, "alarm", car.x, car.z, 6);
            latest.current.shout(stolen.message);
            return;
          }
          setHot({ car_id: stolen.car_id, look: stolen.look, model: stolen.model, worth: stolen.worth });
          await latest.current.onStolen(stolen);
          latest.current.flash(stolen.message);
        })
        .catch((error: unknown) => latest.current.flash(error instanceof Error ? error.message : "It would not open."))
        .finally(() => setWorking(false));
    }, 100);
  }, [nearCar, district, breaking, working, playerId, life]);

  const sell = useCallback(async () => {
    if (working) return;
    setWorking(true);
    try {
      const sold = await sellHotCar(playerId);
      setHot(null);
      latest.current.onMoney(sold.money);
      latest.current.onCarGone();
      latest.current.shout(sold.message);
    } catch (error) {
      latest.current.flash(error instanceof Error ? error.message : "They would not buy it.");
    } finally {
      setWorking(false);
    }
  }, [working, playerId]);

  // ---- a fight ----
  const squareUp = useCallback(async () => {
    if (!life || nearWalker < 0 || fight || working) return;
    const index = nearWalker;
    const walker = life.walkers[index];
    walker.held = true;
    const rot = Math.atan2(playerFocus.x - walker.x, playerFocus.z - walker.z);
    setFight({ index, x: walker.x, z: walker.z, rot, data: null });
    setWorking(true);
    try {
      const data = await startStreetFight(playerId, walker.x, walker.z, walkerLook(life, index));
      setStars(data.stars);
      latest.current.onMoney(data.money);
      if (data.reaction === "fight") {
        setGuard(me, true);
        setGuard(them, true);
        raiseEvent(life, "fight", (walker.x + playerFocus.x) / 2, (walker.z + playerFocus.z) / 2, 40);
        setFight({ index, x: walker.x, z: walker.z, rot, data });
      } else {
        // They ran, or begged and went: either way they are off.
        sendFleeing(life, index, playerFocus.x, playerFocus.z, data.reaction === "run" ? 7 : 4);
        setFight(null);
        latest.current.shout(data.lines.filter(Boolean).slice(0, 2).join(" "));
      }
    } catch (error) {
      walker.held = false;
      setFight(null);
      latest.current.flash(error instanceof Error ? error.message : "Not now.");
    } finally {
      setWorking(false);
    }
  }, [life, nearWalker, fight, working, playerId, me, them]);

  const punch = useCallback(async (move: MoveId) => {
    if (!fight?.data || fight.data.over || working) return;
    setWorking(true);
    try {
      const data = await streetPunch(playerId, move);
      const round = data.fight;
      if (round) {
        if (round.your_move) strike(me, round.your_move);
        if (round.their_move) strike(them, round.their_move);
        window.setTimeout(() => {
          if (round.them_hurt) strike(them, "hit");
          if (round.you_hurt) strike(me, "hit");
        }, 320);
      }
      if (data.over) {
        window.setTimeout(() => {
          if (data.result === "win") {
            strike(them, "ko");
            strike(me, "win");
          } else if (data.result === "loss") {
            strike(me, "ko");
            strike(them, "win");
          }
        }, 650);
        latest.current.onMoney(data.money);
      }
      setStars(data.stars);
      if (life) raiseEvent(life, "fight", fight.x, fight.z, data.over ? 6 : 30);
      setFight({ ...fight, data });
    } catch (error) {
      latest.current.flash(error instanceof Error ? error.message : "Try again.");
    } finally {
      setWorking(false);
    }
  }, [fight, working, playerId, me, them, life]);

  const giveUp = useCallback(async () => {
    if (!fight?.data || working) return;
    setWorking(true);
    try {
      const data = await walkAway(playerId);
      setFight({ ...fight, data });
    } catch {
      setFight(null);
    } finally {
      setWorking(false);
    }
  }, [fight, working, playerId]);

  /** The fight is over and seen: everyone goes on their way. */
  const closeFight = useCallback(() => {
    if (!fight) return;
    setGuard(me, false);
    setGuard(them, false);
    if (life) sendFleeing(life, fight.index, playerFocus.x, playerFocus.z, 5);
    setFight(null);
  }, [fight, life, me, them]);

  // A fight left behind (the player went indoors, or away) lets the person go.
  useEffect(() => {
    if (onStreet || !fight) return;
    if (life) life.walkers[fight.index].held = false;
    setFight(null);
  }, [onStreet, fight, life]);

  // Facing each other, the player held in place, the camera off to the side.
  const hold = useMemo<Hold | null>(() => {
    if (!fight) return null;
    const x = playerFocus.x, z = playerFocus.z;
    return {
      x, z, y: 0, rot: Math.atan2(fight.x - x, fight.z - z),
      lookX: (x + fight.x) / 2, lookZ: (z + fight.z) / 2, lookY: 1.1, distance: 5.2, height: 2.4, side: 1.6,
    };
  }, [fight]);

  return {
    cars: standing, boxes, stars, setStars, hot, setHot, chops, nearCar, nearChop, nearWalker, breaking, fight, working,
    me, them, hold, breakIn, sell, squareUp, punch, giveUp, closeFight,
    /** Busy with a fight: no walking off, no other buttons. */
    fighting: fight !== null,
    /** The stolen car is gone (towed, or the police have it). */
    loseHot: () => setHot(null),
  };
}

export type StreetCrime = ReturnType<typeof useStreetCrime>;

// ---- what is drawn ----------------------------------------------------------------------

/** The cars parked on the side streets: only the ones near the player are drawn. */
export function StreetCars({ cars }: { cars: readonly StreetCar[] }) {
  const groups = useRef(new Map<number, Group>());
  useFrame(() => {
    for (const car of cars) {
      const group = groups.current.get(car.i);
      if (group) group.visible = Math.hypot(car.x - playerFocus.x, car.z - playerFocus.z) < DRAW_WITHIN;
    }
  });
  return (
    <>
      {cars.map((car) => (
        <group
          key={car.i}
          ref={(group: Group | null) => {
            if (group) groups.current.set(car.i, group);
            else groups.current.delete(car.i);
          }}
          position={[car.x, 0, car.z]}
          rotation-y={car.rot}
          visible={false}
        >
          <Car look={car.look} />
        </group>
      ))}
    </>
  );
}

/** Whoever the player has squared up to, drawn in full, fighting. */
export function StreetOpponent({ fight, pose }: { fight: StreetFightState; pose: FightPose }) {
  const still = useRef(0);
  const look = fight.data?.look;
  if (!look) return null;
  return (
    <group position={[fight.x, 0, fight.z]} rotation-y={fight.rot}>
      <Character speedRef={still} look={look} fight={pose} />
    </group>
  );
}

// ---- the buttons and the panel --------------------------------------------------------

function Stars({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="wanted-stars" role="status" aria-label={`Wanted: ${count} of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < count ? "on" : ""}>★</span>
      ))}
    </div>
  );
}

type HudProps = {
  crime: StreetCrime;
  /** Nothing else on screen wants the bottom of it. */
  free: boolean;
  /** The chase is on: the stars flash. */
  chasing: boolean;
  money: number;
};

/** The stars, the "break in" and "fight" buttons, the chop shop, and the fight itself. */
export function CrimeHud({ crime, free, chasing, money }: HudProps) {
  const { fight } = crime;
  const shout = useMemo(() => CROWD_SHOUTS[Math.floor(Math.random() * CROWD_SHOUTS.length)], [fight?.data?.fight?.exchange]); // eslint-disable-line react-hooks/exhaustive-deps
  const car = crime.nearCar;
  const model = car ? readCarLook(car.look).model : "";
  return (
    <>
      <style>{`
        .wanted-stars { position: absolute; z-index: 14; left: 50%; transform: translateX(-50%); top: calc(108px + env(safe-area-inset-top));
          display: flex; gap: 2px; padding: 4px 8px; border-radius: 10px; background: rgba(12, 12, 16, 0.78); pointer-events: none; }
        .wanted-stars span { font-size: 20px; line-height: 1; color: rgba(255, 255, 255, 0.22); }
        .wanted-stars span.on { color: #ffd23f; text-shadow: 0 0 6px rgba(255, 210, 63, 0.8); }
        .wanted-stars.chasing span.on { animation: wanted-blink 0.6s steps(1) infinite; }
        @keyframes wanted-blink { 50% { color: #ff4d4d; } }
        @media (prefers-reduced-motion: reduce) { .wanted-stars.chasing span.on { animation: none; } }
        .crime-actions { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(132px + env(safe-area-inset-bottom)); z-index: 12;
          display: flex; gap: 8px; max-width: calc(100vw - 24px); }
        .crime-actions button { border: 0; border-radius: 999px; padding: 11px 16px; font: 800 14px/1.2 system-ui, sans-serif; white-space: nowrap;
          background: #1c1512; color: #f6efe0; border: 2px solid #c8372d; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); cursor: pointer; }
        .crime-actions button.sell { border-color: #2fae5a; background: #12301f; }
        .crime-actions button:disabled { opacity: 0.55; }
        .crime-break { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(132px + env(safe-area-inset-bottom)); z-index: 13;
          width: min(300px, 80vw); padding: 10px 12px; border-radius: 12px; background: rgba(16, 12, 10, 0.9); color: #fff; font: 700 13px/1.3 system-ui, sans-serif; }
        .crime-break i { display: block; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.15); margin-top: 6px; overflow: hidden; }
        .crime-break i b { display: block; height: 100%; background: #c8372d; }
        .street-fight { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(14px + env(safe-area-inset-bottom)); z-index: 26;
          width: min(440px, calc(100vw - 20px)); background: #17110e; color: #f6efe0; border: 2px solid #c8372d; border-radius: 16px;
          padding: 12px; font: 600 13px/1.35 system-ui, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,0.45); }
        .street-fight h3 { margin: 0 0 6px; font-size: 15px; display: flex; justify-content: space-between; gap: 8px; }
        .street-fight h3 small { font-weight: 600; opacity: 0.7; }
        .sf-bars { display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; align-items: center; font-size: 12px; margin-bottom: 8px; }
        .sf-bar { height: 9px; border-radius: 5px; background: rgba(255,255,255,0.12); overflow: hidden; }
        .sf-bar b { display: block; height: 100%; background: #2fae5a; transition: width 0.3s; }
        .sf-bar.them b { background: #e0533d; }
        .sf-said { min-height: 34px; margin: 6px 0; }
        .sf-said p { margin: 0 0 2px; }
        .sf-hint { color: #ffd23f; font-size: 12px; margin: 2px 0 8px; }
        .sf-moves { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
        .sf-moves button { border: 0; border-radius: 10px; padding: 9px 4px; background: #f6efe0; color: #1c1512; font-weight: 800; cursor: pointer; }
        .sf-moves button small { display: block; font-weight: 600; font-size: 10px; opacity: 0.7; }
        .sf-moves button:disabled { opacity: 0.5; }
        .sf-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; gap: 8px; }
        .sf-foot button { border: 0; border-radius: 999px; padding: 8px 14px; font-weight: 800; background: #3a2c22; color: #f6efe0; cursor: pointer; }
        .sf-foot button.go { background: #ffd23f; color: #1c1512; }
        .sf-crowd { font-style: italic; opacity: 0.75; font-size: 12px; }
      `}</style>
      <div className={chasing ? "wanted-stars chasing" : "wanted-stars"} style={crime.stars > 0 ? undefined : { display: "none" }}>
        <Stars count={crime.stars} />
      </div>

      {free && !fight && crime.breaking > 0 && (
        <div className="crime-break" role="status">
          Breaking into the car… keep still.
          <i>
            <b style={{ width: `${Math.round(crime.breaking * 100)}%` }} />
          </i>
        </div>
      )}
      {free && !fight && crime.breaking === 0 && (car || crime.nearWalker >= 0 || crime.nearChop) && (
        <div className="crime-actions">
          {car && (
            <button type="button" onClick={crime.breakIn} disabled={crime.working}>
              Break into the {car?.name || model.replace(/_/g, " ")}
            </button>
          )}
          {!car && crime.nearWalker >= 0 && (
            <button type="button" onClick={() => void crime.squareUp()} disabled={crime.working}>
              Square up to them
            </button>
          )}
          {crime.nearChop && crime.hot && (
            <button type="button" className="sell" onClick={() => void crime.sell()} disabled={crime.working}>
              Sell it to {crime.nearChop.name}: ₦{crime.hot.worth.toLocaleString()}
            </button>
          )}
        </div>
      )}

      {fight?.data?.fight && (
        <div className="street-fight" role="dialog" aria-label={`Fight with ${fight.data.name}`}>
          <h3>
            <span>{fight.data.name}</span>
            <small>₦{money.toLocaleString()} on you</small>
          </h3>
          <div className="sf-bars">
            <span>You</span>
            <span className="sf-bar">
              <b style={{ width: `${Math.round((100 * fight.data.fight.you.health) / fight.data.fight.you.max_health)}%` }} />
            </span>
            <span>Them</span>
            <span className="sf-bar them">
              <b style={{ width: `${Math.round((100 * fight.data.fight.them.health) / fight.data.fight.them.max_health)}%` }} />
            </span>
          </div>
          <div className="sf-said" aria-live="polite">
            {(fight.data.over ? fight.data.lines : fight.data.fight.said).slice(-3).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          {!fight.data.over && fight.data.fight.hint && <p className="sf-hint">{fight.data.fight.hint}</p>}
          {!fight.data.over && (
            <div className="sf-moves">
              {MOVE_NAMES.map((move) => (
                <button key={move.id} type="button" onClick={() => void crime.punch(move.id)} disabled={crime.working}>
                  {move.name}
                  <small>{move.note}</small>
                </button>
              ))}
            </div>
          )}
          <div className="sf-foot">
            <span className="sf-crowd">The crowd: “{shout}”</span>
            {fight.data.over ? (
              <button type="button" className="go" onClick={crime.closeFight}>
                {fight.data.result === "win" ? "Take it and go" : "Get up"}
              </button>
            ) : (
              <button type="button" onClick={() => void crime.giveUp()} disabled={crime.working}>
                Back off
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
