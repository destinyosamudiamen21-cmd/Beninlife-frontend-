import type { Corner, Fight, MoveOption, Opponent } from "../api/arena";
import type { FightClub } from "./useFightClub";

type Props = {
  arena: FightClub;
  money: number;
};

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

/** A fighter's name with their health and stamina under it. */
function Plate({
  name,
  corner,
  side,
}: {
  name: string;
  corner: Corner;
  side: "you" | "them";
}) {
  const health = Math.max(
    0,
    Math.min(100, (corner.health / corner.max_health) * 100)
  );
  return (
    <div className={`fight-plate fight-${side}`}>
      <strong>{name}</strong>
      <div
        className='fight-bar'
        aria-label={`${name}: health ${corner.health} of ${corner.max_health}`}
      >
        <span className='fight-health' style={{ width: `${health}%` }} />
      </div>
      <div
        className='fight-bar fight-thin'
        aria-label={`${name}: stamina ${corner.stamina}`}
      >
        <span
          className='fight-stamina'
          style={{ width: `${corner.stamina}%` }}
        />
      </div>
    </div>
  );
}

function resultTitle(fight: Fight): string {
  const how = fight.knockout ? "by knockout" : "on points";
  if (fight.result === "win") return `You win ${how}`;
  if (fight.result === "loss") return `You lose ${how}`;
  return "A draw";
}

