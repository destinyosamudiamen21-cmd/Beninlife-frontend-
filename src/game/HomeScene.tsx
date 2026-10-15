import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { BufferAttribute, BufferGeometry } from "three";
import type { Look } from "../api/appearance";
import type { FurnitureOption, Home, PlacedItem, Spot } from "../api/home";
import { Character } from "./Character";
import type { MeshData } from "./districtGeometry";
import { playerFocus } from "./focus";
import { nearestPiece, offerSpot, spotRect, whyNot } from "./homeDecor";
import { buildFurniture, buildRoom } from "./homeGeometry";
import {
  fixtureRect,
  itemRect,
  roomSize,
  stairTrigger,
  type FloorChange,
  type Rect,
} from "./homeLayout";
import { homeThings } from "./homeLife";
import { nearestOf, type Near } from "./nearby";

const OUTSIDE = "#cfdcc6"; // what shows beyond the walls
const MARK = "#f4d27a"; // the patch of floor that shows which thing would be used
const PICK = "#6ab7ff"; // ... which piece would be moved or sold
const FITS = "#48bb78"; // ... where a piece would go, when it fits
const NO_FIT = "#d64545"; // ... and when it does not
const MARK_EDGE = 0.18; // how far the patch reaches past the furniture, in metres
const MARK_HEIGHT = 0.045; // above the floor, and above a rug lying on it
const CHECK_EVERY = 6; // frames between looks at whether a piece fits where it is offered

// The people who come with a hostel room. `look` on a fixture picks one of these.
const ROOMMATES: Look[] = [
  {
    body: "man",
    skin_tone: "#613a25",
    hair_color: "#17120f",
    top_color: "#d64545",
    bottom_color: "#2b3a55",
    shoe_color: "#ede6d6",
  },
  {
    body: "man",
    skin_tone: "#8d5a3b",
    hair_color: "#17120f",
    top_color: "#ede6d6",
    bottom_color: "#3a3d42",
    shoe_color: "#1d1d1f",
  },
  {
    body: "man",
    skin_tone: "#4b2c1c",
    hair_color: "#17120f",
    top_color: "#2f9e54",
    bottom_color: "#5d4a39",
    shoe_color: "#1d1d1f",
  },
];

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** What the player is arranging, if they are arranging the house. */
export type Arranging = {
  /** The piece being put down: a new one, or one already in the house. */
  option: FurnitureOption;
  rot: number;
  /** The piece being moved, which is not in its own way. Null for a new one. */
  moving: PlacedItem | null;
};

/** Where the piece being arranged would go right now, and why it cannot, if it cannot. */
export type Offer = { spot: Spot; why: string | null };

type Props = {
  home: Home;
  /** Which floor is shown: 0 is downstairs. Only one floor is drawn at a time. */
  floor: number;
  /** The player stepped onto the stairs. */
  onStairs: (change: FloorChange) => void;
  /** The kinds of furniture that can be used. */
  usable: ReadonlySet<string>;
  /** Tells the game which thing the player is standing at. Called only when it changes. */
  onNear: (thing: Near | null) => void;
  /** True while the house is being arranged: the piece the player stands at is picked out instead. */
  decorating?: boolean;
  /** Tells the game which piece that is. Called only when it changes. */
  onPick?: (item: PlacedItem | null) => void;
  /** Set while a piece is being put down. */
  arranging?: Arranging | null;
  /** Tells the game where it would go. Called only when the answer changes. */
  onOffer?: (offer: Offer | null) => void;
};

