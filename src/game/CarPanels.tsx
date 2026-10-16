// What a player sees of cars outside the 3D: the salesperson's sheet at the dealership, the
// car keys (which car the driver should bring), and the pedals, wheel and speedometer while
// driving.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { buyCar, fetchCars, sellCar, type CarModelInfo, type Cars, type OwnedCar } from "../api/cars";
import { CAR_COLOURS } from "./Car";
import { driveView } from "./carPhysics";
import { carOutline } from "./carShapes";
import { pedalInput } from "./input";

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

const STYLE = `
  .car-pic { display: block; width: 100%; height: auto; }
  .car-head { display: grid; grid-template-columns: 1fr; gap: 2px; margin: 4px 0 8px; }
  .car-head h3 { margin: 0; font-size: 20px; }
  .car-tag { font-size: 12px; color: #7a6a58; }
  .car-specs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; margin: 10px 0; font-size: 13px; }
  .car-specs dt { color: #8a7a68; font-size: 11px; }
  .car-specs dd { margin: 0; font-weight: 700; color: #2a2018; }
  .car-swatches { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; }
  .car-swatch { width: 34px; height: 34px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px #c9bca8; padding: 0; cursor: pointer; }
  .car-swatch[aria-pressed="true"] { box-shadow: 0 0 0 3px #2a2018; }
  .car-price { font-size: 22px; font-weight: 800; color: #2a2018; margin: 6px 0; }
  .car-list { display: grid; gap: 10px; }
  .car-item { display: grid; grid-template-columns: 96px 1fr; gap: 10px; align-items: center; background: #f6efe3; border-radius: 12px; padding: 8px; }
  .car-item strong { display: block; font-size: 14px; }
  .car-item .plate { display: inline-block; font: 700 11px/1 system-ui, sans-serif; letter-spacing: 0.06em; background: #f4f4f0; color: #1d3a8a; border: 1px solid #1d3a8a; border-radius: 3px; padding: 3px 5px; margin: 3px 0; }
  .car-item .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .car-item button { font-size: 12px; padding: 6px 10px; }

  .drive-hud { position: fixed; inset: 0; pointer-events: none; z-index: 30; }
  .drive-hud button { pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none; }
  .drive-steer { position: absolute; left: calc(14px + env(safe-area-inset-left)); bottom: calc(22px + env(safe-area-inset-bottom)); display: flex; gap: 12px; }
  .drive-steer button { width: 76px; height: 76px; border-radius: 50%; border: none; background: rgba(20, 20, 24, 0.55); color: #fff; font-size: 30px; display: grid; place-items: center; backdrop-filter: blur(4px); }
  .drive-pedals { position: absolute; right: calc(14px + env(safe-area-inset-right)); bottom: calc(22px + env(safe-area-inset-bottom)); display: flex; align-items: flex-end; gap: 12px; }
  .drive-pedal { border: none; border-radius: 14px; color: #fff; font: 800 12px/1 system-ui, sans-serif; letter-spacing: 0.08em; display: grid; place-items: end center; padding-bottom: 10px; }
  .drive-pedal.brake { width: 74px; height: 70px; background: linear-gradient(#5a5d63, #33363b); }
  .drive-pedal.gas { width: 62px; height: 104px; background: linear-gradient(#5f6268, #2f3236); }
  .drive-pedal[data-on="true"] { filter: brightness(1.45); transform: translateY(2px); }
  .drive-top { position: absolute; right: calc(14px + env(safe-area-inset-right)); bottom: calc(146px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .drive-horn { width: 58px; height: 58px; border-radius: 50%; border: none; background: rgba(184, 134, 43, 0.9); color: #fff; font: 800 11px/1 system-ui, sans-serif; }
  .drive-out { border: none; border-radius: 999px; background: #f6efe0; color: #2a2018; font: 700 13px/1 system-ui, sans-serif; padding: 11px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
  .drive-speed { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(24px + env(safe-area-inset-bottom)); text-align: center; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.6); font-family: system-ui, sans-serif; }
  .drive-speed b { display: block; font-size: 40px; line-height: 1; font-variant-numeric: tabular-nums; }
  .drive-speed span { font-size: 11px; letter-spacing: 0.12em; opacity: 0.85; }
  .drive-speed i { font-style: normal; display: inline-block; margin-left: 8px; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.45); }
  /* On a phone the wheel and the pedals take the bottom: the dial goes up top, under the place name. */
  @media (max-width: 560px) {
    .drive-speed { bottom: auto; top: calc(104px + env(safe-area-inset-top)); }
    .drive-speed b { font-size: 34px; }
  }
`;

