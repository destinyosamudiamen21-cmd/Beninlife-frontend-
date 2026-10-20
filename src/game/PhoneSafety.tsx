// The Safety app: report or block anyone, see who is blocked, and read the rules. And,
// for admins only, the Admin app: the reports that came in, and banning.

import { AdminStats } from "./AdminStats";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  banPlayer, block, closeReport, fetchBlocks, fetchReasons, fetchReports, report, unbanPlayer, unblock,
  type AdminReport, type Blocks, type Who,
} from "../api/safety";
import { Face, Screen, ago, words } from "./phoneKit";
import type { RosterEntry } from "./types";

const REASON_WORDS: Record<string, string> = {
  harassment: "Bullying or harassment",
  hate: "Hate or insults about who someone is",
  sexual: "Sexual messages or behaviour",
  scam: "Scam or fraud",
  cheating: "Cheating or using a bug",
  impersonation: "Pretending to be someone else",
  other: "Something else",
};

type SafetyProps = {
  playerId: string;
  /** Players where this one is: quick to pick. */
  nearby: RosterEntry[];
  onBack: () => void;
};

export function SafetyApp({ playerId, nearby, onBack }: SafetyProps) {
  const [blocks, setBlocks] = useState<Blocks | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [target, setTarget] = useState<Who & { name: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    fetchBlocks(playerId).then((b) => alive.current && setBlocks(b)).catch(() => {});
    fetchReasons().then((r) => alive.current && setReasons(r)).catch(() => setReasons(Object.keys(REASON_WORDS)));
  }, [playerId]);

  const act = async (work: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      await work();
    } catch (problem) {
      if (alive.current) setError(words(problem, fallback));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const pick = (event: FormEvent) => {
    event.preventDefault();
    const name = typed.trim().replace(/^@/, "");
    if (name) setTarget({ username: name, name });
  };

  const sendReport = () => act(async () => {
    if (!target || !reason) return;
    await report(playerId, target, reason, details);
    if (!alive.current) return;
    setDone(`Thank you. The admins will look at what @${target.name} did.${isBlocked(target) ? "" : " If you don't want to hear from them meanwhile, block them too."}`);
    setReason("");
    setDetails("");
  }, "Could not send the report.");

  const blockTarget = () => act(async () => {
    if (!target) return;
    const now = await block(playerId, target);
    if (!alive.current) return;
    setBlocks(now);
    setDone(`@${target.name} is blocked. You won't hear them, and they can't text you, send you money or talk to you by voice. They are not told.`);
  }, "Could not block them.");

  const isBlocked = (who: Who & { name: string }) =>
    Boolean(blocks?.blocked.some((b) => b.id === who.player_id || b.username.toLowerCase() === who.name.toLowerCase()));
  const targetBlocked = target ? isBlocked(target) : false;

  return (
    <Screen title="Safety" sub="Report or block anyone" onBack={onBack}>
      {!target ? (
        <>
          <form className="ph-send" onSubmit={pick}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="@username" maxLength={40} autoCapitalize="none" autoCorrect="off" aria-label="Username to report or block" />
            <button type="submit" className="ph-go" disabled={!typed.trim()}>Next</button>
          </form>
          {nearby.length > 0 && (
            <>
              <h3 className="ph-heading">Near you</h3>
              <div className="ph-chips">
                {nearby.slice(0, 12).map((person) => (
                  <button key={person.id} type="button" onClick={() => setTarget({ player_id: person.id, name: person.username })}>
                    @{person.username}
                  </button>
                ))}
              </div>
            </>
          )}
          <h3 className="ph-heading">Blocked</h3>
          <div className="ph-list">
            {blocks?.blocked.map((who) => (
              <div key={who.id} className="ph-item">
                <Face name={who.username} />
                <div className="ph-lines"><strong>@{who.username}</strong><span>Blocked</span></div>
                <button type="button" className="ph-mini plain" disabled={busy}
                  onClick={() => void act(async () => { const now = await unblock(playerId, who.id); if (alive.current) setBlocks(now); }, "Could not unblock them.")}>
                  Unblock
                </button>
              </div>
            ))}
            {blocks && blocks.blocked.length === 0 && <p className="ph-small" style={{ padding: "10px 12px" }}>Nobody blocked.</p>}
          </div>
          <p className="ph-small">
            If someone makes you feel unsafe, block them and report them. If you are in danger in real life, tell an adult you trust or call 112.
          </p>
          <p className="ph-small">
            <a href="/terms.html" target="_blank" rel="noreferrer">Terms of use</a> · <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy policy</a>
          </p>
        </>
      ) : (
        <>
          <div className="ph-item">
            <Face name={target.name} />
            <div className="ph-lines"><strong>@{target.name}</strong><span>{targetBlocked ? "Blocked" : "Report or block"}</span></div>
            <button type="button" className="ph-mini plain" onClick={() => { setTarget(null); setDone(""); setError(""); }}>Back</button>
          </div>
          {!targetBlocked && (
            <button type="button" className="ph-go" style={{ background: "#ff3b30", flex: "none", height: "auto", padding: "12px 16px", fontWeight: 700 }} onClick={() => void blockTarget()} disabled={busy}>
              Block @{target.name}
            </button>
          )}
          <h3 className="ph-heading">What did they do?</h3>
          <div className="ph-chips">
            {reasons.map((id) => (
              <button key={id} type="button" className={reason === id ? "on" : ""} onClick={() => setReason(id)}>
                {REASON_WORDS[id] ?? id}
              </button>
            ))}
          </div>
          <form className="ph-send" onSubmit={(e) => { e.preventDefault(); void sendReport(); }}>
            <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What happened (optional)" maxLength={500} aria-label="What happened" />
            <button type="submit" className="ph-go" disabled={busy || !reason}>Report</button>
          </form>
          <p className="ph-small">A report goes to the admins, with the last texts they sent you. They are not told who reported them.</p>
        </>
      )}
      {done && <p className="ph-small" style={{ color: "#248a3d", fontWeight: 600 }}>{done}</p>}
      {error && <p className="ph-error">{error}</p>}
    </Screen>
  );
}

