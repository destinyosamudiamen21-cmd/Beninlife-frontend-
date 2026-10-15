import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, type Group } from "three";
import type { Look } from "../api/appearance";
import { ARENA, fightHold, nearAt, sameNear, type Near } from "./arenaLayout";
import { buildArenaCrowd, buildArenaRoom } from "./arenaShapes";
import { Character } from "./Character";
import type { MeshData } from "./districtGeometry";
import type { FightPose } from "./fightMoves";
import { playerFocus } from "./focus";

const DARK = "#1c1614"; // what shows above the walls: the roof is in shadow
const CHEER_RATE = 7; // how fast the crowd bounces in a fight
const CHEER_HEIGHT = 0.07;

// The coach: an older man, all in black.
const COACH_LOOK: Look = {
  body: "man",
  skin_tone: "#4b2c1c",
  hair_color: "#17120f",
  top_color: "#3a3d42",
  bottom_color: "#3a3d42",
  shoe_color: "#1d1d1f",
};

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

type Props = {
  /** The coach's name, for the tag over his head. */
  coach: string;
  /** Who the player is fighting, or null when nobody is in the ring. */
  opponent: { name: string; look: Look } | null;
  /** What the opponent's body is doing. */
  them: FightPose;
  /** Tells the game what the player is standing next to. Called only when it changes. */
  onNear: (near: Near) => void;
};

/** The inside of the fight club: the gym, the coach, the people watching, and whoever is in the ring. */
export function ArenaScene({ coach, opponent, them, onNear }: Props) {
  const room = useMemo(() => toGeometry(buildArenaRoom()), []);
  const crowds = useMemo(
    () => [toGeometry(buildArenaCrowd(0)), toGeometry(buildArenaCrowd(1))],
    []
  );
  useEffect(
    () => () => {
      room.dispose();
      crowds.forEach((crowd) => crowd.dispose());
    },
    [room, crowds]
  );

  const still = useRef(0); // nobody here walks
  const firstHalf = useRef<Group>(null);
  const secondHalf = useRef<Group>(null);
  const near = useRef<Near>(null);
  const beat = useRef(0);
  const fighting = opponent !== null;
  const corner = fightHold("them");

  useFrame((_, delta) => {
    // What is the player standing next to?
    const now = nearAt(playerFocus.x, playerFocus.z);
    if (!sameNear(now, near.current)) {
      near.current = now;
      onNear(now);
    }
    // In a fight the two halves of the crowd bounce in turn. Otherwise they sit still.
    beat.current = fighting ? beat.current + delta * CHEER_RATE : 0;
    const bounce = Math.sin(beat.current) * CHEER_HEIGHT;
    if (firstHalf.current) firstHalf.current.position.y = Math.max(0, bounce);
    if (secondHalf.current)
      secondHalf.current.position.y = Math.max(0, -bounce);
  });

  // Leaving the club leaves nothing switched on.
  useEffect(() => () => onNear(null), [onNear]);

  return (
    <>
      <color attach='background' args={[DARK]} />
      {/* Indoors the light comes from everywhere, so nothing is ever in deep shadow. */}
      <ambientLight intensity={1.15} />
      <hemisphereLight args={["#fff1d6", "#6a5a4c", 0.7]} />
      {/* A light always points at (0, 0, 0), the back-left corner. From here its beam passes
          over the middle of the room, so the shadows it casts cover the whole floor. */}
      <directionalLight
        position={[ARENA.width, 14, ARENA.depth]}
        intensity={1.9}
        color='#fff0d2'
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />

      <mesh geometry={room} castShadow receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <group ref={firstHalf}>
        <mesh geometry={crowds[0]} castShadow>
          <meshLambertMaterial vertexColors />
        </mesh>
      </group>
      <group ref={secondHalf}>
        <mesh geometry={crowds[1]} castShadow>
          <meshLambertMaterial vertexColors />
        </mesh>
      </group>

      <group
        position={[ARENA.coach.x, 0, ARENA.coach.z]}
        rotation={[0, ARENA.coach.rot, 0]}
      >
        <Character speedRef={still} look={COACH_LOOK} />
        <Html
          position={[0, 2.05, 0]}
          center
          zIndexRange={[4, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className='nametag'>{coach}</div>
        </Html>
      </group>

      {opponent && (
        <group
          position={[corner.x, corner.y, corner.z]}
          rotation={[0, corner.rot, 0]}
        >
          <Character speedRef={still} look={opponent.look} fight={them} />
          <Html
            position={[0, 2.05, 0]}
            center
            zIndexRange={[4, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div className='nametag'>{opponent.name}</div>
          </Html>
        </group>
      )}
    </>
  );
}
