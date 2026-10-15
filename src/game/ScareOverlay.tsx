import { useEffect, useState } from "react";
import type { Scare } from "./venues";

const FACE_MS = 900;
const LINE_MS = 3200;

/**
 * What a scare in the haunted house looks like on the screen: a face that fills it, bloody
 * hands, or the screen going black, and a line of what just happened. The sound is played
 * by the game (hauntSound.ts); this is only the picture.
 */
export function ScareOverlay({ scare }: { scare: { scare: Scare; key: number } | null }) {
  const [shown, setShown] = useState<{ kind: Scare["kind"]; line: string; key: number } | null>(null);
  const [face, setFace] = useState(false);

  useEffect(() => {
    if (!scare) return;
    setShown({ kind: scare.scare.kind, line: scare.scare.line ?? "", key: scare.key });
    setFace(scare.scare.kind === "face" || scare.scare.kind === "hands");
    const hideFace = window.setTimeout(() => setFace(false), FACE_MS);
    const hideLine = window.setTimeout(() => setShown(null), LINE_MS);
    return () => {
      window.clearTimeout(hideFace);
      window.clearTimeout(hideLine);
    };
  }, [scare]);

  if (!shown) return null;
  return (
    <div className="scare" aria-live="assertive">
      <style>{`
        .scare { position: absolute; inset: 0; z-index: 30; pointer-events: none; }
        .scare-face { position: absolute; inset: 0; display: grid; place-items: center; background: radial-gradient(circle, rgba(40,0,0,0.6), #000 70%);
          animation: scare-shake 0.09s linear infinite; }
        .scare-face svg { width: min(78vw, 78vh); height: min(78vw, 78vh); }
        .scare-dark { position: absolute; inset: 0; background: #000; animation: scare-blink 1.8s steps(6) forwards; }
        .scare-line { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); color: #ffdede; font-weight: 800; font-size: clamp(16px, 3vw, 22px);
          text-shadow: 0 0 12px #f00, 0 2px 4px #000; text-align: center; width: min(90vw, 620px); }
        @keyframes scare-shake { 0% { transform: translate(0, 0) scale(1.02); } 50% { transform: translate(-6px, 4px) scale(1.06); } 100% { transform: translate(5px, -3px) scale(1.03); } }
        @keyframes scare-blink { 0% { opacity: 1; } 40% { opacity: 0.85; } 60% { opacity: 1; } 100% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .scare-face { animation: none; } }
      `}</style>
      {face && shown.kind === "face" && (
        <div className="scare-face">
          {/* A pale face with hollow eyes and a mouth stretched open. Drawn here, so there is no picture file. */}
          <svg viewBox="0 0 200 240" aria-hidden="true">
            <defs>
              <radialGradient id="skin" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#e9e4d8" />
                <stop offset="70%" stopColor="#9a958a" />
                <stop offset="100%" stopColor="#2a2724" />
              </radialGradient>
            </defs>
            <path d="M100 8 C40 8 22 70 26 120 C30 180 60 232 100 232 C140 232 170 180 174 120 C178 70 160 8 100 8 Z" fill="url(#skin)" />
            <path d="M30 60 C40 20 80 4 100 6 C120 4 160 20 170 60 C150 40 130 34 100 36 C70 34 50 40 30 60 Z" fill="#0b0b0b" />
            <ellipse cx="68" cy="104" rx="22" ry="28" fill="#000" />
            <ellipse cx="132" cy="104" rx="22" ry="28" fill="#000" />
            <circle cx="70" cy="108" r="4" fill="#ff2020" />
            <circle cx="130" cy="108" r="4" fill="#ff2020" />
            <path d="M68 160 C80 150 120 150 132 160 C138 200 120 222 100 222 C80 222 62 200 68 160 Z" fill="#000" />
            <path d="M74 166 L80 178 L86 166 L92 180 L98 166 L104 180 L110 166 L116 180 L122 166 L126 176" stroke="#d8d2c4" strokeWidth="3" fill="none" />
            <path d="M60 132 L56 150 M140 132 L144 152" stroke="#5a0000" strokeWidth="3" />
          </svg>
        </div>
      )}
      {face && shown.kind === "hands" && (
        <div className="scare-face" style={{ background: "radial-gradient(circle, rgba(80,0,0,0.5), rgba(0,0,0,0.85) 75%)" }}>
          <svg viewBox="0 0 300 200" aria-hidden="true">
            {[[70, 110, -0.3], [210, 90, 0.25], [140, 150, 0.05]].map(([x, y, a], i) => (
              <g key={i} transform={`translate(${x} ${y}) rotate(${(a as number) * 57})`} fill="#7a0000" opacity="0.9">
                <ellipse cx="0" cy="0" rx="26" ry="30" />
                {[-22, -10, 2, 14].map((fx, j) => <rect key={j} x={fx} y={-72 + Math.abs(j - 1.5) * 6} width="9" height="44" rx="4" />)}
                <rect x="22" y="-22" width="9" height="34" rx="4" transform="rotate(35 26 -5)" />
              </g>
            ))}
          </svg>
        </div>
      )}
      {shown.kind === "lights" && <div key={shown.key} className="scare-dark" />}
      {shown.line && <div className="scare-line">{shown.line}</div>}
    </div>
  );
}
