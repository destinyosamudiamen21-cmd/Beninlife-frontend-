import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Loader } from "@react-three/drei";
import {
  fetchLookOptions,
  fetchLookState,
  saveLook,
  type Look,
  type LookOptions,
} from "../api/appearance";
import { fetchHome, type Home } from "../api/home";
import type { Player } from "../api/players";
import type { Trip } from "../api/travel";
import {
  fetchStory,
  tellStory,
  type StoryResult,
  type StoryState,
} from "../api/story";
import { CharacterCreator } from "./CharacterCreator";
import { District } from "./District";
import { HomeScene } from "./HomeScene";
import { LocalPlayer } from "./LocalPlayer";
import { MarketPeople } from "./MarketPeople";
import { RemotePlayer } from "./RemotePlayer";
import { ShopPanel } from "./ShopPanel";
import { StoryQuiz } from "./StoryQuiz";
import { TouchControls } from "./TouchControls";
import { TravelPanel } from "./TravelPanel";
import { buildCollider } from "./collision";
import { loadDistrict, type DistrictData } from "./districtData";
import { playerFocus } from "./focus";
import { doorSpot, homeCollider, type FloorChange } from "./homeLayout";
import { CAMERA_FOV, creatorInput } from "./input";
import { createCrowd, holder, sendAway, shakeOff, type Seller } from "./npcs";
import { useWorldSocket } from "./useWorldSocket";

// Where everyone starts. The bus takes players to the other districts.
const FIRST_DISTRICT = "uniben";

/** A stall the player is looking at. `fromTout` means a tout dragged them to it. */
type OpenShop = { shopId: string; seller: string; fromTout: boolean };

/** Where the player is. Indoors, only one floor of the house is shown at a time. */
type Scene = { kind: "street" } | { kind: "home"; floor: number };

/** Where the player's body should appear. A new `key` puts them there afresh. */
type Spawn = { x: number; z: number; key: number };

// Indoors nothing is sent to the server and nothing comes back: the house is private.
const sendNothing = () => {};
const noServerPosition = () => null;

