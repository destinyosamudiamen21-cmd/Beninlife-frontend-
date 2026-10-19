import { Component, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, type InstancedMesh } from "three";
import type { MeshData } from "./districtGeometry";
import { cameraView, playerFocus, playerStreet } from "./focus";
import { cameraInput } from "./input";
import type { Crowd } from "./npcs";
import {
  drawnInFull,
  peopleColours,
  stepStreetLife,
  vehicleColours,
  writeStanding,
  writeVehicles,
  writeWalkers,
  type ClearView,
  type PeopleSlots,
  type StreetLife,
} from "./streetLife";
import { buildPersonShapes, buildVehicleShape } from "./streetProps";

const MAX_STEP = 0.1; // cap a frozen tab's catch-up
const CAMERA_DISTANCE = 5.2; // how far behind the player the camera sits at zoom 1: the same number as in LocalPlayer.tsx
const VEHICLE_KINDS = [0, 1, 2, 3];

type MeshRef = { current: InstancedMesh | null };

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The numbers that say where each copy of a shape is. The crowd code writes straight into them. */
function slotsOf(mesh: InstancedMesh): Float32Array {
  return mesh.instanceMatrix.array as Float32Array;
}

type ManyProps = {
  meshRef: MeshRef;
  geometry: BufferGeometry;
  count: number;
  /** Red, green and blue from 0 to 1 for each copy. */
  colours: Float32Array;
  shadow?: boolean;
};

/** One shape drawn `count` times in a single call, each copy with its own colour. */
function Many({ meshRef, geometry, count, colours, shadow = false }: ManyProps) {
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const tint = new Color();
    for (let i = 0; i < count; i++) {
      mesh.setColorAt(i, tint.setRGB(colours[i * 3], colours[i * 3 + 1], colours[i * 3 + 2]));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage); // these move every frame
  }, [meshRef, count, colours]);

  if (count === 0) return null;
  // The copies are spread all over the district, so the engine must not try to skip the
  // whole lot because one of them is off screen.
  return (
    <instancedMesh key={count} ref={meshRef} args={[geometry, undefined, count]} frustumCulled={false} castShadow={shadow} receiveShadow>
      <meshLambertMaterial vertexColors />
    </instancedMesh>
  );
}

type Props = {
  /** The walkers and vehicles of this district. */
  life: StreetLife;
  /** The sellers and touts. Those not drawn as full characters are drawn here, simply. */
  crowd: Crowd | null;
};

/**
 * Everyone and everything that makes the street busy: the walking crowd, a seller at
 * every stall, and the traffic. A person here is five boxes, and all of them are drawn in
 * a handful of calls, which is how there can be a thousand on screen.
 * The behaviour lives in streetLife.ts; this only steps it once a frame and shows the result.
 */
