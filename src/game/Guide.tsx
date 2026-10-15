import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { playerFocus } from "./focus";

const BEACON_HEIGHT = 16; // metres: tall enough to see over a row of shops
const ARROW_AHEAD = 1.5; // metres in front of the player that the arrow lies
const ARROW_HIDES = 7; // closer than this the beacon itself is in view, so the arrow goes
const BRASS = "#e2b657";
const CORAL = "#c8432b";

type Props = {
  /** Where the player is heading, on the street of the district they are in. */
  x: number;
  z: number;
  /** How far away it is, in whole metres. Called only when that changes. */
  onDistance: (metres: number) => void;
};

/**
 * Shows the way to a place the player picked on the map: a tall beam of light standing
 * on the place, and an arrow on the ground at the player's feet that points at it. The
 * arrow points straight there, over the rooftops. It is a direction, not a route.
 */
export function Guide({ x, z, onDistance }: Props) {
  const arrow = useRef<Group>(null);
  const gem = useRef<Mesh>(null);
  const told = useRef(-1);
  const tell = useRef(onDistance);
  useEffect(() => {
    tell.current = onDistance;
  });

  useFrame((state) => {
    const dx = x - playerFocus.x,
      dz = z - playerFocus.z;
    const metres = Math.hypot(dx, dz);
    const time = state.clock.elapsedTime;

    const pointer = arrow.current;
    if (pointer) {
      pointer.visible = metres > ARROW_HIDES;
      if (pointer.visible) {
        const slide = ARROW_AHEAD + 0.18 * Math.sin(time * 4); // it nudges forward, the way a hand waves you on
        pointer.position.set(
          playerFocus.x + (dx / metres) * slide,
          playerFocus.y + 0.08,
          playerFocus.z + (dz / metres) * slide
        );
        pointer.rotation.y = Math.atan2(dx, dz);
      }
    }
    if (gem.current) {
      gem.current.position.y = 3.1 + 0.25 * Math.sin(time * 2.4);
      gem.current.rotation.y = time * 1.5;
    }

    // Far off, the distance is told to the nearest five metres: it is read at a glance, and
    // the game is not asked to draw itself again for every step taken.
    const whole = metres > 30 ? Math.round(metres / 5) * 5 : Math.round(metres);
    if (whole !== told.current) {
      told.current = whole;
      tell.current(whole);
    }
  });

  return (
    <>
      <group position={[x, 0, z]}>
        <mesh position={[0, BEACON_HEIGHT / 2, 0]}>
          <cylinderGeometry args={[0.35, 0.6, BEACON_HEIGHT, 10, 1, true]} />
          <meshBasicMaterial
            color={BRASS}
            transparent
            opacity={0.4}
            depthWrite={false}
            fog={false}
          />
        </mesh>
        <mesh ref={gem} position={[0, 3.1, 0]}>
          <octahedronGeometry args={[0.42]} />
          <meshBasicMaterial color={CORAL} fog={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
          <ringGeometry args={[1.1, 1.45, 28]} />
          <meshBasicMaterial
            color={BRASS}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
      </group>
      {/* A flat arrowhead: a three-sided cone laid on its side and pressed flat. */}
      <group ref={arrow}>
        <mesh rotation-x={Math.PI / 2} scale={[1, 1, 0.12]}>
          <coneGeometry args={[0.42, 1.05, 3]} />
          <meshBasicMaterial color={BRASS} />
        </mesh>
      </group>
    </>
  );
}
