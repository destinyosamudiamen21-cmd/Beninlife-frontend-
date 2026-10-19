// The people of the market: sellers who stand behind their stalls and call out, and
// touts who come after you, take hold of you and will not let go until you shake them
// off or their patience runs out. This file is only the behaviour: who is where and
// doing what. It draws nothing, so all of it can be tested without the 3D engine.

import type { Look } from "../api/appearance";
import type { Collider, Point } from "./collision";
import type { DistrictData } from "./districtData";
import { GOODS } from "./streetProps";

// ---- how the market behaves: change these to tune it -------------------------

const NOTICE = 11;        // metres at which a tout spots you
const GRAB = 0.85;        // metres at which they take hold
const LEASH = 34;         // how far from their spot a tout will chase
const WAKE = 70;          // touts further than this from you do nothing at all
const TOUT_RUN = 3.0;     // m/s. You walk at 2 and sprint at 3.5, so only sprinting gets you away
const TOUT_WALK = 1.5;
const HOLD_SPEED = 4.5;   // once they have you they keep up whatever you do
const CHASE_PATIENCE = 9; // seconds before a tout who cannot catch you gives up
const REST = 26;          // seconds a tout leaves you alone after letting go
const TALK_TIME = 3.2;    // seconds a line stays over someone's head
const SELLER_CALL = 9;    // metres at which sellers call out to you
const SELLER_REACH = 2.8; // metres at which you can buy from a seller

// The market's day (game hours, from the player's clock).
const STROLL = 1.15;      // m/s: sellers walking to and from their stalls
const AWAY = 16;          // metres behind the stall a seller goes to when they are not at it
const ANIMATE_WITHIN = 75; // metres: further from the player than this, people just are where they should be
const LUNCH_HOURS = 0.6;  // how long lunch takes
const CHAT_EVERY = [35, 80]; // seconds between two neighbouring sellers having a word
const CHAT_REACH = 7;     // metres: sellers this close can talk across
const CHAT_TIME = 4.5;    // seconds a word lasts
const WANDER = 3.5;       // metres a tout strolls about their corner while waiting

// Street sense 1 (butter) to 3 (street). Index 0 is unused.
const MAX_AFTER_YOU = [0, 3, 2, 1];   // how many touts come at once
const HOLD_SECONDS = [0, 9, 5, 2.5];  // how long one holds on if you do nothing
const SHAKES = [0, 3, 2, 1];          // how many times you must shake to lose one
const DRAG = [1, 0.5, 0.32, 0.25];    // your speed with 0, 1, 2, 3 touts holding you

// ---- what they say -------------------------------------------------------

const CALLS: Record<string, string[]> = {
  okrika: ["Customer! Fine jeans, come see!", "Bros, I get your size!", "First grade okrika, no stain!", "Come and select, e cheap!"],
  food: ["Hot bole and fish!", "Customer, come chop!", "Sweet pineapple, just now!", "Suya dey, fresh one!"],
  fabric: ["Fine ankara, come and price!", "Aunty, new lace just land!", "Original George, touch am!"],
  beads: ["Coral beads, correct one!", "Come see bronze, na Igun work!", "Fine beads for your wife!"],
  electronics: ["Charger, earpiece, power bank!", "Original, e get warranty!", "Oga, your phone need pouch?"],
  bushmeat: ["Fresh bush meat!", "Grasscutter dey, come see!", "Customer, na today own!"],
  provisions: ["Wetin you wan buy?", "Bread, milk, everything dey!", "Customer, I dey here!"],
};
const GRAB_LINES = ["Customer, wait first!", "Just look am, you no go pay to look!", "Come, I go give you better price!", "No go, na here e dey!", "My customer! Na you I dey wait for!"];
const HOLD_LINES = ["Just two minutes!", "E cheap, I swear!", "Ah ah, you no wan even look?", "I go reduce am for you!", "Fine boy, fine girl, come now!"];
const LET_GO_LINES = ["Okay o. Next time.", "No vex, customer.", "You go come back.", "Ah! This one hard."];
const GIVE_UP_LINES = ["Customer! Come back!", "E don run.", "Next time o!"];
const CHAT_LINES = [
  ["How market today?", "Market dey slow o. Nobody get money."],
  ["You see that boy with the Benz?", "Na yahoo, abeg. Leave am."],
  ["NEPA don take light again.", "Na so. My generator don spoil sef."],
  ["Mama, abeg hold my change.", "Bring am, I go give you later."],
  ["Who dey sell that pepper by the gate?", "Na Iye Osagie. E cheap pass mine? Lie!"],
  ["The police dey Ring Road again.", "Dem no dey tire. Every day na settle."],
  ["Your daughter don finish school?", "She dey UNIBEN now. Final year!"],
  ["Rain wan fall.", "Make e no fall o. My goods go soak."],
];
const OPEN_LINES = ["Oya, make we open shop.", "God, bless my market today.", "First customer, where you dey?"];
const LUNCH_LINES = ["Make I chop small.", "Hunger don catch me.", "Abeg watch my things, I dey come."];
const CLOSE_LINES = ["Oya, I don close.", "Make I pack my things before dark.", "Tomorrow again."];

