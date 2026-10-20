import { useCallback, useEffect, useRef, useState } from "react";
import { checkRaise, fetchSpending, pretendToPay, startRaise, type Spending } from "../api/spending";

const naira = (amount: number) => `₦${amount.toLocaleString()}`;
/** ₦500k, ₦5m, ₦5bn: a tier's limit in a small box. */
const short = (amount: number) =>
  amount >= 1e9 ? `₦${+(amount / 1e9).toFixed(1)}bn` : amount >= 1e6 ? `₦${+(amount / 1e6).toFixed(1)}m` : amount >= 1e3 ? `₦${Math.round(amount / 1e3)}k` : naira(amount);
const CHECK_EVERY = 4000;      // ms between asking whether the payment has gone through
const CHECK_FOR = 3 * 60_000;  // ... for this long after the checkout opened

type Props = {
  playerId: string;
  /** What the server said when the spend was refused, or "" when opened from the menu. */
  reason: string;
  onClose: () => void;
  /** The limit went up. */
  onRaised: (spending: Spending) => void;
};

/**
 * Today's spending limit, reached: how far they got, and a raise for real money (Paystack).
 * The limit only goes up when the server has heard from Paystack that the money arrived.
 */
export function LimitSheet({ playerId, reason, onClose, onRaised }: Props) {
  const [spending, setSpending] = useState<Spending | null>(null);
  const [paying, setPaying] = useState<{ reference: string; url: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Spending | null>(null);
  const started = useRef(0);

  useEffect(() => {
    fetchSpending(playerId).then(setSpending).catch((problem: unknown) => setError(problem instanceof Error ? problem.message : "Could not load your limit."));
  }, [playerId]);

  const finished = useCallback((now: Spending) => {
    setDone(now);
    setSpending(now);
    setPaying(null);
    onRaised(now);
  }, [onRaised]);

  // Waiting on Paystack: ask the server now and then whether the money arrived.
  useEffect(() => {
    if (!paying || paying.url === null) return;
    const timer = window.setInterval(() => {
      if (performance.now() - started.current > CHECK_FOR) {
        window.clearInterval(timer);
        return;
      }
      checkRaise(playerId, paying.reference)
        .then((result) => {
          if (result.paid) finished(result.spending);
          else if (result.status === "failed") {
            setPaying(null);
            setError("The payment did not go through. Nothing was taken.");
          }
        })
        .catch(() => {});
    }, CHECK_EVERY);
    return () => window.clearInterval(timer);
  }, [paying, playerId, finished]);

  const raise = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const opened = await startRaise(playerId);
      started.current = performance.now();
      setPaying({ reference: opened.reference, url: opened.checkout_url });
      if (opened.checkout_url) window.open(opened.checkout_url, "_blank", "noopener");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not start the payment.");
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    if (!paying || busy) return;
    setBusy(true);
    try {
      const result = await checkRaise(playerId, paying.reference);
      if (result.paid) finished(result.spending);
      else setError(result.status === "failed" ? "The payment did not go through." : "Not paid yet. Finish on the Paystack page, then come back.");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not check.");
    } finally {
      setBusy(false);
    }
  };
  const pretend = async () => {
    if (!paying || busy) return;
    setBusy(true);
    try {
      const result = await pretendToPay(playerId, paying.reference);
      if (result.paid) finished(result.spending);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not pretend.");
    } finally {
      setBusy(false);
    }
  };

  const used = spending ? Math.min(1, spending.spent / Math.max(1, spending.allowance)) : 0;
  return (
    <div className="sheet limit-sheet" role="dialog" aria-label="Daily spending limit">
      <style>{`
        .limit-sheet .sheet-card { max-width: 420px; }
        .limit-bar { height: 10px; border-radius: 5px; background: #ece4d6; overflow: hidden; margin: 8px 0 4px; }
        .limit-bar b { display: block; height: 100%; background: linear-gradient(90deg, #2fae5a, #e0a63d, #d6452f); }
        .limit-numbers { display: flex; justify-content: space-between; font-size: 12px; color: #6b6259; }
        .limit-offer { margin-top: 12px; padding: 12px; border-radius: 14px; background: #1c1420; color: #fff; display: flex; flex-direction: column; gap: 6px; }
        .limit-offer strong { font-size: 17px; }
        .limit-offer button.primary { align-self: stretch; background: #ffd23f; color: #1c1420; border: 0; border-radius: 12px; padding: 12px; font-weight: 900; font-size: 15px; }
        .limit-small { font-size: 11px; color: #8a8077; margin-top: 10px; line-height: 1.4; }
        .limit-tiers { list-style: none; margin: 12px 0 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
        .limit-tiers li { border-radius: 12px; padding: 8px 6px; background: #f3ede3; text-align: center; display: flex; flex-direction: column; gap: 2px; }
        .limit-tiers li span { font-size: 11px; color: #6b6259; }
        .limit-tiers li b { font-size: 14px; }
        .limit-tiers li i { font-style: normal; font-size: 12px; font-weight: 700; color: #1c1420; }
        .limit-tiers li.bought { background: #e8fff0; }
        .limit-tiers li.bought i { color: #1f6b3a; }
        .limit-tiers li.next { outline: 2px solid #ffd23f; }
        .limit-tiers li.past { opacity: 0.45; }
        .limit-party { margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: #fff4d6; font-weight: 700; font-size: 13px; }
        .limit-done { background: #e8fff0; border-radius: 12px; padding: 10px 12px; margin-top: 10px; font-weight: 700; color: #1f6b3a; }
      `}</style>
      <div className="sheet-card">
        <div className="sheet-top">
          <div>
            <h2>Daily spending limit</h2>
            <p>{reason || "How much you can spend in the game today."}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
        </div>
        {spending && (
          <>
            <div className="limit-bar" aria-hidden="true"><b style={{ width: `${Math.round(used * 100)}%` }} /></div>
            <div className="limit-numbers">
              <span>Spent today {naira(spending.spent)}</span>
              <span>{spending.unlimited ? "No daily limit" : `Limit ${naira(spending.allowance)}`}</span>
            </div>
            {spending.unlimited && <div className="limit-done" role="status">You have no daily limit (admin).</div>}
            {!spending.unlimited && spending.special_day && (
              <div className="limit-party">🎂 Birthday special: everyone can spend {naira(spending.free)} free today.</div>
            )}
            {!spending.unlimited && <ul className="limit-tiers" aria-label="The tiers">
              {spending.tiers.map((tier) => (
                <li key={tier.number}
                  className={tier.bought ? "bought" : !tier.useful ? "past" : spending.can_raise && tier.limit === spending.next_allowance ? "next" : ""}>
                  <span>Tier {tier.number}</span>
                  <b>{short(tier.limit)}</b>
                  <i>{tier.bought ? "Yours today" : tier.price}</i>
                </li>
              ))}
            </ul>}
            {spending.unlimited ? null : done ? (
              <div className="limit-done" role="status">Done. Your limit today is now {naira(done.allowance)}.</div>
            ) : !spending.can_raise ? (
              <div className="limit-done" role="status">You have the highest limit today. It starts again at midnight.</div>
            ) : (
              <div className="limit-offer">
                <span>Raise today's limit to</span>
                <strong>{naira(spending.next_allowance)}</strong>
                {!paying && (
                  <button type="button" className="primary" onClick={() => void raise()} disabled={busy || (!spending.payments && !spending.test_payments)}>
                    {busy ? "Opening…" : spending.payments || spending.test_payments ? `Pay ${spending.next_price}` : "Payments are not open yet"}
                  </button>
                )}
                {paying && paying.url && (
                  <>
                    <span>Pay on the Paystack page that opened. Your limit goes up as soon as Paystack confirms it.</span>
                    <button type="button" className="primary" onClick={() => void check()} disabled={busy}>I have paid</button>
                    <a href={paying.url} target="_blank" rel="noopener noreferrer" style={{ color: "#ffd23f", fontSize: 13 }}>Open the payment page again</a>
                  </>
                )}
                {paying && !paying.url && (
                  <button type="button" className="primary" onClick={() => void pretend()} disabled={busy}>Pretend to pay (test server)</button>
                )}
              </div>
            )}
          </>
        )}
        {error && <p className="life-why" role="alert">{error}</p>}
        <p className="limit-small">
          This is real money, charged by Paystack in naira. Everyone gets {spending ? naira(spending.free) : "some"} a day free; each tier
          above it is bought once for the day, one after the other, and everything starts again at midnight. Game money cannot be turned back into real money. Under 18? Ask a parent or guardian first.
        </p>
      </div>
    </div>
  );
}
