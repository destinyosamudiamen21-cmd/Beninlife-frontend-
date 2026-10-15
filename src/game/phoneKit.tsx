// The pieces every app on the phone is built from: the frame of a screen, a round
// picture for a person, and the few words and numbers they all write the same way.

import type { ReactNode } from "react";
import { Glyph } from "./glyphs";

export const naira = (amount: number) => `₦${amount.toLocaleString()}`;

/** 1536 -> "1.5 GB", 280 -> "280 MB". */
export function dataText(megabytes: number): string {
  return megabytes >= 1024
    ? `${(megabytes / 1024).toFixed(1)} GB`
    : `${megabytes} MB`;
}

/** What went wrong, in the server's own words when it gave some. */
export function words(problem: unknown, fallback: string): string {
  return problem instanceof Error ? problem.message : fallback;
}

/**
 * How long ago something was sent: "now", "5 min", "3 h", "2 d". Not a time of day, on
 * purpose: every player's day runs on its own clock, so "7:40 pm" would mean a different
 * moment on each phone.
 */
export function ago(ms: number, now = Date.now()): string {
  const minutes = Math.floor((now - ms) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (60 * 24))} d`;
}

// One colour for each person, picked from their name, so the same person is always the same colour.
const FACES = [
  "#2f6f5e",
  "#35557a",
  "#a9792b",
  "#c8432b",
  "#5b4a8a",
  "#7a4a2b",
  "#8a2a22",
  "#3f7d3a",
];

/** A round badge with the first letter of a name. `online` adds a green bead. */
export function Face({
  name,
  online = false,
  size = 40,
}: {
  name: string;
  online?: boolean;
  size?: number;
}) {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return (
    <span
      className='ph-face'
      style={{
        width: size,
        height: size,
        background: FACES[sum % FACES.length],
        fontSize: size * 0.42,
      }}
    >
      {(name[0] ?? "?").toUpperCase()}
      {online && <i />}
    </span>
  );
}

type ScreenProps = {
  title: string;
  /** One line under the title. */
  sub?: string;
  onBack: () => void;
  /** Something for the right-hand end of the title bar. */
  action?: ReactNode;
  /** Kept at the bottom of the screen while the rest scrolls: a box to type in, say. */
  foot?: ReactNode;
  children: ReactNode;
};

/** One screen of an app: a title bar with a way back, the part that scrolls, and a foot. */
export function Screen({
  title,
  sub,
  onBack,
  action,
  foot,
  children,
}: ScreenProps) {
  return (
    <div className='ph-screen'>
      <header className='ph-top'>
        <button
          type='button'
          className='ph-round'
          onClick={onBack}
          aria-label='Back'
        >
          <Glyph name='back' size={20} />
        </button>
        <div className='ph-title'>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </header>
      <div className='ph-main'>{children}</div>
      {foot && <footer className='ph-foot'>{foot}</footer>}
    </div>
  );
}
