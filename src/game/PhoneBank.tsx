import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  fetchContacts,
  fetchMoneyLimits,
  fetchWallet,
  sendMoney,
  type Contact,
  type MoneyLimits,
  type MoneySent,
  type Wallet,
} from "../api/phone";
import { Glyph } from "./glyphs";
import { Screen, naira, words } from "./phoneKit";

const QUICK = [500, 1000, 5000, 10000]; // amounts one press away
const NOTE_LENGTH = 80;

type FormProps = {
  playerId: string;
  /** Who it is for, when that is already known. Left out, the form asks. */
  to?: { id: string; username: string };
  onSent: (sent: MoneySent) => void;
  onCancel?: () => void;
};

/**
 * Sending money to another player: how much, a few words to go with it, and how much of
 * today's allowance is left. The bank's own conversation screen and the Messages app
 * both use it. The server decides everything; this only keeps the button honest.
 */
export function MoneyForm({ playerId, to, onSent, onCancel }: FormProps) {
  const [limits, setLimits] = useState<MoneyLimits | null>(null);
  const [friends, setFriends] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asked, setAsked] = useState(0); // goes up to ask the bank again
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const known = to !== undefined;
  useEffect(() => {
    fetchMoneyLimits(playerId)
      .then((loaded) => {
        if (!alive.current) return;
        setLimits(loaded);
        setError("");
      })
      .catch(
        (problem: unknown) =>
          alive.current && setError(words(problem, "Could not reach the bank."))
      );
  }, [asked, playerId]);
  useEffect(() => {
    if (!known) {
      fetchContacts(playerId)
        .then((loaded) => alive.current && setFriends(loaded.contacts))
        .catch(() => {}); // the form still works: a username can be typed
    }
  }, [known, playerId]);

  const naira_ = Number(amount) || 0;
  const who = to?.username ?? name.trim().replace(/^@/, "");
  let why = "";
  if (limits && naira_ > 0) {
    if (naira_ < limits.least)
      why = `The least you can send is ${naira(limits.least)}.`;
    else if (naira_ > limits.money) why = `You have ${naira(limits.money)}.`;
    else if (naira_ > limits.left_today)
      why = `You can send ${naira(limits.left_today)} more today.`;
  }
  const ready =
    limits !== null && naira_ > 0 && why === "" && who !== "" && !busy;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      const sent = await sendMoney(
        playerId,
        to ? { id: to.id } : { username: who },
        naira_,
        note.trim()
      );
      if (alive.current) onSent(sent);
    } catch (problem) {
      if (alive.current)
        setError(words(problem, "The money did not go. Try again."));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <form className='ph-pay' onSubmit={(event) => void send(event)}>
      {!to && (
        <>
          <label className='ph-field'>
            <span>Who to</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder='@username'
              maxLength={40}
              autoCapitalize='none'
              autoCorrect='off'
            />
          </label>
          {friends.length > 0 && (
            <div className='ph-chips'>
              {friends.slice(0, 8).map((friend) => (
                <button
                  key={friend.id}
                  type='button'
                  className={name === friend.username ? "on" : ""}
                  onClick={() => setName(friend.username)}
                >
                  @{friend.username}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <label className='ph-field'>
        <span>How much</span>
        <div className='ph-amount'>
          <b>₦</b>
          <input
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value.replace(/\D/g, "").slice(0, 7))
            }
            inputMode='numeric'
            placeholder='0'
            aria-label='Amount in naira'
          />
        </div>
      </label>
      <div className='ph-chips'>
        {QUICK.map((quick) => (
          <button
            key={quick}
            type='button'
            className={naira_ === quick ? "on" : ""}
            onClick={() => setAmount(String(quick))}
          >
            {naira(quick)}
          </button>
        ))}
      </div>
      <label className='ph-field'>
        <span>What it is for (they will see this)</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder='For transport'
          maxLength={NOTE_LENGTH}
        />
      </label>
      {(why || error) && <p className='ph-error'>{error || why}</p>}
      {!limits && error && (
        <button
          type='button'
          className='ph-plain'
          onClick={() => setAsked((count) => count + 1)}
        >
          Try the bank again
        </button>
      )}
      <div className='ph-row'>
        {onCancel && (
          <button
            type='button'
            className='ph-plain'
            onClick={onCancel}
            disabled={busy}
          >
            Not now
          </button>
        )}
        <button type='submit' className='ph-go' disabled={!ready}>
          {busy
            ? "Sending…"
            : naira_ > 0 && who
            ? `Send ${naira(naira_)} to @${who}`
            : "Send money"}
        </button>
      </div>
      {limits && (
        <p className='ph-small'>
          You have {naira(limits.money)}. You can send{" "}
          {naira(limits.left_today)} more today, out of{" "}
          {naira(limits.most_a_day)} a day.
        </p>
      )}
    </form>
  );
}

type Props = {
  playerId: string;
  /** Goes up when a message or some money arrives, so the alerts are fetched again. */
  arrivals: number;
  onMoney: (money: number) => void;
  onBack: () => void;
};

/** The bank: what the player has, a way to send some of it, and the alerts for all that has come and gone. */
export function BankApp({ playerId, arrivals, onMoney, onBack }: Props) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [paying, setPaying] = useState(false);
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  const tell = useRef(onMoney);
  useEffect(() => {
    tell.current = onMoney;
  });

  useEffect(() => {
    let cancelled = false;
    fetchWallet(playerId)
      .then((loaded) => {
        if (cancelled) return;
        setWallet(loaded);
        tell.current(loaded.money);
      })
      .catch(
        (problem: unknown) =>
          !cancelled && setError(words(problem, "Could not reach the bank."))
      );
    return () => {
      cancelled = true;
    };
  }, [arrivals, playerId, round]);

  const sent = (result: MoneySent) => {
    onMoney(result.money);
    setPaying(false);
    setSaid(`${naira(result.message.amount)} sent to @${result.username}.`);
    setRound((count) => count + 1); // fetch the alerts again: there is a new one
  };

  if (paying) {
    return (
      <Screen
        title='Send money'
        sub='It arrives at once, with an alert.'
        onBack={() => setPaying(false)}
      >
        <MoneyForm
          playerId={playerId}
          onSent={sent}
          onCancel={() => setPaying(false)}
        />
      </Screen>
    );
  }

  return (
    <Screen title='Bank' sub='Your account' onBack={onBack}>
      {error && <p className='ph-error'>{error}</p>}
      {said && <p className='ph-note'>{said}</p>}
      <div className='ph-balance'>
        <span>Balance</span>
        <strong>{wallet ? naira(wallet.money) : "…"}</strong>
        <button
          type='button'
          onClick={() => {
            setSaid("");
            setPaying(true);
          }}
        >
          <Glyph name='send' size={18} /> Send money
        </button>
      </div>
      <h3 className='ph-heading'>Alerts</h3>
      <div className='ph-list'>
        {wallet?.alerts.map((alert) => (
          <div key={alert.id} className='ph-item'>
            <i className={`ph-sign ${alert.amount >= 0 ? "in" : "out"}`}>
              {alert.amount >= 0 ? "+" : "−"}
            </i>
            <div className='ph-lines'>
              <strong>{alert.note}</strong>
              <span>Balance {naira(alert.balance_after)}</span>
            </div>
            <b className={alert.amount >= 0 ? "ph-in" : "ph-out"}>
              {alert.amount >= 0 ? "+" : "−"}
              {naira(Math.abs(alert.amount))}
            </b>
          </div>
        ))}
      </div>
      {wallet && wallet.alerts.length === 0 && (
        <p className='ph-small'>
          No alerts yet. Money in and money out will show here.
        </p>
      )}
    </Screen>
  );
}
