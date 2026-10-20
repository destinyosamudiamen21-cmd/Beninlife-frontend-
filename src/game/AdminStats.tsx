import { useEffect, useState } from "react";
import { fetchStats, type Stats } from "../api/safety";

/** "Tue 20" from "2026-10-20". */
function dayName(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

/**
 * How many people play, for the admin: in the city right now, today, the last two weeks a
 * bar a day, and every account ever. Read again every 30 seconds while it is open.
 */
export function AdminStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () =>
      fetchStats()
        .then((now) => { if (live) { setStats(now); setError(""); } })
        .catch((problem: unknown) => { if (live) setError(problem instanceof Error ? problem.message : "Could not load the numbers."); });
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);

  if (error && !stats) return <p className="ph-error">{error}</p>;
  if (!stats) return <p className="ph-small">Counting…</p>;
  const most = Math.max(1, ...stats.days.map((d) => d.players));
  return (
    <div className="admin-stats">
      <style>{`
        .admin-stats { display: flex; flex-direction: column; gap: 10px; }
        .as-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .as-tile { background: #fff; border-radius: 14px; padding: 10px; display: flex; flex-direction: column; gap: 2px; color: #000; }
        .as-tile b { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .as-tile span { font-size: 12px; color: #6b6b70; }
        .as-tile.live b { color: #1f8f4a; }
        .as-days { background: #fff; border-radius: 14px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; color: #000; }
        .as-days h3 { font-size: 13px; margin: 0 0 2px; color: #6b6b70; font-weight: 600; }
        .as-row { display: grid; grid-template-columns: 52px 1fr 92px; align-items: center; gap: 8px; font-size: 12.5px; font-variant-numeric: tabular-nums; }
        .as-bar { height: 10px; border-radius: 5px; background: #eef0f2; overflow: hidden; }
        .as-bar i { display: block; height: 100%; background: #0a84ff; border-radius: 5px; }
        .as-row em { font-style: normal; color: #6b6b70; text-align: right; }
      `}</style>
      <div className="as-tiles">
        <div className="as-tile live"><b>{stats.online}</b><span>In the city now</span></div>
        <div className="as-tile"><b>{stats.today.players}</b><span>Played today</span></div>
        <div className="as-tile"><b>{stats.today.peak}</b><span>Most at once today</span></div>
        <div className="as-tile"><b>{stats.average_7}</b><span>A day, last 7 days</span></div>
        <div className="as-tile"><b>{stats.today.new}</b><span>New accounts today</span></div>
        <div className="as-tile"><b>{stats.accounts.toLocaleString()}</b><span>Accounts ever</span></div>
      </div>
      <div className="as-days" aria-label="Players each day">
        <h3>Players each day (new accounts · most at once)</h3>
        {stats.days.map((d) => (
          <div key={d.day} className="as-row">
            <span>{dayName(d.day)}</span>
            <div className="as-bar" aria-hidden="true"><i style={{ width: `${(d.players / most) * 100}%` }} /></div>
            <em>{d.players} · +{d.new} · {d.peak}</em>
          </div>
        ))}
      </div>
      <p className="ph-small">Players: different people who came into the city that day. Counting began with this update; accounts are counted from the start.</p>
    </div>
  );
}