/** The inside of a player's house: one floor of it, with its furniture and whoever lives there too. */
export function HomeScene({
  home,
  floor,
  onStairs,
  usable,
  onNear,
  decorating = false,
  onPick,
  arranging = null,
  onOffer,
}: Props) {
  const { plan, items, catalogue } = home;
  const { width, depth } = roomSize(plan, floor);

  // The room only changes with the floor; the furniture changes whenever something is bought or moved.
  const room = useMemo(() => toGeometry(buildRoom(plan, floor)), [plan, floor]);
  const furniture = useMemo(
    () => toGeometry(buildFurniture(plan, floor, items, catalogue)),
    [plan, floor, items, catalogue]
  );
  useEffect(() => () => room.dispose(), [room]);
  useEffect(() => () => furniture.dispose(), [furniture]);

  // Everything on this floor that can be used, worked out once per change to the house.
  const things = useMemo(
    () => homeThings(plan, floor, items, catalogue, usable),
    [plan, floor, items, catalogue, usable]
  );
  const people =
    floor === 0
      ? (plan.fixtures ?? []).filter((fixture) => fixture.kind === "person")
      : [];
  const still = useRef(0); // nobody here walks

  // Watch for the player stepping onto the stairs. It fires once per visit to a floor.
  const climbed = useRef(false);
  useEffect(() => {
    climbed.current = false;
  }, [floor]);

  // What is the player standing at? Kept as state so the floor under it can be marked,
  // but only set when the answer changes, not on every frame.
  const [near, setNear] = useState<Near | null>(null);
  const nearNow = useRef<Near | null>(null);
  const [picked, setPicked] = useState<PlacedItem | null>(null);
  const pickedNow = useRef<PlacedItem | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const offerNow = useRef<Offer | null>(null);
  const frames = useRef(0);

  useFrame(() => {
    const x = playerFocus.x,
      z = playerFocus.z;

    // Using things and arranging them are two different modes: only one is live at a time.
    const at = decorating ? null : nearestOf(things, x, z);
    if (at !== nearNow.current) {
      nearNow.current = at;
      setNear(at);
      onNear(at);
    }
    const piece =
      decorating && !arranging
        ? nearestPiece(plan, floor, items, catalogue, x, z)
        : null;
    if (piece !== pickedNow.current) {
      pickedNow.current = piece;
      setPicked(piece);
      onPick?.(piece);
    }

    if (arranging) {
      // Where the piece would go follows the player, a cell at a time. Whether it fits is
      // looked at a few times a second: often enough to feel live, without doing the sums every frame.
      frames.current += 1;
      const spot = offerSpot(
        plan,
        floor,
        arranging.option,
        arranging.rot,
        x,
        z
      );
      const last = offerNow.current;
      const moved =
        !last ||
        last.spot.x !== spot.x ||
        last.spot.z !== spot.z ||
        last.spot.rot !== spot.rot ||
        last.spot.floor !== spot.floor;
      if (moved || frames.current % CHECK_EVERY === 0) {
        const why = whyNot(
          plan,
          items,
          catalogue,
          arranging.option,
          spot,
          arranging.moving?.id ?? null,
          x,
          z
        );
        if (moved || why !== last?.why) {
          const next = { spot, why };
          offerNow.current = next;
          setOffer(next);
          onOffer?.(next);
        }
      }
    } else if (offerNow.current) {
      offerNow.current = null;
      setOffer(null);
      onOffer?.(null);
    }

    if (climbed.current || decorating) return; // nobody carries a wardrobe up the stairs by accident
    const change = stairTrigger(plan, floor, x, z);
    if (change) {
      climbed.current = true;
      onStairs(change);
    }
  });

  // Leaving the house leaves nothing marked.
  useEffect(
    () => () => {
      nearNow.current = null;
      onNear(null);
    },
    [onNear]
  );

  let mark: Rect | null = null,
    colour = MARK;
  if (arranging && offer) {
    mark = spotRect(plan, arranging.option, offer.spot);
    colour = offer.why ? NO_FIT : FITS;
  } else if (picked) {
    const option = catalogue.find((entry) => entry.id === picked.item);
    mark = option ? itemRect(plan, option, picked) : null;
    colour = PICK;
  } else if (near) {
    mark = { cx: near.x, cz: near.z, halfX: near.halfX, halfZ: near.halfZ };
  }

  return (
    <>
      <color attach='background' args={[OUTSIDE]} />
      {/* Indoors the light comes from everywhere, so nothing is ever in deep shadow. */}
      <ambientLight intensity={1.4} />
      <hemisphereLight args={["#ffffff", "#8a7a66", 0.7]} />
      <directionalLight
        position={[width / 2 + 3, 9, depth + 5]}
        intensity={1.8}
        color='#fff4e2'
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />

      <mesh geometry={room} receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh geometry={furniture} castShadow receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>

      {people.map((fixture) => {
        const rect = fixtureRect(plan, fixture);
        return (
          <group
            key={fixture.id}
            position={[rect.cx, 0, rect.cz]}
            rotation={[0, (fixture.rot * Math.PI) / 2, 0]}
          >
            <Character
              speedRef={still}
              look={ROOMMATES[fixture.look % ROOMMATES.length]}
            />
            <Html
              position={[0, 2.05, 0]}
              center
              zIndexRange={[4, 0]}
              style={{ pointerEvents: "none" }}
            >
              <div className='nametag'>{fixture.name}</div>
            </Html>
          </group>
        );
      })}

      {/* A patch of light on the floor: round the thing that would be used, the piece that
          would be moved, or where a new piece would go. It lies flat, just above the floor. */}
      {mark && (
        <mesh
          position={[mark.cx, MARK_HEIGHT, mark.cz]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry
            args={[(mark.halfX + MARK_EDGE) * 2, (mark.halfZ + MARK_EDGE) * 2]}
          />
          <meshBasicMaterial
            color={colour}
            transparent
            opacity={arranging ? 0.7 : 0.55}
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
}
