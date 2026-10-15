import { useEffect, useRef, useState } from "react";

/** The rides that have a journey to watch. */
export type RideKind = "bus" | "keke" | "bike" | "cab";

const RIDE_SECONDS = 6;   // unless the server says how long this ride is

// What is said on the way. {to} is where the ride is going.
const RIDES: Record<RideKind, { kicker: string; shouts: string[] }> = {
  bus: {
    kicker: "On the bus",
    shouts: [
      "{to}! {to}! Enter with your change o!",
      "Shift small, make person sit down.",
      "Driver, hold am! One more chance!",
      "No change o, I talk am before.",
      "Bus stop dey! Who dey drop?",
      "{to}! Last bus stop. Come down, come down!",
    ],
  },
  keke: {
    kicker: "In a keke",
    shouts: ["{to}! One chance, one chance!", "Abeg dress small, make we move.", "Hold your change o.", "{to}. We don reach."],
  },
  bike: {
    kicker: "On a bike",
    shouts: ["Hold me well o!", "No fear, I sabi this road.", "Go-slow no concern bike.", "{to}. Oya, come down."],
  },
  cab: {
    kicker: "In a cab",
    shouts: ["AC dey. Wind up your side.", "{to}? No wahala.", "I go pass the short road.", "{to}. We don reach."],
  },
};

type Props = {
  /** The name of the place being left. */
  from: string;
  /** The name of the place the ride is going to. */
  to: string;
  fare: number;
  /** What they are riding in. A bus if left out. */
  mode?: RideKind;
  /** How long the ride takes to watch. */
  seconds?: number;
  /** The ride is over: show the new place. */
  onDone: () => void;
};

/**
 * A ride across town. The fare is already paid and the server has already moved the
 * player, so this is the journey itself: something on the road, somebody talking, and
 * the next place loading behind it.
 */
