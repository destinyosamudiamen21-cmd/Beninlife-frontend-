// The GRA race field in the street scene: the track and everything round it, and, during a
// race, the three rivals driving their lines and the next checkpoint lit up.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, type Group } from "three";
import type { Race } from "../api/race";
import { Car, type CarMotion } from "./Car";
import type { MeshData } from "./districtGeometry";
import { checkpoints, gridSlot, LAP, rivalDistance, rivalSpot, trackPoint } from "./raceTrack";
import { buildCheckpointGate, buildRaceField } from "./raceShapes";

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
  race: Race | null;
  /** The server's clock minus this phone's, in ms. */
  offset: number;
};

export function RaceField({ race, offset }: Props) {
  const field = useMemo(() => {
    const built = buildRaceField();
    return { solid: toGeometry(built.solid), glow: toGeometry(built.glow) };
  }, []);
  const gate = useMemo(() => toGeometry(buildCheckpointGate()), []);
  useEffect(() => () => {
    field.solid.dispose();
    field.glow.dispose();
    gate.dispose();
  }, [field, gate]);

  const live = race && race.state === "racing" && !race.finished ? race : null;
  const marks = useMemo(() => checkpoints(), []);
  const next = live ? marks[live.checkpoint % marks.length] : null;
  const nextHeading = live ? trackPoint(((live.checkpoint % marks.length) + 1) * (LAP / marks.length)).heading : 0;

  return (
    <>
      <mesh geometry={field.solid} castShadow receiveShadow>
        <meshLambertMaterial vertexColors polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-8} />
      </mesh>
      <mesh geometry={field.glow}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      {next && (
        <mesh geometry={gate} position={[next.x, 0, next.z]} rotation={[0, nextHeading - Math.PI / 2, 0]}>
          <meshBasicMaterial vertexColors toneMapped={false} />
        </mesh>
      )}
      {race && race.state === "racing" &&
        race.rivals.map((_, index) => (
          <RivalCar key={`${race.id}-${index}`} race={race} index={index} offset={offset} />
        ))}
    </>
  );
}

function RivalCar({ race, index, offset }: { race: Race; index: number; offset: number }) {
  const group = useRef<Group>(null);
  const motion = useMemo<CarMotion>(() => ({ spin: 0, steer: 0, brake: 0 }), []);
  const rival = race.rivals[index];
  const slot = gridSlot(index + 1);
  const start = slot.x - gridSlot(0).x - 7; // metres behind the line
  const length = race.laps * LAP;
  const last = useRef(start);
  useFrame((_, delta) => {
    const body = group.current;
    if (!body) return;
    const t = (Date.now() + offset - race.go_ms) / 1000;
    const s = rivalDistance(start, length, rival.seconds, t);
    const spot = rivalSpot(index + 1, s);
    body.position.set(spot.x, 0, spot.z);
    body.rotation.y = spot.heading;
    motion.spin += (s - last.current) / 0.33;
    motion.brake = s - last.current < 0.02 && t > 0 ? 1 : 0;
    last.current = s;
    void delta;
  });
  return (
    <group ref={group}>
      <Car look={`${rival.model}|${rival.colour}|${rival.name.slice(0, 8).toUpperCase()}`} motion={motion} />
    </group>
  );
}
