import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { ActionOption, Finished, Life } from "../api/life";
import type { HomeLife } from "./useHomeLife";

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

const BARS: {
  id: "energy" | "food" | "hygiene" | "fun" | "social";
  name: string;
}[] = [
  { id: "energy", name: "Energy" },
  { id: "food", name: "Food" },
  { id: "hygiene", name: "Hygiene" },
  { id: "fun", name: "Fun" },
  { id: "social", name: "Social" },
];

/** Green when a need is fine, amber when it wants attention, red when it is urgent. */
function level(value: number): string {
  if (value >= 50) return "life-fine";
  return value >= 25 ? "life-low" : "life-urgent";
}

// One stylesheet for everything in this file. Each part that can be on screen alone
// brings it along, so no part depends on another being there.
function LifeStyles() {
  return (
    <style>{`
      /* Below the line where notices appear (104px down, one line tall), so they never cover it. */
      .life-hud { position: absolute; left: calc(16px + env(safe-area-inset-left)); top: calc(146px + env(safe-area-inset-top));
        z-index: 10; pointer-events: none; width: 168px; background: rgba(255, 255, 255, 0.92); color: #1f2a26;
        border-radius: 12px; padding: 8px 10px 9px; display: flex; flex-direction: column; gap: 4px; }
      .life-clock { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 700; white-space: nowrap; }
      .life-clock span { font-weight: 600; color: #6b736f; }
      .life-need { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #4c5651; }
      .life-need > span:first-child { width: 48px; flex-shrink: 0; }
      .life-bar { flex: 1; height: 7px; border-radius: 4px; background: #e3ddd0; overflow: hidden; display: flex; }
      .life-bar span { border-radius: 4px; transition: width 0.4s ease-out; }
      .life-fine { background: #2f8f4e; }
      .life-low { background: #e0a528; }
      .life-urgent { background: #c8372d; }
      .life-mood { font-size: 11px; color: #6b736f; margin-top: 1px; }
      .life-mood strong { color: #1f2a26; }
      @media (max-width: 480px) { .life-hud { width: 148px; padding: 7px 9px 8px; } .life-need > span:first-child { width: 44px; } }

      .life-action { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 2px; }
      .life-action strong { font-size: 15px; }
      .life-tags { display: flex; flex-wrap: wrap; gap: 4px; }
      .life-tags span { font-size: 11px; font-weight: 600; color: #2f6f5e; background: #e3efe9; border-radius: 6px; padding: 1px 6px; }
      .life-tags .life-time { color: #4c5651; background: #ece7db; }
      .life-tags .life-cost { color: #8a5a12; background: #f6e7c4; }
      .life-why { font-size: 12px; color: #b5462e; }

      .life-doing, .life-result { position: absolute; left: 50%; transform: translateX(-50%);
        bottom: calc(64px + env(safe-area-inset-bottom)); z-index: 12; width: min(360px, calc(100vw - 24px));
        background: rgba(20, 22, 24, 0.86); color: #fff; border-radius: 16px; padding: 12px 14px;
        display: flex; flex-direction: column; gap: 8px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3); }
      .life-doing-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
      .life-doing-top strong { font-size: 15px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .life-doing-top button { border: none; border-radius: 999px; padding: 6px 14px; font-weight: 600; font-size: 13px;
        background: rgba(255, 255, 255, 0.16); color: #fff; flex-shrink: 0; }
      .life-progress { height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.18); overflow: hidden; }
      .life-progress span { display: block; height: 100%; width: 100%; background: #f4d27a; border-radius: 4px;
        transform-origin: left center; animation-name: life-fill; animation-timing-function: linear; animation-fill-mode: both; }
      @keyframes life-fill { from { transform: scaleX(var(--life-from, 0)); } to { transform: scaleX(1); } }
      /* Above the "Use ..." button, which comes back as soon as the wait is over. */
      .life-result { pointer-events: none; text-align: center; bottom: calc(132px + env(safe-area-inset-bottom)); }
      .life-result.life-fell { bottom: calc(196px + env(safe-area-inset-bottom)); border: 2px solid #f4d27a; }
      .life-result strong { font-size: 15px; }
      .life-result p { font-size: 13px; opacity: 0.9; }
      .life-changes { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
      .life-changes span { font-size: 12px; font-weight: 700; border-radius: 8px; padding: 2px 8px; }
      .life-up { background: rgba(72, 187, 120, 0.25); color: #9ff0bd; }
      .life-down { background: rgba(214, 69, 69, 0.25); color: #ffb3ab; }
      .life-note { font-size: 13px; color: #2f6f5e; background: #e3efe9; border-radius: 10px; padding: 8px 10px; }
      .life-out { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(64px + env(safe-area-inset-bottom));
        z-index: 12; width: min(340px, calc(100vw - 24px)); background: rgba(20, 22, 24, 0.9); color: #fff; border-radius: 16px;
        padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3); }
      .life-out strong { font-size: 13px; letter-spacing: 0.12em; color: #f4d27a; }
      .life-out p { font-size: 14px; opacity: 0.92; }
      .life-out button { border: none; border-radius: 999px; padding: 11px 22px; font-weight: 700; font-size: 15px;
        background: #f4d27a; color: #1f2a26; }
      .life-out button:disabled { background: rgba(255, 255, 255, 0.18); color: rgba(255, 255, 255, 0.7); }
      .life-error { position: absolute; left: 50%; transform: translateX(-50%); top: calc(104px + env(safe-area-inset-top));
        z-index: 12; max-width: 86vw; pointer-events: none; background: #b5462e; color: #fff; border-radius: 10px;
        padding: 8px 14px; font-size: 13px; }
    `}</style>
  );
}

