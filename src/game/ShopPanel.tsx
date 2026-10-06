import { useEffect, useState } from "react";
import { buyFromShop, fetchShop, type Shop } from "../api/market";

type Props = {
  playerId: string;
  /** Which kind of stall this is: okrika, food ... */
  shopId: string;
  /** Who is selling, for the heading. */
  seller: string;
  onMoney: (money: number) => void;
  onClose: () => void;
};

/** What one seller has, at the prices this player gets. */
export function ShopPanel({
  playerId,
  shopId,
  seller,
  onMoney,
  onClose,
}: Props) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState("");
  const [receipt, setReceipt] = useState("");
  const [money, setMoney] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchShop(playerId, shopId)
      .then((loaded) => {
        if (cancelled) return;
        setShop(loaded);
        setMoney(loaded.money);
      })
      .catch((problem: unknown) => {
        if (!cancelled)
          setError(
            problem instanceof Error
              ? problem.message
              : "The seller is not answering."
          );
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, shopId]);

  const buy = async (itemId: string) => {
    if (buying) return;
    setBuying(itemId);
    setError("");
    try {
      const done = await buyFromShop(playerId, shopId, itemId);
      setMoney(done.money);
      onMoney(done.money);
      setReceipt(
        `Bought ${done.bought} for ₦${done.paid.toLocaleString()}. ${
          done.bag.total
        } in your bag.`
      );
    } catch (problem) {
      setReceipt("");
      setError(
        problem instanceof Error ? problem.message : "Could not buy that."
      );
    } finally {
      setBuying("");
    }
  };

  return (
    <div className='sheet'>
      <div className='sheet-card'>
        <div className='sheet-top'>
          <div>
            <h2>{seller}</h2>
            <p>{shop ? shop.name : "…"}</p>
          </div>
          <button type='button' className='ghost' onClick={onClose}>
            Leave
          </button>
        </div>

        {shop && <p className='sheet-note'>{shop.note}</p>}

        <div className='sheet-rows'>
          {shop?.items.map((item) => (
            <div key={item.id} className='sheet-row'>
              <span className='sheet-name'>{item.name}</span>
              <span className='sheet-price'>
                ₦{item.price.toLocaleString()}
              </span>
              <button
                type='button'
                className='primary'
                onClick={() => void buy(item.id)}
                disabled={
                  buying !== "" || (money !== null && money < item.price)
                }
              >
                {buying === item.id ? "…" : "Buy"}
              </button>
            </div>
          ))}
        </div>

        {receipt && <p className='sheet-good'>{receipt}</p>}
        {error && <p className='error'>{error}</p>}
        {money !== null && (
          <p className='sheet-small'>You have ₦{money.toLocaleString()}.</p>
        )}
      </div>
    </div>
  );
}
