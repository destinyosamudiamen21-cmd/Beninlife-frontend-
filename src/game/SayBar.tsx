import { useState, type FormEvent } from "react";
import type { VoiceState } from "./voice";

/** Something that was said out loud near the player. */
export type Line = { key: number; name: string; text: string; mine: boolean };

type Props = {
  /** Say it. Everyone near enough hears it. */
  onSay: (text: string) => void;
  /** The last few things said nearby, oldest first. */
  lines: Line[];
  /** Voice: off, on, or on with the microphone muted. Null where the browser cannot do voice at all. */
  voice: VoiceState | null;
  /** How many players the voice is connected to. */
  voiceWith: number;
  onVoice: () => void;
};

const MAX_LENGTH = 140; // the server cuts anything longer

/**
 * The bar along the bottom wherever players share a place: type something and everyone
 * near hears it, and switch voice on to talk to whoever is standing with you.
 */
export function SayBar({ onSay, lines, voice, voiceWith, onVoice }: Props) {
  const [text, setText] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const words = text.trim();
    if (!words) return;
    onSay(words);
    setText("");
    // On a phone, put the keyboard away: it covers half the game, and a tap on the game
    // does not dismiss it.
    if (
      window.matchMedia("(pointer: coarse)").matches &&
      document.activeElement instanceof HTMLElement
    )
      document.activeElement.blur();
  };

  const micLabel =
    voice === "on"
      ? "Mute your microphone"
      : voice === "muted"
      ? "Turn voice off"
      : "Turn voice on";
  return (
    <>
      <style>{`
        .say { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(10px + env(safe-area-inset-bottom));
          z-index: 12; width: min(430px, calc(100vw - 20px)); display: flex; gap: 8px; align-items: center; }
        .say form { flex: 1; min-width: 0; display: flex; background: rgba(20, 22, 24, 0.82); border-radius: 999px; padding: 4px; }
        .say input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: #fff; font-size: 15px; padding: 8px 12px; }
        .say input::placeholder { color: rgba(255, 255, 255, 0.6); }
        .say button { border: none; border-radius: 999px; font-weight: 700; font-size: 14px; padding: 8px 14px; background: #f4d27a; color: #1f2a26; flex-shrink: 0; }
        .say button:disabled { opacity: 0.45; }
        .say .say-mic { width: 42px; height: 42px; padding: 0; font-size: 18px; background: rgba(20, 22, 24, 0.82); color: #fff; position: relative; }
        .say .say-mic.live { background: #2f8f4e; }
        .say .say-mic.muted { background: #b5462e; }
        .say-count { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; border-radius: 9px; background: #f4d27a; color: #1f2a26;
          font-size: 11px; font-weight: 700; display: grid; place-items: center; padding: 0 4px; }
        .said { position: absolute; left: calc(16px + env(safe-area-inset-left)); top: calc(318px + env(safe-area-inset-top)); z-index: 9;
          width: min(240px, 60vw); display: flex; flex-direction: column; gap: 4px; pointer-events: none; }
        .said p { font-size: 12px; line-height: 1.3; color: #fff; background: rgba(20, 22, 24, 0.6); border-radius: 8px; padding: 4px 8px;
          overflow-wrap: anywhere; }
        .said b { color: #f4d27a; font-weight: 700; }
        @media (max-height: 560px) { .said { display: none; } }
      `}</style>

      {lines.length > 0 && (
        <div className='said' aria-live='polite'>
          {lines.map((line) => (
            <p key={line.key}>
              <b>{line.mine ? "You" : line.name}:</b> {line.text}
            </p>
          ))}
        </div>
      )}

      <div className='say'>
        <form onSubmit={submit}>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder='Say something out loud…'
            maxLength={MAX_LENGTH}
            enterKeyHint='send'
            aria-label='Say something out loud'
          />
          <button type='submit' disabled={!text.trim()}>
            Say
          </button>
        </form>
        {voice !== null && (
          <button
            type='button'
            className={`say-mic${
              voice === "on" ? " live" : voice === "muted" ? " muted" : ""
            }`}
            onClick={onVoice}
            aria-label={micLabel}
            title={micLabel}
          >
            {voice === "muted" ? "🔇" : "🎙️"}
            {voice !== "off" && voiceWith > 0 && (
              <span className='say-count'>{voiceWith}</span>
            )}
          </button>
        )}
      </div>
    </>
  );
}
