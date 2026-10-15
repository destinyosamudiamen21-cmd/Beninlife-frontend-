import { useMemo, useState } from "react";
import {
  buyItem,
  moveItem,
  sellItem,
  type FurnitureOption,
  type Home,
  type HomeChange,
  type PlacedItem,
} from "../api/home";
import type { Arranging, Offer } from "./HomeScene";
import { sellPrice } from "./homeDecor";

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

type Props = {
  playerId: string;
  home: Home;
  money: number;
  /** The piece of furniture the player is standing at, if any: the one Move and Sell act on. */
  picked: PlacedItem | null;
  /** The piece being put down, if one is. The scene shows where it would go. */
  arranging: Arranging | null;
  onArranging: (arranging: Arranging | null) => void;
  /** Where that piece would go right now, and why it cannot, if it cannot. */
  offer: Offer | null;
  /** The house changed on the server: here is how it now stands. */
  onChange: (change: HomeChange) => void;
  onDone: () => void;
};

/**
 * Arranging the house. The player walks about as usual: a new piece is offered on the
 * floor just beyond them, green where it fits and red where it does not, and the piece
 * they stand beside is the one that Move and Sell act on. The server checks everything again.
 */
export function DecoratePanel({
  playerId,
  home,
  money,
  picked,
  arranging,
  onArranging,
  offer,
  onChange,
  onDone,
}: Props) {
  const [shop, setShop] = useState(false);
  const [selling, setSelling] = useState<PlacedItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo(
    () => new Map(home.catalogue.map((option) => [option.id, option])),
    [home.catalogue]
  );
  const groups = useMemo(() => {
    const byGroup = new Map<string, FurnitureOption[]>();
    for (const option of home.catalogue)
      byGroup.set(option.group, [...(byGroup.get(option.group) ?? []), option]);
    return [...byGroup.entries()];
  }, [home.catalogue]);

  /** Send one change to the server and take in how the house stands afterwards. */
  const send = async (work: () => Promise<HomeChange>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onChange(await work());
      onArranging(null);
      setSelling(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const choose = (option: FurnitureOption) => {
    setShop(false);
    setError("");
    onArranging({ option, rot: 0, moving: null });
  };

  const pickedOption = picked ? options.get(picked.item) : undefined;
  const sellingOption = selling ? options.get(selling.item) : undefined;

  return (
    <>
      <style>{`
        .decor { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(64px + env(safe-area-inset-bottom));
          z-index: 12; width: min(440px, calc(100vw - 20px)); background: rgba(20, 22, 24, 0.88); color: #fff; border-radius: 16px;
          padding: 12px; display: flex; flex-direction: column; gap: 9px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3); }
        .decor-line { font-size: 13px; opacity: 0.92; text-align: center; }
        .decor-line strong { font-size: 15px; opacity: 1; }
        .decor-ok { color: #9ff0bd; }
        .decor-no { color: #ffb3ab; }
        .decor-buttons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .decor-buttons button { border: none; border-radius: 999px; padding: 9px 15px; font-weight: 600; font-size: 14px;
          background: rgba(255, 255, 255, 0.16); color: #fff; }
        .decor-buttons button.decor-go { background: #f4d27a; color: #1f2a26; }
        .decor-buttons button:disabled { opacity: 0.45; }
        .decor-name { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 2px; }
        .decor-name strong { font-size: 15px; }
        .decor-size { font-size: 12px; color: #6b736f; }
      `}</style>

      {shop && (
        <div className='sheet'>
          <div className='sheet-card'>
            <div className='sheet-top'>
              <div>
                <h2>Furniture</h2>
                <p>
                  You have {naira(money)}. Pick a piece, then walk to where you
                  want it.
                </p>
              </div>
              <button
                type='button'
                className='ghost'
                onClick={() => setShop(false)}
              >
                Close
              </button>
            </div>
            {groups.map(([group, list]) => (
              <div key={group} className='sheet-rows'>
                <p className='sheet-note'>{group}</p>
                {list.map((option) => (
                  <div key={option.id} className='sheet-row'>
                    <div className='decor-name'>
                      <strong>{option.name}</strong>
                      <span className='decor-size'>
                        {(option.w * home.plan.cell).toFixed(1)} m ×{" "}
                        {(option.d * home.plan.cell).toFixed(1)} m
                      </span>
                    </div>
                    <span className='sheet-price'>{naira(option.price)}</span>
                    <button
                      type='button'
                      className='primary'
                      onClick={() => choose(option)}
                      disabled={option.price > money}
                    >
                      Choose
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {!shop && (
        <div className='decor' role='group' aria-label='Arrange your house'>
          {error && <p className='decor-line decor-no'>{error}</p>}

          {arranging ? (
            <>
              <p className='decor-line'>
                <strong>{arranging.option.name}</strong>
                {arranging.moving
                  ? " · moving it"
                  : ` · ${naira(arranging.option.price)}`}
              </p>
              <p
                className={`decor-line ${offer?.why ? "decor-no" : "decor-ok"}`}
              >
                {offer?.why ?? "It fits here. Walk to move it."}
              </p>
              <div className='decor-buttons'>
                <button
                  type='button'
                  onClick={() =>
                    onArranging({ ...arranging, rot: (arranging.rot + 1) % 4 })
                  }
                  disabled={busy}
                >
                  Turn
                </button>
                <button
                  type='button'
                  className='decor-go'
                  disabled={busy || !offer || offer.why !== null}
                  onClick={() => {
                    if (!offer) return;
                    const moving = arranging.moving;
                    void send(
                      () =>
                        moving
                          ? moveItem(playerId, moving.id, offer.spot)
                          : buyItem(playerId, arranging.option.id, offer.spot),
                      "Could not put it there."
                    );
                  }}
                >
                  {busy
                    ? "…"
                    : arranging.moving
                    ? "Put it here"
                    : `Buy and place · ${naira(arranging.option.price)}`}
                </button>
                <button
                  type='button'
                  onClick={() => onArranging(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : selling && sellingOption ? (
            <>
              <p className='decor-line'>
                Sell the <strong>{sellingOption.name.toLowerCase()}</strong> for{" "}
                <strong>{naira(sellPrice(sellingOption, selling))}</strong>?
                {selling.gift &&
                  " It came with the house, so it sells for nothing."}
              </p>
              <div className='decor-buttons'>
                <button
                  type='button'
                  className='decor-go'
                  disabled={busy}
                  onClick={() =>
                    void send(
                      () => sellItem(playerId, selling.id),
                      "Could not sell it."
                    )
                  }
                >
                  {busy ? "…" : "Sell it"}
                </button>
                <button
                  type='button'
                  onClick={() => setSelling(null)}
                  disabled={busy}
                >
                  Keep it
                </button>
              </div>
            </>
          ) : (
            <>
              <p className='decor-line'>
                {picked && pickedOption ? (
                  <>
                    You are at the{" "}
                    <strong>{pickedOption.name.toLowerCase()}</strong>.
                  </>
                ) : (
                  "Stand beside a piece to move or sell it."
                )}
              </p>
              <div className='decor-buttons'>
                <button
                  type='button'
                  className='decor-go'
                  onClick={() => setShop(true)}
                >
                  Buy furniture
                </button>
                {picked && pickedOption && (
                  <>
                    <button
                      type='button'
                      onClick={() =>
                        onArranging({
                          option: pickedOption,
                          rot: picked.rot,
                          moving: picked,
                        })
                      }
                    >
                      Move it
                    </button>
                    <button type='button' onClick={() => setSelling(picked)}>
                      Sell it
                    </button>
                  </>
                )}
                <button type='button' onClick={onDone}>
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
