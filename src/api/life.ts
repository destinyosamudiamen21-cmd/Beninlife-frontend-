import { request, sendJson } from "./request";

/** Five needs from 0 to 100; higher is always better. `mood` is their average. */
export type Needs = {
  energy: number;
  food: number;
  hygiene: number;
  fun: number;
  social: number;
  mood: number;
  mood_name: string;
};

/** The player's own clock. It creeps while they walk about and jumps when they do something. */
export type Clock = {
  day: number;
  hour: number;
  minute: number;
  text: string;
  block: string;
};

export type Skill = { id: string; name: string; level: number; points: number };

/** Something in progress. It is done with a piece of furniture (`item_id`) or a spot out in the world (`spot`). */
export type Doing = {
  action: string;
  name: string;
  item_id: number | null;
  spot: string | null;
  /** What the body is doing meanwhile: "legwork", "sit" ... or "". */
  pose: string;
  /** How long it takes in all. */
  seconds: number;
  /** By the server's clock. Less than `seconds` minus `elapsed` if they are going to drop before the end. */
  seconds_left: number;
  elapsed: number;
};

export type Life = {
  needs: Needs;
  clock: Clock;
  skills: Skill[];
  /** Portions of cooked food in the pot. */
  meals: number;
  /** Phone data left, in megabytes. */
  data_mb: number;
  doing: Doing | null;
  /** Passed out: seconds until "Wake up" will work. Null when on their feet. */
  out_left: number | null;
  /** The kinds of furniture that can be used. */
  usable: string[];
  /** Things that happened since the last look: a missed class, money from home. */
  news: string[];
  money: number;
};

export type ActionOption = {
  id: string;
  name: string;
  seconds: number;
  cost: number;
  /** "+Energy", "+Cooking", "3 portions", "Energy drain". */
  gives: string[];
  /** Why it cannot be done right now, or null. */
  blocked: string | null;
};

/** What can be done with one thing: a piece of furniture or a spot. */
export type ActionMenu = {
  item_id: number | null;
  spot: string | null;
  name: string;
  /** One line about it right now, or "". */
  note: string;
  actions: ActionOption[];
};

/** What an action is done with. Exactly one of the two is set. */
export type Target = { item_id: number } | { spot: string };

export type Change = { name: string; amount: number };

export type Finished = {
  life: Life;
  name: string;
  lines: string[];
  changes: Change[];
  /** They ran out of energy and are on the floor. */
  collapsed: boolean;
  /** Prize money, or 0. */
  won: number;
  /** A ride put them down somewhere else. */
  moved: { district: string; x: number; z: number } | null;
};

export type DataBundle = {
  id: string;
  name: string;
  mb: number;
  price: number;
};
export type PhoneData = {
  data_mb: number;
  bundles: DataBundle[];
  money: number;
};

export function fetchLife(playerId: string): Promise<Life> {
  return request<Life>(`/players/${playerId}/life`);
}

export function fetchActions(
  playerId: string,
  target: Target
): Promise<ActionMenu> {
  const path =
    "spot" in target
      ? `spots/${encodeURIComponent(target.spot)}`
      : `items/${target.item_id}`;
  return request<ActionMenu>(`/players/${playerId}/life/${path}`);
}

export function startAction(
  playerId: string,
  target: Target,
  action: string
): Promise<Life> {
  return request<Life>(
    `/players/${playerId}/life/start`,
    sendJson("POST", { ...target, action })
  );
}

/** Refused with status 425 if the action's time is not up yet. */
export function finishAction(playerId: string): Promise<Finished> {
  return request<Finished>(`/players/${playerId}/life/finish`, {
    method: "POST",
  });
}

export function cancelAction(playerId: string): Promise<Life> {
  return request<Life>(`/players/${playerId}/life/cancel`, { method: "POST" });
}

/** Get up after passing out. Refused with status 425 for the first few seconds. */
export function wakeUp(playerId: string): Promise<Life> {
  return request<Life>(`/players/${playerId}/life/wake`, { method: "POST" });
}

export function fetchData(playerId: string): Promise<PhoneData> {
  return request<PhoneData>(`/players/${playerId}/life/data`);
}

export function buyData(playerId: string, bundle: string): Promise<PhoneData> {
  return request<PhoneData>(
    `/players/${playerId}/life/data`,
    sendJson("POST", { bundle })
  );
}
