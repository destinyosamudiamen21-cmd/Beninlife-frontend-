import { useEffect, useState } from "react";
import { fetchCareer, type JobsBoard } from "../api/career";
import { Screen } from "./phoneKit";

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

type Props = {
  playerId: string;
  onBack: () => void;
  /** The map, open on a place, so they can go there. */
  onShow: (place: string) => void;
};

/**
 * Jobs: the office job they have (rank, pay, shifts to the next promotion), the careers on offer
 * and how to get one, and every other way to earn in town, each with the way there.
 */
export function JobsApp({ playerId, onBack, onShow }: Props) {
  const [board, setBoard] = useState<JobsBoard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetchCareer(playerId).then(setBoard).catch((problem: unknown) => setError(problem instanceof Error ? problem.message : "Could not load the jobs."));
  }, [playerId]);

  const now = board?.current ?? null;
  return (
    <Screen title="Jobs" sub={now ? `${now.title} · ${now.company}` : "Find work in Benin"} onBack={onBack}>
      <style>{`
        .jobs-now { background: linear-gradient(140deg, #0f5d3a, #1f8f4a); color: #fff; border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 4px; }
        .jobs-now.tech { background: linear-gradient(140deg, #0d1117, #2b3a2a); }
        .jobs-now span { font-size: 12px; font-weight: 600; opacity: 0.85; }
        .jobs-now strong { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
        .jobs-bar { height: 7px; border-radius: 4px; background: rgba(255,255,255,.25); overflow: hidden; margin: 6px 0 2px; }
        .jobs-bar b { display: block; height: 100%; background: #9dff5c; }
        .jobs-now button, .jobs-card button { align-self: flex-start; margin-top: 8px; }
        .jobs-card { background: #fff; border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 5px; color: #000; }
        .jobs-card h3 { font-size: 17px; margin: 0; }
        .jobs-card p { margin: 0; font-size: 13.5px; color: #3c3c43; line-height: 1.4; }
        .jobs-ranks { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; color: #636366; }
        .jobs-ranks span { display: flex; justify-content: space-between; }
        .jobs-how { font-size: 12.5px; color: #8a8a8e; }
        .jobs-h { font-size: 13px; font-weight: 600; color: #8a8a8e; text-transform: none; margin: 8px 4px 0; }
      `}</style>
      {error && <p className="ph-small">{error}</p>}
      {!board && !error && <p className="ph-small">Loading…</p>}
      {now && (
        <div className={`jobs-now ${now.track}`}>
          <span>Your job</span>
          <strong>{now.title}</strong>
          <span>{now.company} · {naira(now.pay)} a shift · {now.shifts} shifts worked</span>
          {now.next_title && (
            <>
              <div className="jobs-bar" aria-hidden="true">
                <b style={{ width: `${Math.max(6, 100 - (now.shifts_to_next / Math.max(1, now.shifts_to_next + now.shifts)) * 100)}%` }} />
              </div>
              <span>{now.shifts_to_next} more {now.shifts_to_next === 1 ? "shift" : "shifts"} to {now.next_title}</span>
            </>
          )}
          <span>{now.hours}</span>
          <button type="button" className="ph-mini" onClick={() => onShow(now.place)}>Go to work</button>
        </div>
      )}
      {board && (
        <>
          <p className="jobs-h">Careers</p>
          {board.tracks.map((track) => (
            <div key={track.id} className="jobs-card">
              <h3>{track.company}</h3>
              <p>{track.blurb}</p>
              <div className="jobs-ranks">
                {track.ranks.map((rank) => (
                  <span key={rank.title}><b>{rank.title}</b>{naira(rank.pay)} a shift</span>
                ))}
              </div>
              <span className="jobs-how">{track.hours}. Boundary Road, GRA. Apply at reception: dress clean.</span>
              <button type="button" className="ph-mini" onClick={() => onShow(track.place)}>
                {now?.track === track.id ? "Go to work" : "Show on the map"}
              </button>
            </div>
          ))}
          <p className="jobs-h">Other ways to earn</p>
          {board.others.map((job) => (
            <div key={job.name} className="jobs-card">
              <h3>{job.name}</h3>
              <p>{job.how}</p>
              <span className="jobs-how">{job.pay} · {job.where}</span>
              {job.place && (
                <button type="button" className="ph-mini plain" onClick={() => onShow(job.place)}>Show on the map</button>
              )}
            </div>
          ))}
        </>
      )}
    </Screen>
  );
}
