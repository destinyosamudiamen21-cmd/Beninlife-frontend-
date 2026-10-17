import { useEffect, useRef, useState } from "react";
import type { Life } from "../api/life";
import { fetchInbox } from "../api/phone";
import type { StoryResult } from "../api/story";
import { DataApp, HelpApp, MeApp, SchoolApp } from "./PhoneApps";
import { BankApp } from "./PhoneBank";
import { FriendsApp } from "./PhoneFriends";
import { AdminApp, SafetyApp } from "./PhoneSafety";
import { MessagesApp } from "./PhoneMessages";
import { Glyph } from "./glyphs";
import { naira } from "./phoneKit";
import type { RosterEntry } from "./types";

type AppId = "messages" | "friends" | "bank" | "map" | "data" | "school" | "me" | "help" | "safety" | "admin";

/** The apps on the home screen: the picture, the name under it and the colour of its medallion. */
const APPS: { id: AppId; name: string; glyph: string; colour: string; students?: boolean; admins?: boolean }[] = [
  { id: "messages", name: "Messages", glyph: "chat", colour: "linear-gradient(#67e86c, #1fbf3c)" },
  { id: "friends", name: "Friends", glyph: "people", colour: "linear-gradient(#ffb340, #ff7a00)" },
  { id: "bank", name: "Bank", glyph: "bank", colour: "linear-gradient(#7b5cff, #4a26e0)" },
  { id: "map", name: "Maps", glyph: "map", colour: "linear-gradient(#5ac8fa, #0a84ff)" },
  { id: "data", name: "Data", glyph: "data", colour: "linear-gradient(#30d5c8, #0a9396)" },
  { id: "school", name: "School", glyph: "school", colour: "linear-gradient(#ffd60a, #ff9f0a)", students: true },
  { id: "me", name: "Me", glyph: "person", colour: "linear-gradient(#a1a1a6, #636366)" },
  { id: "help", name: "Help", glyph: "help", colour: "linear-gradient(#ff6482, #ff2d55)" },
  { id: "safety", name: "Safety", glyph: "shield", colour: "linear-gradient(#64d2ff, #0a84ff)" },
  { id: "admin", name: "Admin", glyph: "shield", colour: "linear-gradient(#3a3a3c, #1c1c1e)", admins: true },
];

/** The four that sit in the dock along the bottom, as on any phone. */
const DOCK: AppId[] = ["messages", "friends", "bank", "map"];

/** "6:36 am" -> "6:36": the status bar shows the time the way a phone does. */
function shortTime(text: string): string {
  return text.replace(/\s*(am|pm)$/i, "");
}

type Props = {
  playerId: string;
  username: string;
  /** True for a player living the student life: they get the School app. */
  student: boolean;
  /** The players who are where this one is: quick to pick as someone to text or save. */
  nearby: RosterEntry[];
  /** Goes up by one each time something arrives while the phone is open, so what is on screen is fetched again. */
  arrivals: number;
  money: number;
  /** The player's needs and clock, for the top of the screen and the Me app. Null until they are known. */
  life: Life | null;
  /** The life they started with, for the Me app. */
  story: StoryResult | null;
  onMoney: (money: number) => void;
  /** The phone looked at how much is unread. */
  onUnread: (count: number) => void;
  /** The Map app was pressed: the phone goes away and the city map opens. */
  onMap: () => void;
  onClose: () => void;
  /** Sign out of this browser. Left out when there is no account to sign out of. */
  onSignOut?: () => void;
  /** An admin (ADMIN_EMAILS on the server) also gets the Admin app. */
  admin?: boolean;
};

/**
 * The player's phone. It opens on a home screen of apps, like any phone:
 *
 * - Messages: texts to anyone, wherever they are, and money sent inside a conversation.
 * - Friends: the contacts saved in it, and which of them are in the game.
 * - Bank: the balance, sending money, and the alerts.
 * - Map: opens the city map.
 * - Data, School (students), Me and Help.
 *
 * All of its styles are in this file, so nothing has to be added to index.css. Each app
 * is in a file of its own (PhoneMessages.tsx and so on) and draws itself with them.
 */
