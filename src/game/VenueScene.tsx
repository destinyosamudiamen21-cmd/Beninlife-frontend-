import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Object3D,
  SRGBColorSpace,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
  type PointLight,
  type SpotLight,
} from "three";
import { Animals } from "./Animals";
import { Car } from "./Car";
import { Character } from "./Character";
import { ClubShow } from "./ClubShow";
import { HauntExtras } from "./HauntExtras";
import type { MeshData } from "./districtGeometry";
import { fightClock, newPose, stepSpeed, danceTurn, strike, type FightPose } from "./fightMoves";
import { playerFocus } from "./focus";
import { nearestOf, type Near } from "./nearby";
import type { NetPlayer } from "./types";
import { buildVenue } from "./venueShapes";
import { nearestSpecial, scareAt, venueThings, type Person, type Scare, type ShowCar, type Sign, type Special, type VenueLayout } from "./venues";

const TURNTABLE_SPEED = 0.18;   // radians a second: once round in about half a minute

/** A car on show. The flagship turns slowly on its stand. */
function ShowCarModel({ car, colour }: { car: ShowCar; colour: string }) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (car.turntable && group.current) group.current.rotation.y += delta * TURNTABLE_SPEED;
  });
  return (
    <group ref={group} position={[car.x, car.turntable ? 0.12 : 0.05, car.z]} rotation-y={car.rot}>
      <Car look={`${car.model}|${colour}|BEN 000 AM`} />
    </group>
  );
}

const BEATS_PER_SECOND = 2;
const GHOST_SECONDS = 1.6;   // how long a ghost stands there before it is gone

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Words on a board, drawn once onto a canvas. */
function SignBoard({ sign }: { sign: Sign }) {
  const made = useMemo(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    const font = 64;
    context.font = `800 ${font}px system-ui, sans-serif`;
    const textWidth = context.measureText(sign.text).width;
    canvas.width = Math.ceil(textWidth + font * 0.8);
    canvas.height = Math.ceil(font * 1.45);
    if (sign.back) {
      context.fillStyle = sign.back;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.font = `800 ${font}px system-ui, sans-serif`;
    context.fillStyle = sign.colour;
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.fillText(sign.text, canvas.width / 2, canvas.height / 2 + 2);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return { texture, aspect: canvas.width / canvas.height };
  }, [sign.text, sign.colour, sign.back]);
  useEffect(() => () => made.texture.dispose(), [made]);

  const height = sign.size * 1.45;
  const turn = sign.face === "left" ? Math.PI / 2 : sign.face === "right" ? -Math.PI / 2 : 0;
  return (
    <mesh position={[sign.x, sign.y, sign.z]} rotation-y={turn}>
      <planeGeometry args={[height * made.aspect, height]} />
      <meshBasicMaterial map={made.texture} transparent={!sign.back} toneMapped={false} side={DoubleSide} />
    </mesh>
  );
}

/** Someone who is always there: standing, sitting or dancing in one place. */
function Regular({ person, delay, hidden }: { person: Person; delay: number; hidden?: boolean }) {
  const body = useRef<Group>(null);
  const speed = useRef(0);
  const pose = useMemo<FightPose | null>(() => {
    if (!person.move) return null;
    const made = newPose();
    strike(made, person.move);
    made.started -= delay;
    return made;
  }, [person.move, delay]);
  useFrame(() => {
    if (!body.current || !pose) return;
    body.current.rotation.y = person.rot + danceTurn(pose.move, fightClock() - pose.started);
    speed.current = stepSpeed(pose.move);
  });
  return (
    <group ref={body} position={[person.x, 0, person.z]} rotation-y={person.rot} visible={!hidden}>
      <Character speedRef={speed} look={person.look} fight={pose} />
    </group>
  );
}

