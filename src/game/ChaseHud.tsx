import { useEffect, useState } from "react";

type Props = { until: number };

/** A siren: two tones swapping, quietly, for as long as it is on. */
function useSiren(): void {
  useEffect(() => {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return undefined;
    let context: AudioContext;
    try {
      context = new Context();
    } catch {
      return undefined;
    }
    const tone = context.createOscillator();
    const volume = context.createGain();
    tone.type = "square";
    volume.gain.value = 0.035;
    tone.connect(volume).connect(context.destination);
    const now = context.currentTime;
    for (let i = 0; i < 120; i++) tone.frequency.setValueAtTime(i % 2 ? 640 : 860, now + i * 0.45);
    tone.start();
    return () => {
      try {
        tone.stop();
      } catch {
        // already stopped
      }
      void context.close();
    };
  }, []);
}

/** The police are after you: how long until you lose them, if you keep moving. */
export function ChaseHud({ until }: Props) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((until - Date.now()) / 1000)));
  useSiren();
  useEffect(() => {
    const timer = window.setInterval(() => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [until]);
  return (
    <div className="chase-hud" role="status" aria-live="polite">
      <style>{`
        .chase-hud { position: absolute; top: calc(70px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 30;
          display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 12px; color: #fff; font: 800 15px/1.2 system-ui, sans-serif;
          background: #14161b; border: 2px solid #2f6fd6; animation: chase-flash 0.5s steps(1) infinite; pointer-events: none; white-space: nowrap; }
        .chase-hud b { font-size: 20px; font-variant-numeric: tabular-nums; }
        .chase-hud small { font-weight: 600; opacity: 0.8; }
        @keyframes chase-flash { 50% { border-color: #d63031; } }
        @media (prefers-reduced-motion: reduce) { .chase-hud { animation: none; } }
      `}</style>
      <span aria-hidden="true">🚨</span>
      <span>
        POLICE CHASE <small>· don't stop</small>
      </span>
      <b>{left}s</b>
    </div>
  );
}