const FIRST_NAMES = ["Osas", "Efosa", "Osaro", "Itohan", "Nosa", "Eki", "Uyi", "Osagie", "Ehis", "Esosa", "Ivie", "Adesuwa", "Iyobosa", "Osahon", "Omo", "Ede"];
const HER_TITLES = ["Mama", "Aunty", "Madam", "Iye"];
const HIS_TITLES = ["Oga", "Uncle", "Bros", "Baba"];

const SKIN = ["#a9714b", "#8d5a3b", "#774a2f", "#613a25", "#4b2c1c", "#35201a"];
const HAIR = ["#17120f", "#2b2320", "#44301f"];
const CLOTH = ["#2f6fd6", "#2f9e54", "#d64545", "#e88a2b", "#6a4fe0", "#d63f8c", "#2a9d8f", "#3a3d42", "#ede6d6", "#c79a2b"];
const SHOES = ["#f2f2f2", "#1d1d1f", "#6b4226"];

// ---- types ---------------------------------------------------------------

export type Person = {
  id: number;
  x: number;
  z: number;
  /** The way they face, as the character model wants it. */
  rot: number;
  /** How fast they are moving, which picks their animation. */
  speed: number;
  look: Look;
  shop: string;
  /** What they are saying, shown until `sayUntil` on the market's clock. */
  say: string;
  sayUntil: number;
  /** Not in the market just now (gone home): not drawn, not selling. */
  hidden?: boolean;
};

/** Where a seller is in their day. */
export type SellerDoing = "selling" | "lunch" | "away" | "going";

export type Seller = Person & {
  name: string;
  nextCall: number;
  homeX: number;
  homeZ: number;
  homeRot: number;
  /** Their day, in game hours: when they come, when they eat, when they go home. */
  opens: number;
  lunch: number;
  closes: number;
  doing: SellerDoing;
  /** The next time they will have a word with a neighbour, and with whom while they do. */
  nextChat: number;
  chatUntil: number;
  chatWith: number;
};

export type ToutState = "wait" | "chase" | "hold" | "leave";

export type Tout = Person & {
  state: ToutState;
  homeX: number;
  homeZ: number;
  /** Shakes left before they let go. */
  grip: number;
  /** Seconds left before they let go by themselves. */
  holdLeft: number;
  /** Seconds they have been chasing without catching you. */
  chased: number;
  /** Seconds before they will bother you again. */
  rest: number;
  /** Which side of you they hang on to. */
  side: number;
  nextLine: number;
  /** Strolling about their corner while they wait: where to, and when to pick somewhere else. */
  strollX: number;
  strollZ: number;
  nextStroll: number;
};

export type Crowd = {
  sellers: Seller[];
  touts: Tout[];
  /** The player's street sense, 1 to 3. */
  street: number;
  /** Seconds since this market came to life. */
  time: number;
  /** How many touts have hold of the player right now. */
  holding: number;
  /** The seller the player is standing close enough to buy from, if any. */
  nearSeller: Seller | null;
  /** The time of day, in game hours (the player's clock). */
  hour: number;
  /** Goes up whenever a seller moves or comes or goes, so whoever draws them knows to again. */
  version: number;
};

// ---- making a crowd ------------------------------------------------------

