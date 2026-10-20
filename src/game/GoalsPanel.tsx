import { useEffect, useState } from "react";
import { claimGoal, type Goal, type Goals } from "../api/goals";

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

function left(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function amount(goal: Goal, value: number): string {
  return goal.target >= 1000 ? naira(value) : String(value);
}

type Props = {
  playerId: string;
  goals: Goals | null;
  onGoals: (goals: Goals) => void;
  onMoney: (money: number) => void;
  onNews: (line: string) => void;
  onClose: () => void;
};

/** Today's three goals, the week's three, and the streak. Finished goals wait here to be collected. */
export function GoalsPanel({ playerId, goals, onGoals, onMoney, onNews, onClose }: Props) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [, tick] = useState(0);
  const [opened] = useState(() => performance.now());

  // The countdowns move while the panel is open.
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const collect = async (goal: Goal) => {
    if (busy) return;
    setBusy(goal.id);
    setError("");
    try {
      const now = await claimGoal(playerId, goal.id);
      onGoals(now);
      onMoney(now.money);
      if (now.news.length) onNews(now.news.join(" "));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not collect that.");
    } finally {
      setBusy("");
    }
  };

  const gone = Math.floor((performance.now() - opened) / 1000);
  const row = (goal: Goal) => {
    const share = Math.min(1, goal.progress / Math.max(1, goal.target));
    const state = goal.claimed ? "claimed" : goal.done ? "ready" : "open";
    return (
      <li key={goal.id} className={`goal goal-${state}`}>
        <span className="goal-icon" aria-hidden="true">{goal.icon}</span>
        <div className="goal-body">
          <span className="goal-name">{goal.name}</span>
          <div className="goal-bar" aria-hidden="true"><b style={{ width: `${Math.round(share * 100)}%` }} /></div>
          <span className="goal-count">{amount(goal, goal.progress)} of {amount(goal, goal.target)}</span>
        </div>
        {goal.claimed ? (
          <span className="goal-paid">Collected</span>
        ) : (
          <button type="button" className="goal-take" disabled={!goal.done || busy !== ""} onClick={() => void collect(goal)}>
            {busy === goal.id ? "…" : goal.done ? `Collect ${naira(goal.reward)}` : naira(goal.reward)}
          </button>
        )}
      </li>
    );
  };

  const streak = goals?.streak;
  return (
    <div className="sheet goals-sheet" role="dialog" aria-label="Goals">
      <style>{`
        .goals-sheet .sheet-card { max-width: 440px; }
        .goals-streak { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px; background: linear-gradient(120deg, #2a1208, #6b2410); color: #fff3e0; margin-bottom: 12px; }
        .goals-streak .flame { font-size: 34px; filter: saturate(1.3); }
        .goals-streak.cold .flame { filter: grayscale(1); opacity: .6; }
        .goals-streak strong { font-size: 22px; display: block; line-height: 1.1; }
        .goals-streak small { color: #f6c9a4; font-size: 12px; }
        .goals-days { display: flex; gap: 4px; margin-left: auto; }
        .goals-days i { width: 9px; height: 22px; border-radius: 3px; background: #ffffff22; }
        .goals-days i.lit { background: #ffb02e; box-shadow: 0 0 8px #ff8a1e; }
        .goals-head { display: flex; justify-content: space-between; align-items: baseline; margin: 10px 2px 6px; }
        .goals-head h3 { margin: 0; font-size: 15px; }
        .goals-head span { font-size: 12px; color: #7d7268; }
        .goals-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .goal { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 14px; background: #f6f1e8; }
        .goal-ready { background: #fff4cf; box-shadow: inset 0 0 0 2px #f0b72f; }
        .goal-claimed { opacity: .55; }
        .goal-icon { font-size: 24px; width: 32px; text-align: center; }
        .goal-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .goal-name { font-weight: 700; font-size: 14px; }
        .goal-bar { height: 6px; border-radius: 3px; background: #e2d8c8; overflow: hidden; }
        .goal-bar b { display: block; height: 100%; background: #2fae5a; }
        .goal-count { font-size: 11px; color: #7d7268; }
        .goal-take { border: 0; border-radius: 11px; padding: 8px 10px; font-weight: 800; font-size: 13px; background: #e6ddcf; color: #6f655b; white-space: nowrap; }
        .goal-ready .goal-take { background: #1f8f4a; color: #fff; }
        .goal-paid { font-size: 12px; font-weight: 700; color: #1f6b3a; }
      `}</style>
      <div className="sheet-card">
        <div className="sheet-top">
          <div>
            <h2>Goals</h2>
            <p>Finish them, collect the money. A daily goal every day keeps your streak.</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
        </div>
        {!goals && <p>Loading…</p>}
        {goals && streak && (
          <>
            <div className={`goals-streak${streak.days === 0 ? " cold" : ""}`}>
              <span className="flame" aria-hidden="true">🔥</span>
              <div>
                <strong>{streak.days === 1 ? "1 day" : `${streak.days} days`}</strong>
                <small>
                  {streak.today ? "Today counts. " : streak.days > 0 ? "Collect a daily goal today to keep it. " : "Collect a daily goal to start one. "}
                  Bonus in {streak.next_bonus_in} {streak.next_bonus_in === 1 ? "day" : "days"}, best {streak.best}
                </small>
              </div>
              <div className="goals-days" aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => <i key={i} className={i < (streak.days % 7 || (streak.days > 0 ? 7 : 0)) ? "lit" : ""} />)}
              </div>
            </div>
            <div className="goals-head">
              <h3>Today</h3>
              <span>New goals in {left(Math.max(0, goals.day_ends_in - gone))}</span>
            </div>
            <ul className="goals-list">{goals.daily.map(row)}</ul>
            <div className="goals-head">
              <h3>This week</h3>
              <span>Ends in {left(Math.max(0, goals.week_ends_in - gone))}</span>
            </div>
            <ul className="goals-list">{goals.weekly.map(row)}</ul>
          </>
        )}
        {error && <p className="life-why" role="alert">{error}</p>}
      </div>
    </div>
  );
}
