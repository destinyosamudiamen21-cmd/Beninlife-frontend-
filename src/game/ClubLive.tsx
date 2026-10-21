import { useCallback, useEffect, useRef, useState } from "react";
import { fetchNight, orderAtClub, pickUpMoney, type ClubItem, type ClubOrder, type Night } from "../api/club";
import type { Life } from "../api/life";
import { ApiError } from "../api/request";
import { showEvent, type ShowKind } from "./clubEffects";
import { playerFocus } from "./focus";
import type { Near } from "./nearby";
import type { NetPlayer, RosterEntry } from "./types";
import type { HomeLife } from "./useHomeLife";

/** What the server tells everyone in the club as it happens. */
export type ClubEvent = {
  type: "club";
  club: string;
  kind: string;
  name: string;
  id?: string;
  text?: string;
  amount?: number;
  song?: string;
  target?: string;
  target_id?: string;
  floor?: number;
  ok?: boolean;
};

type Zone = "dance" | "vip" | "bar" | "dj" | "photo" | "people";
const ZONES: { id: Zone; label: string; icon: string }[] = [
  { id: "dance", label: "Dance floor", icon: "🪩" },
  { id: "vip", label: "VIP booth", icon: "🍾" },
  { id: "bar", label: "Bar", icon: "🍸" },
  { id: "dj", label: "DJ booth", icon: "🎧" },
  { id: "photo", label: "Photo wall", icon: "📸" },
  { id: "people", label: "People", icon: "👥" },
];
const ITEM_ICON: Record<string, string> = {
  bottle: "🍾", gold: "🥂", table: "🛋️", ace: "♠️", takeover: "👑", sneak: "🥷", song: "🎤", shoutout: "🎧", hype: "📣", spray: "💸",
};
const SONG_ICON: Record<string, string> = {
  "Burna Boy": "🦁", Wizkid: "🦅", Davido: "🔥", Asake: "🎤", Tems: "🌙", Rema: "💫", "Ayra Starr": "⭐", Olamide: "🎙️", Shallipopi: "🍬", "Seyi Vibez": "🎶",
};
// The big words across the middle when somebody spends big.
const BANNER: Record<string, string> = { ace: "ACE OF SPADES!", gold: "DORIME!", takeover: "TAKEOVER!", table: "VIP TABLE!" };

const naira = (amount: number) => `₦${amount.toLocaleString()}`;
const short = (amount: number) => (amount >= 1_000_000 ? `₦${(amount / 1_000_000).toFixed(amount % 1_000_000 ? 1 : 0)}m` : amount >= 1000 ? `₦${Math.round(amount / 1000)}k` : naira(amount));

type Banner = { big: string; sub: string; key: number };
type Shout = { title: string; sub: string; key: number };
type Flying = { key: number; left: number; delay: number; drift: number; kind: "note" | "bottle" };

type Props = {
  playerId: string;
  username: string;
  /** The club's id: "club" for the Nightclub, or the GRA club's own. */
  club: string;
  /** Where it is: "Ring Road", "GRA". */
  area: string;
  money: number;
  life: Life | null;
  others: RosterEntry[];
  playersRef: { current: Map<string, NetPlayer> };
  homeLife: HomeLife;
  /** The things in the room the dance floor and the bar are used through. */
  thingFor: (zone: "dance" | "bar") => Near | null;
  tiedUp: boolean;
  music: boolean;
  /** Where the page hands the HUD what the server says about the club. */
  news: { current: ((event: ClubEvent) => void) | null };
  onMoney: (money: number) => void;
  onMusic: () => void;
  onPhoto: () => void;
  onLeave: () => void;
  /** The daily spending limit was reached: the page offers to raise it. */
  onLimit: (message: string) => void;
  onSay: (text: string) => void;
};

/**
 * A night out, on the screen: the clock and the money across the top, the feed and the big
 * banners when somebody spends, the DJ's shout-outs, the board of the top spenders down the
 * side, and the club's own menu along the bottom, zone by zone, as in the Lagos clubs.
 */
const TUCK_KEY = "beninlife.club-menu-tucked";

