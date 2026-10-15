import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  addContact,
  fetchContacts,
  fetchInbox,
  fetchThread,
  sendMessage,
  type Contact,
  type Inbox,
  type MoneySent,
  type Thread,
} from "../api/phone";
import { MoneyForm } from "./PhoneBank";
import { Glyph } from "./glyphs";
import { Face, Screen, ago, dataText, naira, words } from "./phoneKit";
import type { RosterEntry } from "./types";

type Props = {
  playerId: string;
  /** The players who are where this one is: quick to pick as someone to text. */
  nearby: RosterEntry[];
  /** Goes up by one each time a message arrives while the phone is open, so what is on screen is fetched again. */
  arrivals: number;
  /** A player whose conversation to open straight away (the Friends app asks for this), or null. */
  startWith: string | null;
  onMoney: (money: number) => void;
  /** The app looked at how much is unread. */
  onUnread: (count: number) => void;
  onBack: () => void;
};

/**
 * Messages: every conversation the player has, and inside one, texting, sending money
 * and saving the other person as a contact. A text costs a little data; money does not.
 */
export function MessagesApp({
  playerId,
  nearby,
  arrivals,
  startWith,
  onMoney,
  onUnread,
  onBack,
}: Props) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [writing, setWriting] = useState(false); // a new conversation, by username
  const [paying, setPaying] = useState(false);
  const [to, setTo] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const alive = useRef(true);
  const openWith = useRef<string | null>(startWith); // whose conversation is on screen
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Kept in a ref, so that being handed a new function (which happens every time the game
  // behind the phone draws itself again) is not taken as a reason to fetch everything again.
  const tellUnread = useRef(onUnread);
  useEffect(() => {
    tellUnread.current = onUnread;
  });

  const fail = useCallback((problem: unknown, fallback: string) => {
    if (alive.current) setError(words(problem, fallback));
  }, []);

  const loadInbox = useCallback(() => {
    fetchInbox(playerId)
      .then((loaded) => {
        if (!alive.current) return;
        setInbox(loaded);
        tellUnread.current(loaded.unread);
      })
      .catch((problem: unknown) =>
        fail(problem, "Could not open your messages.")
      );
  }, [fail, playerId]);

  const openThread = useCallback(
    (otherId: string) => {
      // Looking again at the conversation already on screen (something arrived) leaves any
      // error where it is; opening a different one starts clean.
      if (openWith.current !== otherId) setError("");
      openWith.current = otherId;
      setWriting(false);
      fetchThread(playerId, otherId)
        .then((loaded) => {
          if (!alive.current || openWith.current !== otherId) return;
          setThread(loaded);
          loadInbox(); // opening it marked it read
        })
        .catch((problem: unknown) =>
          fail(problem, "Could not open that conversation.")
        );
    },
    [fail, loadInbox, playerId]
  );

  // What is on screen is fetched when the app opens, and again whenever something arrives.
  useEffect(() => {
    if (openWith.current) openThread(openWith.current);
    else loadInbox();
  }, [arrivals, loadInbox, openThread]);
  useEffect(() => {
    fetchContacts(playerId)
      .then((loaded) => alive.current && setContacts(loaded.contacts))
      .catch(() => {}); // the app works without them: they are only shortcuts
  }, [playerId]);

  // A conversation opens at its newest message, and goes there again when one more arrives.
  // (Not on every look at it: someone reading back up the conversation is left where they are.)
  const newest = thread
    ? `${thread.other_id}:${thread.messages.length}:${
        thread.messages[thread.messages.length - 1]?.id ?? 0
      }`
    : "";
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [newest, paying]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    const name = to.trim().replace(/^@/, "");
    if (busy || !text || (!thread && !name)) return;
    setBusy(true);
    setError("");
    try {
      const sent = await sendMessage(
        playerId,
        thread ? { id: thread.other_id } : { username: name },
        text
      );
      if (!alive.current) return;
      setDraft("");
      setTo("");
      setError("");
      openThread(sent.to_id);
    } catch (problem) {
      fail(problem, "Could not send that.");
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const save = async () => {
    if (busy || !thread) return;
    setBusy(true);
    setError("");
    try {
      const book = await addContact(playerId, { id: thread.other_id });
      if (!alive.current) return;
      setContacts(book.contacts);
      openThread(thread.other_id); // the conversation now knows they are saved, and whether that made a friend
    } catch (problem) {
      fail(problem, "Could not save them.");
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const paid = (sent: MoneySent) => {
    onMoney(sent.money);
    setPaying(false);
    openThread(sent.to_id);
  };

  const toList = () => {
    openWith.current = null;
    setThread(null);
    setPaying(false);
    setWriting(false);
    setDraft("");
    setError("");
    loadInbox();
  };

  const dataLeft = thread?.data_mb ?? inbox?.data_mb ?? null;
  const cost = inbox?.message_data ?? 1;

  // ---- one conversation ---------------------------------------------------------------------
  if (thread) {
    let standing = "Not in your contacts";
    if (thread.friend)
      standing = thread.online
        ? `In the game · ${thread.where}`
        : "Friend · not in the game now";
    else if (thread.saved)
      standing = "Saved. They have not saved you back yet.";
    return (
      <Screen
        title={`@${thread.username}`}
        sub={standing}
        onBack={toList}
        action={
          thread.saved ? undefined : (
            <button
              type='button'
              className='ph-mini'
              onClick={() => void save()}
              disabled={busy}
            >
              + Save
            </button>
          )
        }
        foot={
          paying ? undefined : (
            <>
              {error && <p className='ph-error'>{error}</p>}
              <form className='ph-send' onSubmit={(event) => void send(event)}>
                <button
                  type='button'
                  className='ph-round coin'
                  onClick={() => setPaying(true)}
                  aria-label={`Send money to @${thread.username}`}
                >
                  ₦
                </button>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder='Message'
                  maxLength={240}
                  aria-label='Message'
                />
                <button
                  type='submit'
                  className='ph-round go'
                  disabled={busy || !draft.trim()}
                  aria-label='Send'
                >
                  <Glyph name='send' size={18} />
                </button>
              </form>
              {dataLeft !== null && (
                <p className='ph-small'>
                  {dataText(dataLeft)} of data left. A text takes {cost} MB.
                </p>
              )}
            </>
          )
        }
      >
        <div className='ph-thread'>
          {thread.messages.map((message) =>
            message.kind === "money" ? (
              <div
                key={message.id}
                className={`ph-cash${message.mine ? " mine" : ""}`}
              >
                <span>{message.mine ? "You sent" : "Sent you"}</span>
                <strong>{naira(message.amount)}</strong>
                {message.text && <em>{message.text}</em>}
                <small>{ago(message.sent_ms)}</small>
              </div>
            ) : (
              <p key={message.id} className={message.mine ? "mine" : ""}>
                {message.text}
                <small>{ago(message.sent_ms)}</small>
              </p>
            )
          )}
          {thread.messages.length === 0 && (
            <p className='ph-small'>Nothing yet. Say hello.</p>
          )}
          {paying && (
            <div className='ph-card'>
              <h3 className='ph-heading'>Send money to @{thread.username}</h3>
              <MoneyForm
                playerId={playerId}
                to={{ id: thread.other_id, username: thread.username }}
                onSent={paid}
                onCancel={() => setPaying(false)}
              />
            </div>
          )}
          <div ref={bottom} />
        </div>
      </Screen>
    );
  }

  // ---- a new conversation ---------------------------------------------------------------------
  if (writing) {
    const known = [
      ...contacts.map((contact) => ({
        id: contact.id,
        username: contact.username,
      })),
      ...nearby.map((person) => ({ id: person.id, username: person.username })),
    ];
    const people = known
      .filter(
        (person, index) =>
          known.findIndex((other) => other.id === person.id) === index
      )
      .slice(0, 10);
    return (
      <Screen
        title='New message'
        sub='To anyone in the city, wherever they are'
        onBack={toList}
      >
        {people.length > 0 && (
          <div className='ph-chips'>
            {people.map((person) => (
              <button
                key={person.id}
                type='button'
                onClick={() => openThread(person.id)}
              >
                @{person.username}
              </button>
            ))}
          </div>
        )}
        <form className='ph-pay' onSubmit={(event) => void send(event)}>
          <label className='ph-field'>
            <span>Who to</span>
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder='@username'
              maxLength={40}
              autoCapitalize='none'
              autoCorrect='off'
            />
          </label>
          <label className='ph-field'>
            <span>Message</span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder='Where you dey?'
              maxLength={240}
            />
          </label>
          {error && <p className='ph-error'>{error}</p>}
          <button
            type='submit'
            className='ph-go'
            disabled={busy || !draft.trim() || !to.trim()}
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </form>
        {dataLeft !== null && (
          <p className='ph-small'>
            {dataText(dataLeft)} of data left. A text takes {cost} MB.
          </p>
        )}
      </Screen>
    );
  }

  // ---- every conversation -----------------------------------------------------------------------
  return (
    <Screen
      title='Messages'
      sub={
        inbox
          ? inbox.unread > 0
            ? `${inbox.unread} not read`
            : "All read"
          : "Opening…"
      }
      onBack={onBack}
      action={
        <button
          type='button'
          className='ph-mini'
          onClick={() => {
            setError("");
            setWriting(true);
          }}
        >
          + New
        </button>
      }
    >
      {error && <p className='ph-error'>{error}</p>}
      <div className='ph-list'>
        {inbox?.chats.map((chat) => (
          <button
            key={chat.other_id}
            type='button'
            className='ph-item press'
            onClick={() => openThread(chat.other_id)}
          >
            <Face name={chat.username} />
            <div className='ph-lines'>
              <strong>@{chat.username}</strong>
              <span>{chat.last}</span>
            </div>
            <div className='ph-when'>
              {chat.last_ms > 0 && <small>{ago(chat.last_ms)}</small>}
              {chat.unread > 0 && <i>{chat.unread}</i>}
            </div>
          </button>
        ))}
      </div>
      {inbox && inbox.chats.length === 0 && (
        <p className='ph-small'>No messages yet. Press New to start one.</p>
      )}
    </Screen>
  );
}