/** A repeatable random number from 0 to 1, so every visit to a market has the same people. */
function hash(n: number): number {
  let h = (n | 0) * 374761393 + 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pick<T>(list: T[], seed: number): T {
  return list[Math.floor(hash(seed) * list.length) % list.length];
}

// What market people wear over their clothes, if anything: a third of them, native.
const HER_WEAR = ["wrapper", "wrapper", "iro_gele", "ankara_gown"];
const HIS_WEAR = ["senator", "kaftan", "ankara_shirt"];

function lookFor(seed: number): Look {
  const woman = hash(seed) < 0.5;
  const native = hash(seed + 6) < 0.34;
  return {
    body: woman ? "woman" : "man",
    dress: native ? pick(woman ? HER_WEAR : HIS_WEAR, seed + 7) : "",
    skin_tone: pick(SKIN, seed + 1),
    hair_color: pick(HAIR, seed + 2),
    top_color: pick(CLOTH, seed + 3),
    bottom_color: pick(CLOTH, seed + 4),
    shoe_color: pick(SHOES, seed + 5),
  };
}

export function createCrowd(district: DistrictData, street: number): Crowd {
  const sense = street >= 1 && street <= 3 ? Math.floor(street) : 1;
  const sellers: Seller[] = [];
  const touts: Tout[] = [];

  const spots = district.vendors ?? [];
  for (let i = 0; i + 3 < spots.length; i += 4) {
    const id = i / 4;
    const look = lookFor(id * 17 + 3);
    const title = pick(look.body === "woman" ? HER_TITLES : HIS_TITLES, id * 5 + 1);
    const shop = GOODS[spots[i + 3]] ?? "provisions";
    // Most come in the morning and go before dark. Some food sellers (suya, roasted corn) only come for the evening.
    const evening = shop === "food" && hash(id + 400) < 0.35;
    const opens = evening ? 16 + hash(id + 401) * 1.5 : 6.3 + hash(id + 402) * 2.2;
    const closes = evening ? 22 + hash(id + 403) * 1.5 : 18 + hash(id + 404) * 2.2;
    sellers.push({
      id,
      x: spots[i],
      z: spots[i + 1],
      rot: spots[i + 2],
      speed: 0,
      look,
      shop,
      name: `${title} ${pick(FIRST_NAMES, id * 7 + 2)}`,
      say: "",
      sayUntil: 0,
      nextCall: hash(id + 900) * 6,
      homeX: spots[i],
      homeZ: spots[i + 1],
      homeRot: spots[i + 2],
      opens,
      lunch: evening ? -1 : 12 + hash(id + 405) * 2,
      closes,
      doing: "selling",
      nextChat: CHAT_EVERY[0] + hash(id + 406) * CHAT_EVERY[1],
      chatUntil: 0,
      chatWith: -1,
    });
  }

  const corners = district.touts ?? [];
  for (let i = 0; i + 2 < corners.length; i += 3) {
    const index = i / 3;
    touts.push({
      id: 10000 + index,
      x: corners[i],
      z: corners[i + 1],
      homeX: corners[i],
      homeZ: corners[i + 1],
      rot: hash(index + 50) * Math.PI * 2,
      speed: 0,
      look: lookFor(index * 23 + 11),
      shop: GOODS[corners[i + 2]] ?? "provisions",
      say: "",
      sayUntil: 0,
      state: "wait",
      grip: 0,
      holdLeft: 0,
      chased: 0,
      rest: hash(index + 77) * 4,
      side: hash(index + 31) * Math.PI * 2,
      nextLine: 0,
      strollX: corners[i],
      strollZ: corners[i + 1],
      nextStroll: hash(index + 32) * 8,
    });
  }

  return { sellers, touts, street: sense, time: 0, holding: 0, nearSeller: null, hour: 10, version: 0 };
}

// ---- one tick ------------------------------------------------------------

const moved: Point = { x: 0, z: 0 };

function speak(crowd: Crowd, person: Person, lines: string[], seed: number): void {
  person.say = pick(lines, seed);
  person.sayUntil = crowd.time + TALK_TIME;
}

/** Walk a tout towards a spot, round walls and stalls when the map's collider is given. */
function walk(tout: Person, toX: number, toZ: number, pace: number, dt: number, collider?: Collider): number {
  const dx = toX - tout.x, dz = toZ - tout.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-4) {
    tout.speed = 0;
    return 0;
  }
  const step = Math.min(distance, pace * dt);
  let nextX = tout.x + (dx / distance) * step;
  let nextZ = tout.z + (dz / distance) * step;
  if (collider) {
    collider.resolve(tout.x, tout.z, nextX, nextZ, moved);
    nextX = moved.x;
    nextZ = moved.z;
  }
  tout.speed = dt > 0 ? Math.hypot(nextX - tout.x, nextZ - tout.z) / dt : 0;
  tout.x = nextX;
  tout.z = nextZ;
  tout.rot = Math.atan2(dx, dz);
  return distance - step;
}

