import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, type Group, type Mesh, type Texture } from "three";
import type { Look } from "../api/appearance";
import type { Home, Room } from "../api/home";
import { Car } from "./Car";
import { carParkSpots } from "./carPhysics";
import { Character } from "./Character";
import type { MeshData } from "./districtGeometry";
import { cameraView, playerFocus } from "./focus";
import { buildCam, buildInput, type BuildView } from "./homeBuild";
import { spotRect } from "./homeDecor";
import { buildFurniture, buildHouse, buildPiece, cutAway, looksOf } from "./homeGeometry";
import { CEILING_SEEN_BELOW, buildCeilings, buildFloors, buildGlow, roomLights } from "./homeLighting";
import { disposeMaterials, homeEnvironment, homeLights, homeMaterials } from "./homeLook";
import { fixtureRect, itemRect, stairTrigger, type FloorChange, type Rect } from "./homeLayout";
import { homeThings } from "./homeLife";
import { isDone, serverNow } from "./homeRooms";
import { nearestOf, type Near } from "./nearby";

const OUTSIDE = "#cfdcc6"; // the sky beyond the plot
const MARK = "#f4d27a";    // the patch of floor that shows which thing would be used
const PICK = "#6ab7ff";    // ... the piece picked out while building
const FITS = "#48bb78";    // ... where a piece would go, when it fits
const NO_FIT = "#d64545";  // ... and when it does not
const MARK_EDGE = 0.18;    // how far the patch reaches past the furniture, in metres
const MARK_HEIGHT = 0.045; // above the floor, and above a rug lying on it
const TAP_SLOP = 8;        // pixels a pointer may move and still count as a tap
const BLADE_SPEED = 9;     // radians a second for a ceiling fan

// The people who come with a hostel room. `look` on a fixture picks one of these.
const ROOMMATES: Look[] = [
  { body: "man", skin_tone: "#613a25", hair_color: "#17120f", top_color: "#d64545", bottom_color: "#2b3a55", shoe_color: "#ede6d6" },
  { body: "man", skin_tone: "#8d5a3b", hair_color: "#17120f", top_color: "#ede6d6", bottom_color: "#3a3d42", shoe_color: "#1d1d1f" },
  { body: "man", skin_tone: "#4b2c1c", hair_color: "#17120f", top_color: "#2f9e54", bottom_color: "#5d4a39", shoe_color: "#1d1d1f" },
];
// A bricklayer in a hi-vis vest, on every building site.
const WORKER: Look = { body: "man", skin_tone: "#5a3622", hair_color: "#17120f", top_color: "#f08a1c", bottom_color: "#3a3d42", shoe_color: "#3b2a20" };

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setAttribute("uv", new BufferAttribute(mesh.uvs, 2));   // the light patches (homeLighting) read it
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Which of eight ways round the camera is: walls are cut away again only when this changes. */
function eighth(yaw: number): number {
  return ((Math.round(yaw / (Math.PI / 4)) % 8) + 8) % 8;
}

/** The blades of a ceiling fan, turning. */
function FanBlades({ x, z }: { x: number; z: number }) {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += Math.min(delta, 0.1) * BLADE_SPEED;
  });
  return (
    <group ref={ref} position={[x, 2.4, z]}>
      {[0, 1, 2, 3].map((blade) => (
        <mesh key={blade} rotation={[0, (blade * Math.PI) / 2, 0]} position={[Math.sin((blade * Math.PI) / 2) * 0.36, 0, Math.cos((blade * Math.PI) / 2) * 0.36]}>
          <boxGeometry args={[0.13, 0.015, 0.62]} />
          <meshLambertMaterial color="#5b3d28" />
        </mesh>
      ))}
    </group>
  );
}

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
  /** Set while building: walls down, the grid, and what is being put down or picked out. */
  build?: BuildView | null;
  /** The player's cars ("model|colour|plate"), parked beside the house. */
  cars?: string[];
};

