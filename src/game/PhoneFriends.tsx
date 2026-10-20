import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchCrew, inviteToCrew } from "../api/crew";
import { addContact, fetchContacts, removeContact, type Contact, type Contacts, type Who } from "../api/phone";
import { Glyph } from "./glyphs";
import { Face, Screen, words } from "./phoneKit";
import type { RosterEntry } from "./types";

type Props = {
  playerId: string;
  /** The players who are where this one is: one press to save. */
  nearby: RosterEntry[];
  /** Goes up when somebody saves this player, so the list is fetched again. */
  arrivals: number;
  /** Open the conversation with one of them. */
  onMessage: (id: string) => void;
  /** Find a friend who is in the game: the phone goes away and the map opens on them. */
  onFind: (id: string) => void;
  onBack: () => void;
};

/** What the phone says under a contact's name. */
function standing(contact: Contact): string {
  if (!contact.friend) return "Saved. They have not saved you back yet.";
  return contact.online ? `In the game · ${contact.where}` : "Friend · not in the game now";
}

/**
 * The contacts in the phone. Saving somebody needs nobody's leave. When two players have
 * saved each other they are friends: each can see when the other is in the game and where,
 * and find them on the map (contact_service.friend_destinations). Nobody else can.
 */
export function FriendsApp({ playerId, nearby, arrivals, onMessage, onFind, onBack }: Props) {
  const [book, setBook] = useState<Contacts | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [crew, setCrew] = useState<Set<string>>(new Set());       // friends already rolling with this player
  const [invited, setInvited] = useState<Set<string>>(new Set()); // friends invited from this screen
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    fetchContacts(playerId)
      .then((loaded) => alive.current && setBook(loaded))
      .catch((problem: unknown) => alive.current && setError(words(problem, "Could not open your contacts.")));
  }, [arrivals, playerId]);
  useEffect(() => {
    fetchCrew(playerId)
      .then((now) => alive.current && setCrew(new Set(now.members.map((member) => member.id))))
      .catch(() => {}); // only decides which button shows: a failure leaves "Roll" on every friend online
  }, [arrivals, playerId]);

  /** Ask a friend in the game to come and move about with this player. */
  const roll = async (contact: Contact) => {
    setError("");
    try {
      await inviteToCrew(playerId, contact.id);
      if (alive.current) setInvited((now) => new Set(now).add(contact.id));
    } catch (problem) {
      if (alive.current) setError(words(problem, "Could not invite them."));
    }
  };

  /** One change to the contacts. The server sends the whole list back each time. Resolves to true if it worked. */
  const change = async (work: () => Promise<Contacts>, fallback: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const now = await work();
      if (alive.current) setBook(now);
      return true;
    } catch (problem) {
      if (alive.current) setError(words(problem, fallback));
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const save = (who: Who) => change(() => addContact(playerId, who), "Could not save them.");

  const add = (event: FormEvent) => {
    event.preventDefault();
    const typed = name.trim().replace(/^@/, "");
    if (!typed) return;
    void save({ username: typed }).then((done) => done && alive.current && setName("")); // a name that could not be saved stays, to be put right
  };

  const saved = new Set(book?.contacts.map((contact) => contact.id));
  const strangers = nearby.filter((person) => !saved.has(person.id)).slice(0, 6);
  const friends = book?.contacts.filter((contact) => contact.friend).length ?? 0;

  return (
    <Screen title="Friends" sub={book ? `${friends} ${friends === 1 ? "friend" : "friends"} · ${book.contacts.length} saved` : "Your contacts"} onBack={onBack}>
      <form className="ph-send" onSubmit={add}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="@username" maxLength={40} autoCapitalize="none" autoCorrect="off" aria-label="Username to save" />
        <button type="submit" className="ph-go" disabled={busy || !name.trim()}>
          Save
        </button>
      </form>
      {error && <p className="ph-error">{error}</p>}

      {strangers.length > 0 && (
        <>
          <h3 className="ph-heading">Standing near you</h3>
          <div className="ph-chips">
            {strangers.map((person) => (
              <button key={person.id} type="button" onClick={() => void save({ id: person.id })} disabled={busy}>
                + @{person.username}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="ph-list">
        {book?.contacts.map((contact) => (
          <div key={contact.id} className="ph-item">
            <Face name={contact.username} online={contact.online} />
            <div className="ph-lines">
              <strong>@{contact.username}</strong>
              {contact.friend && contact.online ? (
                <button type="button" className="ph-find" onClick={() => onFind(contact.id)} aria-label={`Find @${contact.username} on the map`}>
                  📍 {contact.where} · Find
                </button>
              ) : (
                <span>{standing(contact)}</span>
              )}
            </div>
            {contact.friend && contact.online && (
              crew.has(contact.id) ? (
                <span className="ph-mini done">With you</span>
              ) : invited.has(contact.id) ? (
                <span className="ph-mini done">Invited</span>
              ) : (
                <button type="button" className="ph-mini" onClick={() => void roll(contact)} aria-label={`Invite @${contact.username} to roll with you`}>
                  Roll
                </button>
              )
            )}
            <button type="button" className="ph-mini plain" onClick={() => onMessage(contact.id)}>
              Text
            </button>
            <button
              type="button"
              className="ph-mini plain"
              onClick={() => void change(() => removeContact(playerId, contact.id), "Could not remove them.")}
              disabled={busy}
              aria-label={`Remove @${contact.username}`}
            >
              <Glyph name="close" size={15} />
            </button>
          </div>
        ))}
      </div>
      {book && book.contacts.length === 0 && <p className="ph-small">Nobody saved yet. Type a username above, or save someone standing near you.</p>}
      <p className="ph-small">
        When two of you have saved each other you are friends. Friends can see when the other is in the game and where: press Find to see them on the map and get a ride to them. Press Roll to invite a friend to move about with you: they come to where you are, and when one of you takes a ride, the others standing with you ride along.
      </p>
    </Screen>
  );
}
