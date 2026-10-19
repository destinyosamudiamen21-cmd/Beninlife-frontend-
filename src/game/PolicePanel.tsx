import { useState } from "react";
import { answerPolice, type PoliceStop } from "../api/police";

type Props = {
  playerId: string;
  /** The stop as the server opened it. */
  stop: PoliceStop;
  onMoney: (money: number) => void;
  /** Things that came due while they were held (a missed class), to show afterwards. */
  onNews: (lines: string[]) => void;
  onDone: () => void;
  /** They zoomed off: the panel goes, the chase starts. */
  onFled?: () => void;
};

/**
 * Stopped at a checkpoint: what the officer says, and what the player can do about it.
 * Everything is decided on the server; this only shows the conversation and sends back
 * which button was pressed.
 */
export function PolicePanel({ playerId, stop: first, onMoney, onNews, onDone, onFled }: Props) {
  const [stop, setStop] = useState(first);
  const [said, setSaid] = useState<string[]>(first.lines);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const choose = async (choice: string, label: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await answerPolice(playerId, stop.id, choice);
      setStop(next);
      setSaid((lines) => [...lines, `You: ${label}`, ...next.lines]);
      onMoney(next.money);
      if (next.news.length) onNews(next.news);
      if (next.fled) onFled?.();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "They did not hear you. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cop" role="dialog" aria-label="Police checkpoint">
      <style>{`
        .cop { position: absolute; inset: auto 0 0 0; z-index: 22; display: flex; justify-content: center; padding: 0 12px calc(14px + env(safe-area-inset-bottom)); }
        .cop-card { width: min(560px, 100%); background: #14161b; color: #eef0f3; border: 2px solid #2f6fd6; border-radius: 16px; padding: 14px 16px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6); }
        .cop-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .cop-badge { width: 38px; height: 38px; border-radius: 50%; background: #1f3a6b; display: grid; place-items: center; font-weight: 900; font-size: 13px; border: 2px solid #c9d4e8; }
        .cop-top strong { font-size: 16px; display: block; }
        .cop-top span { font-size: 12px; color: #9aa6b8; }
        .cop-lines { display: flex; flex-direction: column; gap: 5px; max-height: 34dvh; overflow-y: auto; margin-bottom: 10px; }
        .cop-lines p { font-size: 14.5px; line-height: 1.4; }
        .cop-lines p.you { color: #e2b657; }
        .cop-lines p.them { color: #ffffff; font-weight: 600; }
        .cop-lines p.told { color: #b8c2d0; font-style: italic; }
        .cop-choices { display: flex; flex-direction: column; gap: 6px; }
        .cop-choices button { text-align: left; border: 1.5px solid #3a4352; background: #1d2129; color: #eef0f3; border-radius: 10px; padding: 10px 12px; font-weight: 700; font-size: 14px; }
        .cop-choices button.pay { border-color: #c79a2b; }
        .cop-choices button.run { border-color: #d63031; color: #ffb3a7; }
        .cop-done { width: 100%; border: none; background: #2f6f5e; color: #fff; border-radius: 10px; padding: 11px; font-weight: 800; font-size: 15px; }
        .cop-small { font-size: 12px; color: #9aa6b8; margin-top: 8px; }
      `}</style>
      <div className="cop-card">
        <div className="cop-top">
          <div className="cop-badge">NPF</div>
          <div>
            <strong>{stop.officer}</strong>
            <span>{stop.place || "Checkpoint"}{stop.paid ? ` · ₦${stop.paid.toLocaleString()} paid` : ""}{stop.minutes ? ` · ${Math.round(stop.minutes / 60)} h lost` : ""}</span>
          </div>
        </div>
        <div className="cop-lines">
          {said.map((line, index) => {
            const you = line.startsWith("You: ");
            const them = !you && line.includes(": ");
            return (
              <p key={index} className={you ? "you" : them ? "them" : "told"}>
                {line}
              </p>
            );
          })}
        </div>
        {error && <p className="cop-small" style={{ color: "#ff9a8a" }}>{error}</p>}
        {stop.over ? (
          <>
            <button type="button" className="cop-done" onClick={onDone}>
              Walk on
            </button>
            {stop.paid > 0 && <p className="cop-small">You can report this at the Central Police Station by Oba Market.</p>}
          </>
        ) : (
          <div className="cop-choices">
            {stop.choices.map((choice) => (
              <button key={choice.id} type="button" className={choice.id === "settle" ? "pay" : choice.id === "zoom" ? "run" : ""} onClick={() => void choose(choice.id, choice.label)} disabled={busy}>
                {choice.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