/** Fish in a tank: small bright shapes swimming to and fro. */
function Fish({ tanks }: { tanks: NonNullable<VenueLayout["fish"]> }) {
  const mesh = useRef<InstancedMesh>(null);
  const fish = useMemo(() => {
    const list: { tank: number; phase: number; speed: number; y: number; colour: Color }[] = [];
    const colours = ["#ff7a59", "#ffe600", "#4fb2e8", "#ff2d95", "#7dff3a", "#ffffff", "#ff9f1a"];
    tanks.forEach((tank, t) => {
      for (let i = 0; i < tank.count; i++) {
        list.push({ tank: t, phase: (i * 1.37) % (Math.PI * 2), speed: 0.15 + ((i * 7) % 5) * 0.05, y: tank.y0 + ((i * 0.618) % 1) * (tank.y1 - tank.y0), colour: new Color(colours[(i + t) % colours.length]) });
      }
    });
    return list;
  }, [tanks]);
  const placer = useMemo(() => new Object3D(), []);
  useEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    fish.forEach((one, index) => instanced.setColorAt(index, one.colour));
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [fish]);
  useFrame(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const time = fightClock();
    fish.forEach((one, index) => {
      const tank = tanks[one.tank];
      const across = tank.maxX - tank.minX > 1.5;
      const swing = Math.sin(time * one.speed + one.phase);
      const along = 0.5 + 0.5 * swing;
      if (across) placer.position.set(tank.minX + along * (tank.maxX - tank.minX), one.y + 0.15 * Math.sin(time + index), tank.z + Math.sin(index) * 0.1);
      else placer.position.set((tank.minX + tank.maxX) / 2, one.y + 0.15 * Math.sin(time + index), tank.z - 12.5 + along * 25);
      placer.rotation.set(0, across ? (Math.cos(time * one.speed + one.phase) > 0 ? 0 : Math.PI) : (Math.cos(time * one.speed + one.phase) > 0 ? -Math.PI / 2 : Math.PI / 2), 0);
      placer.updateMatrix();
      instanced.setMatrixAt(index, placer.matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, fish.length]} frustumCulled={false}>
      <boxGeometry args={[0.28, 0.12, 0.05]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

type Props = {
  layout: VenueLayout;
  /** Where the other players in the room are. Read every frame, for the lit tiles under their feet. */
  playersRef: { current: Map<string, NetPlayer> };
  /** The thing the player is standing at that the server deals with. Called only when it changes. */
  onNear: (thing: Near | null) => void;
  /** The thing the player is standing at that opens a panel: a shop, the boutique, a story. */
  onSpecial: (special: Special | null) => void;
  /** At the dealership: the colour a car on show has been changed to, by model. */
  carColours?: Record<string, string>;
  /** In the haunted house: the player walked into a scare. */
  onScare?: (scare: Scare) => void;
};

/** The inside of one of the rooms in venues.ts. */
export function VenueScene({ layout, playersRef, onNear, onSpecial, onScare, carColours }: Props) {
  const meshes = useMemo(() => {
    const built = buildVenue(layout);
    return { solid: toGeometry(built.solid), glow: toGeometry(built.glow), glass: toGeometry(built.glass) };
  }, [layout]);
  useEffect(() => () => Object.values(meshes).forEach((geometry) => geometry.dispose()), [meshes]);
  const things = useMemo(() => venueThings(layout), [layout]);

  const near = useRef<Near | null>(null);
  const special = useRef<Special | null>(null);
  const seen = useRef(new Set<string>());
  const tell = useRef({ onNear, onSpecial, onScare });
  useEffect(() => {
    tell.current = { onNear, onSpecial, onScare };
  });

  // The haunted house: the ghost, where it stands and until when; the torch; the lights going out.
  const [ghost, setGhost] = useState<{ x: number; z: number; rot: number; key: number } | null>(null);
  const ghostUntil = useRef(0);
  const darkUntil = useRef(0);
  const torch = useRef<SpotLight>(null);
  const torchTarget = useMemo(() => new Object3D(), []);
  const candles = useRef<PointLight>(null);

  // The dance floor and the cinema screen.
  const tiles = useRef<(Mesh | null)[]>([]);
  const screen = useRef<Mesh>(null);
  const palette = useMemo(() => (layout.danceFloor?.colours ?? ["#ffffff"]).map((hex) => new Color(hex)), [layout]);
  const white = useMemo(() => new Color("#ffffff"), []);

  useFrame(() => {
    const x = playerFocus.x, z = playerFocus.z;
    const at = nearestOf(things, x, z);
    if (at !== near.current) {
      near.current = at;
      tell.current.onNear(at);
    }
    const panel = nearestSpecial(layout, x, z);
    if (panel !== special.current) {
      special.current = panel;
      tell.current.onSpecial(panel);
    }

    const now = performance.now();
    if (layout.scares) {
      const scare = scareAt(layout, x, z, seen.current);
      if (scare) {
        seen.current.add(scare.id);
        if (scare.kind === "ghost" && scare.ghost) {
          setGhost({ ...scare.ghost, key: now });
          ghostUntil.current = now + GHOST_SECONDS * 1000;
        }
        if (scare.kind === "lights" || scare.kind === "face") darkUntil.current = now + 1800;
        tell.current.onScare?.(scare);
      }
      if (ghostUntil.current && now > ghostUntil.current) {
        ghostUntil.current = 0;
        setGhost(null);
      }
      // The torch follows the player and points the way they face; it flickers, and goes out when the lights do.
      if (torch.current) {
        const dark = now < darkUntil.current;
        const flicker = Math.sin(now * 0.03) > 0.97 || Math.sin(now * 0.0071) > 0.995 ? 0.25 : 1;
        torch.current.intensity = dark ? (Math.sin(now * 0.05) > 0.8 ? 6 : 0) : 26 * flicker;
        torch.current.position.set(x, 2.1, z + 0.6);
        torchTarget.position.set(x, 0, z - 4);
        torchTarget.updateMatrixWorld();
      }
      if (candles.current) candles.current.intensity = now < darkUntil.current ? 0 : 2.2 + Math.sin(now * 0.013) * 0.5;
    }

    const seconds = fightClock();
    const floor = layout.danceFloor;
    if (floor) {
      const beat = seconds * BEATS_PER_SECOND;
      const step = Math.floor(beat);
      const pulse = 1 - (beat - step);
      const half = (floor.tile * floor.tiles) / 2;
      const stood = new Set<number>();
      const mark = (px: number, pz: number) => {
        const column = Math.floor((px - (floor.x - half)) / floor.tile), row = Math.floor((pz - (floor.z - half)) / floor.tile);
        if (column >= 0 && row >= 0 && column < floor.tiles && row < floor.tiles) stood.add(row * floor.tiles + column);
      };
      mark(x, z);
      for (const other of playersRef.current.values()) mark(other.x, other.z);
      for (let i = 0; i < tiles.current.length; i++) {
        const tile = tiles.current[i];
        if (!tile) continue;
        const column = i % floor.tiles, row = Math.floor(i / floor.tiles);
        const colour = (column + row + step + Math.floor(step / 8)) % palette.length;
        const material = tile.material as MeshBasicMaterial;
        if (stood.has(i)) material.color.copy(white);
        else material.color.copy(palette[colour]).multiplyScalar(0.45 + 0.4 * pulse);
      }
    }
    if (screen.current) {
      // The film: slow changes of colour and brightness, as a film throws on a wall.
      const material = screen.current.material as MeshBasicMaterial;
      const shot = Math.floor(seconds / 3.2);
      const hues = ["#7fb2e8", "#e8b27f", "#a8e87f", "#e87fa8", "#e8e8e8", "#7fe8d4"];
      material.color.set(hues[shot % hues.length]).multiplyScalar(0.55 + 0.25 * Math.sin(seconds * 2.3) * Math.sin(seconds * 0.7));
    }
  });

  // Leaving the room leaves nothing switched on.
  useEffect(
    () => () => {
      tell.current.onNear(null);
      tell.current.onSpecial(null);
    },
    [],
  );

  const { width, depth, lighting } = layout;
  const ghostPerson = layout.people.find((person) => person.ghost);
  const floor = layout.danceFloor;
  return (
    <>
      <color attach="background" args={[layout.sky]} />
      {lighting === "showroom" && (
        <>
          <hemisphereLight args={["#ffffff", "#b9b6ae", 1.0]} />
          <directionalLight position={[width / 2, 16, depth + 6]} intensity={1.0} castShadow />
          {/* Three lights, not one per car: every light makes every shiny surface cost more on a phone. */}
          {[[width * 0.2, depth * 0.4, 30], [width / 2, depth / 2, 34], [width * 0.8, depth * 0.4, 30]].map(([x, z, power]) => (
            <pointLight key={x} position={[x, 5.0, z]} intensity={power} distance={22} decay={1.2} color="#fff8ee" />
          ))}
        </>
      )}
      {lighting === "bright" && (
        <>
          <hemisphereLight args={["#ffffff", "#8a8070", 1.25]} />
          <directionalLight position={[width / 2, 14, depth + 8]} intensity={1.4} />
        </>
      )}
      {lighting === "dining" && (
        <>
          <hemisphereLight args={["#fff0d6", "#2a1d14", 1.05]} />
          <directionalLight position={[width / 2, 12, depth + 6]} intensity={0.9} color="#ffe6c4" />
          {/* Two warm lights: the dining room, and the pass. A phone pays for every light. */}
          <pointLight position={[width / 2, 3.4, depth * 0.6]} intensity={9} distance={20} decay={1.1} color="#ffd59a" />
          <pointLight position={[width / 2, 2.6, 2.2]} intensity={6} distance={12} decay={1.2} color="#fff1d0" />
        </>
      )}
      {lighting === "warm" && (
        <>
          <hemisphereLight args={["#ffe2b8", "#3a2a1a", 0.9]} />
          <directionalLight position={[width / 2, 10, depth + 6]} intensity={0.8} color="#ffd9a8" />
          <pointLight position={[width / 2, 3.2, depth / 2]} intensity={6} distance={18} decay={1} color="#ffc27a" />
        </>
      )}
      {lighting === "club" && (
        <>
          <ambientLight intensity={0.7} color="#b9a8ff" />
          <hemisphereLight args={["#8f7bd6", "#2a1b3d", 0.55]} />
          <directionalLight position={[width / 2, 12, depth + 6]} intensity={0.8} color="#ffd9f0" />
          <pointLight position={[width / 2, 4.6, depth * 0.43]} intensity={8} distance={14} decay={1} color={layout.trim} />
        </>
      )}
      {lighting === "cinema" && (
        <>
          <ambientLight intensity={0.45} color="#c9a8b0" />
          <directionalLight position={[width / 2, 10, depth + 6]} intensity={0.7} color="#ffe2c8" />
          <pointLight position={[width / 2, 3, 2]} intensity={5} distance={14} decay={1} color="#b8d4ff" />
          <pointLight position={[width / 2, 3.5, depth - 4]} intensity={5} distance={14} decay={1} color="#ffd9a8" />
        </>
      )}
      {lighting === "aqua" && (
        <>
          <ambientLight intensity={0.6} color="#4f9ad8" />
          <hemisphereLight args={["#6fc2ff", "#0b1c2c", 0.7]} />
          <pointLight position={[width / 2, 3, depth / 2]} intensity={8} distance={22} decay={1} color="#5ab8e8" />
        </>
      )}
      {lighting === "day" && (
        <>
          <hemisphereLight args={["#dff0ff", "#5a7a3a", 1.1]} />
          <directionalLight position={[width * 0.8, 40, depth + 30]} intensity={1.8} color="#fff3df" />
        </>
      )}
      {lighting === "night" && (
        <>
          <ambientLight intensity={0.35} color="#7f8fc9" />
          <hemisphereLight args={["#4a5a9a", "#1a1a20", 0.6]} />
          {Array.from({ length: Math.ceil(width / 18) }, (_, i) => (
            <pointLight key={i} position={[10 + i * 18, 6.4, depth / 2]} intensity={7} distance={16} decay={1} color="#ffd27a" />
          ))}
          <pointLight position={[60, 1.4, 15.6]} intensity={4} distance={6} decay={1} color="#ff6a1a" />
        </>
      )}
      {lighting === "dark" && (
        <>
          <ambientLight intensity={0.06} color="#5a6a8a" />
          <pointLight ref={candles} position={[13, 1.6, 15]} intensity={2.2} distance={10} decay={1.2} color="#ffb347" />
          <primitive object={torchTarget} />
          <spotLight ref={torch} angle={0.5} penumbra={0.6} distance={14} decay={1.2} intensity={26} color="#fff1cf" target={torchTarget} />
        </>
      )}
      {layout.mist ? (
        <fog attach="fog" args={[layout.mist.colour, layout.mist.near, layout.mist.far]} />
      ) : (
        (lighting === "dark" || lighting === "night") && <fog attach="fog" args={[layout.sky, lighting === "dark" ? 6 : 40, lighting === "dark" ? 22 : 260]} />
      )}
      {lighting === "dark" && <HauntExtras />}

      <mesh geometry={meshes.solid} receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh geometry={meshes.glow}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      <mesh geometry={meshes.glass}>
        <meshLambertMaterial vertexColors transparent opacity={0.22} depthWrite={false} side={DoubleSide} />
      </mesh>
      {layout.kind === "club" && (
        <ClubShow
          width={width}
          depth={depth}
          height={layout.wallHeight}
          bar={(() => {
            const bar = layout.things.find((thing) => thing.spot.endsWith("_bar"));
            return bar ? { x: bar.x + 1.2, z: bar.z } : { x: 3, z: depth / 2 };
          })()}
          dj={(() => {
            const dj = layout.things.find((thing) => thing.spot.endsWith("_dj"));
            return dj ? { x: dj.x, z: dj.z } : { x: width / 2, z: 1.5 };
          })()}
        />
      )}

      {floor &&
        Array.from({ length: floor.tiles * floor.tiles }, (_, i) => {
          const half = (floor.tile * floor.tiles) / 2;
          const column = i % floor.tiles, row = Math.floor(i / floor.tiles);
          return (
            <mesh
              key={i}
              ref={(mesh: Mesh | null) => {
                tiles.current[i] = mesh;
              }}
              position={[floor.x - half + (column + 0.5) * floor.tile, 0.03, floor.z - half + (row + 0.5) * floor.tile]}
              rotation-x={-Math.PI / 2}
            >
              <planeGeometry args={[floor.tile * 0.94, floor.tile * 0.94]} />
              <meshBasicMaterial toneMapped={false} />
            </mesh>
          );
        })}

      {layout.screen && (
        <mesh ref={screen} position={[layout.screen.x, layout.screen.y, layout.screen.z]}>
          <planeGeometry args={[layout.screen.hx * 2, layout.screen.hy * 2]} />
          <meshBasicMaterial toneMapped={false} />
        </mesh>
      )}
      {layout.fish && <Fish tanks={layout.fish} />}
      {layout.cars?.map((car) => (
        <ShowCarModel key={car.model} car={car} colour={carColours?.[car.model] ?? car.colour} />
      ))}
      {layout.animals && <Animals herds={layout.animals} />}

      {layout.signs.map((sign) => (
        <SignBoard key={`${sign.text}:${sign.x}:${sign.z}`} sign={sign} />
      ))}
      {layout.people
        .filter((person) => !person.ghost)
        .map((person, index) => (
          <Regular key={`${layout.id}:${index}`} person={person} delay={index * 0.37} />
        ))}
      {ghostPerson && ghost && (
        <group key={ghost.key} position={[ghost.x, 0.15, ghost.z]} rotation-y={ghost.rot}>
          <Regular person={{ ...ghostPerson, x: 0, z: 0, rot: 0 }} delay={0} />
          <pointLight position={[0, 1.6, 0.6]} intensity={5} distance={5} color="#cfe8ff" />
        </group>
      )}
    </>
  );
}
