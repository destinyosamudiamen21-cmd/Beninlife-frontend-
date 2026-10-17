// The order a player is carrying: where it goes, how long is left, and the button to hand
// it over once they are standing at the door. The server decides whether they really are.

import { useEffect, useState } from "react";
import type { Delivery, Fare } from "../api/jobs";

const STYLE = `
        .delivery-hud { position: fixed; z-index: 30; left: 50%; transform: translateX(-50%); top: calc(64px + env(safe-area-inset-top));
          width: min(420px, calc(100vw - 32px)); background: #0f3b33; color: #fff; border-radius: 14px; padding: 10px 12px;
          border: 1px solid #d4a548; font: 14px/1.35 system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
        .delivery-hud .dh-top { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
        .delivery-hud strong { font-size: 15px; }
        .delivery-hud .dh-clock { font-variant-numeric: tabular-nums; font-weight: 800; color: #f3d48a; }
        .delivery-hud .dh-clock.late { color: #ff8a80; }
        .delivery-hud .dh-what { color: rgba(255,255,255,0.78); margin: 2px 0 8px; }
        .delivery-hud .dh-buttons { display: flex; gap: 6px; }
        .delivery-hud button { border: 0; border-radius: 9px; padding: 8px 12px; font-weight: 700; cursor: pointer; font-size: 14px; }
        .delivery-hud .dh-go { background: #d4a548; color: #1a1206; flex: 1; }
        .delivery-hud .dh-go:disabled { opacity: 0.5; cursor: default; }
        .delivery-hud .dh-plain { background: rgba(255,255,255,0.14); color: #fff; }
      `;

const DISTRICT_NAMES: Record<string, string> = {
  uniben: "UNIBEN", gra: "GRA", ringroad: "Ring Road", newbenin: "New Benin", ikpoba: "Ikpoba Hill",
};

type Props = {
  delivery: Delivery;
  /** Standing at the door, as far as this phone can tell. */
  atDoor: boolean;
  busy: boolean;
  onHandOver: () => void;
  onDrop: () => void;
  onMap: () => void;
};

export function DeliveryHud({ delivery, atDoor, busy, onHandOver, onDrop, onMap }: Props) {
  // Time left on the server's clock: this phone's clock may be minutes out.
  const [offset] = useState(() => delivery.now_ms - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + offset), 500);
    return () => window.clearInterval(timer);
  }, [offset]);
  const left = Math.round((delivery.due_ms - now) / 1000);
  const late = left < 0;
  const clock = `${Math.floor(Math.abs(left) / 60)}:${String(Math.abs(left) % 60).padStart(2, "0")}`;

  return (
    <div className="delivery-hud" role="status">
      <style>{STYLE}</style>
      <div className="dh-top">
        <strong>Deliver to {delivery.to_name}</strong>
        <span className={late ? "dh-clock late" : "dh-clock"}>{late ? `late ${clock}` : clock}</span>
      </div>
      <div className="dh-what">
        {delivery.dish} · {DISTRICT_NAMES[delivery.district] ?? delivery.district} · ₦{(late ? Math.floor(delivery.pay / 2) : delivery.pay).toLocaleString()}
      </div>
      <div className="dh-buttons">
        <button type="button" className="dh-go" disabled={!atDoor || busy} onClick={onHandOver}>
          {atDoor ? "Hand over the food" : "Go to the door"}
        </button>
        <button type="button" className="dh-plain" onClick={onMap}>Map</button>
        <button type="button" className="dh-plain" onClick={onDrop} disabled={busy}>Drop</button>
      </div>
    </div>
  );
}

/** A taxi fare: first to where the passenger waits, then to where they are going. */
export function TaxiHud({ fare, atStop, busy, onAct, onDrop }: { fare: Fare; atStop: boolean; busy: boolean; onAct: () => void; onDrop: () => void }) {
  const riding = fare.state === "riding";
  return (
    <div className="delivery-hud" role="status">
      <style>{STYLE}</style>
      <div className="dh-top">
        <strong>{riding ? `Take ${fare.passenger} to ${fare.to_name}` : `Pick up ${fare.passenger} at ${fare.from_name}`}</strong>
        <span className="dh-clock">₦{fare.pay.toLocaleString()}</span>
      </div>
      <div className="dh-what">{riding ? "In the car. Drive them there." : "Waiting by the door. Drive up to them."}</div>
      <div className="dh-buttons">
        <button type="button" className="dh-go" disabled={!atStop || busy} onClick={onAct}>
          {atStop ? (riding ? "Drop them off" : "Pick them up") : riding ? "Drive to the drop-off" : "Drive to the passenger"}
        </button>
        <button type="button" className="dh-plain" onClick={onDrop} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