export function BusRide({ from, to, fare, mode = "bus", seconds = RIDE_SECONDS, onDone }: Props) {
  const ride = RIDES[mode];
  const [line, setLine] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    const each = (seconds / ride.shouts.length) * 1000;
    const talking = window.setInterval(() => setLine((current) => Math.min(current + 1, ride.shouts.length - 1)), each);
    const arriving = window.setTimeout(() => done.current(), seconds * 1000);
    return () => {
      window.clearInterval(talking);
      window.clearTimeout(arriving);
    };
  }, [ride, seconds]);

  return (
    <div className="busride" role="status" aria-live="polite">
      {/* The styles live here so this file is the whole ride: nothing to add to index.css. */}
      <style>{`
        .busride { position: absolute; inset: 0; z-index: 40; display: flex; flex-direction: column; justify-content: center;
          gap: 18px; padding: 24px 0; background: #14181a; color: #fbf8f1; overflow: hidden; animation: busride-in 0.35s ease-out; }
        .busride-top { text-align: center; padding: 0 20px; }
        .busride-kicker { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #f0b90b; }
        .busride-route { font-size: clamp(20px, 5vw, 30px); font-weight: 700; margin-top: 6px; }
        .busride-fare { font-size: 13px; color: #a9b1ad; margin-top: 4px; }
        .busride-view { position: relative; height: min(46vh, 300px); overflow: hidden;
          background: linear-gradient(#9cc7ee 0%, #cfe3f2 58%, #7fa35a 58%, #7fa35a 66%, #3c3e42 66%, #3c3e42 100%); }
        .busride-far, .busride-near, .busride-dashes { position: absolute; left: 0; right: 0; background-repeat: repeat-x; }
        .busride-far { bottom: 42%; height: 26%; opacity: 0.55; background-size: 260px 100%; animation: busride-far 6s linear infinite;
          background-image: linear-gradient(to right, #8a8f94 0 60px, transparent 60px 80px, #a39c8f 80px 150px, transparent 150px 175px, #7d8a96 175px 240px, transparent 240px 260px); }
        .busride-near { bottom: 34%; height: 22%; background-size: 340px 100%; animation: busride-near 2.2s linear infinite;
          background-image: linear-gradient(to right, #d6352f 0 46px, transparent 46px 60px, #2f6fd6 60px 104px, transparent 104px 124px, #f2c200 124px 170px, transparent 170px 190px, #2f9e54 190px 236px, transparent 236px 262px, #d63f8c 262px 306px, transparent 306px 340px); }
        .busride-dashes { bottom: 14%; height: 5px; background-size: 120px 100%; animation: busride-dashes 0.3s linear infinite;
          background-image: linear-gradient(to right, #e9e6da 0 54px, transparent 54px 120px); }
        .busride-bus { position: absolute; left: 50%; bottom: 17%; width: 220px; height: 96px; margin-left: -110px;
          animation: busride-bounce 0.42s ease-in-out infinite alternate; }
        .busride-body { position: absolute; inset: 0 0 16px 0; background: linear-gradient(to bottom, #f5c400 0 70%, #c8102e 70% 78%, #f5c400 78%); border-radius: 16px 22px 8px 8px; box-shadow: 0 6px 0 rgba(0, 0, 0, 0.25); }
        .busride-stripe { position: absolute; left: 0; right: 0; top: 46px; height: 9px; background: #1d1d1f; }
        .busride-glass { position: absolute; left: 14px; right: 16px; top: 12px; height: 26px; border-radius: 6px;
          background: repeating-linear-gradient(to right, #1f2a36 0 38px, #f0b90b 38px 44px); }
        .busride-wheel { position: absolute; bottom: 0; width: 34px; height: 34px; border-radius: 50%; background: #18181a;
          border: 6px solid #3a3d42; animation: busride-spin 0.5s linear infinite; }

        /* A keke: a short cab under a canopy, with the driver's side open. */
        .busride-keke { width: 150px; margin-left: -75px; }
        .busride-keke .busride-body { inset: 0 0 14px 0; border-radius: 34px 46px 8px 8px; }
        .busride-keke .busride-glass { left: 20px; right: 54px; top: 14px; height: 28px; background: #1f2a36; }
        .busride-keke .busride-door { position: absolute; right: 14px; top: 14px; width: 32px; height: 50px; border-radius: 8px 18px 4px 4px; background: #1f2a36; }
        .busride-keke .busride-stripe { top: 52px; height: 7px; }
        .busride-keke .busride-wheel { width: 28px; height: 28px; border-width: 5px; }

        /* A bike: two wheels, a seat, and the two of you on it. */
        .busride-bike { width: 150px; height: 104px; margin-left: -75px; }
        .busride-bike .busride-frame { position: absolute; left: 20px; right: 20px; bottom: 16px; height: 16px; border-radius: 8px; background: #c8432b; }
        .busride-bike .busride-seat { position: absolute; left: 34px; width: 62px; bottom: 32px; height: 9px; border-radius: 5px; background: #1d1d1f; }
        .busride-bike .busride-bars { position: absolute; right: 26px; bottom: 30px; width: 6px; height: 30px; border-radius: 3px; background: #3a3d42; transform: rotate(18deg); }
        .busride-bike .busride-rider { position: absolute; bottom: 40px; width: 22px; height: 36px; border-radius: 9px 9px 4px 4px; background: #2f6f5e; }
        .busride-bike .busride-rider::before { content: ""; position: absolute; left: 3px; top: -17px; width: 16px; height: 16px; border-radius: 50%; background: #5a3a26; }
        .busride-bike .busride-rider.you { background: #e2b657; }
        .busride-bike .busride-wheel { width: 36px; height: 36px; }

        /* A cab: a saloon car. */
        .busride-cab { width: 200px; height: 84px; margin-left: -100px; }
        .busride-cab .busride-body { inset: 30px 0 14px 0; border-radius: 14px 18px 8px 8px; background: #f6efe0; }
        .busride-cab .busride-roof { position: absolute; left: 40px; right: 46px; top: 4px; height: 34px; border-radius: 20px 26px 0 0; background: #f6efe0; }
        .busride-cab .busride-glass { left: 48px; right: 54px; top: 10px; height: 22px; border-radius: 12px 16px 0 0;
          background: linear-gradient(to right, #1f2a36 0 47%, #f6efe0 47% 53%, #1f2a36 53%); }
        .busride-cab .busride-stripe { top: 46px; height: 7px; background: #c8432b; }
        .busride-cab .busride-wheel { width: 30px; height: 30px; border-width: 5px; }

        .busride-bubble { margin: 0 auto; max-width: min(420px, 86vw); padding: 12px 16px; border-radius: 16px; background: #fbf8f1; color: #1f2a26;
          font-weight: 700; text-align: center; min-height: 48px; display: grid; place-items: center; }
        .busride-bar { margin: 0 auto; width: min(420px, 86vw); height: 6px; border-radius: 3px; background: #2a3033; overflow: hidden; }
        .busride-bar span { display: block; height: 100%; background: #f0b90b; transform-origin: left; animation: busride-fill ${seconds}s linear forwards; }
        @keyframes busride-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes busride-far { to { background-position-x: -260px; } }
        @keyframes busride-near { to { background-position-x: -340px; } }
        @keyframes busride-dashes { to { background-position-x: -120px; } }
        @keyframes busride-bounce { from { transform: translateY(0); } to { transform: translateY(-4px); } }
        @keyframes busride-spin { to { transform: rotate(360deg); } }
        @keyframes busride-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) { .busride-far, .busride-near, .busride-dashes, .busride-bus, .busride-wheel { animation: none; } }
      `}</style>

      <div className="busride-top">
        <div className="busride-kicker">{ride.kicker}</div>
        <div className="busride-route">{from} → {to}</div>
        <div className="busride-fare">Fare paid: ₦{fare.toLocaleString()}</div>
      </div>

      <div className="busride-view" aria-hidden="true">
        <div className="busride-far" />
        <div className="busride-near" />
        <div className="busride-dashes" />
        {mode === "bus" && (
          <div className="busride-bus">
            <div className="busride-body">
              <div className="busride-glass" />
              <div className="busride-stripe" />
            </div>
            <div className="busride-wheel" style={{ left: 28 }} />
            <div className="busride-wheel" style={{ right: 30 }} />
          </div>
        )}
        {mode === "keke" && (
          <div className="busride-bus busride-keke">
            <div className="busride-body">
              <div className="busride-glass" />
              <div className="busride-door" />
              <div className="busride-stripe" />
            </div>
            <div className="busride-wheel" style={{ left: 16 }} />
            <div className="busride-wheel" style={{ right: 14 }} />
          </div>
        )}
        {mode === "bike" && (
          <div className="busride-bus busride-bike">
            <div className="busride-rider you" style={{ left: 40 }} />
            <div className="busride-rider" style={{ left: 68 }} />
            <div className="busride-seat" />
            <div className="busride-bars" />
            <div className="busride-frame" />
            <div className="busride-wheel" style={{ left: 4 }} />
            <div className="busride-wheel" style={{ right: 4 }} />
          </div>
        )}
        {mode === "cab" && (
          <div className="busride-bus busride-cab">
            <div className="busride-roof" />
            <div className="busride-glass" />
            <div className="busride-body">
              <div className="busride-stripe" style={{ top: 16 }} />
            </div>
            <div className="busride-wheel" style={{ left: 26 }} />
            <div className="busride-wheel" style={{ right: 28 }} />
          </div>
        )}
      </div>

      <div className="busride-bubble">{ride.shouts[Math.min(line, ride.shouts.length - 1)].split("{to}").join(to)}</div>
      <div className="busride-bar"><span /></div>
    </div>
  );
}