/** The car from the side, in its colour, for menus. */
export function CarPicture({ model, colour, width = 220 }: { model: string; colour: string; width?: number }) {
  const shape = carOutline(model);
  const pad = 0.15;
  const w = shape.length + pad * 2, h = shape.height + pad * 2;
  const pt = ([z, y]: [number, number]) => `${(z + pad).toFixed(3)},${(h - pad - y).toFixed(3)}`;
  const paint = CAR_COLOURS[colour] ?? colour;
  return (
    <svg className="car-pic" viewBox={`0 0 ${w} ${h}`} width={width} aria-hidden="true">
      <ellipse cx={w / 2} cy={h - pad + 0.02} rx={shape.length * 0.52} ry={0.06} fill="rgba(0,0,0,0.18)" />
      <polygon points={shape.body.map(pt).join(" ")} fill={paint} stroke="rgba(0,0,0,0.35)" strokeWidth={0.015} />
      <polygon points={shape.glass.map(pt).join(" ")} fill="#1b232b" />
      {shape.wheels.map((wheel) => (
        <g key={wheel.z}>
          <circle cx={wheel.z + pad} cy={h - pad - wheel.r} r={wheel.r} fill="#17171a" />
          <circle cx={wheel.z + pad} cy={h - pad - wheel.r} r={wheel.rim} fill="#b9bdc2" />
          <circle cx={wheel.z + pad} cy={h - pad - wheel.r} r={wheel.rim * 0.25} fill="#55585e" />
        </g>
      ))}
    </svg>
  );
}

type DealerProps = {
  playerId: string;
  model: string;
  /** The colour the car on the floor is now. */
  colour: string;
  onColour: (model: string, colour: string) => void;
  onBought: (cars: Cars, car: OwnedCar) => void;
  onClose: () => void;
};

/** The salesperson's sheet for one car at the dealership. */
export function DealerPanel({ playerId, model, colour, onColour, onBought, onClose }: DealerProps) {
  const [cars, setCars] = useState<Cars | null>(null);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState(false);
  const [bought, setBought] = useState<OwnedCar | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCars(playerId)
      .then((loaded) => !cancelled && setCars(loaded))
      .catch((problem: unknown) => !cancelled && setError(problem instanceof Error ? problem.message : "The salesperson is busy."));
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const info: CarModelInfo | undefined = cars?.catalogue.find((entry) => entry.id === model);
  const colours = cars ? cars.colours.filter((entry) => info?.colours.includes(entry.id)) : [];
  const chosen = info?.colours.includes(colour) ? colour : info?.colours[0] ?? colour;
  const short = cars && info ? Math.max(0, info.price - cars.money) : 0;

  const buy = async () => {
    if (!info || buying) return;
    setBuying(true);
    setError("");
    try {
      const done = await buyCar(playerId, info.id, chosen);
      const newest = done.cars[done.cars.length - 1];
      setCars(done);
      setBought(newest);
      onBought(done, newest);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The sale did not go through.");
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="sheet">
      <style>{STYLE}</style>
      <div className="sheet-card">
        <div className="sheet-top">
          <div>
            <h2>Benin Auto Mall</h2>
            <p>{info ? `${info.condition} · ${info.year}` : "…"}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <CarPicture model={model} colour={chosen} width={300} />
        {info && (
          <>
            <div className="car-head">
              <h3>{info.name}</h3>
              <span className="car-tag">On the street they call it "{info.nickname}"</span>
            </div>
            <p className="sheet-note">{info.blurb}</p>
            <dl className="car-specs">
              <div><dt>Engine</dt><dd>{info.engine}</dd></div>
              <div><dt>0 to 100 km/h</dt><dd>{info.zero_to_100.toFixed(1)} s</dd></div>
              <div><dt>Top speed</dt><dd>{info.top_kmh} km/h</dd></div>
              <div><dt>Seats</dt><dd>{info.seats}</dd></div>
            </dl>
            <div className="car-swatches" role="group" aria-label="Colour">
              {colours.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="car-swatch"
                  style={{ background: entry.hex }}
                  aria-label={entry.name}
                  aria-pressed={entry.id === chosen}
                  title={entry.name}
                  onClick={() => onColour(model, entry.id)}
                />
              ))}
            </div>
            <p className="sheet-small">{colours.find((entry) => entry.id === chosen)?.name}</p>
            <div className="car-price">{naira(info.price)}</div>
            {bought ? (
              <p className="sheet-good">
                It's yours! Registered as <b>{bought.plate}</b>. Out on the street, tap <b>Car</b> and your driver brings it to you.
              </p>
            ) : (
              <button type="button" className="primary" onClick={() => void buy()} disabled={buying || !cars?.at_dealer || short > 0}>
                {buying ? "Doing the papers…" : short > 0 ? `You need ${naira(short)} more` : `Buy it · ${naira(info.price)}`}
              </button>
            )}
          </>
        )}
        {error && <p className="error">{error}</p>}
        {cars && <p className="sheet-small">You have {naira(cars.money)}.</p>}
      </div>
    </div>
  );
}

type KeysProps = {
  playerId: string;
  /** What is known of the player's cars; the panel refreshes it. */
  cars: Cars | null;
  busy: boolean;
  onBring: (car: OwnedCar) => void;
  onSendHome: () => void;
  onCars: (cars: Cars) => void;
  onClose: () => void;
};

