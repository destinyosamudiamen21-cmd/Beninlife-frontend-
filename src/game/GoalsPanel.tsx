import { useEffect, useState } from "react";
import { claimGoal, type Goal, type Goals } from "../api/goals";
import { claimMission, fetchMissions, type Mission, type Missions } from "../api/missions";

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

function amountOf(target: number, value: number): string {
  return target >= 1000 ? naira(value) : String(value);
}

type Props = {
  playerId: string;
  goals: Goals | null;
  onGoals: (goals: Goals) => void;
  missions: Missions | null;
  onMissions: (missions: Missions) => void;
  /** "Show me": the map, open on a place (a city map place id). */
  onShow: (place: string) => void;
  onMoney: (money: number) => void;
  onNews: (line: string) => void;
  onClose: () => void;
};

/**
 * Missions (the story, chapter by chapter), and today's three goals, the week's three and the
 * streak. Anything finished waits here to be collected.
 */
export function GoalsPanel({ playerId, goals, onGoals, missions, onMissions, onShow, onMoney, onNews, onClose }: Props) {
  const [tab, setTab] = useState<"missions" | "goals">("missions");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [, tick] = useState(0);
  const [opened] = useState(() => performance.now());
  // Missions are read by the game in the background; if they are not there yet, read them here,
  // and say so when that fails, with a way to try again, rather than "Loading" for ever.
  const [missionsError, setMissionsError] = useState("");
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (missions) return;
    let stop = false;
    setMissionsError("");
    fetchMissions(playerId)
      .then((now) => { if (!stop) onMissions(now); })
      .catch((problem: unknown) => {
        if (!stop) setMissionsError(problem instanceof Error ? problem.message : "The server did not answer.");
      });
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, tries, missions === null]);

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

  const finish = async (mission: Mission) => {
    if (busy) return;
    setBusy(mission.id);
    setError("");
    try {
      const now = await claimMission(playerId, mission.id);
      onMissions(now);
      onMoney(now.money);
      if (now.news.length) onNews(now.news.join(" "));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not collect that.");
    } finally {
      setBusy("");
    }
  };

  const card = (mission: Mission) => (
    <li key={mission.id} className={`mission${mission.done ? " mission-ready" : ""}`}>
      <div className="mission-top">
        <span className="mission-chapter">{mission.chapter}</span>
        <b>{naira(mission.reward)}</b>
      </div>
      <strong>{mission.title}</strong>
      <p><em>{mission.giver}:</em> “{mission.story}”</p>
      <ul className="mission-steps">
        {mission.steps.map((step) => (
          <li key={step.text} className={step.done ? "done" : ""}>
            <span aria-hidden="true">{step.done ? "✓" : "○"}</span>
            <span className="mission-step">{step.text}{step.target > 1 && !step.done ? ` (${amountOf(step.target, step.progress)} of ${amountOf(step.target, step.target)})` : ""}</span>
            {step.place && !step.done && (
              <button type="button" className="mission-show" onClick={() => onShow(step.place)}>Show me</button>
            )}
          </li>
        ))}
      </ul>
      {mission.done && (
        <button type="button" className="mission-take" disabled={busy !== ""} onClick={() => void finish(mission)}>
          {busy === mission.id ? "…" : `Collect ${naira(mission.reward)}`}
        </button>
      )}
    </li>
  );

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
        .goals-tabs { display: flex; gap: 6px; margin: 2px 0 12px; background: #efe8dc; border-radius: 12px; padding: 4px; }
        .goals-tabs button { flex: 1; border: 0; border-radius: 9px; padding: 9px 8px; font-weight: 800; font-size: 14px; background: transparent; color: #6f655b; }
        .goals-tabs button.on { background: #fff; color: #1f2a26; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
        .goals-tabs i { font-style: normal; background: #d6452f; color: #fff; border-radius: 999px; padding: 0 7px; margin-left: 6px; font-size: 12px; }
        .mission-chapters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .mission-chapters span { font-size: 11px; font-weight: 700; background: #f1ebe0; color: #5c544b; border-radius: 999px; padding: 3px 9px; }
        .mission-chapters span.full { background: #dff3e5; color: #1f6b3a; }
        .mission { list-style: none; padding: 12px; border-radius: 16px; background: #f6f1e8; display: flex; flex-direction: column; gap: 6px; }
        .mission-ready { background: #fff4cf; box-shadow: inset 0 0 0 2px #f0b72f; }
        .mission-top { display: flex; justify-content: space-between; align-items: center; }
        .mission-chapter { font-size: 11px; font-weight: 800; color: #8a6d3b; }
        .mission-top b { font-size: 13px; color: #1f6b3a; }
        .mission strong { font-size: 16px; }
        .mission p { margin: 0; font-size: 13px; color: #5c544b; line-height: 1.4; }
        .mission p em { font-style: normal; font-weight: 700; color: #3b342d; }
        .mission-steps { list-style: none; margin: 2px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
        .mission-steps li { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
        .mission-steps li.done { color: #1f6b3a; }
        .mission-steps li > span:first-child { width: 16px; text-align: center; }
        .mission-step { flex: 1; min-width: 0; }
        .mission-show { border: 0; border-radius: 9px; padding: 6px 10px; font-weight: 800; font-size: 12px; background: #1f2a26; color: #fff; white-space: nowrap; }
        .mission-take { border: 0; border-radius: 12px; padding: 11px; font-weight: 900; font-size: 15px; background: #1f8f4a; color: #fff; margin-top: 4px; }
        .goals-sheet .sheet-card { max-height: min(86dvh, 760px); overflow-y: auto; }
      `}</style>
      <div className="sheet-card">
        <div className="sheet-top">
          <div>
            <h2>{tab === "missions" ? "Missions" : "Goals"}</h2>
            <p>{tab === "missions" ? "Follow the story, earn as you go. Finish one and the next comes." : "Finish them, collect the money. A daily goal every day keeps your streak."}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
        </div>
        <div className="goals-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "missions"} className={tab === "missions" ? "on" : ""} onClick={() => setTab("missions")}>
            Missions{missions && missions.active.some((m) => m.done) && <i>{missions.active.filter((m) => m.done).length}</i>}
          </button>
          <button type="button" role="tab" aria-selected={tab === "goals"} className={tab === "goals" ? "on" : ""} onClick={() => setTab("goals")}>
            Daily &amp; weekly{goals && [...goals.daily, ...goals.weekly].some((g) => g.done && !g.claimed) && <i>{[...goals.daily, ...goals.weekly].filter((g) => g.done && !g.claimed).length}</i>}
          </button>
        </div>
        {tab === "missions" && !missions && !missionsError && <p>Loading…</p>}
        {tab === "missions" && !missions && missionsError && (
          <div className="missions-error">
            <p>Could not load the missions ({missionsError}).</p>
            <button type="button" className="mission-take" onClick={() => setTries((n) => n + 1)}>Try again</button>
          </div>
        )}
        {tab === "missions" && missions && (
          <>
            <div className="mission-chapters">
              {missions.chapters.map((chapter) => (
                <span key={chapter.name} className={chapter.done === chapter.total ? "full" : ""}>{chapter.name} {chapter.done}/{chapter.total}</span>
              ))}
            </div>
            <ul className="goals-list">{[...missions.active].sort((a, b) => Number(b.done) - Number(a.done)).map(card)}</ul>
            {missions.active.length === 0 && <p>Every mission done. Respect. More are coming.</p>}
          </>
        )}
        {tab === "goals" && !goals && <p>Loading…</p>}
        {tab === "goals" && goals && streak && (
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