function readTucked(): boolean {
  try {
    return window.localStorage.getItem(TUCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function ClubLive(props: Props) {
  const { playerId, club, money, life, others, homeLife, tiedUp, news } = props;
  const [night, setNight] = useState<Night | null>(null);
  const [zone, setZone] = useState<Zone>("vip");
  const [board, setBoard] = useState<"tonight" | "ever" | null>(null);
  const [clean, setClean] = useState(false);
  // The club's panel can be put away to watch the floor, and stays put away (or out) until
  // the player says otherwise, this visit and the next.
  const [tucked, setTuckedState] = useState(() => readTucked());
  const setTucked = (value: boolean) => {
    setTuckedState(value);
    try {
      window.localStorage.setItem(TUCK_KEY, value ? "1" : "0");
    } catch {
      // private browsing: it is only remembered until they leave
    }
  };
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const [pull, setPull] = useState(0);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [shout, setShout] = useState<Shout | null>(null);
  const [pills, setPills] = useState<{ key: number; text: string; kind: string }[]>([]);
  const [flying, setFlying] = useState<Flying[]>([]);
  const [songs, setSongs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  const [loadedAt, setLoadedAt] = useState(() => performance.now());
  const [, tick] = useState(0);
  const counter = useRef(0);
  const latest = useRef(props);
  latest.current = props;

  const load = useCallback(() => {
    fetchNight(playerId)
      .then((loaded) => {
        setNight(loaded);
        setLoadedAt(performance.now());
      })
      .catch(() => {});
  }, [playerId]);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 8000);
    const second = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(second);
    };
  }, [load]);

  /** Where somebody in the room is standing (the player, or another), for the show in the air. */
  const whereIs = useCallback((id?: string) => {
    if (!id || id === playerId) return { x: playerFocus.x, z: playerFocus.z };
    const other = latest.current.playersRef.current.get(id);
    return other ? { x: other.x, z: other.z } : { x: playerFocus.x, z: playerFocus.z };
  }, [playerId]);

  const fly = useCallback((kind: "note" | "bottle", count: number) => {
    const made: Flying[] = Array.from({ length: count }, () => ({
      key: ++counter.current, left: Math.random() * 100, delay: Math.random() * 0.9, drift: (Math.random() - 0.5) * 60, kind,
    }));
    setFlying((now) => [...now.slice(-60), ...made]);
    window.setTimeout(() => setFlying((now) => now.filter((one) => !made.includes(one))), 3600);
  }, []);

  // What the server says, as it happens: banners, shout-outs, money in the air.
  useEffect(() => {
    news.current = (event: ClubEvent) => {
      if (event.club !== club) return;
      const at = whereIs(event.id);
      const key = ++counter.current;
      if (event.kind === "sprayed_you") {
        setBanner({ big: "YOU DEY SHINE!", sub: `@${event.name} sprayed you ${naira(event.amount ?? 0)}`, key });
        fly("note", 26);
        load();
        return;
      }
      if (event.text) setPills((now) => [...now.slice(-2), { key, text: event.text!, kind: event.kind }]);
      if (BANNER[event.kind]) setBanner({ big: BANNER[event.kind], sub: event.text ?? "", key });
      if (event.kind === "shoutout") setShout({ title: `Shout-out to @${event.name}!!!`, sub: "This one goes out to you!", key });
      if (event.kind === "hype") setShout({ title: `Make some noise for @${event.name}!!!`, sub: "The hype man is on the mic", key });
      if (event.kind === "song") setShout({ title: `Now playing: ${event.song}`, sub: `Requested by @${event.name}`, key });
      if (event.kind === "spray") {
        const target = event.target_id ? whereIs(event.target_id) : at;
        showEvent("spray", target.x, target.z, event.amount ?? 0, event.name);
        fly("note", Math.min(40, 8 + Math.round((event.amount ?? 0) / 25000)));
      } else if (["bottle", "gold", "ace", "takeover", "table"].includes(event.kind)) {
        showEvent(event.kind as ShowKind, at.x, at.z, event.amount ?? 0, event.name);
        fly("bottle", event.kind === "ace" || event.kind === "takeover" ? 22 : 8);
      } else if (event.kind === "hype") {
        showEvent("hype", at.x, at.z, 0, event.name);
      }
      if (event.kind !== "floor") load();
      else setNight((now) => (now ? { ...now, floor: event.floor ?? 0 } : now));
    };
    return () => {
      news.current = null;
    };
  }, [news, club, whereIs, fly, load]);
  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 3800);
    return () => window.clearTimeout(timer);
  }, [banner]);
  useEffect(() => {
    if (!shout) return;
    const timer = window.setTimeout(() => setShout(null), 3500);
    return () => window.clearTimeout(timer);
  }, [shout]);

  const order = async (want: ClubOrder) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const done = await orderAtClub(playerId, want);
      setNight(done);
      setLoadedAt(performance.now());
      latest.current.onMoney(done.money);
      setSongs(false);
    } catch (problem) {
      const text = problem instanceof Error ? problem.message : "Not now.";
      if (problem instanceof ApiError && problem.status === 429) latest.current.onLimit(text);
      else setError(text);
    } finally {
      setBusy(false);
    }
  };
  const pickUp = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const done = await pickUpMoney(playerId);
      setNight(done);
      latest.current.onMoney(done.money);
      setBanner({ big: "QUICK HANDS!", sub: `You picked up ${naira(done.picked)}`, key: ++counter.current });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Too slow! The floor is clear.");
      setNight((now) => (now ? { ...now, floor: 0 } : now));
    } finally {
      setBusy(false);
    }
  };

  const waited = (performance.now() - loadedAt) / 1000;
  const readyIn = (item: string) => Math.max(0, Math.ceil((night?.ready_in[item] ?? 0) - waited));
  const items = (night?.items ?? []).filter((item) => item.zone === (zone === "dj" ? "dj" : zone === "vip" ? "vip" : "dance") && item.id !== "spray");
  const mood = life?.needs.mood_name ?? "";
  const night_time = (life?.clock.hour ?? 0) >= 18 || (life?.clock.hour ?? 0) < 6;

  const card = (item: ClubItem) => {
    const wait = readyIn(item.id);
    const cant = busy || wait > 0 || (item.price > 0 && money < item.price);
    return (
      <button
        key={item.id}
        type="button"
        className="cl-card"
        disabled={cant}
        onClick={() => (item.id === "song" ? setSongs(true) : void order({ item: item.id }))}
      >
        <span className="cl-card-top">
          <i>{ITEM_ICON[item.id] ?? "✨"}</i>
          <small>⏱ {wait > 0 ? `${wait}s` : `${item.cooldown}s`}</small>
        </span>
        <b>{item.price > 0 ? naira(item.price) : "Free"}</b>
        <span className="cl-card-name">{item.name}</span>
        <span className="cl-tags">
          {item.tags.map((tag) => (
            <em key={tag} className={tag === "+Social" ? "social" : ""}>{tag}</em>
          ))}
        </span>
      </button>
    );
  };

  const sprayCards = (target?: RosterEntry) =>
    (night?.sprays ?? []).map((amount) => (
      <button
        key={`${target?.id ?? "room"}-${amount}`}
        type="button"
        className="cl-card spray"
        disabled={busy || readyIn("spray") > 0 || money < amount}
        onClick={() => void order({ item: "spray", amount, target: target?.id ?? null })}
      >
        <span className="cl-card-top">
          <i>💸</i>
          <small>⏱ 3s</small>
        </span>
        <b>{short(amount)}</b>
        <span className="cl-card-name">{target ? `Spray @${target.username}` : "Spray the room"}</span>
        <span className="cl-tags">
          <em>+Fun</em>
          <em className="social">+Social</em>
        </span>
      </button>
    ));

  const useSpot = (which: "dance" | "bar") => {
    const thing = props.thingFor(which);
    if (thing) void homeLife.openMenu(thing);
  };

  return (
    <div className={`club-live${clean ? " clean" : ""}${tucked ? " tucked" : ""}`}>
      <ClubLiveStyles />
      {/* Notes and bottles flying across the screen when someone spends. */}
      <div className="cl-flying" aria-hidden="true">
        {flying.map((one) => (
          <span key={one.key} className={one.kind} style={{ left: `${one.left}%`, animationDelay: `${one.delay}s`, ["--drift" as string]: `${one.drift}px` }}>
            {one.kind === "note" ? "₦" : "🍾"}
          </span>
        ))}
      </div>

      <div className="cl-top" role="status">
        <span>{night_time ? "🌙" : "☀️"} {life?.clock.text ?? night?.clock ?? "—"}</span>
        {mood && <span className="cl-mood">😀 {mood}</span>}
        <button type="button" className="cl-sound" onClick={props.onMusic} aria-pressed={props.music} aria-label={props.music ? "Turn the music off" : "Turn the music on"}>
          {props.music ? "🔊" : "🔇"}
        </button>
        <b>{naira(money)}</b>
      </div>
      <div className="cl-counts">
        <span>👀 {night ? `${night.feed.length + night.here * 37} visits` : "…"}</span>
        <span className="live">● {night?.here ?? others.length + 1} here</span>
      </div>

      {!clean && (
        <div className="cl-left">
          {night?.song && <div className="cl-pill song">🎤 Now playing: {night.song}</div>}
          {night?.takeover && <div className="cl-pill crown">👑 @{night.takeover}'s night</div>}
          {pills.map((pill) => (
            <div key={pill.key} className={`cl-pill ${pill.kind}`}>{pill.text}</div>
          ))}
          <button type="button" className="cl-pill cl-clean" onClick={() => setClean(true)}>⌃ Clean screen</button>
        </div>
      )}
      {clean && (
        <button type="button" className="cl-pill cl-clean shown" onClick={() => setClean(false)}>⌄ Show everything</button>
      )}

      {banner && (
        <div key={banner.key} className="cl-banner" role="alert">
          <strong>{banner.big}</strong>
          {banner.sub && <span>{banner.sub}</span>}
        </div>
      )}
      {shout && (
        <div key={shout.key} className="cl-dj" role="alert">
          <small>🎧 THE DJ</small>
          <strong>{shout.title}</strong>
          <span>{shout.sub}</span>
        </div>
      )}

      {/* The board: the top ten spenders. */}
      <button type="button" className="cl-board-tab" onClick={() => setBoard(board ? null : "tonight")} aria-expanded={board !== null}>
        👑<span>Top 10</span>
      </button>
      {board && night && (
        <aside className="cl-board" aria-label="Top spenders">
          <div className="cl-board-head">
            <strong>Top spenders</strong>
            <button type="button" onClick={() => setBoard(null)} aria-label="Close">✕</button>
          </div>
          <div className="cl-board-tabs">
            <button type="button" className={board === "tonight" ? "on" : ""} onClick={() => setBoard("tonight")}>Tonight</button>
            <button type="button" className={board === "ever" ? "on" : ""} onClick={() => setBoard("ever")}>All time</button>
          </div>
          <ol>
            {(board === "tonight" ? night.tonight : night.ever).map((row, i) => (
              <li key={row.name} className={row.name === props.username ? "me" : ""}>
                <span className="rank">{i === 0 ? "👑" : i + 1}</span>
                <span className="who">@{row.name}</span>
                <b>{short(row.spent)}</b>
              </li>
            ))}
            {(board === "tonight" ? night.tonight : night.ever).length === 0 && <li className="empty">Nobody has spent yet. Be the first.</li>}
          </ol>
        </aside>
      )}

      {night && night.floor > 0 && !tiedUp && (
        <button type="button" className="cl-floor" onClick={() => void pickUp()} disabled={busy}>
          💵 Pick up the money! {short(night.floor)} on the floor
        </button>
      )}

      {/* The club's own panel along the bottom. */}
      {!tiedUp && !homeLife.menu && tucked && (
        <button
          type="button"
          className="cl-dock"
          onClick={() => setTucked(false)}
          onTouchStart={(event) => (drag.current = { y: event.touches[0].clientY, dy: 0 })}
          onTouchMove={(event) => {
            if (!drag.current) return;
            drag.current.dy = event.touches[0].clientY - drag.current.y;
          }}
          onTouchEnd={() => {
            if (drag.current && drag.current.dy < -24) setTucked(false);
            drag.current = null;
          }}
          aria-label="Open the club menu"
        >
          <span className="cl-grip" aria-hidden="true" />
          <span>🪩 {night?.name ?? "The club"} · <b>Menu</b> ⌃</span>
        </button>
      )}
      {!tiedUp && !homeLife.menu && !tucked && (
        <div className="cl-sheet" style={pull > 0 ? { transform: `translateX(-50%) translateY(${pull}px)`, transition: "none" } : undefined}>
          <button
            type="button"
            className="cl-handle"
            onClick={() => setTucked(true)}
            onTouchStart={(event) => (drag.current = { y: event.touches[0].clientY, dy: 0 })}
            onTouchMove={(event) => {
              if (!drag.current) return;
              drag.current.dy = event.touches[0].clientY - drag.current.y;
              setPull(Math.max(0, drag.current.dy));
            }}
            onTouchEnd={(event) => {
              const pulled = drag.current?.dy ?? 0;
              drag.current = null;
              setPull(0);
              if (pulled > 50) {
                event.preventDefault(); // the tap that would follow must not open it again
                setTucked(true);
              }
            }}
            aria-label="Put the club menu away"
          >
            <span className="cl-grip" aria-hidden="true" />
          </button>
          <div className="cl-sheet-head">
            <span className="cl-avatar">🪩</span>
            <div>
              <strong>{night?.name ?? "The club"} <small>· {props.area}</small></strong>
              <span>{error || night?.ambient || "The night is young"}</span>
            </div>
            <button type="button" className="cl-icon" onClick={() => setTucked(true)} aria-label="Put the club menu away">⌄</button>
            <button type="button" className="cl-icon" onClick={props.onLeave} aria-label="Leave the club">🚪</button>
          </div>
          <form
            className="cl-say"
            onSubmit={(event) => {
              event.preventDefault();
              if (said.trim()) props.onSay(said.trim());
              setSaid("");
            }}
          >
            <input value={said} onChange={(event) => setSaid(event.target.value)} maxLength={140} placeholder={`Say something to the ${night?.here ?? others.length + 1} players here…`} />
            <button type="submit" aria-label="Say it">➤</button>
          </form>
          <div className="cl-zones" role="tablist">
            {ZONES.map((one) => (
              <button key={one.id} type="button" role="tab" aria-selected={zone === one.id} className={zone === one.id ? "on" : ""} onClick={() => setZone(one.id)}>
                <i>{one.icon}</i> {one.label}
              </button>
            ))}
          </div>
          <div className="cl-cards">
            {zone === "dance" && (
              <>
                <button type="button" className="cl-card" onClick={() => useSpot("dance")} disabled={homeLife.busy}>
                  <span className="cl-card-top"><i>💃</i><small>Now</small></span>
                  <b>Dance</b>
                  <span className="cl-card-name">Hit the dance floor</span>
                  <span className="cl-tags"><em>+Fun</em><em className="social">+Social</em></span>
                </button>
                {sprayCards()}
              </>
            )}
            {(zone === "vip" || zone === "dj") && items.map(card)}
            {zone === "bar" && (
              <button type="button" className="cl-card" onClick={() => useSpot("bar")} disabled={homeLife.busy}>
                <span className="cl-card-top"><i>🍸</i><small>Now</small></span>
                <b>The bar</b>
                <span className="cl-card-name">Chapman, small chops, jollof…</span>
                <span className="cl-tags"><em>+Food</em><em className="social">+Social</em></span>
              </button>
            )}
            {zone === "photo" && (
              <button type="button" className="cl-card" onClick={props.onPhoto}>
                <span className="cl-card-top"><i>📸</i><small>8s</small></span>
                <b>Free</b>
                <span className="cl-card-name">Clear the screen for a photo</span>
                <span className="cl-tags"><em>+Fun</em></span>
              </button>
            )}
            {zone === "people" && (others.length === 0
              ? <p className="cl-empty">Nobody else is here yet. Text your people to come through.</p>
              : others.map((other) => sprayCards(other).slice(0, 2)))}
          </div>
        </div>
      )}

      {songs && night && (
        <div className="cl-songs" role="dialog" aria-label="Request a song">
          <div className="cl-songs-head">
            <span>🎧</span>
            <div>
              <strong>Request a Song</strong>
              <small>Make your pick</small>
            </div>
            <button type="button" onClick={() => setSongs(false)} aria-label="Close">✕</button>
          </div>
          {night.songs.map((song) => (
            <button key={song} type="button" onClick={() => void order({ item: "song", song })} disabled={busy}>
              <i>{SONG_ICON[song] ?? "🎵"}</i>
              <span>{song}</span>
              <b>{naira(night.items.find((item) => item.id === "song")?.price ?? 300)}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ClubLiveStyles() {
  return (
    <style>{`
      .club-live { position: absolute; inset: 0; z-index: 11; pointer-events: none; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c1420; }
      .club-live button, .club-live input, .club-live form { pointer-events: auto; }
      .cl-top { position: absolute; left: calc(10px + env(safe-area-inset-left)); top: calc(10px + env(safe-area-inset-top)); display: flex; align-items: center; gap: 10px;
        background: #fbf4ea; border-radius: 999px; padding: 6px 8px 6px 14px; box-shadow: 0 4px 14px rgba(0,0,0,0.35); font-size: 14px; font-weight: 700; white-space: nowrap;
        max-width: calc(100vw - 130px); overflow: hidden; pointer-events: auto; }
      .cl-mood { color: #2f9e54; }
      .cl-top b { background: #fff; border-radius: 999px; padding: 3px 10px; }
      .cl-sound { border: 0; background: transparent; font-size: 15px; cursor: pointer; padding: 0 2px; }
      .cl-counts { position: absolute; left: calc(14px + env(safe-area-inset-left)); top: calc(52px + env(safe-area-inset-top)); display: flex; gap: 6px; font-size: 11px; font-weight: 700; }
      .cl-counts span { background: rgba(255,255,255,0.86); border-radius: 999px; padding: 2px 9px; }
      .cl-counts .live { color: #1f8a4c; }
      .cl-left { position: absolute; left: calc(10px + env(safe-area-inset-left)); top: calc(82px + env(safe-area-inset-top)); display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
        max-width: min(330px, 72vw); }
      .cl-pill { background: #fbf4ea; border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 700; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 0; text-align: left;
        animation: cl-in 0.35s ease-out; }
      .cl-pill.song { background: #ffd23f; }
      .cl-pill.crown { background: #1c1420; color: #ffd23f; }
      .cl-pill.ace, .cl-pill.gold, .cl-pill.takeover { background: #24151f; color: #fff; }
      .cl-pill.spray { background: #e8fff0; }
      .cl-clean { cursor: pointer; font-size: 11px; padding: 4px 10px; opacity: 0.9; }
      .cl-clean.shown { position: absolute; left: calc(10px + env(safe-area-inset-left)); top: calc(82px + env(safe-area-inset-top)); }
      @keyframes cl-in { from { transform: translateX(-12px); opacity: 0; } to { transform: none; opacity: 1; } }
      .cl-banner { position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
        width: max-content; max-width: 94vw; animation: cl-pop 3.8s ease-out forwards; }
      .cl-banner strong { font: 900 clamp(38px, 11vw, 86px)/0.95 Impact, "Arial Black", system-ui, sans-serif; letter-spacing: 0.01em; font-style: italic;
        background: linear-gradient(180deg, #fff7b0 0%, #ffd23f 45%, #ff7a00 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
        -webkit-text-stroke: 2px rgba(80, 30, 0, 0.55); filter: drop-shadow(0 4px 0 rgba(90, 20, 60, 0.6)) drop-shadow(0 0 18px rgba(255, 200, 60, 0.75)); }
      .cl-banner span { background: rgba(20, 12, 24, 0.86); color: #fff; border-radius: 999px; padding: 7px 16px; font-weight: 800; font-size: clamp(13px, 3.6vw, 18px); }
      @keyframes cl-pop { 0% { transform: translate(-50%, -50%) scale(0.4) rotate(-6deg); opacity: 0; } 10% { transform: translate(-50%, -50%) scale(1.12) rotate(2deg); opacity: 1; }
        18% { transform: translate(-50%, -50%) scale(1) rotate(0); } 85% { opacity: 1; } 100% { transform: translate(-50%, -60%) scale(1.02); opacity: 0; } }
      .cl-dj { position: absolute; left: 50%; top: calc(86px + env(safe-area-inset-top)); transform: translateX(-50%); width: min(420px, 90vw); text-align: center;
        background: #1a1024; color: #fff; border-radius: 18px; border: 2px solid #ff2d95; box-shadow: 0 0 24px rgba(255, 45, 149, 0.55); padding: 12px 16px;
        display: flex; flex-direction: column; gap: 4px; animation: cl-in 0.3s ease-out; }
      .cl-dj small { letter-spacing: 0.18em; font-weight: 800; color: #ffb3d9; font-size: 11px; }
      .cl-dj strong { font-size: clamp(18px, 5vw, 24px); font-weight: 900; }
      .cl-dj span { opacity: 0.85; font-size: 13px; }
      .cl-board-tab { position: absolute; right: 0; top: 38%; border: 0; border-radius: 14px 0 0 14px; background: #1c1420; color: #ffd23f; font-size: 20px; padding: 10px 10px 10px 12px;
        display: flex; flex-direction: column; align-items: center; gap: 2px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); cursor: pointer; }
      .cl-board-tab span { font-size: 10px; font-weight: 800; color: #fff; letter-spacing: 0.04em; }
      .cl-board { position: absolute; right: 0; top: calc(80px + env(safe-area-inset-top)); bottom: calc(250px + env(safe-area-inset-bottom)); width: min(280px, 78vw); z-index: 3;
        background: rgba(22, 12, 28, 0.94); color: #fff; border-radius: 16px 0 0 16px; padding: 12px; overflow: auto; pointer-events: auto; box-shadow: -6px 0 24px rgba(0,0,0,0.45);
        animation: cl-slide 0.25s ease-out; }
      @keyframes cl-slide { from { transform: translateX(100%); } to { transform: none; } }
      .cl-board-head { display: flex; justify-content: space-between; align-items: center; }
      .cl-board-head button { border: 0; background: transparent; color: #fff; font-size: 16px; cursor: pointer; }
      .cl-board-tabs { display: flex; gap: 6px; margin: 8px 0; }
      .cl-board-tabs button { flex: 1; border: 1px solid rgba(255,255,255,0.25); background: transparent; color: #fff; border-radius: 999px; padding: 5px; font-weight: 700; cursor: pointer; }
      .cl-board-tabs button.on { background: #ffd23f; color: #1c1420; border-color: #ffd23f; }
      .cl-board ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
      .cl-board li { display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,0.06); font-size: 13px; }
      .cl-board li:first-child { background: linear-gradient(90deg, rgba(255,210,63,0.35), rgba(255,210,63,0.08)); }
      .cl-board li.me { outline: 2px solid #ff2d95; }
      .cl-board li.empty { display: block; opacity: 0.7; }
      .cl-board .rank { font-weight: 900; text-align: center; }
      .cl-board .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cl-floor { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(262px + env(safe-area-inset-bottom)); border: 0; border-radius: 999px; padding: 12px 18px;
        background: #2fae5a; color: #fff; font-weight: 900; font-size: 15px; box-shadow: 0 6px 20px rgba(0,0,0,0.4); animation: cl-bounce 0.7s ease-in-out infinite alternate; cursor: pointer; }
      @keyframes cl-bounce { to { transform: translateX(-50%) translateY(-5px); } }
      .cl-sheet { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(8px + env(safe-area-inset-bottom)); width: min(520px, calc(100vw - 16px));
        background: #fbf4ea; border-radius: 22px; padding: 10px 10px 12px; box-shadow: 0 8px 28px rgba(0,0,0,0.45); pointer-events: auto;
        transition: transform 0.2s ease-out; }
      .cl-handle { display: block; width: 100%; border: 0; background: transparent; padding: 0 0 8px; margin-top: -4px; cursor: grab; touch-action: none; }
      .cl-grip { display: block; width: 42px; height: 5px; border-radius: 3px; background: #cdbfae; margin: 0 auto; }
      .cl-dock { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(8px + env(safe-area-inset-bottom)); border: 0; border-radius: 18px;
        background: #fbf4ea; color: #1c1420; padding: 6px 18px 9px; box-shadow: 0 6px 20px rgba(0,0,0,0.45); display: flex; flex-direction: column; align-items: center; gap: 5px;
        font-size: 13px; font-weight: 700; cursor: pointer; touch-action: none; animation: cl-up 0.22s ease-out; }
      .cl-dock b { color: #d63f8c; }
      @keyframes cl-up { from { transform: translateX(-50%) translateY(30px); opacity: 0; } to { transform: translateX(-50%); opacity: 1; } }
      .club-live.tucked .cl-floor { bottom: calc(76px + env(safe-area-inset-bottom)); }
      .club-live.tucked .cl-board { bottom: calc(76px + env(safe-area-inset-bottom)); }
      .cl-sheet-head { display: flex; align-items: center; gap: 10px; }
      .cl-sheet-head div { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .cl-sheet-head strong { font-size: 14px; }
      .cl-sheet-head strong small { font-weight: 600; opacity: 0.7; }
      .cl-sheet-head span { font-size: 12px; opacity: 0.75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cl-avatar { width: 38px; height: 38px; border-radius: 50%; background: #1c1420; display: grid; place-items: center; font-size: 20px; flex-shrink: 0; }
      .cl-icon { border: 0; background: #fff; border-radius: 50%; width: 36px; height: 36px; font-size: 18px; cursor: pointer; }
      .cl-say { display: flex; gap: 6px; margin: 8px 0; }
      .cl-say input { flex: 1; min-width: 0; border: 0; border-radius: 999px; padding: 9px 14px; background: #f0e6d8; font-size: 13px; }
      .cl-say button { border: 0; border-radius: 50%; width: 36px; height: 36px; background: #2fae5a; color: #fff; font-size: 15px; cursor: pointer; }
      .cl-zones { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: none; }
      .cl-zones button { flex-shrink: 0; border: 0; border-radius: 999px; padding: 7px 12px; background: transparent; font-weight: 700; font-size: 13px; color: #3a2c38; cursor: pointer; white-space: nowrap; }
      .cl-zones button.on { background: #1c1420; color: #fff; }
      .cl-cards { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 4px; scroll-snap-type: x mandatory; scrollbar-width: none; }
      .cl-card { flex: 0 0 138px; scroll-snap-align: start; border: 0; border-radius: 16px; background: #fff; padding: 10px; text-align: left; display: flex; flex-direction: column; gap: 4px;
        box-shadow: 0 2px 8px rgba(40, 20, 30, 0.12); cursor: pointer; color: #1c1420; }
      .cl-card:disabled { opacity: 0.5; cursor: default; }
      .cl-card-top { display: flex; justify-content: space-between; align-items: center; }
      .cl-card-top i { font-style: normal; font-size: 22px; }
      .cl-card-top small { font-size: 11px; font-weight: 700; background: #f3ece2; border-radius: 999px; padding: 2px 7px; }
      .cl-card b { font-size: 16px; }
      .cl-card-name { font-size: 13px; font-weight: 700; line-height: 1.2; min-height: 32px; }
      .cl-tags { display: flex; gap: 4px; }
      .cl-tags em { font-style: normal; font-size: 10px; font-weight: 800; color: #e07a00; background: #fff3e0; border-radius: 999px; padding: 1px 6px; }
      .cl-tags em.social { color: #d63f8c; background: #ffe8f3; }
      .cl-card.spray { background: #f1fff5; }
      .cl-empty { font-size: 13px; opacity: 0.75; margin: 6px 4px; }
      .cl-songs { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(8px + env(safe-area-inset-bottom)); width: min(460px, calc(100vw - 16px)); z-index: 4;
        background: #fff; border-radius: 22px; padding: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.45); pointer-events: auto; display: flex; flex-direction: column; gap: 8px;
        max-height: 70vh; overflow: auto; }
      .cl-songs-head { display: flex; align-items: center; gap: 10px; }
      .cl-songs-head div { flex: 1; display: flex; flex-direction: column; }
      .cl-songs-head small { opacity: 0.6; }
      .cl-songs-head button { border: 0; background: transparent; font-size: 16px; cursor: pointer; }
      .cl-songs > button { display: flex; align-items: center; gap: 12px; border: 0; border-radius: 14px; background: #f7f3ee; padding: 12px 14px; font-size: 15px; font-weight: 600; cursor: pointer; }
      .cl-songs > button i { font-style: normal; font-size: 20px; }
      .cl-songs > button span { flex: 1; text-align: left; }
      .cl-flying { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
      .cl-flying span { position: absolute; top: -40px; font-size: 22px; animation: cl-fall 2.8s linear forwards; }
      .cl-flying span.note { font: 900 16px/1 system-ui, sans-serif; color: #3b2a08; background: linear-gradient(90deg, #d8b15c, #f1dc96, #c8963f); border: 2px solid #8a6324;
        border-radius: 3px; padding: 3px 7px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
      @keyframes cl-fall { 0% { transform: translate(0, 0) rotate(0); opacity: 0; } 8% { opacity: 1; }
        100% { transform: translate(var(--drift), 105vh) rotate(540deg); opacity: 0.9; } }
      .club-live.clean .cl-board-tab, .club-live.clean .cl-counts { display: none; }
      @media (prefers-reduced-motion: reduce) { .cl-flying, .cl-banner { animation: none; } .cl-floor { animation: none; } }
      @media (max-width: 420px) { .cl-card { flex-basis: 124px; } .cl-top { font-size: 12px; gap: 6px; } }
    `}</style>
  );
}