function letGo(crowd: Crowd, tout: Tout, lines: string[]): void {
  tout.state = "leave";
  tout.rest = REST + hash(tout.id + Math.floor(crowd.time)) * 14;
  speak(crowd, tout, lines, tout.id + Math.floor(crowd.time * 10));
}

/** Move the market on by `dt` seconds, given where the player is. */
export function stepCrowd(crowd: Crowd, dt: number, playerX: number, playerZ: number, collider?: Collider): void {
  crowd.time += dt;
  const sense = crowd.street;

  let busy = 0; // touts already after the player
  for (const tout of crowd.touts) if (tout.state === "chase" || tout.state === "hold") busy++;

  for (const tout of crowd.touts) {
    const toPlayer = Math.hypot(playerX - tout.x, playerZ - tout.z);
    tout.rest = Math.max(0, tout.rest - dt);

    // Touts work the daylight hours only.
    const night = crowd.hour < 7 || crowd.hour >= 20;
    if (night && tout.state === "wait") {
      tout.hidden = true;
      tout.speed = 0;
      continue;
    }
    tout.hidden = false;

    if (tout.state === "wait") {
      // Strolling about their corner, eyes open.
      if (crowd.time >= tout.nextStroll) {
        const a = hash(tout.id + Math.floor(crowd.time)) * Math.PI * 2;
        tout.strollX = tout.homeX + Math.cos(a) * WANDER;
        tout.strollZ = tout.homeZ + Math.sin(a) * WANDER;
        tout.nextStroll = crowd.time + 6 + hash(tout.id * 3 + Math.floor(crowd.time)) * 9;
      }
      if (toPlayer < WAKE && Math.hypot(tout.strollX - tout.x, tout.strollZ - tout.z) > 0.2) walk(tout, tout.strollX, tout.strollZ, 0.8, dt, collider);
      else tout.speed = 0;
      if (toPlayer < NOTICE && tout.rest <= 0 && busy < MAX_AFTER_YOU[sense]) {
        tout.state = "chase";
        tout.chased = 0;
        busy++;
        speak(crowd, tout, CALLS[tout.shop] ?? CALLS.provisions, tout.id + Math.floor(crowd.time));
      }
      continue;
    }

    if (tout.state === "chase") {
      tout.chased += dt;
      const fromHome = Math.hypot(tout.x - tout.homeX, tout.z - tout.homeZ);
      if (tout.chased > CHASE_PATIENCE || fromHome > LEASH || toPlayer > WAKE) {
        letGo(crowd, tout, GIVE_UP_LINES);
        continue;
      }
      if (walk(tout, playerX, playerZ, TOUT_RUN, dt, collider) <= GRAB || toPlayer <= GRAB) {
        tout.state = "hold";
        tout.grip = SHAKES[sense];
        tout.holdLeft = HOLD_SECONDS[sense];
        tout.nextLine = crowd.time + TALK_TIME;
        speak(crowd, tout, GRAB_LINES, tout.id + Math.floor(crowd.time));
      }
      continue;
    }

    if (tout.state === "hold") {
      tout.holdLeft -= dt;
      if (tout.holdLeft <= 0 || tout.grip <= 0 || toPlayer > 6) {
        letGo(crowd, tout, LET_GO_LINES);
        continue;
      }
      // Stay at the player's elbow, facing them, whatever they do.
      walk(tout, playerX + Math.cos(tout.side) * 0.7, playerZ + Math.sin(tout.side) * 0.7, HOLD_SPEED, dt, collider);
      tout.rot = Math.atan2(playerX - tout.x, playerZ - tout.z);
      if (crowd.time >= tout.nextLine) {
        tout.nextLine = crowd.time + TALK_TIME + 0.8;
        speak(crowd, tout, HOLD_LINES, tout.id + Math.floor(crowd.time));
      }
      continue;
    }

    // Walking back to their spot.
    if (walk(tout, tout.homeX, tout.homeZ, TOUT_WALK, dt, collider) < 0.3) {
      tout.state = "wait";
      tout.speed = 0;
    }
  }

  crowd.holding = 0;
  for (const tout of crowd.touts) if (tout.state === "hold") crowd.holding++;

  // Sellers keep a day: they come in the morning, eat at midday, chat across to the next
  // stall, and pack up and go home before dark. Only those at their stalls sell.
  let nearest: Seller | null = null;
  let nearestGap = SELLER_REACH;
  for (const seller of crowd.sellers) {
    const gap = Math.hypot(playerX - seller.x, playerZ - seller.z);
    stepSeller(crowd, seller, dt, gap);
    if (seller.doing !== "selling") continue;
    if (gap < nearestGap) {
      nearest = seller;
      nearestGap = gap;
    }
    if (gap < SELLER_CALL && crowd.time >= seller.nextCall && crowd.time >= seller.chatUntil) {
      seller.nextCall = crowd.time + 7 + hash(seller.id + Math.floor(crowd.time)) * 10;
      speak(crowd, seller, CALLS[seller.shop] ?? CALLS.provisions, seller.id + Math.floor(crowd.time));
    }
  }
  crowd.nearSeller = nearest;
}

