import { useEffect, useState } from "react";
import type { Club } from "../api/club";
import type { Life } from "../api/life";
import { clubThing } from "./clubLayout";
import type { RosterEntry } from "./types";
import type { HomeLife } from "./useHomeLife";

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

/** Minutes and seconds: 754 -> "12:34". */
function clockText(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Seconds left until a moment on the page's own clock (performance.now()), counted down once a second. 0 means none. */
function useSecondsUntil(until: number): number {
  const [left, setLeft] = useState(() =>
    Math.max(0, (until - performance.now()) / 1000)
  );
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, (until - performance.now()) / 1000));
    tick();
    if (until <= performance.now()) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  return left;
}

function ClubStyles() {
  return (
    <style>{`
      /* On the left, where the name card usually is: the buttons down the right-hand side stay clear. */
      .club-top { position: absolute; left: calc(12px + env(safe-area-inset-left)); top: calc(12px + env(safe-area-inset-top)); z-index: 11;
        display: flex; align-items: stretch; background: rgba(16, 10, 26, 0.86); border: 1px solid rgba(255, 201, 74, 0.45);
        border-radius: 14px; overflow: hidden; pointer-events: none; max-width: calc(100vw - 118px); }
      .club-top div { display: flex; flex-direction: column; align-items: center; padding: 6px 14px; min-width: 0; }
      .club-top div + div { border-left: 1px solid rgba(255, 255, 255, 0.14); }
      .club-top span { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: #ffc94a; }
      .club-top strong { font-size: 14px; color: #fff; white-space: nowrap; }
      @media (max-width: 420px) { .club-top div { padding: 6px 7px; } .club-top strong { font-size: 12px; } .club-top span { font-size: 9px; } }
      .club-near { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(118px + env(safe-area-inset-bottom)); z-index: 12; }
      .club-near button { border: none; border-radius: 999px; padding: 11px 18px; font-weight: 700; font-size: 14px; white-space: nowrap;
        background: #ffc94a; color: #1f1430; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); }
      .club-quick { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(64px + env(safe-area-inset-bottom)); z-index: 12;
        display: flex; gap: 8px; max-width: calc(100vw - 16px); }
      .club-quick button { border: 1px solid rgba(255, 201, 74, 0.5); border-radius: 12px; padding: 11px 13px; font-weight: 700; font-size: 14px;
        white-space: nowrap; background: rgba(16, 10, 26, 0.88); color: #fff; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); }
      .club-quick button.here { background: #ffc94a; color: #1f1430; }
      .club-quick button:disabled { opacity: 0.5; }
      @media (max-width: 420px) { .club-quick { gap: 5px; } .club-quick button { padding: 10px 9px; font-size: 13px; } }
      .club-booth { display: flex; flex-direction: column; gap: 8px; background: #f6e7c4; border-radius: 12px; padding: 10px 12px; font-size: 13px; color: #4a3a12; }
      .club-booth strong { font-size: 15px; color: #1f2a26; }
      .club-booth button { align-self: flex-start; }
      .club-guest { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .club-toast { position: absolute; left: 50%; transform: translateX(-50%); top: calc(96px + env(safe-area-inset-top)); z-index: 13;
        max-width: 88vw; pointer-events: none; text-align: center; background: rgba(16, 10, 26, 0.92); color: #fff; border: 2px solid #ffc94a;
        border-radius: 14px; padding: 10px 16px; font-size: 15px; font-weight: 700; }
    `}</style>
  );
}

type HudProps = {
  club: Club | null;
  life: Life | null;
  money: number;
  /** Everyone in the club, counting the player. */
  online: number;
  homeLife: HomeLife;
  /** True while the player is in the middle of something, or passed out: no new buttons then. */
  tiedUp: boolean;
  onMenu: () => void;
  /** Something to shout across the top of the screen, or "". */
  toast: string;
};

/** The club's own screen furniture: the strip across the top and the four buttons along the bottom. */
export function ClubHud({
  club,
  life,
  money,
  online,
  homeLife,
  tiedUp,
  onMenu,
  toast,
}: HudProps) {
  const open = (spot: string) => {
    const thing = clubThing(spot);
    if (thing) void homeLife.openMenu(thing);
  };
  const here = homeLife.near?.key ?? "";

  return (
    <>
      <ClubStyles />
      <div className='club-top' role='status'>
        <div>
          <span>Time</span>
          <strong>{life ? life.clock.text : "—"}</strong>
        </div>
        <div>
          <span>Money</span>
          <strong>{naira(money)}</strong>
        </div>
        <div>
          <span>Visits</span>
          <strong>{club ? club.visits : "—"}</strong>
        </div>
        <div>
          <span>Online</span>
          <strong>{online}</strong>
        </div>
      </div>

      {toast && (
        <div className='club-toast' role='alert'>
          {toast}
        </div>
      )}

      {/* Standing at something that has no button of its own along the bottom (the DJ): offer it. */}
      {!tiedUp &&
        !homeLife.menu &&
        homeLife.near &&
        !["spot:dance", "spot:vip", "spot:bar"].includes(here) && (
          <div className='club-near'>
            <button
              type='button'
              onClick={() => void homeLife.openMenu()}
              disabled={homeLife.busy}
            >
              {homeLife.near.name}
            </button>
          </div>
        )}

      {/* Hidden while a list is open. (Without the player's needs no list can be drawn, so then they stay.) */}
      {!tiedUp && !(homeLife.menu && life) && (
        <div className='club-quick'>
          <button
            type='button'
            className={here === "spot:dance" ? "here" : ""}
            onClick={() => open("dance")}
            disabled={homeLife.busy}
          >
            Dance Floor
          </button>
          <button
            type='button'
            className={here === "spot:vip" ? "here" : ""}
            onClick={() => open("vip")}
            disabled={homeLife.busy}
          >
            VIP Booth
          </button>
          <button
            type='button'
            className={here === "spot:bar" ? "here" : ""}
            onClick={() => open("bar")}
            disabled={homeLife.busy}
          >
            Bar
          </button>
          <button type='button' onClick={onMenu}>
            Menu
          </button>
        </div>
      )}
    </>
  );
}

