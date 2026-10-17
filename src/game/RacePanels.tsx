// The race desk (pick a race, a car and a bet), the race on screen (the countdown, laps,
// checkpoints, place and clock) and the result.

import { useEffect, useRef, useState } from "react";
import { fetchRaces, startRace, type Race, type Races } from "../api/race";
import { CarPicture } from "./CarPanels";
import { LAP, rivalDistance, gridSlot } from "./raceTrack";

const naira = (n: number) => `₦${n.toLocaleString()}`;
const short = (n: number) => (n >= 1_000_000 ? `₦${(n / 1_000_000).toLocaleString()}m` : `₦${(n / 1000).toLocaleString()}k`);

const STYLE = `
  .race-kinds { display: grid; gap: 8px; margin: 8px 0; }
  .race-kind { text-align: left; border: 2px solid #e4d9c6; background: #fbf6ec; border-radius: 12px; padding: 10px 12px; cursor: pointer; color: #2a2018; }
  .race-kind[aria-pressed="true"] { border-color: #c62828; background: #fff1ee; }
  .race-kind strong { font-size: 16px; display: block; }
  .race-kind span { font-size: 13px; color: #6d5d4b; }
  .race-kind b { color: #c62828; }
  .race-section { font-size: 12px; font-weight: 800; color: #8a7a68; margin: 12px 0 6px; }
  .race-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .race-chips button { border: 2px solid #e4d9c6; background: #fff; border-radius: 999px; padding: 7px 12px; font-weight: 700; font-size: 13px; color: #2a2018; cursor: pointer; }
  .race-chips button[aria-pressed="true"] { border-color: #2a2018; background: #2a2018; color: #fff; }
  .race-cars { display: grid; gap: 6px; }
  .race-car { display: grid; grid-template-columns: 84px 1fr auto; gap: 8px; align-items: center; border: 2px solid #e4d9c6; background: #fff; border-radius: 12px; padding: 4px 10px 4px 4px; cursor: pointer; text-align: left; color: #2a2018; }
  .race-car[aria-pressed="true"] { border-color: #2a2018; }
  .race-car small { color: #6d5d4b; }
  .race-total { display: flex; justify-content: space-between; align-items: baseline; margin: 12px 0 8px; font-weight: 800; color: #2a2018; }
  .race-go { width: 100%; border: none; border-radius: 12px; background: #c62828; color: #fff; font: 800 16px/1 system-ui, sans-serif; padding: 14px; cursor: pointer; }
  .race-go:disabled { opacity: 0.5; cursor: default; }
  .race-small { font-size: 12px; color: #6d5d4b; margin: 8px 0 0; }

  .race-hud { position: fixed; z-index: 31; top: calc(10px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); display: flex; gap: 6px;
    font: 800 15px/1 system-ui, sans-serif; color: #fff; pointer-events: none; }
  .race-hud > div { background: rgba(16, 16, 20, 0.78); border-radius: 10px; padding: 8px 11px; text-align: center; min-width: 54px; }
  .race-hud small { display: block; font-size: 10px; letter-spacing: 0.08em; opacity: 0.7; margin-bottom: 4px; font-weight: 700; }
  .race-hud .pos { background: #c62828; }
  .race-quit { position: fixed; z-index: 31; top: calc(62px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); border: none; border-radius: 999px;
    background: rgba(16,16,20,0.7); color: #fff; font: 700 12px/1 system-ui, sans-serif; padding: 7px 12px; cursor: pointer; }
  .race-count { position: fixed; z-index: 32; inset: 0; display: grid; place-items: center; pointer-events: none; font: 900 120px/1 system-ui, sans-serif;
    color: #fff; text-shadow: 0 4px 24px rgba(0,0,0,0.6); }
  .race-count.go { color: #4caf50; }
  .race-result h3 { font-size: 40px; margin: 4px 0; color: #c62828; }
  .race-table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 8px 0; }
  .race-table td { padding: 6px 4px; border-bottom: 1px solid #eee3d0; }
  .race-table tr.me td { font-weight: 800; color: #c62828; }
  .race-table td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
`;

type DeskProps = {
  playerId: string;
  /** The model of the player's own car, if they drove up in it. */
  ownModel: string | null;
  ownColour: string;
  busy: boolean;
  onStart: (race: Race) => void;
  onClose: () => void;
};