export function Phone({ playerId, username, student, nearby, arrivals, money, life, story, onMoney, onUnread, onMap, onClose, onSignOut, admin = false }: Props) {
  const [app, setApp] = useState<AppId | null>(null);
  const [chatWith, setChatWith] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  // The home screen shows how many messages are waiting. Asked when the phone opens, and
  // again each time something arrives.
  const tell = useRef(onUnread);
  useEffect(() => {
    tell.current = onUnread;
  });
  useEffect(() => {
    let cancelled = false;
    fetchInbox(playerId)
      .then((inbox) => {
        if (cancelled) return;
        setUnread(inbox.unread);
        tell.current(inbox.unread);
      })
      .catch(() => {}); // the badge is a nicety: the Messages app reports a real failure itself
    return () => {
      cancelled = true;
    };
  }, [arrivals, playerId]);

  const counted = (count: number) => {
    setUnread(count);
    onUnread(count);
  };
  const home = () => {
    setApp(null);
    setChatWith(null);
  };
  const open = (id: AppId) => {
    if (id === "map") onMap();
    else setApp(id);
  };

  const energy = life ? Math.round(life.needs.energy) : null;
  const apps = APPS.filter((entry) => (!entry.students || student) && (!entry.admins || admin));

  return (
    <div className="ph" role="dialog" aria-label="Your phone">
      <style>{`
        /* The phone is drawn like the big Pro phones of 2023: a thin titanium edge, a pill-shaped
           island at the top, square icons with round corners, a frosted dock, and apps in the
           light grouped style with blue for anything that can be pressed. */
        .ph { position: absolute; inset: 0; z-index: 25; display: grid; place-items: center; background: rgba(0, 0, 0, 0.5); color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif;
          padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
        .ph button { font: inherit; cursor: pointer; }
        .ph-shell { position: relative; padding: 11px; border-radius: 62px; background: #121214;
          box-shadow: 0 0 0 2.5px #8d877c, 0 0 0 4px #4d4a45, 0 30px 70px rgba(0, 0, 0, 0.6); animation: ph-up 0.26s cubic-bezier(.2,.9,.3,1.1); }
        /* The side buttons: the action button and volume on the left, the power button on the right. */
        .ph-shell::before { content: ""; position: absolute; left: -7px; top: 120px; width: 4px; height: 150px; border-radius: 3px 0 0 3px;
          background: linear-gradient(#8d877c 0 22px, transparent 22px 44px, #8d877c 44px 92px, transparent 92px 102px, #8d877c 102px 150px); }
        .ph-shell::after { content: ""; position: absolute; right: -7px; top: 180px; width: 4px; height: 82px; border-radius: 0 3px 3px 0; background: #8d877c; }
        .ph-body { position: relative; width: min(372px, calc(100vw - 30px)); height: min(806px, calc(100dvh - 30px)); display: flex; flex-direction: column; overflow: hidden;
          border-radius: 52px; background: #000; }
        @media (max-width: 520px), (max-height: 700px) {
          .ph { padding: 0; } .ph-shell { padding: 0; border-radius: 0; box-shadow: none; } .ph-shell::before, .ph-shell::after { display: none; }
          .ph-body { width: 100vw; height: 100dvh; border-radius: 0; } }
        @keyframes ph-up { from { transform: translateY(40px) scale(0.96); opacity: 0; } to { transform: none; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .ph-shell { animation: none; } }

        /* ---- the status bar and the island ---- */
        .ph-island { position: absolute; z-index: 3; top: 11px; left: 50%; width: 122px; height: 35px; margin-left: -61px; border-radius: 20px; background: #000;
          display: flex; align-items: center; justify-content: flex-end; padding: 0 12px; }
        .ph-island i { width: 11px; height: 11px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #2a3550, #0a0c12 60%); }
        .ph-status { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; padding: 18px 30px 0 34px; height: 54px;
          font-size: 16px; font-weight: 600; letter-spacing: -0.01em; flex-shrink: 0; color: #fff; }
        .ph-status.dark { color: #000; background: #f2f2f7; }
        .ph-status > span { display: flex; align-items: center; gap: 6px; }
        .ph-status small { font-size: 12.5px; font-weight: 700; }
        .ph-signal { display: flex; align-items: flex-end; gap: 1.5px; height: 11px; }
        .ph-signal b { width: 3px; border-radius: 1px; background: currentColor; }
        .ph-cell { width: 25px; height: 12px; border: 1.5px solid currentColor; border-radius: 4px; padding: 1.5px; position: relative; opacity: 0.95; }
        .ph-cell::after { content: ""; position: absolute; right: -4px; top: 3px; width: 2px; height: 4px; border-radius: 0 1px 1px 0; background: currentColor; }
        .ph-cell i { display: block; height: 100%; border-radius: 1.5px; background: currentColor; }
        .ph-cell.low i { background: #ff453a; }

        /* ---- the home screen ---- */
        .ph-home { position: absolute; inset: 0; display: flex; flex-direction: column; padding: 54px 18px 0; overflow: hidden;
          background:
            radial-gradient(120% 60% at 15% 10%, rgba(255, 159, 67, 0.75), transparent 55%),
            radial-gradient(90% 55% at 95% 35%, rgba(255, 45, 85, 0.6), transparent 60%),
            radial-gradient(110% 70% at 40% 100%, rgba(10, 132, 255, 0.85), transparent 60%),
            linear-gradient(170deg, #3a1c71 0%, #1a1446 55%, #06122e 100%); }
        .ph-home-top { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; padding: 14px 4px 10px; }
        .ph-widgets { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .ph-widget { border-radius: 22px; padding: 13px 14px; min-height: 148px; display: flex; flex-direction: column; justify-content: space-between;
          background: rgba(255, 255, 255, 0.16); -webkit-backdrop-filter: blur(24px) saturate(1.4); backdrop-filter: blur(24px) saturate(1.4);
          border: 0.5px solid rgba(255, 255, 255, 0.22); text-align: left; color: #fff; }
        .ph-widget span { font-size: 12px; font-weight: 600; opacity: 0.85; }
        .ph-widget strong { font-size: 34px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
        .ph-widget em { font-style: normal; font-size: 13px; font-weight: 600; opacity: 0.9; }
        .ph-widget.cash { background: linear-gradient(150deg, rgba(91, 55, 255, 0.85), rgba(170, 60, 255, 0.75)); border: none; }
        .ph-widget.cash strong { font-size: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ph-grid { width: 100%; display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px 4px; }
        .ph-app { border: none; background: none; color: #fff; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0;
          font-size: 11.5px; font-weight: 500; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35); }
        .ph-app i { position: relative; width: 60px; height: 60px; border-radius: 14px; display: grid; place-items: center; color: #fff;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 3px 8px rgba(0, 0, 0, 0.25); transition: transform 0.12s; }
        .ph-app:active i { transform: scale(0.9); filter: brightness(0.85); }
        .ph-app:focus-visible { outline: none; } .ph-app:focus-visible i { outline: 2px solid #fff; outline-offset: 3px; }
        .ph-app b { position: absolute; top: -6px; right: -7px; min-width: 22px; height: 22px; border-radius: 11px; background: #ff3b30; color: #fff;
          font-size: 13px; font-weight: 600; display: grid; place-items: center; padding: 0 6px; font-style: normal; text-shadow: none; }
        .ph-dots { display: flex; justify-content: center; gap: 7px; padding: 6px 0 12px; }
        .ph-dots i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255, 255, 255, 0.45); }
        .ph-dots i:first-child { background: #fff; }
        .ph-dock { margin: 0 -6px 0; padding: 14px 14px 14px; border-radius: 34px; display: grid; grid-template-columns: repeat(4, 1fr);
          background: rgba(255, 255, 255, 0.2); -webkit-backdrop-filter: blur(28px) saturate(1.5); backdrop-filter: blur(28px) saturate(1.5); }
        .ph-dock .ph-app { font-size: 0; gap: 0; }
        .ph-indicator { flex-shrink: 0; display: grid; place-items: center; padding: 9px 0 calc(9px + env(safe-area-inset-bottom)); border: none; background: none; width: 100%; }
        .ph-indicator span { width: 134px; height: 5px; border-radius: 3px; background: #fff; }

        /* ---- inside an app: the light grouped style ---- */
        .ph-screen { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #f2f2f7; color: #000; }
        .ph-top { display: flex; align-items: center; gap: 8px; padding: 2px 12px 10px; background: rgba(242, 242, 247, 0.94); color: #000;
          border-bottom: 0.5px solid rgba(60, 60, 67, 0.2); flex-shrink: 0; }
        .ph-title { flex: 1; min-width: 0; }
        .ph-title h2 { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ph-title p { font-size: 13px; color: #8a8a8e; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ph-main { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
        .ph-foot { flex-shrink: 0; padding: 8px 12px 4px; border-top: 0.5px solid rgba(60, 60, 67, 0.2); background: rgba(249, 249, 249, 0.96);
          display: flex; flex-direction: column; gap: 6px; }
        .ph-homebar { flex-shrink: 0; display: grid; place-items: center; padding: 8px 0 calc(9px + env(safe-area-inset-bottom)); background: #f2f2f7; border: none; width: 100%; }
        .ph-homebar span { width: 134px; height: 5px; border-radius: 3px; background: #000; }

        .ph-round { width: 34px; height: 34px; border-radius: 50%; border: none; background: transparent; color: #007aff; display: grid; place-items: center;
          padding: 0; flex-shrink: 0; }
        .ph-top .ph-round { margin-left: -6px; }
        .ph-round.coin { background: #34c759; color: #fff; font-weight: 700; font-size: 17px; }
        .ph-round.go { background: #007aff; color: #fff; }
        .ph-mini { border: none; border-radius: 999px; background: #007aff; color: #fff; font-weight: 600; font-size: 13.5px; padding: 7px 13px; white-space: nowrap; flex-shrink: 0; }
        .ph-mini.plain { background: rgba(118, 118, 128, 0.12); color: #007aff; }
        .ph-mini.done { background: rgba(52, 199, 89, 0.15); color: #248a3d; }
        .ph-top .ph-mini { background: rgba(0, 122, 255, 0.12); color: #007aff; }
        .ph-go { border: none; border-radius: 12px; background: #007aff; color: #fff; font-weight: 600; font-size: 16px; padding: 12px 16px; flex: 1; }
        .ph-go:disabled, .ph-mini:disabled { opacity: 0.45; }
        .ph-plain { border: none; border-radius: 12px; background: rgba(118, 118, 128, 0.12); color: #007aff; font-weight: 600; padding: 12px 16px; }
        .ph-row { display: flex; gap: 8px; }

        .ph-heading { font-size: 13px; font-weight: 400; color: #6d6d72; margin: 6px 0 -2px 14px; text-transform: none; }
        .ph-small { font-size: 12.5px; color: #6d6d72; line-height: 1.4; padding: 0 4px; }
        .ph-error { font-size: 13px; font-weight: 600; color: #ff3b30; }
        .ph-note { font-size: 13px; background: #fff; border-radius: 12px; padding: 10px 12px; color: #3c3c43; }
        .ph-list { display: flex; flex-direction: column; background: #fff; border-radius: 12px; overflow: hidden; }
        .ph-list > * + * { border-top: 0.5px solid rgba(60, 60, 67, 0.18); }
        .ph-list:empty { display: none; }
        .ph-item { display: flex; align-items: center; gap: 11px; background: #fff; border: none; border-radius: 0; padding: 10px 12px; text-align: left; color: #000; width: 100%; }
        .ph-item.tall { align-items: flex-start; }
        .ph-item.press:active { background: #d1d1d6; }
        .ph-lines { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .ph-lines strong { font-size: 16px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ph-lines span { font-size: 13.5px; color: #8a8a8e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ph-item.tall .ph-lines span { white-space: normal; line-height: 1.4; }
        .ph-when { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
        .ph-when small { font-size: 12px; color: #8a8a8e; }
        .ph-when i { min-width: 20px; height: 20px; border-radius: 10px; background: #007aff; color: #fff; font-size: 12px; font-weight: 600; font-style: normal;
          display: grid; place-items: center; padding: 0 6px; }
        .ph-in { color: #34c759; font-size: 14px; font-weight: 600; white-space: nowrap; } .ph-out { color: #000; font-size: 14px; font-weight: 600; white-space: nowrap; }
        .ph-face { position: relative; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 600; flex-shrink: 0;
          background-image: linear-gradient(180deg, rgba(255,255,255,0.18), rgba(0,0,0,0.12)); }
        .ph-face i { position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px; border-radius: 50%; background: #34c759; border: 2px solid #fff; }
        .ph-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .ph-chips button { border: none; border-radius: 999px; background: #fff; color: #007aff; font-size: 14px; font-weight: 600; padding: 7px 13px; }
        .ph-chips button.on { background: #007aff; color: #fff; }
        .ph-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .ph-facts div { background: #fff; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .ph-facts span { font-size: 12px; color: #8a8a8e; }
        .ph-facts strong { font-size: 17px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ph-card { background: #fff; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 9px; }
        .ph-bar { height: 8px; border-radius: 4px; background: #e5e5ea; overflow: hidden; flex: 1; }
        .ph-bar span { display: block; height: 100%; background: #34c759; border-radius: 4px; }
        .ph-bar.low span { background: #ff9500; } .ph-bar.urgent span { background: #ff3b30; }
        .ph-need { display: flex; align-items: center; gap: 10px; font-size: 14px; }
        .ph-need > span { width: 60px; flex-shrink: 0; color: #3c3c43; } .ph-need b { width: 28px; text-align: right; font-size: 14px; font-weight: 600; }

        /* ---- typing: a message, a name, an amount ---- */
        .ph-send { display: flex; gap: 8px; align-items: center; }
        .ph-send input, .ph-field input { flex: 1; min-width: 0; border: 0.5px solid rgba(60, 60, 67, 0.3); border-radius: 18px; padding: 9px 14px; font-size: 16px; background: #fff; color: #000;
          -webkit-user-select: text; user-select: text; }
        .ph-field input { border-radius: 10px; }
        .ph-send input:focus, .ph-field input:focus, .ph-amount:focus-within { outline: 2px solid #007aff; outline-offset: 0; }
        .ph-send .ph-go { flex: 0 0 auto; border-radius: 18px; padding: 9px 15px; }
        .ph-pay { display: flex; flex-direction: column; gap: 10px; }
        .ph-field { display: flex; flex-direction: column; gap: 4px; }
        .ph-field > span { font-size: 13px; color: #6d6d72; padding-left: 4px; }
        .ph-amount { display: flex; align-items: center; gap: 4px; border-radius: 12px; background: #fff; padding: 0 14px; }
        .ph-amount b { font-size: 26px; font-weight: 700; color: #34c759; }
        .ph-amount input { border: none; padding: 10px 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; background: none; }
        .ph-amount input:focus { outline: none; }

        /* ---- a conversation: blue for you, grey for them ---- */
        .ph-thread { display: flex; flex-direction: column; gap: 4px; flex: 1; background: #fff; margin: -12px -14px; padding: 12px 14px; }
        .ph-thread > p:not(.ph-small) { max-width: 76%; align-self: flex-start; background: #e9e9eb; color: #000; border-radius: 18px; padding: 7px 12px 6px; font-size: 16px; line-height: 1.3;
          overflow-wrap: anywhere; -webkit-user-select: text; user-select: text; }
        .ph-thread > p.mine { align-self: flex-end; background: #007aff; color: #fff; }
        .ph-thread small { display: block; font-size: 10.5px; opacity: 0.6; margin-top: 2px; text-align: right; }
        /* Money that was sent is a card of its own: a green wash and the amount writ large. */
        .ph-cash { align-self: flex-start; min-width: 180px; max-width: 78%; background: linear-gradient(150deg, #1c1c1e, #2c2c2e); color: #fff; border-radius: 18px;
          padding: 11px 14px 9px; display: flex; flex-direction: column; box-shadow: inset 0 0 0 1.5px #34c759; }
        .ph-cash.mine { align-self: flex-end; }
        .ph-cash span { font-size: 12px; font-weight: 600; color: #34c759; }
        .ph-cash strong { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; }
        .ph-cash em { font-size: 13px; font-style: normal; color: #aeaeb2; overflow-wrap: anywhere; }

        /* ---- the bank: a purple card with the balance, a green button to top up ---- */
        .ph-balance { background: linear-gradient(135deg, #4a26e0 0%, #7b3ff2 60%, #a64bf4 100%); color: #fff; border-radius: 20px; padding: 18px 18px 16px;
          display: flex; flex-direction: column; gap: 2px; box-shadow: 0 10px 24px rgba(91, 55, 255, 0.35); }
        .ph-balance span { font-size: 13px; font-weight: 600; opacity: 0.85; }
        .ph-balance strong { font-size: 34px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; overflow-wrap: anywhere; }
        .ph-sign { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-style: normal; font-weight: 700; font-size: 18px; flex-shrink: 0; }
        .ph-sign.in { background: #34c759; } .ph-sign.out { background: #ff3b30; }
        .ph-balance button { margin-top: 14px; border: none; border-radius: 12px; background: #34c759; color: #fff; font-weight: 600; padding: 12px 14px;
          display: flex; align-items: center; justify-content: center; gap: 8px; }
      `}</style>

      <div className="ph-shell">
      <div className="ph-body">
        <div className="ph-island" aria-hidden="true">
          <i />
        </div>
        <div className={`ph-status${app === null ? "" : " dark"}`}>
          <span>{life ? shortTime(life.clock.text) : "9:41"}</span>
          <span>
            <span className="ph-signal" aria-hidden="true">
              {[4, 6, 8, 11].map((height) => (
                <b key={height} style={{ height }} />
              ))}
            </span>
            <small>4G</small>
            {energy !== null && (
              <span className={`ph-cell${energy < 20 ? " low" : ""}`} role="img" aria-label={`Energy ${energy} of 100`}>
                <i style={{ width: `${Math.max(6, energy)}%` }} />
              </span>
            )}
          </span>
        </div>

        {app === null && (
          <div className="ph-home">
            <div className="ph-home-top">
              <div className="ph-widgets">
                <div className="ph-widget">
                  <span>{life ? `Day ${life.clock.day}` : "Benin City"}</span>
                  <strong>{life ? shortTime(life.clock.text) : "--:--"}</strong>
                  <em>{life ? life.clock.block : `@${username}`}</em>
                </div>
                <button type="button" className="ph-widget cash" onClick={() => open("bank")}>
                  <span>Wallet</span>
                  <strong>{naira(money)}</strong>
                  <em>@{username}</em>
                </button>
              </div>
              <div className="ph-grid">
                {apps
                  .filter((entry) => !DOCK.includes(entry.id))
                  .map((entry) => (
                    <button key={entry.id} type="button" className="ph-app" onClick={() => open(entry.id)}>
                      <i style={{ background: entry.colour }}>
                        <Glyph name={entry.glyph} size={30} />
                      </i>
                      {entry.name}
                    </button>
                  ))}
              </div>
            </div>
            <div className="ph-dots" aria-hidden="true">
              <i />
              <i />
            </div>
            <div className="ph-dock">
              {DOCK.map((id) => APPS.find((entry) => entry.id === id)!).map((entry) => (
                <button key={entry.id} type="button" className="ph-app" onClick={() => open(entry.id)} aria-label={entry.name}>
                  <i style={{ background: entry.colour }}>
                    <Glyph name={entry.glyph} size={30} />
                    {entry.id === "messages" && unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
                  </i>
                  {entry.name}
                </button>
              ))}
            </div>
            {/* Swiping up, or pressing the bar, puts the phone away. */}
            <button type="button" className="ph-indicator" onClick={onClose} aria-label="Put phone away">
              <span />
            </button>
          </div>
        )}

        {app === "messages" && (
          <MessagesApp playerId={playerId} nearby={nearby} arrivals={arrivals} startWith={chatWith} onMoney={onMoney} onUnread={counted} onBack={home} />
        )}
        {app === "friends" && (
          <FriendsApp
            playerId={playerId}
            nearby={nearby}
            arrivals={arrivals}
            onMessage={(id) => {
              setChatWith(id);
              setApp("messages");
            }}
            onBack={home}
          />
        )}
        {app === "bank" && <BankApp playerId={playerId} arrivals={arrivals} onMoney={onMoney} onBack={home} />}
        {app === "data" && <DataApp playerId={playerId} onMoney={onMoney} onBack={home} />}
        {app === "school" && <SchoolApp playerId={playerId} onBack={home} />}
        {app === "me" && <MeApp username={username} money={money} life={life} story={story} onBack={home} onSignOut={onSignOut} />}
        {app === "help" && <HelpApp onBack={home} />}
        {app === "safety" && <SafetyApp playerId={playerId} nearby={nearby} onBack={home} />}
        {app === "admin" && admin && <AdminApp onBack={home} />}

        {/* The bar along the bottom of every app goes back to the home screen, as on any phone. */}
        {app !== null && (
          <button type="button" className="ph-homebar" onClick={home} aria-label="Home screen">
            <span />
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