type BoothProps = {
  club: Club | null;
  /** The moment the player's booth runs out, on the page's own clock (performance.now()). 0 if they have none. */
  until: number;
  money: number;
  /** The other players in the club: the ones who can be brought in. */
  others: RosterEntry[];
  busy: boolean;
  error: string;
  onRent: () => void;
  onInvite: (player: RosterEntry) => void;
};

/** What goes at the top of the VIP list: the button that rents a booth, or the time left on it and who can be brought in. */
export function BoothCard({
  club,
  until,
  money,
  others,
  busy,
  error,
  onRent,
  onInvite,
}: BoothProps) {
  const left = useSecondsUntil(until);
  if (!club) return null;

  if (left <= 0) {
    return (
      <div className='club-booth'>
        <strong>Rent a booth · {naira(club.vip_price)}</strong>
        <span>
          Yours for {club.vip_minutes} minutes. Sit with your people, order for
          the table, spray money, and bring in friends who are in the club.
        </span>
        {error && <span className='life-why'>{error}</span>}
        <button
          type='button'
          className='primary'
          onClick={onRent}
          disabled={busy || money < club.vip_price}
        >
          {busy
            ? "…"
            : money < club.vip_price
            ? `You need ${naira(club.vip_price)}`
            : "Rent the booth"}
        </button>
      </div>
    );
  }
  return (
    <div className='club-booth'>
      <strong>Your booth · {clockText(left)} left</strong>
      {error && <span className='life-why'>{error}</span>}
      {!club.vip_host ? (
        <span>
          You are here as a guest. Whoever rented the booth can bring more
          people in.
        </span>
      ) : club.guests_left > 0 ? (
        others.length > 0 ? (
          <>
            <span>Bring a friend in ({club.guests_left} more):</span>
            {others.map((player) => (
              <div key={player.id} className='club-guest'>
                <span>@{player.username}</span>
                <button
                  type='button'
                  className='ghost'
                  onClick={() => onInvite(player)}
                  disabled={busy}
                >
                  Bring in
                </button>
              </div>
            ))}
          </>
        ) : (
          <span>
            Nobody else is in the club to bring in. Text a friend to come.
          </span>
        )
      ) : (
        <span>Your booth is full.</span>
      )}
    </div>
  );
}

type MenuProps = {
  club: Club | null;
  others: RosterEntry[];
  music: boolean;
  onMusic: () => void;
  onPhoto: () => void;
  onLeave: () => void;
  onClose: () => void;
};

/** The club's menu: who is here, the sound, a clear view for a screenshot, and the way out. */
export function ClubMenu({
  club,
  others,
  music,
  onMusic,
  onPhoto,
  onLeave,
  onClose,
}: MenuProps) {
  return (
    <div className='sheet'>
      <div className='sheet-card'>
        <div className='sheet-top'>
          <div>
            <h2>{club?.name ?? "The club"}</h2>
            <p>
              {others.length === 0
                ? "You are the only player here."
                : `${others.length + 1} players here.`}
            </p>
          </div>
          <button type='button' className='ghost' onClick={onClose}>
            Close
          </button>
        </div>
        {others.length > 0 && (
          <p className='sheet-note'>
            Here now: {others.map((player) => `@${player.username}`).join(", ")}
          </p>
        )}
        <div className='sheet-rows'>
          <div className='sheet-row'>
            <span className='sheet-name'>Music</span>
            <button type='button' className='primary' onClick={onMusic}>
              {music ? "Turn off" : "Turn on"}
            </button>
          </div>
          <div className='sheet-row'>
            <span className='sheet-name'>
              Clear the screen for a photo (8 seconds)
            </span>
            <button type='button' className='primary' onClick={onPhoto}>
              Photo
            </button>
          </div>
          <div className='sheet-row'>
            <span className='sheet-name'>Leave the club</span>
            <button type='button' className='primary' onClick={onLeave}>
              Leave
            </button>
          </div>
        </div>
        <p className='sheet-small'>
          Walk up to someone to talk. The microphone button turns voice on for
          whoever is standing with you.
        </p>
      </div>
    </div>
  );
}
