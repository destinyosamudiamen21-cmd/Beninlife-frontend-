import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, type Group, type Mesh, type MeshBasicMaterial } from "three";
import type { Look } from "../api/appearance";
import type { PatrolRoute } from "../api/police";
import { driveView } from "./carPhysics";
import { Character } from "./Character";
import { MeshBuilder, type MeshData } from "./districtGeometry";
import { playerFocus } from "./focus";
import { hexToLinear } from "./tint";

const DRAW_WITHIN = 260;      // metres: patrols further away are not drawn
const CHASE_BEHIND = 13;      // metres the chasing van keeps behind the player's car
const CHASE_EASE = 1.8;       // how quickly it closes in (higher is tighter)

const OFFICER = (skin: string): Look => ({ body: "man", skin_tone: skin, hair_color: "#17120f", top_color: "#1b1d22", bottom_color: "#1b1d22", shoe_color: "#0d0d0f" });
const FOOT_OFFICERS = [OFFICER("#4b2c1c"), OFFICER("#774a2f")];

/** A route measured: how far round the loop each corner is. */
type Measured = PatrolRoute & { lengths: number[]; total: number };

function measure(route: PatrolRoute): Measured {
  const lengths = [0];
  const pts = route.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    lengths.push(lengths[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { ...route, lengths, total: lengths[lengths.length - 1] || 1 };
}

/** Where a patrol is at a moment of the server's clock: the same sum as patrol_service.Route.at. */
export function patrolAt(route: Measured, serverMs: number): { x: number; z: number; heading: number } {
  const d = (((serverMs / 1000) * route.speed + route.phase) % route.total + route.total) % route.total;
  const pts = route.points;
  for (let i = 0; i < pts.length; i++) {
    if (d <= route.lengths[i + 1]) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const t = (d - route.lengths[i]) / Math.max(1e-6, route.lengths[i + 1] - route.lengths[i]);
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
    }
  }
  return { x: pts[0][0], z: pts[0][1], heading: 0 };
}

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The patrol van: a police-blue pickup with a cage on the back, facing +z. The light bar is drawn on its own. */
function buildVan(): MeshData {
  const b = new MeshBuilder();
  const C = hexToLinear;
  b.box(0, 0, 0.95, 2.4, 0.35, 1.35, C("#1f3a6b"));          // the body
  b.box(0, 1.0, 0.92, 1.0, 1.35, 2.0, C("#1f3a6b"));          // the cab
  b.box(0, 1.05, 0.96, 0.9, 1.45, 1.9, C("#1f2a36"));         // its windows
  b.box(0, -1.15, 0.9, 1.1, 1.35, 1.42, C("#d9dde2"));        // white flank on the tray
  for (const z of [-2.15, -0.15]) b.box(0, z, 0.9, 0.04, 1.35, 2.2, C("#5a5f66")); // the cage
  b.box(0, -1.15, 0.04, 1.1, 2.15, 2.2, C("#5a5f66"));
  b.box(0, 2.42, 0.8, 0.04, 0.55, 0.8, C("#c9ced6"));         // the grille
  for (const [x, z] of [[-0.9, 1.5], [0.9, 1.5], [-0.9, -1.5], [0.9, -1.5]]) b.box(x, z, 0.12, 0.36, 0, 0.72, C("#18181a"));
  b.box(0, 0.4, 0.97, 0.3, 0.9, 1.2, C("#f2f2f2"));           // POLICE stripe
  return b.build();
}

function buildLights(colour: string): MeshData {
  const b = new MeshBuilder();
  b.box(0, 0, 0.32, 0.12, 0, 0.12, hexToLinear(colour));
  return b.build();
}

type VanProps = { geometry: BufferGeometry; red: BufferGeometry; blue: BufferGeometry; flashing: boolean };

/** One van, with its light bar on the cab roof. */
function Van({ geometry, red, blue, flashing, innerRef }: VanProps & { innerRef: (group: Group | null) => void }) {
  const redRef = useRef<Mesh>(null);
  const blueRef = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const on = Math.floor(clock.elapsedTime * (flashing ? 6 : 2)) % 2 === 0;
    if (redRef.current) (redRef.current.material as MeshBasicMaterial).color.setScalar(on ? 1 : 0.15).multiply(RED);
    if (blueRef.current) (blueRef.current.material as MeshBasicMaterial).color.setScalar(on ? 0.15 : 1).multiply(BLUE);
  });
  return (
    <group ref={innerRef}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh ref={redRef} geometry={red} position={[-0.34, 2.0, 1.0]}>
        <meshBasicMaterial />
      </mesh>
      <mesh ref={blueRef} geometry={blue} position={[0.34, 2.0, 1.0]}>
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

// Tints for the light bar, applied over white: set once, read every frame.
const RED = new Color(1, 0.12, 0.1);
const BLUE = new Color(0.15, 0.35, 1);

type Props = {
  district: string;
  routes: PatrolRoute[];
  /** Server clock minus this browser's clock, in milliseconds. */
  clockOffset: number;
  /** A chase is on: a van with its lights going follows the player. */
  chasing: boolean;
  /** ... on foot: two officers run after them instead. */
  onFoot?: boolean;
  /** How wanted they are: at three stars and more a second van joins in. */
  stars?: number;
};

/**
 * The police patrols in this district: vans going round the main roads, two officers
 * walking the pavement by the market, and, in a chase, the van behind you. Where each one
 * is comes from the clock (the server works it out the same way to decide who it stops).
 */
export function PolicePatrols({ district, routes, clockOffset, chasing, onFoot = false, stars = 0 }: Props) {
  const here = useMemo(() => routes.filter((r) => r.district === district).map(measure), [routes, district]);
  const van = useMemo(() => toGeometry(buildVan()), []);
  const red = useMemo(() => toGeometry(buildLights("#ffffff")), []);
  const blue = useMemo(() => toGeometry(buildLights("#ffffff")), []);
  useEffect(() => () => [van, red, blue].forEach((g) => g.dispose()), [van, red, blue]);

  const groups = useRef(new Map<string, Group>());
  const chaser = useRef<Group | null>(null);
  const second = useRef<Group | null>(null);
  const runners = useRef<Group | null>(null);
  const chaseAt = useRef<{ x: number; z: number; heading: number } | null>(null);
  const walking = useRef(1.25);
  const running = useRef(3.4);

  useFrame((_, delta) => {
    const now = Date.now() + clockOffset;
    for (const route of here) {
      const group = groups.current.get(route.id);
      if (!group) continue;
      const at = patrolAt(route, now);
      const near = Math.hypot(at.x - playerFocus.x, at.z - playerFocus.z) < DRAW_WITHIN;
      group.visible = near;
      if (!near) continue;
      group.position.set(at.x, 0, at.z);
      group.rotation.y = at.heading;
    }
    const follow = chaser.current;
    const backup = second.current;
    const feet = runners.current;
    if (follow && backup && feet) {
      const inCar = chasing && !onFoot;
      follow.visible = inCar;
      backup.visible = inCar && stars >= 3;
      feet.visible = chasing && onFoot;
      if (!chasing) {
        chaseAt.current = null;
        return;
      }
      const heading = driveView.active ? driveView.heading : Math.atan2(playerFocus.x - (chaseAt.current?.x ?? playerFocus.x), playerFocus.z - (chaseAt.current?.z ?? playerFocus.z - 1));
      const behind = onFoot ? 5.5 : CHASE_BEHIND;
      const goalX = playerFocus.x - Math.sin(heading) * behind;
      const goalZ = playerFocus.z - Math.cos(heading) * behind;
      const now3 = chaseAt.current ?? { x: goalX - Math.sin(heading) * (onFoot ? 12 : 30), z: goalZ - Math.cos(heading) * (onFoot ? 12 : 30), heading };
      const ease = 1 - Math.exp(-delta * (onFoot ? 1.2 : CHASE_EASE));
      now3.x += (goalX - now3.x) * ease;
      now3.z += (goalZ - now3.z) * ease;
      now3.heading = Math.atan2(playerFocus.x - now3.x, playerFocus.z - now3.z);
      chaseAt.current = now3;
      const target = onFoot ? feet : follow;
      target.position.set(now3.x, 0, now3.z);
      target.rotation.y = now3.heading;
      if (backup.visible) {
        // The second van a little further back and to one side.
        backup.position.set(now3.x - Math.sin(now3.heading) * 9 + Math.cos(now3.heading) * 3, 0, now3.z - Math.cos(now3.heading) * 9 - Math.sin(now3.heading) * 3);
        backup.rotation.y = now3.heading;
      }
    }
  });

  const keep = (id: string) => (group: Group | null) => {
    if (group) groups.current.set(id, group);
    else groups.current.delete(id);
  };

  return (
    <>
      {here.map((route) =>
        route.kind === "van" ? (
          <Van key={route.id} innerRef={keep(route.id)} geometry={van} red={red} blue={blue} flashing={false} />
        ) : (
          <group key={route.id} ref={keep(route.id)}>
            {FOOT_OFFICERS.map((look, i) => (
              <group key={i} position={[i === 0 ? -0.45 : 0.45, 0, i === 0 ? 0 : -0.3]}>
                <Character speedRef={walking} look={look} />
              </group>
            ))}
          </group>
        ),
      )}
      <Van innerRef={(group) => (chaser.current = group)} geometry={van} red={red} blue={blue} flashing />
      <Van innerRef={(group) => (second.current = group)} geometry={van} red={red} blue={blue} flashing />
      {/* On foot, two officers run after them, batons out. */}
      <group ref={runners} visible={false}>
        {FOOT_OFFICERS.map((look, i) => (
          <group key={i} position={[i === 0 ? -0.6 : 0.7, 0, i === 0 ? 0 : -1.4]}>
            <Character speedRef={running} look={look} />
          </group>
        ))}
      </group>
    </>
  );
}