/** The fight itself: both corners along the top, the moves along the bottom. */
function FightHud({
  arena,
  fight,
  moves,
}: {
  arena: FightClub;
  fight: Fight;
  moves: MoveOption[];
}) {
  return (
    <div className='fight'>
      <div className='fight-top'>
        <Plate name='You' corner={fight.you} side='you' />
        <div className='fight-round'>
          <strong>Round {fight.round}</strong>
          <span>of {fight.rounds}</span>
        </div>
        <Plate name={fight.opponent_name} corner={fight.them} side='them' />
      </div>

      {fight.over ? (
        <div className='fight-result'>
          <h2>{resultTitle(fight)}</h2>
          {fight.said.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          <button
            type='button'
            className='primary'
            onClick={() => void arena.finish()}
            disabled={arena.busy}
          >
            Continue
          </button>
        </div>
      ) : (
        <div className='fight-bottom'>
          <div className='fight-said'>
            {fight.said.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            {/* What the other fighter gives away: reading it is how fights are won. */}
            <p className='fight-hint'>{fight.hint}</p>
          </div>
          {arena.error && <p className='fight-error'>{arena.error}</p>}
          <div className='fight-moves'>
            {moves.map((move) => (
              <button
                key={move.id}
                type='button'
                title={move.note}
                onClick={() => void arena.throwMove(move.id)}
                disabled={arena.busy || fight.you.stamina < move.cost}
              >
                <strong>{move.name}</strong>
                <span>{move.cost > 0 ? `${move.cost} stamina` : "rest"}</span>
              </button>
            ))}
          </div>
          <button
            type='button'
            className='fight-quit'
            onClick={() => void arena.giveUp()}
            disabled={arena.busy}
          >
            Give up
          </button>
        </div>
      )}
    </div>
  );
}

function opponentState(
  opponent: Opponent,
  before: Opponent | undefined
): string {
  if (opponent.beaten) return "Beaten";
  if (!opponent.open) return before ? `Beat ${before.name} first` : "Not yet";
  return opponent.about;
}

/**
 * Everything the fight club puts on the screen over the game: what you can do where you
 * are standing, the coach, the list of opponents, and the fight.
 */
export function ArenaHud({ arena, money }: Props) {
  const { club, fight, near, sheet } = arena;
  if (!club) return null;

  return (
    <>
      {/* The styles live here so this file is the whole of the club's screen: nothing to add to index.css. */}
      <style>{`
        .fight { position: absolute; inset: 0; z-index: 22; pointer-events: none; display: flex; flex-direction: column;
          justify-content: space-between; padding: calc(10px + env(safe-area-inset-top)) 10px calc(12px + env(safe-area-inset-bottom)); }
        .fight > * { pointer-events: auto; }
        .fight-top { display: flex; align-items: flex-start; gap: 10px; margin-top: 54px; }
        .fight-plate { flex: 1; min-width: 0; background: rgba(20, 22, 24, 0.82); color: #fff; border-radius: 12px; padding: 8px 10px; }
        .fight-plate strong { display: block; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fight-them { text-align: right; }
        .fight-bar { height: 12px; border-radius: 6px; background: rgba(255, 255, 255, 0.18); overflow: hidden; margin-top: 6px; display: flex; }
        .fight-them .fight-bar { justify-content: flex-end; }
        .fight-thin { height: 6px; margin-top: 4px; }
        .fight-health { background: #d64545; transition: width 0.25s ease-out; }
        .fight-stamina { background: #e8b23a; transition: width 0.25s ease-out; }
        .fight-round { background: #c8372d; color: #fff; border-radius: 12px; padding: 6px 12px; text-align: center; line-height: 1.15; }
        .fight-round strong { display: block; font-size: 14px; white-space: nowrap; }
        .fight-round span { font-size: 11px; opacity: 0.85; }
        .fight-bottom { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .fight-said { max-width: min(520px, 100%); background: rgba(20, 22, 24, 0.82); color: #fff; border-radius: 12px;
          padding: 8px 12px; font-size: 13px; line-height: 1.35; text-align: center; }
        .fight-hint { color: #f4d27a; font-weight: 600; margin-top: 2px; }
        .fight-error { background: #b5462e; color: #fff; border-radius: 10px; padding: 6px 12px; font-size: 13px; }
        .fight-moves { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; width: min(560px, 100%); }
        .fight-moves button { border: none; border-radius: 14px; padding: 12px 4px; background: #fff; color: #1f2a26;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .fight-moves button strong { font-size: 15px; }
        .fight-moves button span { font-size: 11px; color: #6b736f; }
        .fight-moves button:active:not(:disabled) { transform: scale(0.95); }
        .fight-moves button:disabled { opacity: 0.45; }
        .fight-quit { border: none; background: none; color: #fff; font-size: 12px; text-decoration: underline; opacity: 0.8; padding: 4px 8px; }
        .fight-result { align-self: center; margin: auto 0; width: min(420px, 100%); background: #fbf8f1; color: #1f2a26; border-radius: 20px;
          padding: 20px 18px; text-align: center; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 16px 50px rgba(0, 0, 0, 0.45); }
        .fight-result h2 { font-size: 24px; }
        .fight-result p { font-size: 14px; color: #4c5651; }
        .fight-result button { border: none; border-radius: 12px; padding: 13px; font-weight: 600; font-size: 16px; margin-top: 6px; }
        .club-lines { display: flex; flex-direction: column; gap: 6px; }
        .club-lines p { background: #fff; border-radius: 12px; padding: 10px 12px; font-size: 14px; }
        .club-who { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        .club-who span { font-size: 12px; color: #6b736f; }
        .club-pay { text-align: right; font-size: 12px; color: #6b736f; white-space: nowrap; }
        .club-pay strong { display: block; font-size: 14px; color: #1f2a26; }
        .club-said { position: absolute; left: 50%; transform: translateX(-50%); top: calc(104px + env(safe-area-inset-top)); z-index: 12;
          max-width: 86vw; pointer-events: none; background: rgba(20, 22, 24, 0.86); color: #fff; border-radius: 12px; padding: 9px 14px;
          font-size: 13px; text-align: center; }
      `}</style>

      {arena.notice && !fight && (
        <div className='club-said'>{arena.notice}</div>
      )}

      {/* Walking about: what can be done from where the player is standing. */}
      {!fight && !sheet && !arena.hold && near && (
        <div className='crowd-actions'>
          {near.kind === "coach" && (
            <button
              type='button'
              className='give-in'
              onClick={() => arena.openSheet("coach")}
            >
              Talk to {club.coach}
            </button>
          )}
          {near.kind === "ring" && (
            <button
              type='button'
              className='give-in'
              onClick={() => arena.openSheet("ladder")}
            >
              Step into the ring
            </button>
          )}
          {near.kind === "bag" && (
            <button
              type='button'
              className='give-in'
              onClick={() => void arena.train()}
              disabled={
                arena.busy || club.train_price === 0 || money < club.train_price
              }
            >
              {club.train_price === 0
                ? "Nothing left to learn on the bag"
                : `Train on the bag · ${naira(club.train_price)}`}
            </button>
          )}
        </div>
      )}

      {sheet === "coach" && (
        <div className='sheet'>
          <div className='sheet-card'>
            <div className='sheet-top'>
              <div>
                <h2>{club.coach}</h2>
                <p>
                  Fitness {club.fitness} of {club.max_fitness} · {club.wins}{" "}
                  won, {club.losses} lost
                </p>
              </div>
              <button
                type='button'
                className='ghost'
                onClick={() => arena.openSheet(null)}
              >
                Leave
              </button>
            </div>
            <div className='club-lines'>
              {club.lines.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
            <p className='sheet-small'>
              {club.train_price > 0
                ? `A session on the bag is ${naira(
                    club.train_price
                  )}. Each one makes you hit harder and last longer.`
                : "You have learnt all the bag can teach."}
            </p>
          </div>
        </div>
      )}

      {sheet === "ladder" && (
        <div className='sheet'>
          <div className='sheet-card'>
            <div className='sheet-top'>
              <div>
                <h2>Who do you want?</h2>
                <p>Pay the fee, win the purse. Lose and the fee is gone.</p>
              </div>
              <button
                type='button'
                className='ghost'
                onClick={() => arena.openSheet(null)}
              >
                Leave
              </button>
            </div>
            <div className='sheet-rows'>
              {club.opponents.map((opponent, index) => (
                <div key={opponent.id} className='sheet-row'>
                  <div className='club-who'>
                    <strong>{opponent.name}</strong>
                    <span>
                      {opponentState(opponent, club.opponents[index - 1])}
                    </span>
                  </div>
                  <div className='club-pay'>
                    <strong>{naira(opponent.prize)}</strong>
                    fee {naira(opponent.fee)}
                  </div>
                  <button
                    type='button'
                    className='primary'
                    onClick={() => void arena.challenge(opponent.id)}
                    disabled={
                      arena.busy || !opponent.open || money < opponent.fee
                    }
                  >
                    {opponent.beaten ? "Again" : "Fight"}
                  </button>
                </div>
              ))}
            </div>
            {arena.error && <p className='error'>{arena.error}</p>}
            <p className='sheet-small'>You have {naira(money)}.</p>
          </div>
        </div>
      )}

      {fight && <FightHud arena={arena} fight={fight} moves={club.moves} />}
    </>
  );
}