function Street({ life, crowd }: Props) {
  const shapes = useMemo(() => {
    const person = buildPersonShapes();
    return {
      body: toGeometry(person.body),
      head: toGeometry(person.head),
      leg: toGeometry(person.leg),
      arm: toGeometry(person.arm),
      load: toGeometry(person.load),
      vehicles: VEHICLE_KINDS.map((kind) => toGeometry(buildVehicleShape(kind))),
    };
  }, []);
  useEffect(
    () => () => {
      for (const geometry of [shapes.body, shapes.head, shapes.leg, shapes.arm, shapes.load, ...shapes.vehicles]) geometry.dispose();
    },
    [shapes],
  );

  const standing = useMemo(() => (crowd ? [...crowd.sellers, ...crowd.touts] : []), [crowd]);
  const sellers = crowd ? crowd.sellers.length : 0;
  const walkers = life.walkers.length;
  const people = walkers + standing.length;
  const colours = useMemo(() => peopleColours(life, standing), [life, standing]);
  const paints = useMemo(() => VEHICLE_KINDS.map((kind) => vehicleColours(life, kind)), [life]);

  const body = useRef<InstancedMesh>(null);
  const head = useRef<InstancedMesh>(null);
  const legs = useRef<InstancedMesh>(null);
  const arms = useRef<InstancedMesh>(null);
  const loads = useRef<InstancedMesh>(null);
  const buses = useRef<InstancedMesh>(null);
  const kekes = useRef<InstancedMesh>(null);
  const cars = useRef<InstancedMesh>(null);
  const cityBuses = useRef<InstancedMesh>(null);
  const vehicleRefs: MeshRef[] = [buses, kekes, cars, cityBuses];

  // Sellers do not move, so they are only placed again when the set of people drawn as
  // full characters changes. -1 means "place them now".
  const placedFor = useRef(-1);
  const clear = useRef<ClearView>({ x: 0, z: 0, ux: 0, uz: 1, near: 0.9, far: 0 });
  useLayoutEffect(() => {
    placedFor.current = -1;
  }, [standing, people]);

  const show = () => {
    const b = body.current, h = head.current, l = legs.current, a = arms.current, o = loads.current;
    if (b && h && l && a && o) {
      const slots: PeopleSlots = { body: slotsOf(b), head: slotsOf(h), legs: slotsOf(l), arms: slotsOf(a), loads: slotsOf(o) };
      // The camera looks at the player from whichever side it has been swung to. Walkers
      // in the gap between the two are not drawn. (Not when the player is up on a bridge:
      // the walkers are down below.)
      clear.current.x = playerFocus.x;
      clear.current.z = playerFocus.z;
      clear.current.ux = Math.sin(cameraView.yaw);
      clear.current.uz = Math.cos(cameraView.yaw);
      clear.current.far = playerStreet.up ? 0 : CAMERA_DISTANCE * cameraInput.zoom + 1.5;
      writeWalkers(life, slots, clear.current);
      // Sellers are placed again when the set drawn in full changes, or when any of them moved (their day: crowd.version).
      const placed = drawnInFull.version * 100003 + (crowd?.version ?? 0);
      if (placedFor.current !== placed) {
        placedFor.current = placed;
        writeStanding(standing, walkers, 0, sellers, slots, life.time);
      }
      // Touts do move: they are placed every frame.
      writeStanding(standing, walkers, sellers, standing.length, slots, life.time);
      for (const mesh of [b, h, l, a, o]) mesh.instanceMatrix.needsUpdate = true;
    }
    VEHICLE_KINDS.forEach((kind) => {
      const mesh = vehicleRefs[kind].current;
      if (!mesh) return;
      writeVehicles(life, kind, slotsOf(mesh));
      mesh.instanceMatrix.needsUpdate = true;
    });
  };

  // The crowd is decoration. If anything in it ever goes wrong it stops moving and says
  // so in the console; it must never take the rest of the game down with it.
  const stopped = useRef(false);
  const safely = (work: () => void) => {
    if (stopped.current) return;
    try {
      work();
    } catch (error) {
      stopped.current = true;
      console.error("[CrowdAndTraffic] stopped after an error:", error);
    }
  };

  // Put everyone in place before the first picture is drawn, so nothing flashes at the origin.
  useLayoutEffect(() => safely(show));

  useFrame((_, delta) => {
    safely(() => {
      // The street's own idea of where the player is: someone up on a footbridge is not in
      // the road, so the traffic under them does not brake.
      stepStreetLife(life, Math.min(delta, MAX_STEP), playerStreet.x, playerStreet.z);
      show();
    });
  });

  return (
    <>
      <Many meshRef={body} geometry={shapes.body} count={people} colours={colours.body} shadow />
      <Many meshRef={head} geometry={shapes.head} count={people} colours={colours.head} />
      <Many meshRef={legs} geometry={shapes.leg} count={people * 2} colours={colours.legs} shadow />
      <Many meshRef={arms} geometry={shapes.arm} count={people * 2} colours={colours.arms} />
      <Many meshRef={loads} geometry={shapes.load} count={people > 0 ? Math.max(1, walkers) : 0} colours={colours.loads} />
      {VEHICLE_KINDS.map((kind) => (
        <Many
          key={kind}
          meshRef={vehicleRefs[kind]}
          geometry={shapes.vehicles[kind]}
          count={paints[kind].length / 3}
          colours={paints[kind]}
          shadow
        />
      ))}
    </>
  );
}

/** Catches a failure while the crowd is being set up, and carries on without it. */
class WithoutCrowd extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[CrowdAndTraffic] could not be shown:", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function CrowdAndTraffic(props: Props) {
  return (
    <WithoutCrowd>
      <Street {...props} />
    </WithoutCrowd>
  );
}
