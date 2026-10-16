import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas } from "@react-three/fiber";
import { Loader } from "@react-three/drei";
import {
  fetchLookOptions,
  fetchLookState,
  saveLook,
  type Look,
  type LookOptions,
} from "../api/appearance";
import {
  enterClub,
  fetchClub,
  inviteToBooth,
  rentBooth,
  type Club,
} from "../api/club";
import {
  bringCar,
  carLook,
  fetchCars,
  getIn,
  getOut,
  sendCarHome,
  type Cars,
  type OwnedCar,
} from "../api/cars";
import {
  acceptCrew,
  declineCrew,
  fetchCrew,
  leaveCrew,
  type Crew,
} from "../api/crew";
import { fetchHome, type Home, type HomeChange } from "../api/home";
import type { Player } from "../api/players";
import { fetchWallet } from "../api/phone";
import { getStopped, type PoliceStop } from "../api/police";
import {
  fetchStory,
  tellStory,
  type StoryResult,
  type StoryState,
} from "../api/story";
import {
  fetchCity,
  goTo,
  type City,
  type CityPlace,
  type Going,
  type RideOption,
} from "../api/travel";
import { ArenaScene } from "./ArenaScene";
import { BusRide, type RideKind } from "./BusRide";
import { CharacterCreator } from "./CharacterCreator";
import { CityMap } from "./CityMap";
import { BoothCard, ClubHud, ClubMenu } from "./ClubHud";
import { ClubScene } from "./ClubScene";
import { Compass } from "./Compass";
import { CrewBar } from "./CrewBar";
import { CrowdAndTraffic } from "./CrowdAndTraffic";
import { BuildCamera } from "./BuildCamera";
import { BuildPanel } from "./BuildPanel";
import { ParkedCars } from "./Car";
import { CarKeysPanel, DealerPanel, DriveHud } from "./CarPanels";
import {
  carBox,
  carParkSpots,
  statsFor,
  touchesBox,
  withCars,
  type Box,
} from "./carPhysics";
import { carParts, readCarLook } from "./carShapes";
import { District } from "./District";
import { ArenaHud } from "./FightPanel";
import { Guide } from "./Guide";
import { HomeScene } from "./HomeScene";
import { EMPTY_VIEW, type BuildView } from "./homeBuild";
import { isDone, serverNow, syncClock } from "./homeRooms";
import { LifeActions, LifeHud } from "./LifePanel";
import { LocalPlayer, type Driving } from "./LocalPlayer";
import { MapPanel } from "./MapPanel";
import { MarketPeople } from "./MarketPeople";
import { PoliceCheckpoints } from "./PoliceCheckpoint";
import { PolicePanel } from "./PolicePanel";
import { Phone } from "./Phone";
import { RemotePlayer } from "./RemotePlayer";
import { ScareOverlay } from "./ScareOverlay";
import { SayBar, type Line } from "./SayBar";
import { ShopPanel } from "./ShopPanel";
import { StoryPanel } from "./StoryPanel";
import { StoryQuiz } from "./StoryQuiz";
import { StreetExtras } from "./StreetExtras";
import { TouchControls } from "./TouchControls";
import { VenueScene } from "./VenueScene";
import { WardrobePanel } from "./WardrobePanel";
import { ARENA, arenaCollider, ringside } from "./arenaLayout";
import { DISTRICT_AT } from "./cityLayout";
import { CLUB, clubCollider, clubFloorAt } from "./clubLayout";
import { ClubMusic } from "./clubMusic";
import { buildCollider } from "./collision";
import { loadDistrict, type DistrictData, type Door } from "./districtData";
import { cameraView, playerFocus } from "./focus";
import { buildWalkways, walkwayHeight, withFootbridges } from "./footbridge";
import { doorSpot, homeCollider, type FloorChange } from "./homeLayout";
import { CAMERA_FOV, creatorInput, faceNorth } from "./input";
import { holdAt, type Near } from "./nearby";
import { createCrowd, holder, sendAway, shakeOff, type Seller } from "./npcs";
import { HauntSound } from "./hauntSound";
import { createStreetLife, trafficCollider } from "./streetLife";
import type { RosterEntry, WorldEvent } from "./types";
import { useFightClub } from "./useFightClub";
import { useHomeLife } from "./useHomeLife";
import { useWorldSocket } from "./useWorldSocket";
import {
  VENUES,
  isVenue,
  venueCollider,
  type Scare,
  type Special,
} from "./venues";
import { Voice, type VoiceState } from "./voice";

// Where everyone starts. The bus takes players to the other districts.
const FIRST_DISTRICT = "uniben";

/** A stall the player is looking at. `fromTout` means a tout dragged them to it. */
type OpenShop = { shopId: string; seller: string; fromTout: boolean };

/** Where the player is. In a house, only one floor is shown at a time. */
type Scene =
  | { kind: "street" }
  | { kind: "home"; floor: number }
  | { kind: "arena"; name: string }
  | { kind: "club" }
  | { kind: "venue"; id: string };

// A student whose room is in the hostel goes home through its door. Anyone else, from anywhere.
const HOSTEL_ROOMS = ["hostel4", "hostel2"];

/** Where the player's body should appear. A new `key` puts them there afresh. */
type Spawn = { x: number; z: number; key: number };

/** A ride in progress: where from, where to, what it is, what was paid and how long it takes to watch. */
type Ride = {
  from: string;
  to: string;
  fare: number;
  mode: RideKind;
  seconds: number;
};

/** A place the player picked on the map and is walking to: the guide points at it. */
type Heading = { name: string; district: string; x: number; z: number };

// A phone draws a smaller crowd than a laptop, so it stays smooth.
const SMALL_SCREEN = { walkers: 150, vehicles: 40 };

const SPOT_REACH = 2.6; // metres from something on the street at which it can be used: the same as a door
const BUBBLE_SECONDS = 5; // how long what somebody said stays over their head
const LINE_SECONDS = 14; // ... and in the list at the side
const NOTICE_SECONDS = 6;
const PHOTO_SECONDS = 8;
const VOICE_EVERY = 500; // milliseconds between looks at who is near enough to talk to
const SAY_EVERY = 0.65; // seconds between two things said out loud: a little more than the server asks
const ARRIVED = 6; // metres from a place at which the guide says "you are here" and goes away

// Inside a room the floor is flat.
const flatFloor = () => 0;

// Where nothing is shared, nothing is sent to the server and nothing comes back.
const sendNothing = () => {};
const noServerPosition = () => null;

// The fight club is the same room for everyone, so these are worked out once.
const GYM_COLLIDER = arenaCollider();
const RINGSIDE = ringside();

/** Something on the street that is used where it stands (a buka, a shuttle stop), as a thing the player can stand at. */
function streetThing(door: Door): Near {
  const id = door.id.slice("spot:".length);
  let verb = "Go into",
    name = door.text;
  if (id.startsWith("stop_")) [verb, name] = ["Take", "the shuttle"];
  else if (id.startsWith("keke_")) [verb, name] = ["Take", "a keke"];
  else if (id === "park" || id === "track") verb = "Stop at";
  return {
    key: door.id,
    target: { spot: id },
    name,
    verb,
    x: door.x,
    z: door.z,
    halfX: 0,
    halfZ: 0,
    reach: SPOT_REACH,
  };
}

