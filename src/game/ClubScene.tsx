import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Color, type Group, type Mesh, type MeshBasicMaterial, type PointLight } from "three";
import type { Look } from "../api/appearance";
import {
  BEATS_PER_SECOND,
  CLUB,
  CLUB_THINGS,
  REGULARS,
  TILE_COLOURS,
  TILE_COUNT,
  clubFloorAt,
  tileAt,
  tileCentre,
  tileLook,
} from "./clubLayout";
import { NEON_BLUE, NEON_GOLD, NEON_PINK, SCREENS, buildClubCrowd, buildClubNeon, buildClubRoom } from "./clubShapes";
import { Character } from "./Character";
import { ClubShow } from "./ClubShow";
import type { MeshData } from "./districtGeometry";
import { danceTurn, fightClock, newPose, stepSpeed, strike, type FightPose } from "./fightMoves";
import { playerFocus } from "./focus";
import { nearestOf, type Near } from "./nearby";
import type { NetPlayer } from "./types";

const DARK = "#0b0910";      // what shows above the walls
const BOB_HEIGHT = 0.06;     // how far the people along the walls bob to the beat
const BARS = 7;              // bars on each screen
const STEPPED_ON = "#ffffff";

// The people who work here, and the regulars who are always on the floor.
const STAFF: Look = { body: "man", skin_tone: "#4b2c1c", hair_color: "#17120f", top_color: "#111114", bottom_color: "#111114", shoe_color: "#1d1d1f" };
const DJ: Look = { body: "man", skin_tone: "#613a25", hair_color: "#17120f", top_color: "#c79a2b", bottom_color: "#1d1d1f", shoe_color: "#ede6d6" };
const DANCERS: Look[] = [
  { body: "woman", skin_tone: "#774a2f", hair_color: "#17120f", top_color: "#d63f8c", bottom_color: "#1d1d1f", shoe_color: "#ede6d6" },
  { body: "man", skin_tone: "#4b2c1c", hair_color: "#17120f", top_color: "#ede6d6", bottom_color: "#2b3a55", shoe_color: "#ede6d6" },
  { body: "woman", skin_tone: "#8d5a3b", hair_color: "#3a2a1a", top_color: "#2a9d8f", bottom_color: "#ede6d6", shoe_color: "#1d1d1f" },
  { body: "man", skin_tone: "#613a25", hair_color: "#17120f", top_color: "#6a4fe0", bottom_color: "#3a3d42", shoe_color: "#1d1d1f" },
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

/** Someone who is always dancing in the same place: a regular on the floor, or the DJ behind his decks. */
function Dancer({ x, y, z, rot, look, pose }: { x: number; y: number; z: number; rot: number; look: Look; pose: FightPose }) {
  const body = useRef<Group>(null);
  const speed = useRef(0);
  useFrame(() => {
    if (!body.current) return;
    body.current.rotation.y = rot + danceTurn(pose.move, fightClock() - pose.started);
    speed.current = stepSpeed(pose.move);
  });
  return (
    <group ref={body} position={[x, y, z]}>
      <Character speedRef={speed} look={look} fight={pose} />
    </group>
  );
}

type Props = {
  /** Where the other players in the club are, as the server last said. Read every frame, for the tiles under their feet. */
  playersRef: { current: Map<string, NetPlayer> };
  /** Tells the game what the player is standing next to. Called only when it changes. */
  onNear: (thing: Near | null) => void;
};

/** The inside of the club: the room, the lights, the dance floor, and the people who are always there. */
export function ClubScene({ playersRef, onNear }: Props) {
  const room = useMemo(() => toGeometry(buildClubRoom()), []);
  const neon = useMemo(() => toGeometry(buildClubNeon()), []);
  const crowds = useMemo(() => [toGeometry(buildClubCrowd(0)), toGeometry(buildClubCrowd(1))], []);
  useEffect(
    () => () => {
      room.dispose();
      neon.dispose();
      crowds.forEach((crowd) => crowd.dispose());
    },
    [room, neon, crowds],
  );

  // The regulars start their dances a moment apart, so they are not all in step.
  const dancing = useMemo(
    () =>
      REGULARS.map((regular) => {
        const pose = newPose();
        strike(pose, regular.move);
        pose.started -= regular.delay;
        return pose;
      }),
    [],
  );
  const mixing = useMemo(() => {
    const pose = newPose();
    strike(pose, "bounce");
    return pose;
  }, []);
  const still = useRef(0);

  const palette = useMemo(() => TILE_COLOURS.map((hex) => new Color(hex)), []);
  const white = useMemo(() => new Color(STEPPED_ON), []);
  const tiles = useRef<(Mesh | null)[]>([]);
  const bars = useRef<(Mesh | null)[]>([]);
  const firstHalf = useRef<Group>(null);
  const secondHalf = useRef<Group>(null);
  const spots = useRef<(PointLight | null)[]>([]);
  const trodden = useRef<boolean[]>(new Array<boolean>(TILE_COUNT).fill(false));
  const near = useRef<Near | null>(null);

  useFrame(() => {
    const seconds = fightClock();
    const beat = seconds * BEATS_PER_SECOND;

    // What is the player standing next to?
    const at = nearestOf(CLUB_THINGS, playerFocus.x, playerFocus.z);
    if (at !== near.current) {
      near.current = at;
      onNear(at);
    }

    // Which tiles have somebody on them: the player, the other players, the regulars.
    const stood = trodden.current;
    stood.fill(false);
    const mine = tileAt(playerFocus.x, playerFocus.z);
    if (mine >= 0) stood[mine] = true;
    for (const other of playersRef.current.values()) {
      const tile = tileAt(other.x, other.z);
      if (tile >= 0) stood[tile] = true;
    }
    for (const regular of REGULARS) stood[tileAt(regular.x, regular.z)] = true;

    // Every tile takes its turn through the colours, a step on each beat. A tile with
    // somebody on it burns white and lifts a little under their feet.
    for (let i = 0; i < TILE_COUNT; i++) {
      const tile = tiles.current[i];
      if (!tile) continue;
      const look = tileLook(i, seconds);
      const material = tile.material as MeshBasicMaterial;
      if (stood[i]) material.color.copy(white).multiplyScalar(0.75 + 0.25 * look.glow);
      else material.color.copy(palette[look.colour]).multiplyScalar(look.glow);
      tile.position.y = stood[i] ? 0.075 : 0.05;
    }

    // The screens: a row of bars jumping to the beat.
    for (let i = 0; i < bars.current.length; i++) {
      const bar = bars.current[i];
      if (!bar) continue;
      const height = 0.25 + 0.75 * Math.abs(Math.sin(beat * Math.PI * (0.5 + (i % BARS) * 0.07) + i * 1.7));
      bar.scale.y = height;
      bar.position.y = bar.userData.base + (height * bar.userData.full) / 2;
    }

    // The people along the walls bob in two halves, and the coloured lights swing round.
    const bob = Math.sin(beat * Math.PI) * BOB_HEIGHT;
    if (firstHalf.current) firstHalf.current.position.y = Math.max(0, bob);
    if (secondHalf.current) secondHalf.current.position.y = Math.max(0, -bob);
    for (let i = 0; i < spots.current.length; i++) {
      const spot = spots.current[i];
      if (!spot) continue;
      const turn = seconds * 0.6 + (i * Math.PI * 2) / spots.current.length;
      spot.position.set(CLUB.floor.x + Math.cos(turn) * 3.2, 4.6, CLUB.floor.z + Math.sin(turn) * 3.2);
    }
  });

  // Leaving the club leaves nothing switched on.
  useEffect(() => () => onNear(null), [onNear]);

  const tile = CLUB.floor.tile;
  return (
    <>
      <color attach="background" args={[DARK]} />
      {/* Dim, with colour: enough light everywhere to see faces, and pools of colour over the floor. */}
      <ambientLight intensity={0.75} color="#b9a8ff" />
      <hemisphereLight args={["#8f7bd6", "#2a1b3d", 0.6]} />
      <directionalLight position={[CLUB.width / 2, 12, CLUB.depth + 6]} intensity={0.9} color="#ffd9f0" />
      {[NEON_PINK, NEON_BLUE, NEON_GOLD].map((colour, index) => (
        <pointLight
          key={colour}
          ref={(light: PointLight | null) => {
            spots.current[index] = light;
          }}
          color={colour}
          intensity={7}
          distance={14}
          decay={1}
        />
      ))}
      <pointLight position={[CLUB.bar.x + 1.5, 2.6, CLUB.bar.z]} color={NEON_GOLD} intensity={3} distance={9} decay={1} />
      <pointLight position={[22.5, 3, CLUB.booths[1].z]} color="#ff7ab8" intensity={3} distance={10} decay={1} />

      <mesh geometry={room}>
        <meshLambertMaterial vertexColors />
      </mesh>
      {/* Lasers, the lit ceiling, and whatever the spenders buy. */}
      <ClubShow width={CLUB.width} depth={CLUB.depth} height={CLUB.wallHeight} bar={{ x: CLUB.bar.x + 1.2, z: CLUB.bar.z }} dj={{ x: CLUB.dj.x, z: CLUB.dj.z }} />
      <mesh geometry={neon}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>

      {/* The dance floor: sixteen tiles, each its own light. */}
      {Array.from({ length: TILE_COUNT }, (_, index) => {
        const centre = tileCentre(index);
        return (
          <mesh
            key={index}
            ref={(mesh: Mesh | null) => {
              tiles.current[index] = mesh;
            }}
            position={[centre.x, 0.05, centre.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[tile - 0.08, tile - 0.08]} />
            <meshBasicMaterial color={TILE_COLOURS[index % TILE_COLOURS.length]} toneMapped={false} />
          </mesh>
        );
      })}

      {/* What the three screens show. */}
      {SCREENS.flatMap((screen, s) =>
        Array.from({ length: BARS }, (_, b) => {
          const width = (screen.halfX * 2 - 0.4) / BARS;
          const base = screen.y - screen.halfY + 0.15, full = screen.halfY * 2 - 0.3;
          return (
            <mesh
              key={`${s}-${b}`}
              ref={(mesh: Mesh | null) => {
                bars.current[s * BARS + b] = mesh;
                if (mesh) mesh.userData = { base, full };
              }}
              position={[screen.x - screen.halfX + 0.2 + width * (b + 0.5), base + full / 2, 0.15]}
            >
              <planeGeometry args={[width * 0.72, full]} />
              <meshBasicMaterial color={[NEON_PINK, NEON_BLUE, NEON_GOLD][(s + b) % 3]} toneMapped={false} />
            </mesh>
          );
        }),
      )}

      <group ref={firstHalf}>
        <mesh geometry={crowds[0]}>
          <meshLambertMaterial vertexColors />
        </mesh>
      </group>
      <group ref={secondHalf}>
        <mesh geometry={crowds[1]}>
          <meshLambertMaterial vertexColors />
        </mesh>
      </group>

      {REGULARS.map((regular, index) => (
        <Dancer key={index} x={regular.x} y={0} z={regular.z} rot={regular.rot} look={DANCERS[regular.look % DANCERS.length]} pose={dancing[index]} />
      ))}
      <Dancer x={CLUB.dj.x} y={CLUB.dj.stage} z={CLUB.dj.z - 0.45} rot={0} look={DJ} pose={mixing} />
      <group position={[CLUB.dj.x, CLUB.dj.stage, CLUB.dj.z - 0.45]}>
        <Html position={[0, 2.05, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
          <div className="nametag">DJ Osa</div>
        </Html>
      </group>

      <group position={[CLUB.bar.keeper.x, 0, CLUB.bar.keeper.z]} rotation={[0, Math.PI / 2, 0]}>
        <Character speedRef={still} look={STAFF} />
        <Html position={[0, 2.05, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
          <div className="nametag">Bar</div>
        </Html>
      </group>
      <group position={[CLUB.bouncer.x, clubFloorAt(CLUB.bouncer.x, CLUB.bouncer.z), CLUB.bouncer.z]} rotation={[0, -Math.PI / 2, 0]}>
        <Character speedRef={still} look={STAFF} />
        <Html position={[0, 2.05, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
          <div className="nametag">VIP</div>
        </Html>
      </group>
    </>
  );
}