export function RaceDesk({ playerId, ownModel, ownColour, busy, onStart, onClose }: DeskProps) {
  const [info, setInfo] = useState<Races | null>(null);
  const [kind, setKind] = useState("sprint");
  const [hire, setHire] = useState<string | null>(ownModel ? null : "falke_c40");
  const [bet, setBet] = useState(0);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let live = true;
    fetchRaces(playerId).then((r) => live && setInfo(r)).catch((p: unknown) => live && setError(p instanceof Error ? p.message : "The desk is closed."));
    return () => {
      live = false;
    };
  }, [playerId]);

  const race = info?.races.find((r) => r.id === kind);
  const hired = info?.hires.find((h) => h.model === hire);
  const total = (race?.entry ?? 0) + (hired?.price ?? 0) + bet;
  const bets = info ? [0, info.min_bet, 1_000_000, 5_000_000, 10_000_000, info.max_bet] : [0];

  const go = async () => {
    if (!race || starting || busy) return;
    setStarting(true);
    setError("");
    try {
      onStart(await startRace(playerId, race.id, hire, bet));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not sign you up.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="sheet">
      <style>{STYLE}</style>
      <div className="sheet-card">
        <div className="sheet-top">
          <div>
            <h2>Race desk</h2>
            <p>GRA Race Field</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
        </div>
        {!info && !error && <p className="sheet-note">One moment…</p>}
        {info && (
          <>
            <div className="race-kinds" role="group" aria-label="Which race">
              {info.races.map((r) => (
                <button key={r.id} type="button" className="race-kind" aria-pressed={kind === r.id} onClick={() => setKind(r.id)}>
                  <strong>{r.name}</strong>
                  <span>{r.laps} laps · entry {short(r.entry)} · win <b>{short(r.prizes[0])}</b>, 2nd {short(r.prizes[1])}, 3rd {short(r.prizes[2])}</span>
                </button>
              ))}
            </div>

            <div className="race-section">Your car</div>
            <div className="race-cars">
              {ownModel ? (
                <button type="button" className="race-car" aria-pressed={hire === null} onClick={() => setHire(null)}>
                  <CarPicture model={ownModel} colour={ownColour} width={84} />
                  <span><strong>The car you drove here</strong><br /><small>No hire to pay</small></span>
                  <b>Free</b>
                </button>
              ) : (
                <p className="race-small">Drive here in your own car to race in it, or hire one.</p>
              )}
              {info.hires.map((h) => (
                <button key={h.model} type="button" className="race-car" aria-pressed={hire === h.model} onClick={() => setHire(h.model)}>
                  <CarPicture model={h.model} colour="red" width={84} />
                  <span><strong>{h.name}</strong><br /><small>Hired for this race</small></span>
                  <b>{short(h.price)}</b>
                </button>
              ))}
            </div>

            <div className="race-section">Bet on yourself to win: it pays {race?.odds ?? 3} times the stake</div>
            <div className="race-chips" role="group" aria-label="Bet">
              {bets.map((amount) => (
                <button key={amount} type="button" aria-pressed={bet === amount} onClick={() => setBet(amount)}>
                  {amount === 0 ? "No bet" : short(amount)}
                </button>
              ))}
            </div>
            <p className="race-small">Lose the race and the stake is gone. Game money only: it can't be bought or cashed out.</p>

            <div className="race-total">
              <span>To pay now</span>
              <span>{naira(total)}</span>
            </div>
            {error && <p className="error">{error}</p>}
            <button type="button" className="race-go" disabled={starting || busy || total > info.money} onClick={() => void go()}>
              {total > info.money ? `You have ${naira(info.money)}` : starting ? "Signing you up…" : "Line up on the grid"}
            </button>
          </>
        )}
        {error && !info && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

/** Where the player is in the field right now, from the checkpoints the server has counted. */
function placeNow(race: Race, t: number): number {
  const mine = (race.checkpoint / race.total) * race.laps * LAP;
  let ahead = 0;
  race.rivals.forEach((rival, index) => {
    const start = gridSlot(index + 1).x - gridSlot(0).x - 7;
    if (rivalDistance(start, race.laps * LAP, rival.seconds, t) > mine) ahead++;
  });
  return ahead + 1;
}

export function RaceHud({ race, offset, onQuit }: { race: Race; offset: number; onQuit: () => void }) {
  const [now, setNow] = useState(() => Date.now() + offset);
  const frame = useRef(0);
  useEffect(() => {
    const tick = () => {
      setNow(Date.now() + offset);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [offset]);
  const t = (now - race.go_ms) / 1000;
  const perLap = race.total / race.laps;
  const lap = Math.min(race.laps, Math.floor(race.checkpoint / perLap) + 1);
  const count = Math.ceil(-t);

  return (
    <>
      <style>{STYLE}</style>
      {t < 0 && <div className="race-count">{count <= 3 ? count : ""}</div>}
      {t >= 0 && t < 1.2 && <div className="race-count go">GO!</div>}
      <div className="race-hud" role="status">
        <div className="pos"><small>POS</small>{t < 0 ? "–" : `${placeNow(race, t)}/4`}</div>
        <div><small>LAP</small>{lap}/{race.laps}</div>
        <div><small>CHECKPOINT</small>{race.checkpoint % perLap}/{perLap}</div>
        <div><small>TIME</small>{t < 0 ? "0.0" : t.toFixed(1)}</div>
      </div>
      {race.false_start && t < 4 && <div className="race-count" style={{ fontSize: 32 }}>False start: +5 s</div>}
      <button type="button" className="race-quit" onClick={onQuit}>Give up</button>
    </>
  );
}

export function RaceResultSheet({ race, message, onClose }: { race: Race; message: string; onClose: () => void }) {
  const rows = [
    ...race.rivals.map((r) => ({ name: r.name, seconds: r.seconds, me: false })),
    ...(race.seconds !== null ? [{ name: "You", seconds: race.seconds, me: true }] : []),
  ].sort((a, b) => a.seconds - b.seconds);
  return (
    <div className="sheet">
      <style>{STYLE}</style>
      <div className="sheet-card race-result">
        <div className="sheet-top">
          <div>
            <h2>{race.name}</h2>
            <p>{race.place === 1 ? "You won!" : "Race over"}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
        </div>
        {race.place && <h3>{race.place === 1 ? "1st" : race.place === 2 ? "2nd" : race.place === 3 ? "3rd" : `${race.place}th`}</h3>}
        <table className="race-table">
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.name} className={row.me ? "me" : ""}>
                <td>{i + 1}. {row.name}</td>
                <td>{row.seconds.toFixed(2)} s</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sheet-note">{message}</p>
        {race.won > 0 && <p className="race-total"><span>You won</span><span>{naira(race.won)}</span></p>}
      </div>
    </div>
  );
}
