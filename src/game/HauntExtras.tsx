import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, type Group, type MeshBasicMaterial, type Points } from "three";
import { cameraView, playerFocus } from "./focus";

const DUST = 260;           // motes hanging in the air round the player
const DUST_SPREAD = 7;      // metres either side
const WRAITH_EVERY = [9, 18] as const;   // seconds between sightings, at least and at most
const WRAITH_SECONDS = 2.6;              // how long one lasts

/** Dust hanging in the torchlight: tiny pale specks drifting round the player, slowly. */
function Dust() {
  const points = useRef<Points>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      positions[i * 3] = (Math.random() - 0.5) * DUST_SPREAD * 2;
      positions[i * 3 + 1] = Math.random() * 3.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * DUST_SPREAD * 2;
    }
    const built = new BufferGeometry();
    built.setAttribute("position", new BufferAttribute(positions, 3));
    return built;
  }, []);
  useFrame((_, delta) => {
    const cloud = points.current;
    if (!cloud) return;
    cloud.position.set(playerFocus.x, 0, playerFocus.z);
    const positions = geometry.getAttribute("position") as BufferAttribute;
    const now = performance.now() / 1000;
    for (let i = 0; i < DUST; i++) {
      let y = positions.getY(i) - delta * 0.05 + Math.sin(now * 0.7 + i) * delta * 0.04;
      if (y < 0) y += 3.2;
      positions.setY(i, y);
      positions.setX(i, positions.getX(i) + Math.sin(now * 0.3 + i * 1.7) * delta * 0.03);
    }
    positions.needsUpdate = true;
  });
  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial size={0.035} color="#d8d2c0" transparent opacity={0.55} depthWrite={false} blending={AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/**
 * Something pale at the edge of the light, now and then: a shape in a long shroud, a few
 * metres ahead of the player in the mist, that drifts across and fades before they can be
 * sure they saw it. It never comes close; that is the scares' job.
 */
function Wraith() {
  const group = useRef<Group>(null);
  const shroud = useRef<MeshBasicMaterial>(null);
  const face = useRef<MeshBasicMaterial>(null);
  const state = useRef({ next: performance.now() + 6000, start: 0, x: 0, z: 0, dx: 0, dz: 0 });

  useFrame(() => {
    const now = performance.now();
    const ghost = state.current;
    const shape = group.current;
    if (!shape || !shroud.current || !face.current) return;
    if (ghost.start === 0 && now > ghost.next) {
      // Ahead of the player, where the camera looks, 5 to 8 metres off, to one side.
      const yaw = cameraView.yaw;
      const ahead = 5 + Math.random() * 3;
      const aside = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2);
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      ghost.x = playerFocus.x + fx * ahead + fz * aside;
      ghost.z = playerFocus.z + fz * ahead - fx * aside;
      ghost.dx = -fz * Math.sign(aside) * 0.9;
      ghost.dz = fx * Math.sign(aside) * 0.9;
      ghost.start = now;
    }
    if (ghost.start === 0) {
      shape.visible = false;
      return;
    }
    const t = (now - ghost.start) / 1000;
    if (t > WRAITH_SECONDS) {
      ghost.start = 0;
      ghost.next = now + (WRAITH_EVERY[0] + Math.random() * (WRAITH_EVERY[1] - WRAITH_EVERY[0])) * 1000;
      shape.visible = false;
      return;
    }
    const fade = Math.sin((Math.PI * t) / WRAITH_SECONDS);
    shape.visible = true;
    shape.position.set(ghost.x + ghost.dx * t, 0.25 + Math.sin(t * 3) * 0.08, ghost.z + ghost.dz * t);
    shape.rotation.y = Math.atan2(playerFocus.x - shape.position.x, playerFocus.z - shape.position.z);
    shroud.current.opacity = 0.42 * fade * (Math.random() > 0.06 ? 1 : 0.3);
    face.current.opacity = 0.9 * fade;
  });

  return (
    <group ref={group} visible={false}>
      {/* A long shroud, narrow at the head and trailing at the floor. */}
      <mesh position-y={0.95}>
        <coneGeometry args={[0.45, 1.9, 10, 1, true]} />
        <meshBasicMaterial ref={shroud} color="#dfe6e8" transparent opacity={0} depthWrite={false} side={2} fog={false} />
      </mesh>
      <mesh position-y={1.85}>
        <sphereGeometry args={[0.19, 12, 10]} />
        <meshBasicMaterial color="#e8eef0" transparent opacity={0.45} depthWrite={false} fog={false} />
      </mesh>
      {/* Two holes for eyes and an open mouth: the only thing that does not fade at once. */}
      <group position={[0, 1.86, 0.17]}>
        {[-0.07, 0.07].map((x) => (
          <mesh key={x} position={[x, 0.03, 0]}>
            <boxGeometry args={[0.06, 0.07, 0.02]} />
            <meshBasicMaterial ref={x < 0 ? face : undefined} color="#000000" transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}
        <mesh position={[0, -0.08, 0]}>
          <boxGeometry args={[0.06, 0.09, 0.02]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.6} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

/** What makes the haunted house feel haunted besides its scares: the dust in the air, and what moves in the mist. */
export function HauntExtras() {
  return (
    <>
      <Dust />
      <Wraith />
    </>
  );
}