/** Is it time to be at the stall, eating, or gone? */
function dueTo(seller: Seller, hour: number): SellerDoing {
  if (hour < seller.opens || hour >= seller.closes) return "away";
  if (seller.lunch >= 0 && hour >= seller.lunch && hour < seller.lunch + LUNCH_HOURS) return "lunch";
  return "selling";
}

/** Where a seller goes for each part of their day. */
function placeFor(seller: Seller, doing: SellerDoing): [number, number] {
  const fx = Math.sin(seller.homeRot), fz = Math.cos(seller.homeRot);
  if (doing === "away") return [seller.homeX - fx * AWAY, seller.homeZ - fz * AWAY];      // out the back, home
  if (doing === "lunch") return [seller.homeX - fx * 1.6 + fz * 2.2, seller.homeZ - fz * 1.6 - fx * 2.2]; // a stool beside the stall
  return [seller.homeX, seller.homeZ];
}

function stepSeller(crowd: Crowd, seller: Seller, dt: number, gap: number): void {
  const due = dueTo(seller, crowd.hour);
  const [goalX, goalZ] = placeFor(seller, due);
  const there = Math.hypot(goalX - seller.x, goalZ - seller.z) < 0.15;
  if (there) {
    if (seller.doing !== due) {
      // Arrived: at the stall, at lunch, or gone.
      seller.doing = due;
      seller.speed = 0;
      seller.hidden = due === "away";
      seller.rot = seller.homeRot;
      crowd.version++;
    }
  } else if (gap > ANIMATE_WITHIN) {
    // Nobody is watching: they are simply where they should be by now.
    seller.x = goalX;
    seller.z = goalZ;
    seller.doing = due;
    seller.speed = 0;
    seller.hidden = due === "away";
    seller.rot = seller.homeRot;
    crowd.version++;
    return;
  } else {
    if (seller.doing !== "going") {
      // Setting off: say so.
      const lines = due === "away" ? CLOSE_LINES : due === "lunch" ? LUNCH_LINES : OPEN_LINES;
      speak(crowd, seller, lines, seller.id + Math.floor(crowd.time));
      seller.doing = "going";
      seller.hidden = false;
    }
    walk(seller, goalX, goalZ, STROLL, dt);
    crowd.version++;
    return;
  }

  // At the stall: now and then, a word with the seller at the next stall.
  if (seller.doing !== "selling") return;
  if (crowd.time < seller.chatUntil) return;
  if (seller.chatWith >= 0) {
    seller.chatWith = -1;
    seller.rot = seller.homeRot; // back to the customers
    crowd.version++;
  }
  if (crowd.time < seller.nextChat || gap > ANIMATE_WITHIN) return;
  seller.nextChat = crowd.time + CHAT_EVERY[0] + hash(seller.id + Math.floor(crowd.time)) * CHAT_EVERY[1];
  const other = crowd.sellers.find((o) => o !== seller && o.doing === "selling" && crowd.time >= o.chatUntil
    && Math.abs(o.x - seller.x) < CHAT_REACH && Math.abs(o.z - seller.z) < CHAT_REACH && Math.hypot(o.x - seller.x, o.z - seller.z) < CHAT_REACH);
  if (!other) return;
  const pair = CHAT_LINES[Math.floor(hash(seller.id * 13 + Math.floor(crowd.time)) * CHAT_LINES.length) % CHAT_LINES.length];
  seller.rot = Math.atan2(other.x - seller.x, other.z - seller.z);
  other.rot = Math.atan2(seller.x - other.x, seller.z - other.z);
  seller.say = pair[0];
  seller.sayUntil = crowd.time + CHAT_TIME * 0.5;
  other.say = pair[1];
  other.sayUntil = crowd.time + CHAT_TIME;
  seller.chatUntil = other.chatUntil = crowd.time + CHAT_TIME;
  seller.chatWith = other.id;
  other.chatWith = seller.id;
  other.nextChat = seller.nextChat;
  crowd.version++;
}

