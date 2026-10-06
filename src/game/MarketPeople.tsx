import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import { Character } from "./Character";
import type { Collider } from "./collision";
import { playerDrag, playerFocus } from "./focus";
import {
  dragFactor,
  keepPeople,
  stepCrowd,
  type Crowd,
  type Person,
  type Seller,
} from "./npcs";

const MAX_SHOWN = 9; // a person costs far more to draw than a stall
const SHOW_RANGE = 38; // metres
const RECHECK = 0.4; // seconds between working out who is in view
const MAX_STEP = 0.1; // cap a frozen tab's catch-up
const BUBBLE_HEIGHT = 2.15;

type Props = {
  crowd: Crowd;
  /** The same walls and stalls the player bumps into, so touts walk round them too. */
  collider: Collider;
  /** How many touts have hold of the player. Called only when the number changes. */
  onHeld: (count: number) => void;
  /** The seller the player can buy from. Called only when it changes. */
  onNearSeller: (seller: Seller | null) => void;
};

/** One seller or tout: a full character, placed each frame from the market's own state. */
function PersonView({ person, crowd }: { person: Person; crowd: Crowd }) {
  const groupRef = useRef<Group>(null);
  const speedRef = useRef(0);
  const shownLine = useRef("");
  const [line, setLine] = useState("");

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    group.position.set(person.x, 0, person.z);
    group.rotation.y = person.rot;
    speedRef.current = person.speed;

    // The speech bubble is React's job, but only when the words change.
    const saying = crowd.time < person.sayUntil ? person.say : "";
    if (saying !== shownLine.current) {
      shownLine.current = saying;
      setLine(saying);
    }
  });

  return (
    <group
      ref={groupRef}
      position={[person.x, 0, person.z]}
      rotation={[0, person.rot, 0]}
    >
      <Character speedRef={speedRef} look={person.look} />
      {line && (
        <Html
          position={[0, BUBBLE_HEIGHT, 0]}
          center
          zIndexRange={[4, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className='speech'>{line}</div>
        </Html>
      )}
    </group>
  );
}

/**
 * Runs the market and draws the people nearest the player.
 * The behaviour lives in npcs.ts; this only steps it once a frame and shows the result.
 */
export function MarketPeople({ crowd, collider, onHeld, onNearSeller }: Props) {
  const [shown, setShown] = useState<Person[]>([]);
  const sinceCheck = useRef(RECHECK);
  const held = useRef(0);
  const near = useRef<Seller | null>(null);

  // Leaving the market must never leave the player slowed down.
  useEffect(
    () => () => {
      playerDrag.factor = 1;
    },
    [crowd]
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, MAX_STEP);
    stepCrowd(crowd, dt, playerFocus.x, playerFocus.z, collider);
    playerDrag.factor = dragFactor(crowd);

    if (crowd.holding !== held.current) {
      held.current = crowd.holding;
      onHeld(crowd.holding);
    }
    if (crowd.nearSeller !== near.current) {
      near.current = crowd.nearSeller;
      onNearSeller(crowd.nearSeller);
    }

    sinceCheck.current += dt;
    if (sinceCheck.current >= RECHECK) {
      sinceCheck.current = 0;
      setShown((current) => {
        const next = keepPeople(
          crowd,
          current,
          playerFocus.x,
          playerFocus.z,
          MAX_SHOWN,
          SHOW_RANGE
        );
        const same =
          current.length === next.length &&
          next.every((person) => current.includes(person));
        return same ? current : next;
      });
    }
  });

  return (
    <>
      {shown.map((person) => (
        <PersonView key={person.id} person={person} crowd={crowd} />
      ))}
    </>
  );
}
