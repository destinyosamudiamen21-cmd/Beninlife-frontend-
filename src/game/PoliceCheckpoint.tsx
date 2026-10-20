import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry } from "three";
import type { Look } from "../api/appearance";
import { Character } from "./Character";
import { MeshBuilder, type MeshData } from "./districtGeometry";
import { playerFocus } from "./focus";
import { hexToLinear } from "./tint";

/**
 * The first police checkpoints, placed by hand. The server sends the full list with the
 * patrols (there are many more now: backend/app/services/patrol_routes.py); these are only
 * drawn if that list has not arrived. The server checks a player is really at one before it
 * lets the officers stop them. `angle` is the way the road runs there.
 */
export const CHECKPOINTS: { id: string; district: string; x: number; z: number; angle: number }[] = [
  { id: "cp_ugbowo", district: "uniben", x: -117.3, z: 77.3, angle: 2.96 },
  { id: "cp_ugbowo_east", district: "uniben", x: 149.9, z: 59.2, angle: 3.1 },
  { id: "cp_ringroad", district: "ringroad", x: 19.1, z: 116.3, angle: -1.85 },
  { id: "cp_mission", district: "newbenin", x: 13.0, z: 59.9, angle: -1.56 },
  { id: "cp_gra", district: "gra", x: 100.0, z: 8.0, angle: 0 },
  { id: "cp_okada", district: "gra", x: -130.0, z: -200.0, angle: 0 },
  { id: "cp_ikpoba", district: "ikpoba", x: 210.0, z: 8.0, angle: 0 },
];

const CALL_OVER = 10;    // metres: walk this close and they call you over
const LET_GO = 20;       // ... and you must be this far away before they can call you again

const OFFICER = (skin: string): Look => ({ body: "man", skin_tone: skin, hair_color: "#17120f", top_color: "#1b1d22", bottom_color: "#1b1d22", shoe_color: "#0d0d0f" });
const OFFICERS = [OFFICER("#4b2c1c"), OFFICER("#613a25"), OFFICER("#774a2f")];

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** A patrol van parked on the kerb, a row of old tyres and planks with nails across the lane. */
function buildCheckpoint(): MeshData {
  const builder = new MeshBuilder();
  const C = hexToLinear;
  // The van: a pickup in police blue, a cage on the back.
  builder.box(0, -6.2, 2.3, 0.95, 0.35, 1.4, C("#1f3a6b"));
  builder.box(1.0, -6.2, 1.0, 0.92, 1.4, 2.0, C("#1f3a6b"));
  builder.box(1.05, -6.2, 0.9, 0.96, 1.5, 1.9, C("#1f2a36"));
  builder.box(-1.1, -6.2, 1.1, 0.9, 1.4, 1.42, C("#d9dde2"));
  for (const x of [-2.1, -0.1]) builder.box(x, -6.2, 0.04, 0.9, 1.4, 2.2, C("#5a5f66"));
  builder.box(-1.1, -6.2, 1.1, 0.04, 2.15, 2.2, C("#5a5f66"));
  builder.box(1.0, -6.2, 0.25, 0.3, 2.0, 2.12, C("#2f6fd6"));
  for (const [x, z] of [[-1.5, -5.3], [1.5, -5.3], [-1.5, -7.1], [1.5, -7.1]]) builder.box(x, z, 0.36, 0.12, 0, 0.72, C("#18181a"));
  // Tyres across half of the road, and a plank studded with nails.
  for (let i = 0; i < 4; i++) builder.box(-1.6 + i * 1.05, -1.5, 0.42, 0.42, 0, 0.32, C("#1a1a1c"));
  builder.box(0.4, 0.6, 2.2, 0.12, 0, 0.08, C("#7a5a3c"));
  // A drum with "STOP" painted on it, in red and white.
  builder.box(-3.4, -2.6, 0.32, 0.32, 0, 0.95, C("#c0392b"));
  builder.box(-3.4, -2.6, 0.33, 0.33, 0.4, 0.55, C("#f2f2f2"));
  return builder.build();
}

type Props = {
  district: string;
  /** Every checkpoint in the city, from the server. Empty until it arrives. */
  points?: { id: string; district: string; x: number; z: number; angle: number }[];
  /** The player walked up to a checkpoint. Called once each time they come close. */
  onReach: (checkpoint: string) => void;
  /** True while something else is going on (a ride, a panel): nobody is called over then. */
  paused: boolean;
};

/** The checkpoints in this district: the van, the tyres, the officers, and the stop itself. */
export function PoliceCheckpoints({ district, points, onReach, paused }: Props) {
  const here = useMemo(
    () => (points && points.length > 0 ? points : CHECKPOINTS).filter((point) => point.district === district),
    [district, points],
  );
  const shape = useMemo(() => toGeometry(buildCheckpoint()), []);
  useEffect(() => () => shape.dispose(), [shape]);
  const armed = useRef(new Map<string, boolean>());
  const reach = useRef(onReach);
  const quiet = useRef(paused);
  useEffect(() => {
    reach.current = onReach;
    quiet.current = paused;
  });
  const still = useRef(0);

  useFrame(() => {
    for (const point of here) {
      const gap = Math.hypot(playerFocus.x - point.x, playerFocus.z - point.z);
      const ready = armed.current.get(point.id) ?? true;
      if (ready && gap < CALL_OVER && !quiet.current) {
        armed.current.set(point.id, false);
        reach.current(point.id);
      } else if (!ready && gap > LET_GO) {
        armed.current.set(point.id, true);
      }
    }
  });

  return (
    <>
      {here.map((point) => (
        <group key={point.id} position={[point.x, 0, point.z]} rotation-y={-point.angle}>
          <mesh geometry={shape} castShadow receiveShadow>
            <meshLambertMaterial vertexColors />
          </mesh>
          {OFFICERS.map((look, index) => (
            <group key={index} position={[-2.2 + index * 2.1, 0, index === 1 ? 0.2 : -3.6]} rotation-y={index === 1 ? Math.PI : 0.4 * (index - 1)}>
              <Character speedRef={still} look={look} />
            </group>
          ))}
        </group>
      ))}
    </>
  );
}