// ---- what the player can do about it --------------------------------------

/** "Leave me!" Every tout holding the player loses some of their grip. */
export function shakeOff(crowd: Crowd): void {
  for (const tout of crowd.touts) if (tout.state === "hold") tout.grip -= 1;
}

/** Everyone after the player backs off, as they do once you have bought something. */
export function sendAway(crowd: Crowd): void {
  for (const tout of crowd.touts) {
    if (tout.state === "hold" || tout.state === "chase") letGo(crowd, tout, LET_GO_LINES);
  }
  crowd.holding = 0;
}

/** The first tout holding the player, whose goods they can agree to look at. */
export function holder(crowd: Crowd): Tout | null {
  return crowd.touts.find((tout) => tout.state === "hold") ?? null;
}

/** How fast the player can move: 1 when free. */
export function dragFactor(crowd: Crowd): number {
  return DRAG[Math.min(crowd.holding, DRAG.length - 1)];
}

/**
 * Who is worth drawing: anyone after the player first, then whoever is nearest.
 * Drawing a person costs far more than a stall, so only a handful are shown at once.
 */
export function visiblePeople(crowd: Crowd, playerX: number, playerZ: number, limit: number, range: number): Person[] {
  const ranked: { person: Person; rank: number }[] = [];
  for (const tout of crowd.touts) {
    if (tout.hidden) continue;
    const gap = Math.hypot(playerX - tout.x, playerZ - tout.z);
    if (tout.state !== "wait") ranked.push({ person: tout, rank: gap - 1000 });
    else if (gap < range) ranked.push({ person: tout, rank: gap });
  }
  for (const seller of crowd.sellers) {
    if (seller.hidden) continue;
    const gap = Math.hypot(playerX - seller.x, playerZ - seller.z);
    if (gap < range) ranked.push({ person: seller, rank: gap });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.person.id - b.person.id);
  return ranked.slice(0, limit).map((entry) => entry.person);
}

/**
 * The same choice as visiblePeople, but it keeps whoever is already on screen until they
 * are well out of range. Bringing a person on screen is the costly part, so walking down
 * a market street swaps one or two people at a time instead of the whole set.
 */
export function keepPeople(
  crowd: Crowd,
  current: Person[],
  playerX: number,
  playerZ: number,
  limit: number,
  range: number,
): Person[] {
  const wanted = visiblePeople(crowd, playerX, playerZ, limit, range);
  const after = (person: Person) => (person as Partial<Tout>).state !== undefined && (person as Tout).state !== "wait";

  // Anyone after the player is always shown. Then those already on screen and still close. Then the nearest.
  const kept: Person[] = wanted.filter(after);
  for (const person of current) {
    if (kept.length >= limit) break;
    if (kept.includes(person)) continue;
    if (!person.hidden && Math.hypot(playerX - person.x, playerZ - person.z) < range + 8) kept.push(person);
  }
  for (const person of wanted) {
    if (kept.length >= limit) break;
    if (!kept.includes(person)) kept.push(person);
  }
  return kept;
}

/** Tell the market what time it is (game hours, 0 to 24). */
export function setHour(crowd: Crowd, hour: number): void {
  crowd.hour = hour;
}
