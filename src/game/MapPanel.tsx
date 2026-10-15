import type { City, CityPlace, RideOption } from "../api/travel";
import { Compass } from "./Compass";
import { clampView, flyTo, mapView, turnBy, zoomBy } from "./cityCamera";
import {
  DISTRICT_SPAN,
  MAP_EDGE,
  PIN,
  PLAIN_PIN,
  WHOLE_CITY,
  toMap,
} from "./cityLayout";
import { Glyph } from "./glyphs";

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

/** 55 -> "55 m", 1840 -> "1.8 km". */
function distance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
}

/** Game minutes, as a player would say them: 45 -> "45 min", 80 -> "1 h 20 min". */
function howLong(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

type Props = {
  /** Every place and its fares, or null while the server is being asked. */
  city: City | null;
  /** Why the map could not be fetched, or "". */
  error: string;
  money: number;
  /** Where the player is. */
  here: { district: string; x: number; z: number };
  /** The place whose choices are open, or null. */
  picked: CityPlace | null;
  /** The ride being paid for right now ("keke"), or "". */
  going: string;
  /** Why the last ride did not happen, or "". */
  problem: string;
  /** Who made the map data. It must stay readable. */
  credit: string;
  onGo: (place: CityPlace, option: RideOption) => void;
  onPutAway: () => void;
  onRetry: () => void;
  onClose: () => void;
};

/**
 * Everything written over the city map: its title bar, the buttons that move it for
 * anyone without two fingers to pinch with, and the sheet that says how to get to the
 * place that was pressed and what each way costs.
 */
export function MapPanel({
  city,
  error,
  money,
  here,
  picked,
  going,
  problem,
  credit,
  onGo,
  onPutAway,
  onRetry,
  onClose,
}: Props) {
  const nudge = (change: () => void) => {
    change();
    clampView(mapView.goal, MAP_EDGE);
  };
  const toMe = () => {
    const you = toMap(here.district, here.x, here.z);
    if (you) flyTo(you.x, you.z, DISTRICT_SPAN);
  };
  const look = picked ? PIN[picked.kind] ?? PLAIN_PIN : PLAIN_PIN;

  return (
    <div className='citymap'>
      {/* The styles live here so this file and CityMap.tsx are the whole map: nothing to add to index.css. */}
      <style>{`
        .citymap { position: absolute; inset: 0; z-index: 12; pointer-events: none; color: #f6efe0; }
        .citymap button { pointer-events: auto; }
        .citymap-bar { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 12px;
          padding: calc(12px + env(safe-area-inset-top)) calc(14px + env(safe-area-inset-right)) 12px calc(14px + env(safe-area-inset-left));
          background: #1c1512; border-bottom: 2px solid #a9792b; pointer-events: auto; }
        .citymap-title { flex: 1; min-width: 0; }
        .citymap-title h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.1; }
        .citymap-title p { font-size: 12px; color: #d9c9a8; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .citymap-money { font-weight: 700; font-size: 14px; color: #e2b657; white-space: nowrap; }
        .citymap-close { border: 1px solid #a9792b; border-radius: 10px; background: #2a201a; color: #f6efe0; font-weight: 700; padding: 9px 14px; }

        .citymap-tools { position: absolute; right: calc(12px + env(safe-area-inset-right)); top: calc(84px + env(safe-area-inset-top));
          display: flex; flex-direction: column; gap: 8px; align-items: center; }
        .citymap-tool { width: 44px; height: 44px; border-radius: 50%; border: 2px solid #a9792b; background: #1c1512; color: #f6efe0;
          display: grid; place-items: center; padding: 0; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); }
        .citymap-tool:active { transform: scale(0.94); }
        .citymap-jump { position: absolute; left: calc(12px + env(safe-area-inset-left)); top: calc(84px + env(safe-area-inset-top));
          display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
        .citymap-jump button { border: 2px solid #a9792b; border-radius: 999px; background: #1c1512; color: #f6efe0; font-weight: 700;
          font-size: 13px; padding: 8px 13px; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); }

        .citymap-credit { position: absolute; left: calc(8px + env(safe-area-inset-left)); bottom: calc(6px + env(safe-area-inset-bottom));
          font-size: 10px; color: #1c1512; background: rgba(246, 239, 224, 0.75); padding: 2px 6px; border-radius: 4px; }
        .citymap-hint { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(26px + env(safe-area-inset-bottom));
          font-size: 12px; font-weight: 600; background: rgba(28, 21, 18, 0.82); padding: 7px 12px; border-radius: 999px; white-space: nowrap; }
        .citymap-hint .touch { display: none; }
        @media (hover: none) and (pointer: coarse) { .citymap-hint .touch { display: inline; } .citymap-hint .keys { display: none; } }
        .citymap-wait { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: #1c1512; border: 2px solid #a9792b;
          border-radius: 14px; padding: 14px 18px; text-align: center; display: flex; flex-direction: column; gap: 10px; pointer-events: auto;
          max-width: min(320px, 86vw); font-size: 14px; }
        .citymap-wait button { border: none; border-radius: 10px; background: #e2b657; color: #1c1512; font-weight: 700; padding: 10px; }

        /* ---- what is pinned on the map itself (drawn by CityMap.tsx) ---- */
        .citymap-pin { display: flex; align-items: center; gap: 0; border: none; background: none; padding: 0; color: #f6efe0; font-size: 12px;
          font-weight: 700; white-space: nowrap; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.45)); }
        /* A finger that lands on a pin and drags still moves the map, and never the page. */
        .citymap-pin, .citymap-district { touch-action: none; }
        .citymap-pin i { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: #f6efe0;
          border: 2px solid #e2b657; box-shadow: inset 0 0 0 1.5px rgba(28, 21, 18, 0.45); flex-shrink: 0; }
        .citymap-pin span { display: none; background: #1c1512; border: 1px solid #a9792b; border-left: none; border-radius: 0 999px 999px 0;
          padding: 4px 11px 4px 16px; margin-left: -12px; position: relative; z-index: -1; }
        .citymap-pin.named span { display: block; }
        .citymap-pin.open i { width: 38px; height: 38px; border-color: #f6efe0; box-shadow: 0 0 0 3px #c8432b; }
        .citymap-pin.open span { background: #c8432b; border-color: #c8432b; font-size: 13px; }
        .citymap-pin:focus-visible { outline: 2px solid #f6efe0; outline-offset: 3px; border-radius: 999px; }
        .citymap-district { display: flex; flex-direction: column; align-items: center; gap: 1px; background: #1c1512; color: #f6efe0;
          border: 2px solid #e2b657; border-radius: 12px; padding: 7px 13px; white-space: nowrap; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4); }
        .citymap-district strong { font-size: 14px; font-weight: 800; }
        .citymap-district span { font-size: 11px; color: #e2b657; font-weight: 600; }
        .citymap-soon { display: flex; flex-direction: column; align-items: center; font-size: 12px; font-weight: 700; color: #f6efe0;
          text-shadow: 0 1px 3px rgba(28, 21, 18, 0.9); white-space: nowrap; opacity: 0.85; }
        .citymap-soon small { font-size: 9px; font-weight: 600; color: #f0dcb4; }
        .citymap-you { display: flex; flex-direction: column; align-items: center; gap: 3px; transform: translateY(20px); }
        .citymap-you b { width: 18px; height: 18px; border-radius: 50%; background: #c8432b; border: 3px solid #f6efe0;
          box-shadow: 0 0 0 0 rgba(200, 67, 43, 0.7); animation: citymap-beat 1.6s ease-out infinite; }
        .citymap-you span { font-size: 11px; font-weight: 800; color: #f6efe0; background: #c8432b; border-radius: 999px; padding: 1px 8px; }
        @keyframes citymap-beat { to { box-shadow: 0 0 0 16px rgba(200, 67, 43, 0); } }
        @media (prefers-reduced-motion: reduce) { .citymap-you b { animation: none; } }

        /* ---- how to get to the place that was pressed ---- */
        .citymap-sheet { position: absolute; left: 0; right: 0; bottom: 0; pointer-events: auto; background: #f6efe0; color: #1c1512;
          border-top: 3px solid #a9792b; border-radius: 18px 18px 0 0; padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
          max-height: 62dvh; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.35);
          animation: citymap-up 0.22s ease-out; }
        /* On a wide screen the sheet is a card in the bottom left corner, clear of the buttons down the right. */
        @media (min-width: 700px) {
          .citymap-sheet { right: auto; left: 16px; bottom: 16px; width: 380px; border-radius: 18px; border: 3px solid #a9792b; max-height: calc(100dvh - 160px); }
          .citymap-jump { flex-direction: row; }
        }
        @keyframes citymap-up { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .citymap-sheet { animation: none; } }
        .citymap-place { display: flex; align-items: center; gap: 11px; }
        .citymap-place i { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; color: #f6efe0; border: 2px solid #a9792b; flex-shrink: 0; }
        .citymap-place div { flex: 1; min-width: 0; }
        .citymap-place h3 { font-size: 19px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.15; }
        .citymap-place p { font-size: 13px; color: #6b5a44; margin-top: 1px; }
        .citymap-place button { border: none; background: #e8dcc2; color: #1c1512; border-radius: 50%; width: 34px; height: 34px; display: grid; place-items: center; padding: 0; }
        .citymap-ways { display: flex; flex-direction: column; gap: 6px; }
        .citymap-way { display: flex; align-items: center; gap: 10px; background: #fff; border-radius: 12px; padding: 9px 10px; }
        .citymap-way > i { width: 36px; height: 36px; border-radius: 10px; background: #1c1512; color: #e2b657; display: grid; place-items: center; flex-shrink: 0; }
        .citymap-way > div { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .citymap-way strong { font-size: 15px; display: flex; justify-content: space-between; gap: 8px; }
        .citymap-way strong b { font-weight: 800; }
        .citymap-way span { font-size: 12px; color: #6b5a44; line-height: 1.3; }
        .citymap-way button { border: none; border-radius: 10px; background: #2f6f5e; color: #fff; font-weight: 700; padding: 10px 14px; min-width: 62px; }
        .citymap-way.shut { opacity: 0.62; }
        .citymap-way.shut > i { background: #8a7d6a; color: #f6efe0; }
        .citymap-problem { color: #b5462e; font-size: 14px; font-weight: 600; }
        .citymap-small { font-size: 12px; color: #6b5a44; }
      `}</style>

      <div className='citymap-bar'>
        <div className='citymap-title'>
          <h2>Benin City</h2>
          <p>
            {city ? `You are in ${city.district_name}` : "Opening the map…"}
          </p>
        </div>
        <span className='citymap-money'>{naira(money)}</span>
        <button
          type='button'
          className='citymap-close'
          onClick={onClose}
          disabled={going !== ""}
        >
          Close
        </button>
      </div>

      <div className='citymap-jump'>
        <button type='button' onClick={toMe}>
          <Glyph name='pin' size={16} /> Where I am
        </button>
        <button
          type='button'
          onClick={() => flyTo(WHOLE_CITY.x, WHOLE_CITY.z, WHOLE_CITY.span)}
        >
          <Glyph name='map' size={16} /> Whole city
        </button>
      </div>

      <div className='citymap-tools'>
        <Compass
          read={() => mapView.now.yaw}
          onReset={() => (mapView.goal.yaw = 0)}
        />
        <button
          type='button'
          className='citymap-tool'
          onClick={() => nudge(() => zoomBy(mapView.goal, 0.6))}
          aria-label='Zoom in'
        >
          <Glyph name='plus' />
        </button>
        <button
          type='button'
          className='citymap-tool'
          onClick={() => nudge(() => zoomBy(mapView.goal, 1 / 0.6))}
          aria-label='Zoom out'
        >
          <Glyph name='minus' />
        </button>
        <button
          type='button'
          className='citymap-tool'
          onClick={() => nudge(() => turnBy(mapView.goal, Math.PI / 4))}
          aria-label='Turn the map'
        >
          <Glyph name='turn' />
        </button>
      </div>

      {!city && (
        <div className='citymap-wait' role='status'>
          {error ? (
            <>
              <span>{error}</span>
              <button type='button' onClick={onRetry}>
                Try again
              </button>
            </>
          ) : (
            <span>Asking the conductors what it costs…</span>
          )}
        </div>
      )}

      {!picked && city && (
        <div className='citymap-hint'>
          <span className='keys'>
            Press a place to go there · Drag, scroll and right-drag to look
            round
          </span>
          <span className='touch'>
            Press a place to go there · Pinch and twist to look round
          </span>
        </div>
      )}
      {!picked && <div className='citymap-credit'>{credit}</div>}

      {picked && city && (
        <div
          className='citymap-sheet'
          role='dialog'
          aria-label={`How to get to ${picked.name}`}
        >
          <div className='citymap-place'>
            <i style={{ background: look.colour }}>
              <Glyph name={look.glyph} size={24} />
            </i>
            <div>
              <h3>{picked.name}</h3>
              <p>
                {picked.district_name} ·{" "}
                {picked.here
                  ? `${distance(picked.metres)} from you`
                  : `${distance(picked.metres)} across town`}
              </p>
            </div>
            <button
              type='button'
              onClick={onPutAway}
              aria-label='Put this away'
              disabled={going !== ""}
            >
              <Glyph name='close' size={18} />
            </button>
          </div>

          {!city.on_street && (
            <p className='citymap-problem'>
              Go outside first: rides leave from the street.
            </p>
          )}
          {problem && <p className='citymap-problem'>{problem}</p>}

          <div className='citymap-ways'>
            {picked.options.map((option) => {
              const shut = option.blocked !== null || !city.on_street;
              return (
                <div
                  key={option.mode}
                  className={`citymap-way${shut ? " shut" : ""}`}
                >
                  <i>
                    <Glyph
                      name={option.mode === "trek" ? "walk" : option.mode}
                    />
                  </i>
                  <div>
                    <strong>
                      {option.name}
                      {option.mode !== "drive" && (
                        <b>{option.fare > 0 ? naira(option.fare) : "Free"}</b>
                      )}
                    </strong>
                    <span>
                      {option.blocked ?? option.note}
                      {!option.blocked && option.minutes > 0
                        ? ` About ${howLong(option.minutes)} of your day.`
                        : ""}
                    </span>
                  </div>
                  {option.mode !== "drive" && (
                    <button
                      type='button'
                      onClick={() => onGo(picked, option)}
                      disabled={shut || going !== ""}
                    >
                      {going === option.mode
                        ? "Going…"
                        : option.mode === "trek"
                        ? "Trek"
                        : "Go"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className='citymap-small'>
            You have {naira(money)}. Fares are paid when you set off.
          </p>
        </div>
      )}
    </div>
  );
}
