import { request, sendJson } from "./request";

/** One message in a conversation. When `kind` is "money" it is money that was sent: `amount` naira, and `text` is the note with it. */
export type Message = {
  id: number;
  mine: boolean;
  text: string;
  sent_ms: number;
  kind: string;
  amount: number;
};

/** One conversation, as it shows in the list. */
export type Chat = {
  other_id: string;
  username: string;
  last: string;
  last_ms: number;
  unread: number;
};

export type Inbox = {
  chats: Chat[];
  unread: number;
  data_mb: number;
  message_data: number;
};

export type Thread = {
  other_id: string;
  username: string;
  messages: Message[];
  data_mb: number;
  /** The reader has this player in their contacts ... */
  saved: boolean;
  /** ... and this player has the reader in theirs. */
  friend: boolean;
  /** A friend who is in the game right now, and which part of town they are in. */
  online: boolean;
  where: string;
};

export type Sent = {
  message: Message;
  to_id: string;
  username: string;
  data_mb: number;
};

/** Who something is for: a username typed in, or a player the phone already knows. */
export type Who = { username: string } | { id: string };

export function fetchInbox(playerId: string): Promise<Inbox> {
  return request<Inbox>(`/players/${playerId}/messages`);
}

/** Opening a conversation marks what the other person sent as read. */
export function fetchThread(
  playerId: string,
  otherId: string
): Promise<Thread> {
  return request<Thread>(`/players/${playerId}/messages/${otherId}`);
}

export function sendMessage(
  playerId: string,
  to: Who,
  text: string
): Promise<Sent> {
  const body = "id" in to ? { to_id: to.id, text } : { to: to.username, text };
  return request<Sent>(`/players/${playerId}/messages`, sendJson("POST", body));
}

// ---- money -----------------------------------------------------------------------------

export type MoneySent = {
  message: Message;
  to_id: string;
  username: string;
  /** What the sender has left. */
  money: number;
  /** How much more they may send today. */
  left_today: number;
};

export type MoneyLimits = {
  least: number;
  most_a_day: number;
  left_today: number;
  money: number;
};

export function fetchMoneyLimits(playerId: string): Promise<MoneyLimits> {
  return request<MoneyLimits>(`/players/${playerId}/money`);
}

/** Send naira to another player. It shows in the conversation with them, with the note. */
export function sendMoney(
  playerId: string,
  to: Who,
  amount: number,
  note: string
): Promise<MoneySent> {
  const body =
    "id" in to
      ? { to_id: to.id, amount, note }
      : { to: to.username, amount, note };
  return request<MoneySent>(
    `/players/${playerId}/money`,
    sendJson("POST", body)
  );
}

/** One line of the bank's record: money in or out, and what was left. */
export type Alert = {
  id: number;
  amount: number;
  reason: string;
  note: string;
  balance_after: number;
  created_at: string;
};

export type Wallet = { money: number; alerts: Alert[] };

/** The newest bank alerts, newest first. */
export function fetchWallet(playerId: string, limit = 20): Promise<Wallet> {
  return request<Wallet>(`/players/${playerId}/wallet?limit=${limit}`);
}

// ---- contacts ---------------------------------------------------------------------------

/**
 * Someone saved in the phone. When both have saved each other they are friends, and only
 * then does the phone say whether they are in the game and where.
 */
export type Contact = {
  id: string;
  username: string;
  friend: boolean;
  online: boolean;
  where: string;
};

export type Contacts = { contacts: Contact[]; most: number };

export function fetchContacts(playerId: string): Promise<Contacts> {
  return request<Contacts>(`/players/${playerId}/contacts`);
}

export function addContact(playerId: string, who: Who): Promise<Contacts> {
  const body = "id" in who ? { player_id: who.id } : { username: who.username };
  return request<Contacts>(
    `/players/${playerId}/contacts`,
    sendJson("POST", body)
  );
}

export function removeContact(
  playerId: string,
  otherId: string
): Promise<Contacts> {
  return request<Contacts>(`/players/${playerId}/contacts/${otherId}`, {
    method: "DELETE",
  });
}