export function Game({
  player,
  onSignOut,
}: {
  player: Player;
  onSignOut?: () => void;
}) {
  // Everything that asks "where is the player?" before their body has been drawn (a
  // refresh in the middle of something, say) must get where they really are, not (0, 0).
  useState(() => {
    playerFocus.x = player.pos_x;
    playerFocus.z = player.pos_z;
    return null;
  });

  // ---- voice, which the live connection feeds and is fed by ---------------------------
  const signalOut = useRef<(to: string, data: Record<string, unknown>) => void>(
    () => {}
  );
  const voice = useMemo(
    () => new Voice(player.id, (to, data) => signalOut.current(to, data)),
    [player.id]
  );
  const [voiceState, setVoiceState] = useState<VoiceState>("off");
  const [voiceWith, setVoiceWith] = useState(0);
  const [talking, setTalking] = useState<ReadonlySet<string>>(new Set());

  // ---- what people say ------------------------------------------------------------------
  const [lines, setLines] = useState<Line[]>([]);
  const [said, setSaid] = useState<Record<string, string>>({});
  const lineKey = useRef(0);
  const timers = useRef<Set<number>>(new Set());
  const later = useCallback((work: () => void, seconds: number) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      work();
    }, seconds * 1000);
    timers.current.add(timer);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  /** Show something that was said: over the speaker's head for a few seconds, and in the list a little longer. */
  const hear = useCallback(
    (id: string, name: string, text: string, mine: boolean) => {
      const key = ++lineKey.current;
      setLines((current) => [...current.slice(-3), { key, name, text, mine }]);
      setSaid((current) => ({ ...current, [id]: text }));
      later(
        () =>
          setSaid((current) =>
            current[id] === text ? { ...current, [id]: "" } : current
          ),
        BUBBLE_SECONDS
      );
      later(
        () => setLines((current) => current.filter((line) => line.key !== key)),
        LINE_SECONDS
      );
    },
    [later]
  );

  const [notice, setNotice] = useState("");
  const noticeKey = useRef(0);
  /** A line across the top that takes itself away. */
  const flash = useCallback(
    (text: string) => {
      const key = ++noticeKey.current;
      setNotice(text);
      later(() => noticeKey.current === key && setNotice(""), NOTICE_SECONDS);
    },
    [later]
  );
  const [toast, setToast] = useState("");
  const toastKey = useRef(0);
  /** The same, but louder: for things everybody should notice. */
  const shout = useCallback(
    (text: string) => {
      const key = ++toastKey.current;
      setToast(text);
      later(() => toastKey.current === key && setToast(""), NOTICE_SECONDS);
    },
    [later]
  );

  // ---- the phone ----------------------------------------------------------------------------
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [arrivals, setArrivals] = useState(0);
  const [club, setClub] = useState<Club | null>(null);

  // ---- the crew: friends moving about together ---------------------------------------------
  const [crew, setCrew] = useState<Crew | null>(null);
  const [crewBusy, setCrewBusy] = useState(false);
  const refreshCrew = useCallback(() => {
    fetchCrew(player.id)
      .then(setCrew)
      .catch(() => {}); // the bar is a reminder: it stays as it was until the next news
  }, [player.id]);
  useEffect(refreshCrew, [refreshCrew]);
  // A friend took a ride and this player rode along: set by the ride code further down.
  const rideAlong = useRef<(trip: Going, by: string) => void>(() => {});

  const onEvent = useCallback(
    (event: WorldEvent) => {
      if (event.type === "say") {
        hear(event.id, event.name, event.text, false);
      } else if (event.type === "rtc") {
        void voice.signal(event.from, event.data);
      } else if (event.type === "dm") {
        setUnread((count) => count + 1);
        setArrivals((count) => count + 1);
        if (event.kind === "money") {
          flash(
            `@${event.name} sent you ₦${(event.amount ?? 0).toLocaleString()}.${
              event.text ? ` "${event.text}"` : ""
            }`
          );
          // The bank is asked what the balance is now, so it is never counted twice.
          fetchWallet(player.id, 1)
            .then((wallet) => setMoney(wallet.money))
            .catch(() => {});
        } else {
          flash(
            `Message from @${event.name}: ${
              event.text.length > 70
                ? `${event.text.slice(0, 70)}…`
                : event.text
            }`
          );
        }
      } else if (event.type === "event" && event.kind === "vip") {
        shout(`@${event.name} brought you into their VIP booth!`);
        fetchClub(player.id)
          .then(setClub)
          .catch(() => {});
      } else if (event.type === "event" && event.kind === "saved") {
        setArrivals((count) => count + 1);
        flash(
          `@${event.name} saved your number. Save theirs in your phone and you are friends.`
        );
      } else if (event.type === "crew") {
        refreshCrew();
        setArrivals((count) => count + 1);
        if (event.kind === "invite") return; // the invite card itself says so
        if (event.kind === "joined")
          shout(`@${event.name} is rolling with you now!`);
        else if (event.kind === "left") flash(`@${event.name} left the crew.`);
        else if (event.kind === "declined")
          flash(`@${event.name} said not now.`);
        else if (event.kind === "behind")
          flash(
            `@${event.name} took a ride, but you stayed behind: ${
              event.text ?? ""
            }`
          );
        else if (event.kind === "ride" && event.trip)
          rideAlong.current(event.trip, event.name);
      }
    },
    [flash, hear, player.id, refreshCrew, shout, voice]
  );

  const {
    playersRef,
    remotes,
    parked,
    connected,
    sendMove,
    sendPlace,
    takeServerPosition,
    say,
    signal,
  } = useWorldSocket(player.id, onEvent);
  useEffect(() => {
    signalOut.current = signal;
  }, [signal]);

  const [options, setOptions] = useState<LookOptions | null>(null);
  const [look, setLook] = useState<Look | null>(null); // what is saved on the server
  const [draft, setDraft] = useState<Look | null>(null); // what the creator is previewing
  const [lookLoaded, setLookLoaded] = useState(false);
  const [firstTime, setFirstTime] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [district, setDistrict] = useState<DistrictData | null>(null);
  const [mapError, setMapError] = useState("");

  const [money, setMoney] = useState(player.money);
  const [story, setStory] = useState<StoryState | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [scene, setScene] = useState<Scene>({ kind: "street" });
  const [spawn, setSpawn] = useState<Spawn>({
    x: player.pos_x,
    z: player.pos_z,
    key: 0,
  });
  const [busy, setBusy] = useState(false);
  const streetSpot = useRef({ x: player.pos_x, z: player.pos_z }); // where to come back out to

  const [held, setHeld] = useState(0); // touts holding the player
  const [nearSeller, setNearSeller] = useState<Seller | null>(null);
  const [shop, setShop] = useState<OpenShop | null>(null);
  const [ride, setRide] = useState<Ride | null>(null);
  const nextDistrict = useRef<string | null>(null); // the district a ride is going to, if it is another one
  const arrival = useRef({ x: 0, z: 0 }); // where the ride puts them down
  const rideNews = useRef<string[]>([]); // things that came due on the way

  // The city map.
  const [mapOpen, setMapOpen] = useState(false);
  const [mapHere, setMapHere] = useState({
    district: FIRST_DISTRICT,
    x: 0,
    z: 0,
  });
  const [city, setCity] = useState<City | null>(null);
  const [cityError, setCityError] = useState("");
  const [allDistricts, setAllDistricts] = useState<DistrictData[]>([]);
  const [pickedPlace, setPickedPlace] = useState<string | null>(null);
  const [going, setGoing] = useState("");
  const [goProblem, setGoProblem] = useState("");
  const [heading, setHeading] = useState<Heading | null>(null);
  const [headingMetres, setHeadingMetres] = useState<number | null>(null);
  const [nearDoor, setNearDoor] = useState<Door | null>(null); // a door or a spot the player is standing at

  // Building and arranging the house, as in The Sims.
  const [decorating, setDecorating] = useState(false);
  const [buildView, setBuildView] = useState<BuildView>(EMPTY_VIEW);
  // Goes up when a room being built is finished, so its walls and doorways are walked into at once.
  const [roomsDone, setRoomsDone] = useState(0);

  // The club.
  const [clubMenu, setClubMenu] = useState(false);
  const [clubBusy, setClubBusy] = useState(false);
  const [clubError, setClubError] = useState("");
  const [musicOn, setMusicOn] = useState(false);
  const [photo, setPhoto] = useState(false);
  const music = useMemo(() => new ClubMusic(), []);

  // The rooms of the city (venues.ts): what the player stands at that opens a panel, the
  // panels themselves, the haunted house's scares, and a police stop on the road.
  const [special, setSpecial] = useState<Special | null>(null);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [storyOpen2, setStoryOpen2] = useState<Special | null>(null);
  const [scare, setScare] = useState<{ scare: Scare; key: number } | null>(
    null
  );
  const [policeStop, setPoliceStop] = useState<PoliceStop | null>(null);
  // Cars: what the player owns, the keys, the dealership's sheet, and the trip at the wheel.
  const [cars, setCars] = useState<Cars | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [dealerCar, setDealerCar] = useState<string | null>(null);
  const [showColours, setShowColours] = useState<Record<string, string>>({});
  const [driving, setDriving] = useState<Driving | null>(null);
  const [carBusy, setCarBusy] = useState(false);
  const [nearCar, setNearCar] = useState(false);
  const tripCount = useRef(0);
  const stopping = useRef(false);
  const haunt = useMemo(() => new HauntSound(), []);

  const customising = draft !== null;
  const indoors = scene.kind !== "street";
  /** Places where players see and hear each other: the street and the club. A house and the gym are private. */
  const shared =
    scene.kind === "street" || scene.kind === "club" || scene.kind === "venue";
  const venue = scene.kind === "venue" ? VENUES[scene.id] : null;
  const storyOpen = story !== null && !story.done && lookLoaded && !customising;
  const student = story?.result?.path === "student";
  const inHostel = student && HOSTEL_ROOMS.includes(story?.result?.home ?? "");

  // Walls, trees and the district edge, worked out once per map.
  const streetCollider = useMemo(
    () => (district ? buildCollider(district) : null),
    [district]
  );
  // Indoors: the walls, the stairs and the furniture on the floor being shown.
  const homeFloor = scene.kind === "home" ? scene.floor : 0;
  // At home the best cars get the car park's spaces.
  const homeCars = useMemo(
    () => [...(cars?.cars ?? [])].sort((a, b) => b.paid - a.paid).map(carLook),
    [cars]
  );
  const indoorCollider = useMemo(
    () => {
      if (!home) return null;
      const base = homeCollider(
        home.plan,
        homeFloor,
        home.items,
        home.catalogue,
        home.rooms,
        serverNow()
      );
      if (homeFloor !== 0 || !home.plan.buildable || homeCars.length === 0)
        return base;
      // The cars in the car park are walked round.
      const boxes = carParkSpots(
        home.plan.lot,
        home.plan.cell,
        homeCars.length,
        home.rooms
      ).map((spot, i) => {
        const shape = carParts(readCarLook(homeCars[i]).model);
        return carBox(spot.x, spot.z, spot.rot, shape.length, shape.width);
      });
      return withCars(base, () => boxes);
    },
    // `roomsDone` brings in a room the workers have just finished.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [home, homeFloor, roomsDone, homeCars]
  );
  // When the room being built will be finished, look again.
  useEffect(() => {
    if (!home) return;
    const waiting = home.rooms
      .filter((room) => !isDone(room))
      .map((room) => room.ready_ms - serverNow());
    if (waiting.length === 0) return;
    const timer = window.setTimeout(
      () => setRoomsDone((value) => value + 1),
      Math.max(500, Math.min(...waiting) + 300)
    );
    return () => window.clearTimeout(timer);
  }, [home, roomsDone]);
  // The club: the rope across the way in to VIP is open to those with a booth. The server
  // says how many seconds a booth has left; here that becomes a moment on the page's own
  // clock, so the countdown and the rope keep time without asking again.
  const [vipUntil, setVipUntil] = useState(0);
  const vipSeconds = club?.vip_seconds ?? 0;
  useEffect(() => {
    setVipUntil(vipSeconds > 0 ? performance.now() + vipSeconds * 1000 : 0);
    if (vipSeconds <= 0) return;
    const timer = window.setTimeout(() => setVipUntil(0), vipSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [club, vipSeconds]);
  const inVip = vipUntil > 0;
  const danceCollider = useMemo(() => clubCollider(inVip), [inVip]);
  const roomCollider = useMemo(
    () => (venue ? venueCollider(venue) : null),
    [venue]
  );

  // The sellers and touts of this district. Street sense decides how hard they press.
  const streetSense = story?.result?.street ?? 1;
  const crowd = useMemo(
    () => (district ? createCrowd(district, streetSense) : null),
    [district, streetSense]
  );

  // The walking crowd and the traffic. The player cannot walk through a moving bus,
  // so the vehicles are added to what the player bumps into.
  const touchScreen = useMemo(
    () => window.matchMedia("(pointer: coarse)").matches,
    []
  );
  const life = useMemo(
    () =>
      district
        ? createStreetLife(district, touchScreen ? SMALL_SCREEN : {})
        : null,
    [district, touchScreen]
  );
  // On top of both goes the footbridge: once up on it, nothing on the street can touch the player.
  // The cars standing on the street are solid too. Read through a ref, so cars coming and
  // going do not rebuild the collider.
  const parkedRef = useRef(parked);
  parkedRef.current = parked;
  const parkedBoxes = useCallback(
    (): Box[] =>
      parkedRef.current.map((car) => {
        const shape = carParts(readCarLook(car.look).model);
        return carBox(car.x, car.z, car.rot, shape.length, shape.width);
      }),
    []
  );
  // What a car being driven bumps into besides the street: the parked cars and the traffic.
  const roadBoxes = useCallback((): Box[] => {
    const boxes = parkedBoxes();
    for (const vehicle of life?.vehicles ?? [])
      if (vehicle.active) boxes.push(vehicle);
    return boxes;
  }, [life, parkedBoxes]);
  const outdoorCollider = useMemo(() => {
    if (!district || !streetCollider) return null;
    return withFootbridges(
      withCars(
        life ? trafficCollider(streetCollider, life) : streetCollider,
        parkedBoxes
      ),
      district
    );
  }, [district, streetCollider, life, parkedBoxes]);
  const collider =
    scene.kind === "arena"
      ? GYM_COLLIDER
      : scene.kind === "club"
      ? danceCollider
      : scene.kind === "venue"
      ? roomCollider
      : scene.kind === "home"
      ? indoorCollider
      : outdoorCollider;

  // Other players are drawn up on a footbridge, or on the club's platform, when they are standing where one is.
  const walkways = useMemo(
    () => (district ? buildWalkways(district) : []),
    [district]
  );
  const streetHeight = useCallback(
    (x: number, z: number) => walkwayHeight(walkways, x, z) ?? 0,
    [walkways]
  );
  const heightAt =
    scene.kind === "club"
      ? clubFloorAt
      : scene.kind === "venue"
      ? flatFloor
      : streetHeight;

  useEffect(() => {
    let cancelled = false;

    loadDistrict(FIRST_DISTRICT)
      .then((loaded) => {
        if (!cancelled) setDistrict(loaded);
      })
      .catch((error: unknown) => {
        console.error("Could not load the map:", error);
        if (!cancelled)
          setMapError(
            error instanceof Error ? error.message : "The map did not load."
          );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchLookOptions(), fetchLookState(player.id)])
      .then(([loadedOptions, state]) => {
        if (cancelled) return;
        setOptions(loadedOptions);
        setLook(state.look);
        if (!state.customised) {
          creatorInput.spin = 0;
          setFirstTime(true);
          setDraft(state.look);
        }
      })
      .catch((error: unknown) => {
        // The game still works without customisation, so carry on with the plain model.
        console.error("Could not load the character options:", error);
      })
      .finally(() => {
        if (!cancelled) setLookLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [player.id]);

  // The player's story: told once, it decides their money and where they live.
  useEffect(() => {
    let cancelled = false;

    fetchStory(player.id)
      .then((state) => {
        if (cancelled) return;
        setStory(state);
        setMoney(state.money);
      })
      .catch((error: unknown) => {
        // Walking the city still works without it.
        console.error("Could not load the story:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [player.id]);

  const openCreator = () => {
    if (!look) return;
    creatorInput.spin = 0;
    setSaveError("");
    setDraft(look);
  };

  const closeCreator = () => {
    setDraft(null);
    setFirstTime(false);
    setSaveError("");
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError("");
    try {
      setLook(await saveLook(player.id, draft));
      closeCreator();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save your look."
      );
    } finally {
      setSaving(false);
    }
  };

  /** Put the player's body somewhere new, and tell everything that follows the player. */
  const appearAt = useCallback((x: number, z: number) => {
    playerFocus.x = x;
    playerFocus.z = z;
    setSpawn((current) => ({ x, z, key: current.key + 1 }));
  }, []);

  // The fight club: its state, and the order things happen in a fight.
  const placeInGym = useCallback(
    (spot: { x: number; z: number }) => appearAt(spot.x, spot.z),
    [appearAt]
  );
  const arena = useFightClub(player.id, {
    onMoney: setMoney,
    onPlace: placeInGym,
    ringside: RINGSIDE,
  });

  // The player's needs and clock, and whatever they are doing: at home, in the club, out in the city.
  const homeLife = useHomeLife(player.id, {
    onMoney: setMoney,
    onNews: (news) => flash(news.join(" ")),
    onMoved: (spot) => {
      // A shuttle or a keke put them down further along the street. (Rides start and end
      // on the street of one district, so that is where they are whatever else was on screen.)
      streetSpot.current = { x: spot.x, z: spot.z };
      setScene({ kind: "street" });
      appearAt(spot.x, spot.z);
    },
    onDone: (finished) => {
      if (finished.collapsed)
        shout(`${player.username} collapsed from exhaustion!`);
      // Renting a room changes where home is: ask the story again, it knows.
      if (finished.lines.some((line) => line.startsWith("You moved into")))
        fetchStory(player.id)
          .then(setStory)
          .catch(() => {});
    },
  });
  const loadLife = homeLife.load;
  useEffect(() => {
    void loadLife();
  }, [loadLife]);

  // Out on the street, the thing a player can use is whatever spot they are standing at.
  const setNearThing = homeLife.setNear;
  const spotHere = useMemo(
    () =>
      nearDoor && nearDoor.id.startsWith("spot:")
        ? streetThing(nearDoor)
        : null,
    [nearDoor]
  );
  useEffect(() => {
    if (scene.kind === "street") setNearThing(spotHere);
  }, [scene.kind, setNearThing, spotHere]);

  /** Into the player's own house or room. `door` is where they will come back out, if it is through a door on the street. */
  const goHome = async (door?: { x: number; z: number }) => {
    if (busy || homeLife.hold !== null) return; // not in the middle of something, and not while passed out
    setBusy(true);
    setNotice("");
    try {
      // Fetched on every visit, so the house is always as the server has it.
      const loaded = await fetchHome(player.id);
      streetSpot.current = door
        ? { x: door.x, z: door.z }
        : { x: playerFocus.x, z: playerFocus.z };
      const inside = doorSpot(loaded.plan);
      homeLife.leave(); // whatever they were standing at outside is not in here
      syncClock(loaded.now_ms);
      if (loaded.note) flash(loaded.note);
      setHome(loaded);
      setMoney(loaded.money);
      setScene({ kind: "home", floor: 0 });
      void loadCars(); // for the car park
      appearAt(inside.x, inside.z);
      sendPlace("home");
      void loadLife(); // needs may have moved on while they were out
    } catch (error) {
      flash(
        error instanceof Error ? error.message : "Could not open your house."
      );
    } finally {
      setBusy(false);
    }
  };

  const finishStory = (result: StoryResult) => {
    setMoney(result.cash);
    setStory({
      done: true,
      questions: [],
      student_questions: [],
      result,
      money: result.cash,
    });
    // A student's life starts in their room. The server has already put them at the hostel door.
    if (
      result.path === "student" &&
      result.door_x !== null &&
      result.door_z !== null
    ) {
      void goHome({ x: result.door_x, z: result.door_z });
    }
  };

  /** Through a door on the street: the fight club, the nightclub, or a student's hostel. */
  const goThrough = async (door: Door) => {
    if (busy || homeLife.hold !== null) return;
    if (door.id === "hostel") {
      if (inHostel) void goHome(door);
      else
        flash(
          student
            ? "You moved out of the hostel. Press Home to go to your room."
            : "Only the students who stay here can go in."
        );
      return;
    }
    if (isVenue(door.id)) {
      enterVenue(door);
      return;
    }
    if (door.id !== "arena" && door.id !== "club") {
      // A door this copy of the game does not know: the map is newer than the page.
      flash(`${door.text} is new. Refresh the page to go in.`);
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      if (door.id === "arena") {
        if (await arena.enter()) {
          streetSpot.current = { x: door.x, z: door.z };
          homeLife.leave();
          setScene({ kind: "arena", name: door.text });
          appearAt(ARENA.door.x, ARENA.door.z);
          sendPlace("private"); // a gym each to themselves: out of sight of the street
        } else {
          flash(`${door.text} is closed just now. Try again.`);
        }
        return;
      }
      // The club is one room for everybody. The server lets in only someone standing at its door.
      const entered = await enterClub(player.id);
      setClub(entered);
      streetSpot.current = { x: door.x, z: door.z };
      homeLife.leave();
      setScene({ kind: "club" });
      appearAt(CLUB.door.x, CLUB.door.z);
      sendPlace("venue:club");
      music.start(); // they pressed a button to come in, so the browser allows sound
      setMusicOn(true);
      void loadLife();
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : `${door.text} is closed just now. Try again.`
      );
    } finally {
      setBusy(false);
    }
  };

  /** Into one of the rooms in venues.ts. The server lets in only someone standing at the door. */
  const enterVenue = (door: Door) => {
    const layout = VENUES[door.id];
    streetSpot.current = { x: door.x, z: door.z };
    homeLife.leave();
    setScene({ kind: "venue", id: layout.id });
    appearAt(layout.entry.x, layout.entry.z);
    sendPlace(`venue:${layout.id}`);
    // They pressed a button to come in, so the browser allows sound. A club always has
    // music; anywhere else plays public/audio/<id>.mp3 if there is one (see clubMusic.ts).
    music.start(`/audio/${layout.id}.mp3`, !!layout.music);
    setMusicOn(!!layout.music);
    if (layout.kind === "haunted") {
      haunt.start();
      flash(
        "The Old Residency. Nobody has lived here since 1960. Find the way out at the back."
      );
    }
    void loadLife();
  };

  const goOutside = () => {
    if (scene.kind === "arena") arena.leave();
    if (scene.kind === "club" || scene.kind === "venue") {
      music.stop();
      setMusicOn(false);
      setClubMenu(false);
    }
    if (scene.kind === "venue") {
      haunt.stop();
      setSpecial(null);
      setWardrobeOpen(false);
      setStoryOpen2(null);
      setDealerCar(null);
    }
    homeLife.leave();
    setDecorating(false);
    setBuildView(EMPTY_VIEW);
    setScene({ kind: "street" });
    appearAt(streetSpot.current.x, streetSpot.current.z);
    sendPlace("street");
  };
  useEffect(() => () => music.stop(), [music]);
  useEffect(() => () => haunt.stop(), [haunt]);

  // ---- cars ------------------------------------------------------------------------------------
  const myParked = parked.find((car) => car.id === player.id) ?? null;
  const drivingCar = useRef<number | null>(null);

  const loadCars = useCallback(async (): Promise<Cars | null> => {
    try {
      const loaded = await fetchCars(player.id);
      setCars(loaded);
      setMoney(loaded.money);
      return loaded;
    } catch {
      return null;
    }
  }, [player.id]);

  // Standing by their own car: the "Get in" button shows.
  useEffect(() => {
    if (!myParked || driving || scene.kind !== "street") {
      setNearCar(false);
      return;
    }
    // Within reach of its doors: its own half-length and a step or two. (The server allows 6 m.)
    const check = () =>
      setNearCar(
        Math.hypot(playerFocus.x - myParked.x, playerFocus.z - myParked.z) < 5
      );
    check();
    const timer = window.setInterval(check, 250);
    return () => window.clearInterval(timer);
  }, [myParked, driving, scene.kind]);

  /**
   * Somewhere beside the player with room for the car, pointing where it can drive off: the
   * way the camera looks if the road is open that way, otherwise across it or back.
   */
  const spotForCar = (model: string): { x: number; z: number; rot: number } => {
    const shape = carParts(model);
    const yaw = cameraView.yaw;
    const fx = -Math.sin(yaw),
      fz = -Math.cos(yaw); // the way the camera looks
    const rx = -fz,
      rz = fx; // and to the right of that
    const px = playerFocus.x,
      pz = playerFocus.z;
    const r = shape.width / 2,
      half = shape.wheelbase / 2;
    const probe = { x: 0, z: 0 };
    const others = roadBoxes();
    // Can a car-wide circle get from (ax, az) to (bx, bz) without meeting anything?
    const open = (ax: number, az: number, bx: number, bz: number) => {
      streetCollider?.resolve(ax, az, bx, bz, probe, r);
      return (
        Math.hypot(probe.x - bx, probe.z - bz) < 0.05 &&
        !others.some((box) => touchesBox(box, bx, bz, r))
      );
    };
    const forward = Math.atan2(fx, fz);
    let fallback: { x: number; z: number; rot: number } | null = null;
    for (const [side, ahead] of [
      [3.4, 1.5],
      [-3.4, 1.5],
      [3.4, -2.5],
      [-3.4, -2.5],
      [0, 6.5],
      [0, -6.5],
      [5.8, 3],
      [-5.8, 3],
    ]) {
      const x = px + rx * side + fx * ahead,
        z = pz + rz * side + fz * ahead;
      for (const heading of [
        forward,
        forward + Math.PI / 2,
        forward - Math.PI / 2,
        forward + Math.PI,
      ]) {
        const hx = Math.sin(heading),
          hz = Math.cos(heading);
        const front = { x: x + hx * half, z: z + hz * half },
          back = { x: x - hx * half, z: z - hz * half };
        // Room for the car: it could be slid there from where the player stands.
        if (!open(px, pz, front.x, front.z) || !open(px, pz, back.x, back.z))
          break;
        fallback ??= { x, z, rot: heading };
        // And a clear run of a few car lengths in front of it.
        if (open(front.x, front.z, front.x + hx * 8, front.z + hz * 8))
          return { x, z, rot: heading };
      }
    }
    return fallback ?? { x: px + rx * 3.4, z: pz + rz * 3.4, rot: forward };
  };

  const bring = async (car: OwnedCar) => {
    if (carBusy) return;
    setCarBusy(true);
    try {
      const spot = spotForCar(car.model);
      setCars(await bringCar(player.id, car.id, spot.x, spot.z, spot.rot));
      setKeysOpen(false);
      shout("Your driver has brought the car. Walk up to it and get in.");
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "The driver could not bring it."
      );
    } finally {
      setCarBusy(false);
    }
  };

  const sendHome = async () => {
    if (carBusy) return;
    setCarBusy(true);
    try {
      setCars(await sendCarHome(player.id));
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "The driver could not take it home."
      );
    } finally {
      setCarBusy(false);
    }
  };

  const getInCar = async () => {
    if (carBusy || !myParked || !streetCollider) return;
    setCarBusy(true);
    try {
      // Which car is standing there: the server says, in what it knows of the player's cars.
      const known = (cars?.parked ? cars : null) ?? (await loadCars());
      const carId = known?.parked?.car_id;
      if (!carId)
        throw new Error("That car is not here. Ask your driver to bring it.");
      const done = await getIn(player.id, carId);
      const car = done.cars.find((entry) => entry.id === carId);
      if (!car) throw new Error("That car is not yours.");
      const model = done.catalogue.find((entry) => entry.id === car.model);
      const shape = carParts(car.model);
      setCars(done);
      drivingCar.current = car.id;
      setDriving({
        key: ++tripCount.current,
        look: carLook(car),
        stats: statsFor(model?.zero_to_100 ?? 9, model?.top_kmh ?? 180, shape),
        x: myParked.x,
        z: myParked.z,
        heading: myParked.rot,
        ground: streetCollider,
        boxes: roadBoxes,
      });
      setNearCar(false);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not get in.");
    } finally {
      setCarBusy(false);
    }
  };

  const getOutOfCar = async () => {
    if (!driving) return;
    // Out at once on the screen; the server leaves the car where it is.
    setDriving(null);
    drivingCar.current = null;
    try {
      setCars(await getOut(player.id));
    } catch {
      // The server parks the car anyway the next time the player goes anywhere.
    }
  };

  // A dropped connection while driving: the server left the car where it stopped. Get back in.
  const wasConnected = useRef(connected);
  useEffect(() => {
    const back = connected && !wasConnected.current;
    wasConnected.current = connected;
    const carId = drivingCar.current;
    if (!back || !driving || carId === null) return;
    getIn(player.id, carId).catch(() => {
      setDriving(null);
      drivingCar.current = null;
    });
  }, [connected, driving, player.id]);

  /** Something in the haunted house: the picture on the screen and its sound. */
  const frighten = useCallback(
    (what: Scare) => {
      setScare({ scare: what, key: performance.now() });
      if (what.kind === "face" || what.kind === "hands") haunt.scream();
      else if (what.kind === "slam") haunt.slam();
      else if (what.kind === "lights") haunt.whisper();
      else {
        haunt.whisper();
        haunt.scream();
      }
    },
    [haunt]
  );

  /** Walking past a checkpoint: the officers call the player over, if the server agrees they are there. */
  const calledOver = useCallback(
    (checkpoint: string) => {
      if (stopping.current) return;
      stopping.current = true;
      getStopped(player.id, checkpoint)
        .then(setPoliceStop)
        .catch(() => {}) // too far, or waved through: nothing happens
        .finally(() => {
          stopping.current = false;
        });
    },
    [player.id]
  );

  const takeStairs = (change: FloorChange) => {
    setScene({ kind: "home", floor: change.floor });
    appearAt(change.x, change.z);
  };

  // ---- the city map, and getting about ---------------------------------------------------------
  const loadCity = useCallback(() => {
    setCityError("");
    fetchCity(player.id)
      .then((loaded) => {
        setCity(loaded);
        setMoney(loaded.money);
      })
      .catch((error: unknown) =>
        setCityError(
          error instanceof Error ? error.message : "The map did not open."
        )
      );
  }, [player.id]);

  const openMap = () => {
    if (!district || scene.kind !== "street") {
      flash("Go outside first: the map is for when you are on the street.");
      return;
    }
    if (busy || homeLife.hold !== null) {
      flash("Finish what you are doing first.");
      return;
    }
    setShop(null);
    setPhoneOpen(false);
    setPickedPlace(null);
    setGoProblem("");
    setCity(null);
    setMapHere({ district: district.id, x: playerFocus.x, z: playerFocus.z });
    setMapOpen(true);
    loadCity();
    // The map draws a small model of every district. Each one appears when its file arrives.
    for (const id of Object.keys(DISTRICT_AT)) {
      loadDistrict(id)
        .then((loaded) =>
          setAllDistricts((current) =>
            current.some((known) => known.id === loaded.id)
              ? current
              : [...current, loaded]
          )
        )
        .catch(() => {}); // a district that will not download is simply not drawn
    }
  };

  const closeMap = () => {
    setMapOpen(false);
    setPickedPlace(null);
    appearAt(playerFocus.x, playerFocus.z); // their body is drawn again where it was standing
  };

  /** The ride is over: step out where it stopped, in a new district if it crossed town. */
  const arrive = async () => {
    const spot = arrival.current;
    const next = nextDistrict.current;
    try {
      // The new district has been downloading during the ride. If that failed, it is asked for once more.
      const loaded = next
        ? await loadDistrict(next).catch(() => loadDistrict(next))
        : null;
      setHeld(0);
      setNearSeller(null);
      setNearDoor(null);
      if (loaded) setDistrict(loaded);
      streetSpot.current = { x: spot.x, z: spot.z };
      appearAt(spot.x, spot.z);
      if (rideNews.current.length > 0) flash(rideNews.current.join(" "));
      void loadLife(); // the ride took time off their day
    } catch (error) {
      setMapError(
        error instanceof Error ? error.message : "The map did not load."
      );
    } finally {
      nextDistrict.current = null;
      rideNews.current = [];
      setRide(null);
    }
  };

  /** A ride was paid for and the server has put the player down at the other end: show the ride. */
  const startRide = (trip: Going) => {
    if (!district) return;
    homeLife.leave();
    setMoney(trip.money);
    arrival.current = { x: trip.x, z: trip.z };
    rideNews.current = trip.news;
    nextDistrict.current = trip.district === district.id ? null : trip.district;
    if (nextDistrict.current)
      loadDistrict(nextDistrict.current).catch(() => {}); // starts the download now; a failure is dealt with on arriving
    // A bus only goes as far as the bus stop: the guide shows the way from there.
    setHeading(
      trip.walk > ARRIVED
        ? {
            name: trip.name,
            district: trip.district,
            x: trip.to_x,
            z: trip.to_z,
          }
        : null
    );
    setHeadingMetres(trip.walk > ARRIVED ? trip.walk : null);
    setMapOpen(false);
    setPickedPlace(null);
    const mode: RideKind =
      trip.mode === "keke" || trip.mode === "bike" || trip.mode === "cab"
        ? trip.mode
        : "bus";
    setRide({
      from: district.name,
      to: mode === "bus" ? trip.district_name : trip.name,
      fare: trip.fare,
      mode,
      seconds: trip.seconds,
    });
  };
  // A friend in the crew took a ride: this player was on the same street and went too.
  rideAlong.current = (trip, by) => {
    setPhoneOpen(false);
    shout(`You rode with @${by} to ${trip.name}.`);
    startRide(trip);
  };

  /** Saying yes to a friend's invite: the server puts the player beside them. */
  const joinCrew = async (fromId: string) => {
    if (crewBusy || !district) return;
    setCrewBusy(true);
    try {
      if (scene.kind !== "street") goOutside();
      const joined = await acceptCrew(player.id, fromId);
      setCrew(joined.crew);
      if (joined.moved) {
        homeLife.leave();
        setPhoneOpen(false);
        setMapOpen(false);
        arrival.current = { x: joined.x, z: joined.z };
        nextDistrict.current =
          joined.district === district.id ? null : joined.district;
        setHeading(null);
        await arrive();
      }
      shout(
        joined.note || "You are rolling together now. Talk: they can hear you."
      );
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not join them.");
      refreshCrew();
    } finally {
      setCrewBusy(false);
    }
  };
  const answerCrew = async (work: () => Promise<Crew>) => {
    if (crewBusy) return;
    setCrewBusy(true);
    try {
      setCrew(await work());
    } catch (error) {
      flash(error instanceof Error ? error.message : "Try again.");
    } finally {
      setCrewBusy(false);
    }
  };

  /** A way of getting to a place was chosen on the map. */
  const go = async (place: CityPlace, option: RideOption) => {
    if (going || !district) return;
    if (option.mode === "trek") {
      // Walking costs nothing and the server is not asked: they just walk, and an arrow shows the way.
      setHeading({
        name: place.name,
        district: place.district,
        x: place.x,
        z: place.z,
      });
      setHeadingMetres(place.metres);
      closeMap();
      flash(`Follow the arrow to ${place.name}.`);
      return;
    }
    setGoing(option.mode);
    setGoProblem("");
    try {
      // The fare is paid and the server has put the player down at the other end.
      const trip = await goTo(player.id, place.id, option.mode);
      startRide(trip);
      if (trip.crew && trip.crew.length > 0)
        flash(
          `${trip.crew.map((name) => `@${name}`).join(", ")} rode with you.`
        );
    } catch (error) {
      // Refused, or the answer was lost on the way back. If it was lost the ride may still
      // have been paid for, so the server is asked where it has the player now.
      try {
        const now = await fetchCity(player.id);
        setCity(now);
        setMoney(now.money);
        const moved =
          now.district !== district.id ||
          Math.hypot(now.x - mapHere.x, now.z - mapHere.z) > 20;
        if (now.on_street && moved) {
          // It was paid for: go where the server says they are, without the picture of the ride.
          homeLife.leave();
          arrival.current = { x: now.x, z: now.z };
          nextDistrict.current =
            now.district === district.id ? null : now.district;
          setHeading(null);
          setMapOpen(false);
          setPickedPlace(null);
          await arrive();
          return;
        }
      } catch {
        // Still no answer from the server: say so below.
      }
      setGoProblem(
        error instanceof Error
          ? error.message
          : "That ride did not leave. Try again."
      );
    } finally {
      setGoing("");
    }
  };

  /** The guide says how far there is still to walk. Close enough, and they have arrived. */
  const walked = (metres: number) => {
    if (metres > ARRIVED) {
      setHeadingMetres(metres);
      return;
    }
    if (heading) flash(`You have reached ${heading.name}.`);
    setHeading(null);
    setHeadingMetres(null);
  };

  const lookAtGoods = () => {
    const tout = crowd ? holder(crowd) : null;
    if (tout)
      setShop({ shopId: tout.shop, seller: "Street seller", fromTout: true });
  };

  const closeShop = () => {
    // Once you have looked at their goods, the ones holding you let go.
    if (shop?.fromTout && crowd) sendAway(crowd);
    setShop(null);
  };

  // ---- arranging the house ------------------------------------------------------------------
  const houseChanged = (change: HomeChange) => {
    syncClock(change.now_ms);
    setHome((current) =>
      current
        ? {
            ...current,
            items: change.items,
            money: change.money,
            rooms: change.rooms ?? current.rooms,
          }
        : current
    );
    setMoney(change.money);
  };
  const stopDecorating = () => {
    setDecorating(false);
    setBuildView(EMPTY_VIEW);
  };
  /** Go up or down a floor while building: the player goes too, to the top or the bottom of the stairs. */
  const buildFloor = (floor: number) => {
    if (!home?.plan.stairs) return;
    const stairs = home.plan.stairs;
    const middle = (stairs.x + stairs.w / 2) * home.plan.cell;
    const z =
      floor > 0
        ? (stairs.z - 1) * home.plan.cell
        : (stairs.z + stairs.d + 1) * home.plan.cell;
    takeStairs({ floor, x: middle, z });
  };

  // ---- the club -----------------------------------------------------------------------------
  /** One request to the club's desk, with the button greyed out meanwhile. */
  const atTheClub = async (work: () => Promise<Club>, fallback: string) => {
    if (clubBusy) return;
    setClubBusy(true);
    setClubError("");
    try {
      const now = await work();
      setClub(now);
      setMoney(now.money);
      homeLife.refreshMenu(); // what the booth offers has just changed
    } catch (error) {
      setClubError(error instanceof Error ? error.message : fallback);
    } finally {
      setClubBusy(false);
    }
  };
  // Opening the booth's list asks the club how things stand: a friend may have brought
  // them in, or their time may have run out, since the page last heard.
  const boothOpen = scene.kind === "club" && homeLife.menu?.spot === "vip";
  useEffect(() => {
    if (!boothOpen) return;
    let cancelled = false;
    fetchClub(player.id)
      .then((now) => !cancelled && setClub(now))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [boothOpen, player.id]);
  const invite = (guest: RosterEntry) =>
    atTheClub(async () => {
      const result = await inviteToBooth(player.id, guest.id);
      flash(`@${result.guest} is in your booth.`);
      return result.club;
    }, "Could not bring them in.");
  const toggleMusic = () => {
    if (musicOn) music.stop();
    else
      music.start(
        scene.kind === "venue" ? `/audio/${scene.id}.mp3` : undefined
      );
    setMusicOn(!musicOn);
  };
  const takePhoto = () => {
    setClubMenu(false);
    setPhoto(true);
    later(() => setPhoto(false), PHOTO_SECONDS);
  };

  // When somebody else in the room passes out, everybody is told.
  const poses = useRef(new Map<string, string>());
  useEffect(() => {
    const before = poses.current;
    const now = new Map<string, string>();
    for (const other of remotes) {
      now.set(other.id, other.pose);
      if (
        other.pose === "out" &&
        before.has(other.id) &&
        before.get(other.id) !== "out"
      ) {
        shout(`${other.username} collapsed from exhaustion!`);
      }
    }
    poses.current = now;
  }, [remotes, shout]);

  // ---- talking ------------------------------------------------------------------------------
  const spoke = useRef(0);
  const speak = (text: string) => {
    // Shown as said only if it will be: the server drops what is said while disconnected,
    // and a second thing said in the same half second.
    if (!connected) {
      flash("You are not connected. Give it a moment and say it again.");
      return;
    }
    if (performance.now() - spoke.current < SAY_EVERY * 1000) return;
    spoke.current = performance.now();
    say(text);
    hear(player.id, player.username, text, true);
  };

  const toggleVoice = async () => {
    const calls = voice;
    if (calls.state === "off") {
      try {
        await calls.turnOn();
        flash("Voice is on. Whoever is standing with you can hear you.");
      } catch {
        flash(
          "The microphone is blocked. Allow it for this page in your browser, then try again."
        );
      }
    } else if (calls.state === "on") {
      calls.setMuted(true);
      flash(
        "Your microphone is muted. You can still hear. Press again to turn voice off."
      );
    } else {
      calls.turnOff();
      setVoiceWith(0);
      setTalking(new Set());
    }
    setVoiceState(calls.state);
  };

  // Voice is for shared places. Going home or into the gym hangs up and lets go of the
  // microphone, so it is never left on where there is no button to turn it off.
  useEffect(() => {
    if (shared || voice.state === "off") return;
    voice.turnOff();
    setVoiceState("off");
    setVoiceWith(0);
    setTalking(new Set());
  }, [shared, voice]);

  // Voice is for whoever is standing with you. A couple of times a second, work out who
  // that is; the calls themselves start and stop by distance. Where nobody is shared with
  // (a house, the gym) everyone is cut off.
  useEffect(() => {
    if (voiceState === "off") return;
    const calls = voice;
    const timer = window.setInterval(() => {
      const near = [];
      if (shared) {
        for (const other of playersRef.current.values()) {
          near.push({
            id: other.id,
            distance: Math.hypot(
              other.x - playerFocus.x,
              other.z - playerFocus.z
            ),
          });
        }
      }
      calls.update(near);
      setVoiceWith(calls.connected);
      const loud = calls.talking();
      setTalking((current) =>
        current.size === loud.length && loud.every((id) => current.has(id))
          ? current
          : new Set(loud)
      );
    }, VOICE_EVERY);
    return () => window.clearInterval(timer);
  }, [playersRef, shared, voice, voiceState]);
  useEffect(() => () => voice.turnOff(), [voice]);

  const roomPanel = wardrobeOpen || storyOpen2 !== null || policeStop !== null;
  const panelOpen =
    shop !== null ||
    mapOpen ||
    customising ||
    storyOpen ||
    ride !== null ||
    phoneOpen ||
    roomPanel ||
    keysOpen ||
    dealerCar !== null;
  // Stopped at a checkpoint: held where they stand until they are let go.
  const policeHold = useMemo(
    () => (policeStop ? holdAt(null, playerFocus.x, playerFocus.z) : null),
    [policeStop]
  );
  // On the bus the server already has the player at the next stop, so nothing is sent
  // from the street they are leaving. In a house or the gym nothing is sent either.
  const silent = !shared || ride !== null;

  // In the ring, at the bag, in the middle of something or passed out, the player is busy:
  // no walking out half way through.
  const fighting =
    scene.kind === "arena" && (arena.fight !== null || arena.hold !== null);
  const tiedUp = fighting || (scene.kind !== "arena" && homeLife.hold !== null);
  // Their body is doing something only while they dance, sit or lie passed out. The rest
  // of the time the character is told nothing, and loads none of the fighting animations.
  const posing =
    Boolean(homeLife.life?.doing?.pose) || homeLife.wakeAt !== null;
  const hold = scene.kind === "arena" ? arena.hold : homeLife.hold;

  let placeName = district?.name ?? "";
  if (scene.kind === "arena") placeName = scene.name;
  if (scene.kind === "club")
    placeName = (club?.name ?? CLUB.name).toUpperCase();
  if (venue) placeName = venue.name;
  if (scene.kind === "home" && home) {
    const level =
      home.plan.floors.length > 1
        ? scene.floor > 0
          ? " · Upstairs"
          : " · Downstairs"
        : "";
    placeName = `${home.plan.name}${level}`;
  }

  const doorHere =
    !indoors && nearDoor && !nearDoor.id.startsWith("spot:") ? nearDoor : null;
  const sayBar =
    shared && story?.done === true && !customising && !photo && !panelOpen;
  const overlay = customising || photo || mapOpen;
  // The guide is drawn only on the street of the district the place is in.
  const guiding =
    heading !== null &&
    !mapOpen &&
    ride === null &&
    scene.kind === "street" &&
    district?.id === heading.district;

  return (
    <div className='game'>
      <style>{`
        .overhead { display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none; }
        .overhead-said { max-width: 200px; width: max-content; padding: 5px 10px; border-radius: 12px; background: #fff; color: #1f2a26;
          font-size: 12px; font-weight: 600; line-height: 1.25; text-align: center; white-space: normal; overflow-wrap: anywhere;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
        .overhead-out { display: flex; flex-direction: column; align-items: center; line-height: 1; }
        .overhead-out span { font-size: 26px; }
        .overhead-out b { font-size: 10px; letter-spacing: 0.1em; color: #fff; background: #c8372d; border-radius: 6px; padding: 2px 6px; margin-top: 2px; }
        .hud-dot { display: inline-grid; place-items: center; min-width: 18px; height: 18px; border-radius: 9px; background: #c8372d; color: #fff;
          font-size: 11px; padding: 0 5px; margin-left: 6px; }
        .notice { text-align: center; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
        .notice.notice-news { background: rgba(20, 22, 24, 0.9); }
        .notice.notice-loud { top: calc(64px + env(safe-area-inset-top)); z-index: 13; font-weight: 700; }
        .guide-chip { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(124px + env(safe-area-inset-bottom)); z-index: 11;
          display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 14px; border-radius: 999px; background: #1c1512; color: #f6efe0;
          border: 2px solid #e2b657; font-size: 13px; font-weight: 700; white-space: nowrap; max-width: 86vw; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35); }
        .guide-chip span { overflow: hidden; text-overflow: ellipsis; }
        .guide-chip button { border: none; border-radius: 50%; width: 26px; height: 26px; background: #3a2c22; color: #f6efe0; font-size: 12px;
          display: grid; place-items: center; padding: 0; flex-shrink: 0; }
      `}</style>

      <Canvas
        shadows='percentage'
        dpr={[1, 1.5]}
        camera={{
          position: [player.pos_x, 6, player.pos_z + 9],
          fov: CAMERA_FOV,
          near: 0.3,
          far: 1600,
        }}
      >
        {/* While the city map is open it is all that is drawn: the street comes back when it closes. */}
        {mapOpen && (
          <CityMap
            districts={allDistricts}
            city={city}
            here={mapHere}
            picked={pickedPlace}
            onPick={setPickedPlace}
          />
        )}
        {!mapOpen && scene.kind === "street" && district && (
          <District data={district} />
        )}
        {!mapOpen && scene.kind === "street" && district && (
          <StreetExtras data={district} onNearDoor={setNearDoor} />
        )}
        {!mapOpen && scene.kind === "street" && <ParkedCars cars={parked} />}
        {!mapOpen && scene.kind === "street" && district && life && (
          <CrowdAndTraffic key={district.id} life={life} crowd={crowd} />
        )}
        {guiding && heading && (
          <Guide
            key={`${heading.district}:${heading.name}`}
            x={heading.x}
            z={heading.z}
            onDistance={walked}
          />
        )}
        {!mapOpen && scene.kind === "street" && district && (
          <PoliceCheckpoints
            district={district.id}
            onReach={calledOver}
            paused={panelOpen || busy || tiedUp || held > 0 || driving !== null}
          />
        )}
        {scene.kind === "home" && home && (
          <HomeScene
            home={home}
            floor={scene.floor}
            onStairs={takeStairs}
            usable={homeLife.usable}
            onNear={homeLife.setNear}
            build={decorating ? buildView : null}
            cars={homeCars}
          />
        )}
        {scene.kind === "home" && home && decorating && (
          <BuildCamera lot={home.plan.lot} cell={home.plan.cell} />
        )}
        {scene.kind === "arena" && arena.club && (
          <ArenaScene
            coach={arena.club.coach}
            opponent={
              arena.fight
                ? {
                    name: arena.fight.opponent_name,
                    look: arena.fight.opponent_look,
                  }
                : null
            }
            them={arena.them}
            onNear={arena.setNear}
          />
        )}
        <Suspense fallback={null}>
          {scene.kind === "club" && (
            <ClubScene playersRef={playersRef} onNear={homeLife.setNear} />
          )}
          {venue && (
            <VenueScene
              key={venue.id}
              layout={venue}
              playersRef={playersRef}
              onNear={homeLife.setNear}
              onSpecial={setSpecial}
              onScare={frighten}
              carColours={showColours}
            />
          )}
          {lookLoaded && collider && !mapOpen && (
            <LocalPlayer
              key={spawn.key}
              start={{ x: spawn.x, z: spawn.z }}
              sendMove={silent ? sendNothing : sendMove}
              takeServerPosition={
                silent ? noServerPosition : takeServerPosition
              }
              look={draft ?? look}
              customising={customising}
              collider={collider}
              fight={
                scene.kind === "arena"
                  ? arena.you
                  : posing
                  ? homeLife.pose
                  : null
              }
              hold={policeHold ?? hold}
              said={said[player.id] ?? ""}
              out={homeLife.wakeAt !== null}
              spraying={homeLife.life?.doing?.pose === "spray"}
              orbit={
                scene.kind === "street" ||
                scene.kind === "home" ||
                Boolean(venue?.open)
              }
              frozen={decorating}
              driving={scene.kind === "street" ? driving : null}
            />
          )}
          {shared &&
            !mapOpen &&
            remotes.map((entry) => (
              <RemotePlayer
                key={entry.id}
                entry={entry}
                playersRef={playersRef}
                heightAt={heightAt}
                said={said[entry.id] ?? ""}
                talking={talking.has(entry.id)}
              />
            ))}
          {!indoors && !mapOpen && district && crowd && streetCollider && (
            <MarketPeople
              key={district.id}
              crowd={crowd}
              collider={streetCollider}
              onHeld={setHeld}
              onNearSeller={setNearSeller}
            />
          )}
        </Suspense>
      </Canvas>

      <Loader />

      {/* The map takes fingers and the mouse itself, so the walking controls step aside for it. */}
      {!mapOpen && !decorating && !driving && (
        <TouchControls
          key={customising ? "spin" : "play"}
          mode={customising ? "spin" : "play"}
          turn={
            scene.kind === "street" ||
            scene.kind === "home" ||
            Boolean(venue?.open)
          }
        />
      )}
      {driving && scene.kind === "street" && !overlay && !panelOpen && (
        <DriveHud onGetOut={() => void getOutOfCar()} busy={carBusy} />
      )}

      {!photo && !mapOpen && (
        <div className='hud'>
          {scene.kind === "club" ? (
            <span />
          ) : (
            <div className='hud-card'>
              <strong>@{player.username}</strong>
              <span>₦{money.toLocaleString()}</span>
              <span className={connected ? "online" : "offline"}>
                {connected ? `${remotes.length + 1} online` : "Connecting…"}
              </span>
            </div>
          )}
          {!customising && (
            <div className='hud-actions'>
              {indoors && !tiedUp && !decorating && scene.kind !== "club" && (
                <button
                  type='button'
                  className='hud-button'
                  onClick={goOutside}
                >
                  Go outside
                </button>
              )}
              {scene.kind === "home" && !tiedUp && !decorating && (
                <button
                  type='button'
                  className='hud-button hud-build'
                  onClick={() => setDecorating(true)}
                >
                  Build
                </button>
              )}
              {!indoors && !tiedUp && !driving && story?.done && (
                <button
                  type='button'
                  className='hud-button'
                  onClick={() => setKeysOpen(true)}
                  disabled={busy}
                >
                  Car
                </button>
              )}
              {!indoors && !tiedUp && !driving && (
                <>
                  {story?.done && !inHostel && (
                    <button
                      type='button'
                      className='hud-button'
                      onClick={() => void goHome()}
                      disabled={busy}
                    >
                      {busy ? "Opening…" : "Home"}
                    </button>
                  )}
                  <button
                    type='button'
                    className='hud-button'
                    onClick={openMap}
                    disabled={!district || busy}
                  >
                    Map
                  </button>
                </>
              )}
              {story?.done && scene.kind !== "arena" && !decorating && (
                <button
                  type='button'
                  className='hud-button'
                  onClick={() => setPhoneOpen(true)}
                >
                  Phone
                  {unread > 0 && <span className='hud-dot'>{unread}</span>}
                </button>
              )}
              {!indoors && !tiedUp && !driving && (
                <button
                  type='button'
                  className='hud-button'
                  onClick={openCreator}
                  disabled={!look || !options}
                >
                  Edit look
                </button>
              )}
              {/* Out on the street the camera can be swung right round. This shows which way is north, and puts it back. */}
              {!indoors && (
                <Compass read={() => cameraView.yaw} onReset={faceNorth} />
              )}
            </div>
          )}
        </div>
      )}

      {placeName && !overlay && !fighting && scene.kind !== "club" && (
        <div className='place-name'>{placeName}</div>
      )}
      {placeName && !overlay && scene.kind === "club" && (
        <div
          className='place-name'
          style={{
            top: "calc(64px + env(safe-area-inset-top))",
            letterSpacing: "0.14em",
          }}
        >
          {placeName}
        </div>
      )}
      {notice && !photo && <div className='notice notice-news'>{notice}</div>}
      {toast && scene.kind !== "club" && !photo && (
        <div className='notice notice-loud'>{toast}</div>
      )}
      {/* The map's credit must always be readable: where the say bar is along the bottom, it sits above it. */}
      {district && !indoors && !mapOpen && (
        <div
          className='map-credit'
          style={
            driving
              ? {
                  bottom: "calc(112px + env(safe-area-inset-bottom))",
                  left: "14px",
                  right: "auto",
                  transform: "none",
                }
              : sayBar
              ? { bottom: "calc(60px + env(safe-area-inset-bottom))" }
              : undefined
          }
        >
          {district.attribution}
        </div>
      )}
      {mapError && (
        <div className='map-error'>
          <strong>The map did not load.</strong>
          <span>{mapError}</span>
          <span>
            Check that the map file is in frontend/public/map, then refresh.
          </span>
        </div>
      )}

      {/* A tout has hold of you: shake them off, or give in and look. */}
      {!indoors && !panelOpen && held > 0 && (
        <div className='crowd-actions'>
          <button
            type='button'
            className='shake'
            onClick={() => crowd && shakeOff(crowd)}
          >
            Leave me!
          </button>
          <button type='button' className='give-in' onClick={lookAtGoods}>
            Okay, show me
          </button>
        </div>
      )}
      {!indoors && !panelOpen && !tiedUp && !driving && nearCar && (
        <div className='crowd-actions'>
          <button
            type='button'
            className='give-in'
            onClick={() => void getInCar()}
            disabled={carBusy}
          >
            {carBusy ? "Opening…" : "Get in and drive"}
          </button>
        </div>
      )}
      {!indoors &&
        !panelOpen &&
        !tiedUp &&
        !driving &&
        !nearCar &&
        held === 0 &&
        (nearSeller || doorHere) &&
        !spotHere && (
          <div className='crowd-actions'>
            {doorHere && (
              <button
                type='button'
                className='give-in'
                onClick={() => void goThrough(doorHere)}
                disabled={busy}
              >
                {busy ? "Opening…" : `Enter ${doorHere.text}`}
              </button>
            )}
            {nearSeller && !doorHere && (
              <button
                type='button'
                className='give-in'
                onClick={() =>
                  setShop({
                    shopId: nearSeller.shop,
                    seller: nearSeller.name,
                    fromTout: false,
                  })
                }
              >
                Buy from {nearSeller.name}
              </button>
            )}
          </div>
        )}

      {/* In a room: something that opens a panel of its own. */}
      {venue &&
        special &&
        !panelOpen &&
        !tiedUp &&
        !homeLife.menu &&
        !homeLife.life?.doing && (
          <div
            className='crowd-actions'
            style={{
              bottom: homeLife.near
                ? "calc(130px + env(safe-area-inset-bottom))"
                : undefined,
            }}
          >
            <button
              type='button'
              className='give-in'
              onClick={() => {
                if (special.kind === "shop")
                  setShop({
                    shopId: special.shop,
                    seller: special.name,
                    fromTout: false,
                  });
                else if (special.kind === "wardrobe") setWardrobeOpen(true);
                else if (special.kind === "car") setDealerCar(special.model);
                else setStoryOpen2(special);
              }}
            >
              {special.kind === "shop"
                ? `Shop: ${special.name}`
                : special.kind === "wardrobe"
                ? "Browse the boutique"
                : special.kind === "car"
                ? `See the ${special.name}`
                : `Hear the story: ${special.story.title}`}
            </button>
          </div>
        )}

      {scene.kind === "arena" && !customising && (
        <ArenaHud arena={arena} money={money} />
      )}

      {/* Needs and the player's own clock: always in view, except where they would cover a fight or a form. */}
      {homeLife.life &&
        !overlay &&
        !storyOpen &&
        !fighting &&
        ride === null &&
        !decorating &&
        !driving && <LifeHud life={homeLife.life} />}

      {/* Friends: an invite to answer, and who is rolling with this player. */}
      {!storyOpen && ride === null && (
        <CrewBar
          crew={crew}
          busy={crewBusy}
          onAccept={(fromId) => void joinCrew(fromId)}
          onDecline={(fromId) =>
            void answerCrew(() => declineCrew(player.id, fromId))
          }
          onLeave={() => void answerCrew(() => leaveCrew(player.id))}
          showCrew={!mapOpen && !phoneOpen && !overlay}
        />
      )}

      {/* Using things: furniture and roommates at home, the bar and the dance floor in the club, a buka or a shuttle on the street. */}
      {scene.kind !== "arena" &&
        !overlay &&
        !decorating &&
        !roomPanel &&
        !driving &&
        !(scene.kind === "street" && (panelOpen || held > 0)) && (
          <LifeActions
            homeLife={homeLife}
            noButton={scene.kind === "club"}
            extra={
              boothOpen ? (
                <BoothCard
                  club={club}
                  until={vipUntil}
                  money={money}
                  others={remotes}
                  busy={clubBusy}
                  error={clubError}
                  onRent={() =>
                    void atTheClub(
                      () => rentBooth(player.id),
                      "Could not rent a booth."
                    )
                  }
                  onInvite={(guest) => void invite(guest)}
                />
              ) : null
            }
          />
        )}

      {scene.kind === "home" && home && decorating && !customising && (
        <BuildPanel
          playerId={player.id}
          home={home}
          floor={scene.floor}
          money={money}
          onChange={houseChanged}
          onView={setBuildView}
          onFloor={buildFloor}
          onDone={stopDecorating}
        />
      )}

      {scene.kind === "club" && !overlay && (
        <ClubHud
          club={club}
          life={homeLife.life}
          money={money}
          online={remotes.length + 1}
          homeLife={homeLife}
          tiedUp={tiedUp}
          onMenu={() => setClubMenu(true)}
          toast={toast}
        />
      )}
      {scene.kind === "club" && clubMenu && (
        <ClubMenu
          club={club}
          others={remotes}
          music={musicOn}
          onMusic={toggleMusic}
          onPhoto={takePhoto}
          onLeave={goOutside}
          onClose={() => setClubMenu(false)}
        />
      )}

      {/* Wherever players share a place they can talk: typed for everyone near, and by voice for whoever is standing with them. */}
      {sayBar && !decorating && !driving && (
        <SayBar
          onSay={speak}
          lines={lines}
          voice={Voice.supported() ? voiceState : null}
          voiceWith={voiceWith}
          onVoice={() => void toggleVoice()}
        />
      )}

      {!shared && !customising && !tiedUp && (
        <div className='hint'>
          <span className='hint-keys'>
            WASD to walk · Shift to sprint · Scroll to zoom
          </span>
          <span className='hint-touch'>Drag to move · Pinch to zoom</span>
        </div>
      )}

      {draft && options && (
        <CharacterCreator
          options={options}
          look={draft}
          firstTime={firstTime}
          saving={saving}
          error={saveError}
          onChange={setDraft}
          onSave={() => void save()}
          onCancel={closeCreator}
        />
      )}

      {shop && (
        <ShopPanel
          playerId={player.id}
          shopId={shop.shopId}
          seller={shop.seller}
          onMoney={setMoney}
          onClose={closeShop}
        />
      )}
      {mapOpen && (
        <MapPanel
          city={city}
          error={cityError}
          money={money}
          here={mapHere}
          picked={
            city?.places.find((place) => place.id === pickedPlace) ?? null
          }
          going={going}
          problem={goProblem}
          credit={district?.attribution ?? ""}
          onGo={(place, option) => void go(place, option)}
          onPutAway={() => setPickedPlace(null)}
          onRetry={loadCity}
          onClose={closeMap}
        />
      )}
      {wardrobeOpen && (
        <WardrobePanel
          playerId={player.id}
          onMoney={setMoney}
          onWear={() =>
            fetchLookState(player.id)
              .then((state) => setLook(state.look))
              .catch(() => {})
          }
          onClose={() => setWardrobeOpen(false)}
        />
      )}
      {storyOpen2?.kind === "story" && (
        <StoryPanel
          story={storyOpen2.story}
          onClose={() => setStoryOpen2(null)}
        />
      )}
      {dealerCar && (
        <DealerPanel
          playerId={player.id}
          model={dealerCar}
          colour={
            showColours[dealerCar] ??
            VENUES.dealer?.cars?.find((car) => car.model === dealerCar)
              ?.colour ??
            "black"
          }
          onColour={(model, colour) =>
            setShowColours((now) => ({ ...now, [model]: colour }))
          }
          onBought={(done) => {
            setCars(done);
            setMoney(done.money);
            shout("Congratulations on your new car!");
          }}
          onClose={() => setDealerCar(null)}
        />
      )}
      {keysOpen && (
        <CarKeysPanel
          playerId={player.id}
          cars={cars}
          busy={carBusy}
          onBring={(car) => void bring(car)}
          onSendHome={() => void sendHome()}
          onCars={(loaded) => {
            setCars(loaded);
            setMoney(loaded.money);
          }}
          onClose={() => setKeysOpen(false)}
        />
      )}
      {policeStop && (
        <PolicePanel
          playerId={player.id}
          stop={policeStop}
          onMoney={setMoney}
          onNews={(lines) => flash(lines.join(" "))}
          onDone={() => {
            setPoliceStop(null);
            void loadLife(); // a night in the station takes hours off their day
          }}
        />
      )}
      <ScareOverlay scare={scare} />
      {ride && (
        <BusRide
          from={ride.from}
          to={ride.to}
          fare={ride.fare}
          mode={ride.mode}
          seconds={ride.seconds}
          onDone={() => void arrive()}
        />
      )}

      {/* Walking to a place picked on the map: how far is left, and a way to stop being shown. */}
      {heading && !overlay && !panelOpen && scene.kind === "street" && (
        <div className='guide-chip'>
          <span>
            {district?.id === heading.district
              ? `${heading.name}${
                  headingMetres !== null
                    ? ` · ${headingMetres.toLocaleString()} m`
                    : ""
                }`
              : `${heading.name} is in another part of town`}
          </span>
          <button
            type='button'
            onClick={() => setHeading(null)}
            aria-label={`Stop showing the way to ${heading.name}`}
          >
            ✕
          </button>
        </div>
      )}

      {phoneOpen && (
        <Phone
          playerId={player.id}
          username={player.username}
          student={student}
          nearby={shared ? remotes : []}
          arrivals={arrivals}
          money={money}
          life={homeLife.life}
          story={story?.result ?? null}
          onMoney={setMoney}
          onUnread={setUnread}
          onSignOut={onSignOut}
          onMap={() => {
            setPhoneOpen(false); // put away first, so whatever the map has to say can be seen
            void loadLife();
            openMap();
          }}
          onClose={() => {
            setPhoneOpen(false);
            void loadLife(); // data may have been bought or used
          }}
        />
      )}

      {storyOpen && story && (
        <StoryQuiz
          questions={{
            citizen: story.questions,
            student: story.student_questions,
          }}
          onTell={(path, answers) => tellStory(player.id, path, answers)}
          onDone={finishStory}
        />
      )}
    </div>
  );
}