// ---- admins -----------------------------------------------------------------------------------

export function AdminApp({ onBack }: { onBack: () => void }) {
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"stats" | "reports">("stats");

  const load = () => fetchReports().then((r) => setReports(r.reports)).catch((p: unknown) => setError(words(p, "Could not load the reports.")));
  useEffect(() => {
    void load();
  }, []);

  const act = async (work: () => Promise<unknown>, said: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      setNote(said);
      await load();
    } catch (problem) {
      setError(words(problem, "That did not work."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Admin" sub={reports ? `${reports.length} open reports` : "Reports"} onBack={onBack}>
      <div className="ph-chips" role="tablist" aria-label="Admin">
        <button type="button" role="tab" aria-selected={tab === "stats"} className={tab === "stats" ? "on" : ""} onClick={() => setTab("stats")}>Stats</button>
        <button type="button" role="tab" aria-selected={tab === "reports"} className={tab === "reports" ? "on" : ""} onClick={() => setTab("reports")}>Reports</button>
      </div>
      {tab === "stats" ? <AdminStats /> : <>
      <div className="ph-chips" role="group" aria-label="Ban for">
        {[1, 3, 7, 30, 0].map((d) => (
          <button key={d} type="button" className={days === d ? "on" : ""} onClick={() => setDays(d)}>
            {d === 0 ? "For good" : `${d} day${d === 1 ? "" : "s"}`}
          </button>
        ))}
      </div>
      {note && <p className="ph-small" style={{ color: "#248a3d", fontWeight: 600 }}>{note}</p>}
      {error && <p className="ph-error">{error}</p>}
      <div className="ph-list">
        {reports?.map((r) => (
          <div key={r.id} className="ph-item tall">
            <Face name={r.reported} />
            <div className="ph-lines">
              <strong>@{r.reported}{r.banned ? " · banned" : ""}</strong>
              <span>{REASON_WORDS[r.reason] ?? r.reason} · by @{r.reporter} · {ago(r.created_ms)} · {r.reports_against} open against them</span>
              {r.details && <span>"{r.details}"</span>}
              {r.context && <span style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#444" }}>{r.context}</span>}
              <span style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {r.banned ? (
                  <button type="button" className="ph-mini plain" disabled={busy}
                    onClick={() => void act(() => unbanPlayer({ player_id: r.reported_id }), `@${r.reported} can play again.`)}>
                    Unban
                  </button>
                ) : (
                  <button type="button" className="ph-mini" style={{ background: "#ff3b30" }} disabled={busy}
                    onClick={() => void act(() => banPlayer({ player_id: r.reported_id }, REASON_WORDS[r.reason] ?? "Broke the rules", days), `@${r.reported} is banned ${days ? `for ${days} days` : "for good"}.`)}>
                    Ban {days ? `${days}d` : "for good"}
                  </button>
                )}
                <button type="button" className="ph-mini plain" disabled={busy}
                  onClick={() => void act(() => closeReport(r.id), "Report closed.")}>
                  Close
                </button>
              </span>
            </div>
          </div>
        ))}
        {reports && reports.length === 0 && <p className="ph-small" style={{ padding: "10px 12px" }}>No open reports.</p>}
      </div>
      </>}
    </Screen>
  );
}
