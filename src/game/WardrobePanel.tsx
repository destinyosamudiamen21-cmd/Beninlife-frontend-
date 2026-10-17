import { useEffect, useRef, useState } from "react";
import { buyOutfit, fetchWardrobe, sellOutfit, wearOutfit, type Outfit, type Wardrobe } from "../api/wardrobe";

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

type Props = {
  playerId: string;
  onMoney: (money: number) => void;
  /** The player changed clothes: the game should show the new look. */
  onWear: () => void;
  onClose: () => void;
};

/** The three colours of an outfit, as a little figure: top over trousers over shoes. */
function Swatch({ outfit }: { outfit: Outfit }) {
  return (
    <span className="ward-swatch" aria-hidden="true">
      <i style={{ background: outfit.top }} />
      <i style={{ background: outfit.bottom }} />
      <i style={{ background: outfit.shoes }} />
    </span>
  );
}

/** The boutique in the mall: buy an outfit, change into it, sell it back for half. */
export function WardrobePanel({ playerId, onMoney, onWear, onClose }: Props) {
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    fetchWardrobe(playerId)
      .then((loaded) => alive.current && setWardrobe(loaded))
      .catch((problem: unknown) => alive.current && setError(problem instanceof Error ? problem.message : "The boutique is closed."));
    return () => {
      alive.current = false;
    };
  }, [playerId]);

  const act = async (outfit: Outfit, what: "buy" | "sell" | "wear") => {
    if (busy) return;
    setBusy(`${what}:${outfit.id}`);
    setError("");
    try {
      const work = what === "buy" ? buyOutfit : what === "sell" ? sellOutfit : wearOutfit;
      const now = await work(playerId, outfit.id);
      if (!alive.current) return;
      setWardrobe(now);
      onMoney(now.money);
      if (what === "wear") onWear();
      setSaid(what === "buy" ? `${outfit.name}: bought. Press Wear to change into it.` : what === "sell" ? `Sold for ${naira(Math.floor(outfit.price / 2))}.` : `You are wearing the ${outfit.name.toLowerCase()}.`);
    } catch (problem) {
      if (alive.current) setError(problem instanceof Error ? problem.message : "That did not go through.");
    } finally {
      if (alive.current) setBusy("");
    }
  };

  return (
    <div className="sheet" role="dialog" aria-label="Boutique">
      <style>{`
        .ward-list { display: flex; flex-direction: column; gap: 6px; max-height: min(52dvh, 460px); overflow-y: auto; }
        .ward-item { display: flex; align-items: center; gap: 10px; background: rgba(255, 255, 255, 0.06); border-radius: 12px; padding: 8px 10px; }
        .ward-item.on { outline: 2px solid #e2b657; }
        .ward-swatch { display: flex; flex-direction: column; width: 26px; border-radius: 6px; overflow: hidden; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.25); }
        .ward-swatch i { display: block; height: 12px; }
        .ward-swatch i:nth-child(2) { height: 14px; }
        .ward-swatch i:nth-child(3) { height: 5px; }
        .ward-lines { flex: 1; min-width: 0; }
        .ward-lines strong { display: block; font-size: 14.5px; }
        .ward-lines span { font-size: 12.5px; opacity: 0.75; }
        .ward-item button { border: none; border-radius: 9px; padding: 8px 11px; font-weight: 700; font-size: 13px; background: #2f6f5e; color: #fff; }
        .ward-item button.plain { background: rgba(255,255,255,0.12); color: inherit; }
        .ward-note { font-size: 13px; margin: 6px 0; }
      `}</style>
      <div className="sheet-card">
        <div className="sheet-top">
          <div>
            <h2>The boutique</h2>
            <p>{wardrobe ? `You have ${naira(wardrobe.money)} · Sell back for half price` : "Opening…"}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {error && <p className="life-error-inline ward-note" style={{ color: "#ff9a8a" }}>{error}</p>}
        {said && !error && <p className="ward-note">{said}</p>}
        {wardrobe && !wardrobe.in_shop && <p className="ward-note">You can change into clothes you own here. Buying and selling is in the boutique at the mall.</p>}
        <div className="ward-list">
          {wardrobe?.outfits.map((outfit) => (
            <div key={outfit.id} className={`ward-item${wardrobe.wearing === outfit.id ? " on" : ""}`}>
              <Swatch outfit={outfit} />
              <div className="ward-lines">
                <strong>{outfit.name}</strong>
                <span>
                  {naira(outfit.price)}
                  {outfit.owned > 0 ? ` · You have ${outfit.owned}` : ""}
                  {wardrobe.wearing === outfit.id ? " · Wearing" : ""}
                </span>
              </div>
              {outfit.owned > 0 && wardrobe.wearing !== outfit.id && (
                <button type="button" onClick={() => void act(outfit, "wear")} disabled={busy !== ""}>
                  {busy === `wear:${outfit.id}` ? "…" : "Wear"}
                </button>
              )}
              {outfit.owned > 0 && wardrobe.in_shop && (
                <button type="button" className="plain" onClick={() => void act(outfit, "sell")} disabled={busy !== ""}>
                  {busy === `sell:${outfit.id}` ? "…" : "Sell"}
                </button>
              )}
              {wardrobe.in_shop && (
                <button type="button" className="plain" onClick={() => void act(outfit, "buy")} disabled={busy !== "" || outfit.price > wardrobe.money}>
                  {busy === `buy:${outfit.id}` ? "…" : "Buy"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