export function Game({ player }: { player: Player }) {
  const {
    playersRef,
    remotes,
    connected,
    sendMove,
    sendPlace,
    takeServerPosition,
  } = useWorldSocket(player.id);

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
  const [notice, setNotice] = useState("");
  const streetSpot = useRef({ x: player.pos_x, z: player.pos_z }); // where to come back out to

  const [held, setHeld] = useState(0); // touts holding the player
  const [nearSeller, setNearSeller] = useState<Seller | null>(null);
  const [shop, setShop] = useState<OpenShop | null>(null);
  const [busOpen, setBusOpen] = useState(false);

  const customising = draft !== null;
  const indoors = scene.kind === "home";
  const storyOpen = story !== null && !story.done && lookLoaded && !customising;

  // Walls, trees and the district edge, worked out once per map.
  const streetCollider = useMemo(
    () => (district ? buildCollider(district) : null),
    [district]
  );
  // Indoors: the walls, the stairs and the furniture on the floor being shown.
  const homeFloor = scene.kind === "home" ? scene.floor : 0;
  const indoorCollider = useMemo(
    () =>
      home
        ? homeCollider(home.plan, homeFloor, home.items, home.catalogue)
        : null,
    [home, homeFloor]
  );
  const collider = indoors ? indoorCollider : streetCollider;

  // The sellers and touts of this district. Street sense decides how hard they press.
  const streetSense = story?.result?.street ?? 1;
  const crowd = useMemo(
    () => (district ? createCrowd(district, streetSense) : null),
    [district, streetSense]
  );

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

  // The player's story: told once, it decides their money and their house.
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

  const finishStory = (result: StoryResult) => {
    setMoney(result.cash);
    setStory({ done: true, questions: [], result, money: result.cash });
  };

  /** Put the player's body somewhere new, and tell everything that follows the player. */
  const appearAt = (x: number, z: number) => {
    playerFocus.x = x;
    playerFocus.z = z;
    setSpawn((current) => ({ x, z, key: current.key + 1 }));
  };

  const goHome = async () => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      // Fetched on every visit, so the house is always as the server has it.
      const loaded = await fetchHome(player.id);
      streetSpot.current = { x: playerFocus.x, z: playerFocus.z };
      const door = doorSpot(loaded.plan);
      setHome(loaded);
      setMoney(loaded.money);
      setScene({ kind: "home", floor: 0 });
      appearAt(door.x, door.z);
      sendPlace("home");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not open your house."
      );
    } finally {
      setBusy(false);
    }
  };

  const goOutside = () => {
    setScene({ kind: "street" });
    appearAt(streetSpot.current.x, streetSpot.current.z);
    sendPlace("street");
  };

  const takeStairs = (change: FloorChange) => {
    setScene({ kind: "home", floor: change.floor });
    appearAt(change.x, change.z);
  };

  /** The bus has been paid for and the server has moved the player: show the new district. */
  const arrive = async (trip: Trip) => {
    setMoney(trip.money);
    setBusOpen(false);
    setHeld(0);
    setNearSeller(null);
    try {
      const loaded = await loadDistrict(trip.district);
      setDistrict(loaded);
      streetSpot.current = { x: 0, z: 0 };
      appearAt(0, 0); // every district is built around its own arrival spot
    } catch (error) {
      setMapError(
        error instanceof Error ? error.message : "The map did not load."
      );
    }
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

  const panelOpen = shop !== null || busOpen || customising || storyOpen;

  let placeName = district?.name ?? "";
  if (scene.kind === "home" && home) {
    const level =
      home.plan.floors.length > 1
        ? scene.floor > 0
          ? " · Upstairs"
          : " · Downstairs"
        : "";
    placeName = `${home.plan.name}${level}`;
  }

  return (
    <div className='game'>
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
        {scene.kind === "street" && district && <District data={district} />}
        {scene.kind === "home" && home && (
          <HomeScene home={home} floor={scene.floor} onStairs={takeStairs} />
        )}
        <Suspense fallback={null}>
          {lookLoaded && collider && (
            <LocalPlayer
              key={spawn.key}
              start={{ x: spawn.x, z: spawn.z }}
              sendMove={indoors ? sendNothing : sendMove}
              takeServerPosition={
                indoors ? noServerPosition : takeServerPosition
              }
              look={draft ?? look}
              customising={customising}
              collider={collider}
            />
          )}
          {!indoors &&
            remotes.map((entry) => (
              <RemotePlayer
                key={entry.id}
                entry={entry}
                playersRef={playersRef}
              />
            ))}
          {!indoors && district && crowd && streetCollider && (
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

      <TouchControls
        key={customising ? "spin" : "play"}
        mode={customising ? "spin" : "play"}
      />

      <div className='hud'>
        <div className='hud-card'>
          <strong>@{player.username}</strong>
          <span>₦{money.toLocaleString()}</span>
          <span className={connected ? "online" : "offline"}>
            {connected ? `${remotes.length + 1} online` : "Connecting…"}
          </span>
        </div>
        {!customising && (
          <div className='hud-actions'>
            {indoors ? (
              <button type='button' className='hud-button' onClick={goOutside}>
                Go outside
              </button>
            ) : (
              <>
                {story?.done && (
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
                  onClick={() => setBusOpen(true)}
                  disabled={!district}
                >
                  Bus
                </button>
                <button
                  type='button'
                  className='hud-button'
                  onClick={openCreator}
                  disabled={!look || !options}
                >
                  Edit look
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {placeName && !customising && (
        <div className='place-name'>{placeName}</div>
      )}
      {notice && <div className='notice'>{notice}</div>}
      {district && !indoors && (
        <div className='map-credit'>{district.attribution}</div>
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
      {!indoors && !panelOpen && held === 0 && nearSeller && (
        <div className='crowd-actions'>
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
        </div>
      )}

      {!customising && (
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
      {busOpen && (
        <TravelPanel
          playerId={player.id}
          onArrive={(trip) => void arrive(trip)}
          onClose={() => setBusOpen(false)}
        />
      )}

      {storyOpen && story && (
        <StoryQuiz
          questions={story.questions}
          onTell={(answers) => tellStory(player.id, answers)}
          onDone={finishStory}
        />
      )}
    </div>
  );
}