/** The player's needs and their own clock: a small card that is always in view. */
export function LifeHud({ life }: { life: Life }) {
  const { needs, clock } = life;
  return (
    <>
      <LifeStyles />
      <div className='life-hud'>
        <div className='life-clock'>
          Day {clock.day} · {clock.block}
          <span>{clock.text}</span>
        </div>
        {BARS.map((bar) => (
          <div key={bar.id} className='life-need'>
            <span>{bar.name}</span>
            <div
              className='life-bar'
              role='img'
              aria-label={`${bar.name}: ${needs[bar.id]} of 100`}
            >
              <span
                className={level(needs[bar.id])}
                style={{ width: `${needs[bar.id]}%` }}
              />
            </div>
          </div>
        ))}
        <div className='life-mood'>
          Mood: <strong>{needs.mood_name}</strong>
        </div>
      </div>
    </>
  );
}

/** One thing that can be done with whatever the list is for. */
function ActionRow({
  option,
  busy,
  onDo,
}: {
  option: ActionOption;
  busy: boolean;
  onDo: () => void;
}) {
  return (
    <div className='sheet-row'>
      <div className='life-action'>
        <strong>{option.name}</strong>
        <div className='life-tags'>
          {option.gives.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          <span className='life-time'>{option.seconds}s</span>
          {option.cost > 0 && (
            <span className='life-cost'>{naira(option.cost)}</span>
          )}
        </div>
        {option.blocked && <span className='life-why'>{option.blocked}</span>}
      </div>
      <button
        type='button'
        className='primary'
        onClick={onDo}
        disabled={busy || option.blocked !== null}
      >
        Do
      </button>
    </div>
  );
}

/** What the thing just finished did: a few words and what went up and down. */
function Result({ result }: { result: Finished }) {
  return (
    <div
      className={`life-result${result.collapsed ? " life-fell" : ""}`}
      role='status'
    >
      <strong>{result.name || "Done"}</strong>
      {result.lines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
      {result.changes.length > 0 && (
        <div className='life-changes'>
          {result.changes.map((change) => (
            <span
              key={change.name}
              className={change.amount > 0 ? "life-up" : "life-down"}
            >
              {change.amount > 0 ? "+" : "−"}
              {Math.abs(change.amount)} {change.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Flat on the floor: what happened, and the button that gets them up once it will work. */
function PassedOut({
  wakeAt,
  busy,
  onWake,
}: {
  wakeAt: number;
  busy: boolean;
  onWake: () => void;
}) {
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.ceil((wakeAt - performance.now()) / 1000))
  );
  useEffect(() => {
    const tick = () =>
      setLeft(Math.max(0, Math.ceil((wakeAt - performance.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [wakeAt]);

  return (
    <div className='life-out' role='alert'>
      <strong>PASSED OUT</strong>
      <p>You danced until there was nothing left. Everybody saw.</p>
      <button type='button' onClick={onWake} disabled={busy || left > 0}>
        {left > 0 ? `Wake up (${left})` : "Wake up"}
      </button>
    </div>
  );
}

type Props = {
  homeLife: HomeLife;
  /** Something extra to show in the open list, under the note: the club's booth buttons, say. */
  extra?: ReactNode;
  /** True to leave out the button that appears beside a thing, when the screen has its own. */
  noButton?: boolean;
};

/**
 * Everything on screen for using a thing, wherever it is: the button that appears beside
 * it, the list of what it can be used for, the wait, and what came of it.
 */
export function LifeActions({ homeLife, extra, noButton }: Props) {
  const { life, near, menu, result, error, busy, run, wakeAt } = homeLife;
  const doing = life?.doing ?? null;
  // The bar fills over the whole of the action, from however far along it already is. If
  // they are going to drop before the end, it stops short when they do.
  const bar: CSSProperties | undefined = doing
    ? ({
        animationDuration: `${Math.max(0.1, doing.seconds - doing.elapsed)}s`,
        "--life-from":
          doing.seconds > 0
            ? Math.max(0, Math.min(1, doing.elapsed / doing.seconds))
            : 0,
      } as CSSProperties)
    : undefined;
  const label = near
    ? `${near.verb ?? "Use"} ${
        near.verb === undefined ? near.name.toLowerCase() : near.name
      }`.trim()
    : "";

  return (
    <>
      <LifeStyles />
      {error && <div className='life-error'>{error}</div>}

      {/* Standing at something usable, with nothing else going on: offer it. */}
      {near && !noButton && !menu && !doing && wakeAt === null && (
        <div className='crowd-actions'>
          <button
            type='button'
            className='give-in'
            onClick={() => void homeLife.openMenu()}
            disabled={busy}
          >
            {busy ? "…" : label}
          </button>
        </div>
      )}

      {menu && life && (
        <div className='sheet'>
          <div className='sheet-card'>
            <div className='sheet-top'>
              <div>
                <h2>{menu.name}</h2>
                <p>
                  Day {life.clock.day} · {life.clock.block} · {life.clock.text}
                </p>
              </div>
              <button
                type='button'
                className='ghost'
                onClick={homeLife.closeMenu}
              >
                Close
              </button>
            </div>
            {menu.note && <p className='life-note'>{menu.note}</p>}
            {extra}
            <div className='sheet-rows'>
              {menu.actions.map((option) => (
                <ActionRow
                  key={option.id}
                  option={option}
                  busy={busy}
                  onDo={() => void homeLife.start(option.id)}
                />
              ))}
            </div>
            {menu.actions.length === 0 && (
              <p className='sheet-small'>
                There is nothing to do with this yet.
              </p>
            )}
            <p className='sheet-small'>
              You have {naira(life.money)}
              {menu.item_id !== null && life.meals > 0
                ? ` and ${life.meals} portion${
                    life.meals > 1 ? "s" : ""
                  } in the pot.`
                : "."}
            </p>
          </div>
        </div>
      )}

      {doing && (
        <div className='life-doing' role='status'>
          <div className='life-doing-top'>
            <strong>{doing.name}…</strong>
            <button
              type='button'
              onClick={() => void homeLife.stop()}
              disabled={busy}
            >
              Stop
            </button>
          </div>
          <div className='life-progress'>
            {/* A new key each time a wait starts, so the bar's animation starts afresh. */}
            <span key={run} style={bar} />
          </div>
        </div>
      )}

      {wakeAt !== null && !doing && (
        <PassedOut
          wakeAt={wakeAt}
          busy={busy}
          onWake={() => void homeLife.wake()}
        />
      )}

      {result && !doing && !menu && <Result result={result} />}
    </>
  );
}