/** The car keys: which car to have brought, and the ones in the garage. */
export function CarKeysPanel({ playerId, cars, busy, onBring, onSendHome, onCars, onClose }: KeysProps) {
  const [error, setError] = useState("");
  const [selling, setSelling] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCars(playerId)
      .then((loaded) => !cancelled && onCars(loaded))
      .catch((problem: unknown) => !cancelled && setError(problem instanceof Error ? problem.message : "Could not find your keys."));
    return () => {
      cancelled = true;
    };
    // Loaded once, when the keys come out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const sell = async (car: OwnedCar) => {
    if (selling !== car.id) {
      setSelling(car.id); // the first tap asks; the second sells
      return;
    }
    try {
      onCars(await sellCar(playerId, car.id));
      setSelling(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not sell it.");
    }
  };

  const name = (car: OwnedCar) => cars?.catalogue.find((entry) => entry.id === car.model)?.name ?? car.model;
  const value = (car: OwnedCar) => Math.floor(car.paid / 2);

  return (
    <div className="sheet">
      <style>{STYLE}</style>
      <div className="sheet-card">
        <div className="sheet-top">
          <div>
            <h2>Your cars</h2>
            <p>Your driver brings the one you pick to where you are.</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {cars && cars.cars.length === 0 && (
          <p className="sheet-note">
            You don't have a car yet. Benin Auto Mall is on Boundary Road in GRA, right by the bus stop: from a Saloon that every mechanic knows to the flagship SUV.
          </p>
        )}
        <div className="car-list">
          {cars?.cars.map((car) => {
            const here = cars.parked?.car_id === car.id;
            return (
              <div key={car.id} className="car-item">
                <CarPicture model={car.model} colour={car.colour} width={96} />
                <div>
                  <strong>{name(car)}</strong>
                  <span className="plate">{car.plate}</span>
                  <div className="row">
                    {here ? (
                      <>
                        <span className="sheet-small">Parked on this street.</span>
                        <button type="button" className="ghost" onClick={onSendHome} disabled={busy}>Send home</button>
                      </>
                    ) : (
                      <button type="button" className="primary" onClick={() => onBring(car)} disabled={busy}>
                        {busy ? "…" : "Bring it here"}
                      </button>
                    )}
                    {!here && (
                      <button type="button" className="ghost" onClick={() => void sell(car)}>
                        {selling === car.id ? `Sell for ${naira(value(car))}?` : "Sell"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

/** A button that is held: on while a finger is on it. */
function HoldButton({ className, label, onHold, children }: { className: string; label: string; onHold: (on: boolean) => void; children: ReactNode }) {
  const [on, setOn] = useState(false);
  const press = (down: boolean) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (down) event.currentTarget.setPointerCapture(event.pointerId);
    setOn(down);
    onHold(down);
  };
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      data-on={on}
      onPointerDown={press(true)}
      onPointerUp={press(false)}
      onPointerCancel={press(false)}
      onLostPointerCapture={() => { setOn(false); onHold(false); }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
}

/** At the wheel: steering on the left, the pedals on the right, the speed in the middle. */
export function DriveHud({ onGetOut, busy }: { onGetOut: () => void; busy: boolean }) {
  const speed = useRef<HTMLElement>(null);
  const gear = useRef<HTMLElement>(null);
  const left = useRef(false), right = useRef(false);
  const steer = () => { pedalInput.steer = (left.current ? 1 : 0) - (right.current ? 1 : 0); };

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (speed.current) speed.current.textContent = String(driveView.kmh);
      if (gear.current) gear.current.textContent = driveView.gear;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="drive-hud">
      <style>{STYLE}</style>
      <div className="drive-steer">
        <HoldButton className="" label="Steer left" onHold={(on) => { left.current = on; steer(); }}>◀</HoldButton>
        <HoldButton className="" label="Steer right" onHold={(on) => { right.current = on; steer(); }}>▶</HoldButton>
      </div>
      <div className="drive-speed" aria-live="off">
        <b ref={speed}>0</b>
        <span>KM/H</span>
        <i ref={gear}>P</i>
      </div>
      <div className="drive-top">
        <button type="button" className="drive-out" onClick={onGetOut} disabled={busy}>
          {busy ? "…" : "Get out"}
        </button>
        <HoldButton className="drive-horn" label="Horn" onHold={(on) => { pedalInput.horn = on; }}>HORN</HoldButton>
      </div>
      <div className="drive-pedals">
        <HoldButton className="drive-pedal brake" label="Brake (hold to reverse)" onHold={(on) => { pedalInput.brake = on ? 1 : 0; }}>BRAKE</HoldButton>
        <HoldButton className="drive-pedal gas" label="Gas" onHold={(on) => { pedalInput.gas = on ? 1 : 0; }}>GAS</HoldButton>
      </div>
    </div>
  );
}