/** A player's house: one floor of it, with its furniture, whoever lives there too, and any room being built. */
export function HomeScene({ home, floor, onStairs, usable, onNear, build = null, cars = [] }: Props) {
  const { plan, items, catalogue } = home;
  const building = build !== null;
  const cell = plan.cell;

  // Which way the camera looks from, a few times a second: walls between it and the house are cut down.
  const [view, setView] = useState(() => eighth(building ? buildCam.yaw : cameraView.yaw));
  // Rooms being built change as the workers go: redraw them every couple of seconds while any are.
  const [tick, setTick] = useState(0);
  const anyBuilding = home.rooms.some((room) => !isDone(room));
  useEffect(() => {
    if (!anyBuilding) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 2000);
    return () => window.clearInterval(timer);
  }, [anyBuilding]);

  const rooms: Room[] = useMemo(() => {
    const preview = build?.preview;
    if (!preview) return home.rooms;
    return home.rooms.map((room) => (room.id === preview.roomId ? { ...room, wall: preview.wall ?? room.wall, ground: preview.ground ?? room.ground } : room));
  }, [home.rooms, build?.preview]);
  const look = useMemo(() => looksOf(home.paints, home.finishes), [home.paints, home.finishes]);

  const house = useMemo(() => {
    const angle = (view * Math.PI) / 4;
    return toGeometry(buildHouse(plan, rooms, floor, look, { low: building, dirX: Math.sin(angle), dirZ: Math.cos(angle) }, { grid: building, now: serverNow(), floors: false }));
    // `tick` redraws a building site as it goes up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, rooms, floor, look, view, building, tick]);
  // The floors, each sheen apart (polished stone shines, carpet does not), the ceilings, and the
  // light falling on everything: homeLighting.ts.
  const floors = useMemo(() => {
    const built = buildFloors(plan, rooms, floor, look.finishes, serverNow());
    return { polished: toGeometry(built.polished), satin: toGeometry(built.satin), matte: toGeometry(built.matte) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, rooms, floor, look, tick]);
  const ceilings = useMemo(() => {
    const angle = (view * Math.PI) / 4;
    return toGeometry(buildCeilings(plan, rooms, floor, { low: building, dirX: Math.sin(angle), dirZ: Math.cos(angle) }, serverNow()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, rooms, floor, view, building, tick]);
  const glow = useMemo(() => {
    const angle = (view * Math.PI) / 4;
    const wallView = { low: building, dirX: Math.sin(angle), dirZ: Math.cos(angle) };
    return toGeometry(buildGlow(plan, rooms, floor, wallView, items, catalogue, cutAway, serverNow(), (wall) => look.paints.get(wall)?.hex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, rooms, floor, look, view, building, items, catalogue, tick]);
  useEffect(() => () => Object.values(floors).forEach((geometry) => geometry.dispose()), [floors]);
  useEffect(() => () => ceilings.dispose(), [ceilings]);
  useEffect(() => () => glow.dispose(), [glow]);

  // What everything is made of, how it is lit, and what shiny things reflect: homeLook.ts.
  const materials = useMemo(() => homeMaterials(), []);
  useEffect(() => () => disposeMaterials(materials), [materials]);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const environment: Texture = homeEnvironment(gl);
    const before = scene.environment;
    scene.environment = environment;
    return () => {
      scene.environment = before;
      environment.dispose();
    };
  }, [gl, scene]);
  const lights = useMemo(() => {
    const width = Math.max(...plan.floors.map((entry) => entry.w)) * cell, depth = Math.max(...plan.floors.map((entry) => entry.d)) * cell;
    return homeLights(roomLights(plan, rooms, floor), { x: width / 2, z: depth / 2 });
  }, [plan, rooms, floor, cell]);
  // Ceilings only from under them: from above, the house is seen into, as a doll's house is.
  const ceilingRef = useRef<Mesh>(null);
  const furniture = useMemo(
    () => toGeometry(buildFurniture(plan, floor, items, catalogue, build?.moving ?? null)),
    [plan, floor, items, catalogue, build?.moving],
  );
  useEffect(() => () => house.dispose(), [house]);
  useEffect(() => () => furniture.dispose(), [furniture]);

  const ghost = build?.ghost ?? null;
  const ghostMesh = useMemo(() => (ghost ? toGeometry(buildPiece(plan, ghost.option, ghost.spot)) : null), [plan, ghost]);
  useEffect(() => () => ghostMesh?.dispose(), [ghostMesh]);

  // Everything on this floor that can be used, worked out once per change to the house.
  const things = useMemo(() => homeThings(plan, floor, items, catalogue, usable), [plan, floor, items, catalogue, usable]);
  const people = floor === 0 ? (plan.fixtures ?? []).filter((fixture) => fixture.kind === "person") : [];
  const fans = items.filter((item) => item.floor === floor && item.item === "ceiling_fan" && item.id !== build?.moving);
  const sites = rooms.filter((room) => room.floor === floor && !isDone(room));
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

  useFrame(({ camera }) => {
    if (ceilingRef.current) ceilingRef.current.visible = camera.position.y < CEILING_SEEN_BELOW;
    const turned = eighth(building ? buildCam.yaw : cameraView.yaw);
    if (turned !== view) setView(turned);

    const at = building ? null : nearestOf(things, playerFocus.x, playerFocus.z);
    if (at !== nearNow.current) {
      nearNow.current = at;
      setNear(at);
      onNear(at);
    }
    if (climbed.current || building) return; // nobody carries a wardrobe up the stairs by accident
    const change = stairTrigger(plan, floor, playerFocus.x, playerFocus.z);
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
    [onNear],
  );

  // A tap while building: the point on the floor (or on a piece of furniture) under it.
  const tap = (event: ThreeEvent<MouseEvent>) => {
    if (!building || event.delta > TAP_SLOP) return;
    event.stopPropagation();
    buildInput.onTap?.(event.point.x, event.point.z);
  };

  // The patches of light on the floor.
  const marks: { rect: Rect; colour: string; opacity: number }[] = [];
  if (ghost) marks.push({ rect: spotRect(plan, ghost.option, ghost.spot), colour: ghost.ok ? FITS : NO_FIT, opacity: 0.55 });
  if (build?.selected != null && !ghost) {
    const item = items.find((entry) => entry.id === build.selected);
    const option = item ? catalogue.find((entry) => entry.id === item.item) : undefined;
    if (item && option) marks.push({ rect: itemRect(plan, option, item), colour: PICK, opacity: 0.6 });
  }
  if (build?.room) {
    const { shape, ok } = build.room;
    marks.push({ rect: { cx: (shape.x + shape.w / 2) * cell, cz: (shape.z + shape.d / 2) * cell, halfX: (shape.w * cell) / 2 - MARK_EDGE, halfZ: (shape.d * cell) / 2 - MARK_EDGE }, colour: ok ? FITS : NO_FIT, opacity: 0.45 });
  }
  if (build?.selectedRoom != null) {
    const room = rooms.find((entry) => entry.id === build.selectedRoom);
    if (room) marks.push({ rect: { cx: (room.x + room.w / 2) * cell, cz: (room.z + room.d / 2) * cell, halfX: (room.w * cell) / 2 - MARK_EDGE, halfZ: (room.d * cell) / 2 - MARK_EDGE }, colour: MARK, opacity: 0.22 });
  }
  if (!building && near) marks.push({ rect: { cx: near.x, cz: near.z, halfX: near.halfX, halfZ: near.halfZ }, colour: MARK, opacity: 0.55 });

  const lot = plan.lot;
  const lotRect = lot
    ? { cx: ((lot.min_x + lot.max_x) / 2) * cell, cz: ((lot.min_z + lot.max_z) / 2) * cell, w: (lot.max_x - lot.min_x) * cell + 20, d: (lot.max_z - lot.min_z) * cell + 20 }
    : { cx: 5, cz: 5, w: 40, d: 40 };

  return (
    <>
      <color attach="background" args={[OUTSIDE]} />
      {/* Warm downlights, low ambient, a key light for shadows (homeLook.ts). While building,
          more light everywhere, so every piece can be seen and placed. */}
      <primitive object={lights} />
      {building && <ambientLight intensity={0.9} />}

      <mesh geometry={house} material={materials.walls} receiveShadow onClick={tap} />
      <mesh geometry={floors.polished} material={materials.floors.polished} receiveShadow onClick={tap} />
      <mesh geometry={floors.satin} material={materials.floors.satin} receiveShadow onClick={tap} />
      <mesh geometry={floors.matte} material={materials.floors.matte} receiveShadow onClick={tap} />
      <mesh ref={ceilingRef} geometry={ceilings} material={materials.walls} />
      <mesh geometry={furniture} material={materials.furniture} castShadow receiveShadow onClick={tap} />
      <mesh geometry={glow} material={materials.glow} renderOrder={1} />
      {building && (
        // An invisible floor over the whole plot, so a tap anywhere lands somewhere.
        <mesh position={[lotRect.cx, -0.01, lotRect.cz]} rotation={[-Math.PI / 2, 0, 0]} onClick={tap}>
          <planeGeometry args={[lotRect.w, lotRect.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {fans.map((item) => {
        const option = catalogue.find((entry) => entry.id === item.item);
        if (!option) return null;
        const rect = itemRect(plan, option, item);
        return <FanBlades key={item.id} x={rect.cx} z={rect.cz} />;
      })}

      {ghostMesh && (
        <mesh geometry={ghostMesh} renderOrder={2}>
          <meshLambertMaterial color={ghost?.ok ? "#9ff0bd" : "#ff9a8f"} transparent opacity={0.72} depthWrite={false} />
        </mesh>
      )}

      {people.map((fixture) => {
        const rect = fixtureRect(plan, fixture);
        return (
          <group key={fixture.id} position={[rect.cx, 0, rect.cz]} rotation={[0, (fixture.rot * Math.PI) / 2, 0]}>
            <Character speedRef={still} look={ROOMMATES[fixture.look % ROOMMATES.length]} />
            <Html position={[0, 2.05, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
              <div className="nametag">{fixture.name}</div>
            </Html>
          </group>
        );
      })}

      {/* The car park: paving to the left of the house, and the player's cars on it. */}
      {floor === 0 && plan.buildable && cars.length > 0 && (() => {
        const spots = carParkSpots(plan.lot, cell, cars.length, home.rooms);
        if (spots.length === 0) return null;
        const last = spots[spots.length - 1];
        return (
          <>
            <mesh rotation-x={-Math.PI / 2} position={[last.x, 0.012, (spots[0].z + last.z) / 2]} receiveShadow>
              <planeGeometry args={[6.2, last.z - spots[0].z + 3.4]} />
              <meshLambertMaterial color="#8d8a84" />
            </mesh>
            {spots.map((spot, i) => (
              <group key={cars[i]} position={[spot.x, 0, spot.z]} rotation-y={spot.rot}>
                <Car look={cars[i]} shadow={false} />
              </group>
            ))}
          </>
        );
      })()}

      {/* A bricklayer at every room going up, looking at it, with a sign of how far along it is. */}
      {sites.map((room) => (
        <group key={room.id} position={[(room.x + room.w / 2) * cell, 0, (room.z + room.d) * cell + 0.9]} rotation={[0, Math.PI, 0]}>
          <Character speedRef={still} look={WORKER} />
          <Html position={[0, 2.2, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
            <div className="nametag site-tag">{room.name} · building</div>
          </Html>
        </group>
      ))}

      {marks.map(({ rect, colour, opacity }, index) => (
        <mesh key={index} position={[rect.cx, MARK_HEIGHT + index * 0.002, rect.cz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[(rect.halfX + MARK_EDGE) * 2, (rect.halfZ + MARK_EDGE) * 2]} />
          <meshBasicMaterial color={colour} transparent opacity={opacity} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}
