import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, type Group } from "three";
import type { MeshData } from "./districtGeometry";
import { RIDES } from "./BusRide";
import { SEAT_Z, SEGMENT, buildBus, buildRoadside } from "./busShapes";

/**
 * The bus ride, in 3D: the yellow bus pulls up at the stop, you climb in, ride with
 * everyone else down the road (watching it go by through the windows), and get off at the
 * other end as the bus pulls away. The fare is paid and the server has already moved the
 * player: this is the journey, while the next place loads behind it.
 */

const PULL_UP = 0.22;      // share of the ride spent watching the bus come and stop
const BOARD = 0.3;         // ... and climbing in
const GET_OFF = 0.86;      // from here, standing at the other stop as it leaves
const ROAD_SPEED = 12;     // metres a second inside
const SEGMENTS = 5;        // pieces, recycled as they go by

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

type Shot = "outside" | "inside" | "leaving";

/** Everything in the ride's own little world. `progress` is read every frame, 0 to 1. */
function RideWorld({ progress }: { progress: { current: number } }) {
  const bus = useMemo(() => toGeometry(buildBus()), []);
  const sides = useMemo(() => Array.from({ length: SEGMENTS }, (_, i) => toGeometry(buildRoadside(31 + i * 17))), []);
  useEffect(() => () => [bus, ...sides].forEach((g) => g.dispose()), [bus, sides]);
  const busRef = useRef<Group>(null);
  const pieces = useRef<(Group | null)[]>([]);
  const travelled = useRef(0);
  const camera = useThree((state) => state.camera);

  useFrame((_, delta) => {
    const p = progress.current;
    const shot: Shot = p < BOARD ? "outside" : p < GET_OFF ? "inside" : "leaving";
    const busGroup = busRef.current;
    if (!busGroup) return;
    const time = performance.now() / 1000;

    if (shot === "outside") {
      // The bus comes down the road, slows, and stops with its door at the stop.
      const k = Math.min(1, p / PULL_UP);
      const ease = 1 - Math.pow(1 - k, 2.4);
      busGroup.position.set(1.8, 0, -60 + ease * 60);
      busGroup.rotation.set(0, 0, 0);
      for (const [i, piece] of pieces.current.entries()) piece?.position.set(0, 0, (i - 2) * SEGMENT);
      // Standing on the pavement; then walking up to the door.
      const step = p < PULL_UP ? 0 : (p - PULL_UP) / (BOARD - PULL_UP);
      camera.position.set(7.2 - step * 3.4, 1.65, 1.0 + 2.5 * (1 - step));
      camera.lookAt(busGroup.position.x + 0.6, 1.4, busGroup.position.z + (step > 0 ? 1.0 : 0));
      return;
    }

    if (shot === "inside") {
      // Riding: the roadside goes by; the bus sways and bumps.
      travelled.current += delta * ROAD_SPEED;
      const span = SEGMENT * SEGMENTS;
      for (const [i, piece] of pieces.current.entries()) {
        if (!piece) continue;
        let z = (i - 2) * SEGMENT - (travelled.current % span);
        if (z < -SEGMENT * 2) z += span;
        piece.position.set(0, 0, z);
      }
      const bump = Math.max(0, Math.sin(time * 1.7) - 0.93) * 0.9;            // now and then, a pothole
      busGroup.position.set(1.8, Math.sin(time * 9) * 0.012 + bump * 0.06, 0);
      busGroup.rotation.set(Math.sin(time * 1.3) * 0.006, 0, Math.sin(time * 0.9) * 0.012);
      // In the back row, by the window, looking forward past everyone's heads.
      camera.position.set(1.8 - 0.24, 1.86 + busGroup.position.y, SEAT_Z + 0.1);
      camera.lookAt(1.8 - 0.1 + Math.sin(time * 0.25) * 0.9, 1.55, 8);
      return;
    }

    // Off at the other end: standing at the stop as the bus pulls away.
    const k = (p - GET_OFF) / (1 - GET_OFF);
    busGroup.position.set(1.8, 0, Math.pow(k, 1.8) * 45);
    busGroup.rotation.set(0, 0, 0);
    camera.position.set(6.2, 1.65, -2.0);
    camera.lookAt(busGroup.position.x, 1.3, busGroup.position.z + 2);
  });

  return (
    <>
      <color attach="background" args={["#bcd8ee"]} />
      <hemisphereLight args={["#e8f2ff", "#6b5a46", 1.1]} />
      <directionalLight position={[8, 14, 6]} intensity={1.6} />
      {sides.map((geometry, i) => (
        <group key={i} ref={(g: Group | null) => { pieces.current[i] = g; }}>
          <mesh geometry={geometry}>
            <meshLambertMaterial vertexColors />
          </mesh>
        </group>
      ))}
      <group ref={busRef}>
        <mesh geometry={bus}>
          <meshLambertMaterial vertexColors />
        </mesh>
      </group>
    </>
  );
}

type Props = {
  from: string;
  to: string;
  fare: number;
  seconds?: number;
  onDone: () => void;
};

/** The bus ride as a scene of its own, over the game, with the conductor's shouting on top. */
export function BusRide3D({ from, to, fare, seconds = 8, onDone }: Props) {
  const ride = RIDES.bus;
  const length = Math.max(7, seconds);   // long enough to see it come, ride, and leave
  const progress = useRef(0);
  const [line, setLine] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const started = performance.now();
    let frame = 0;
    const tick = () => {
      progress.current = Math.min(1, (performance.now() - started) / 1000 / length);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const inside = (BOARD + (GET_OFF - BOARD) * 0) * length * 1000;
    const each = ((GET_OFF - BOARD) * length * 1000) / ride.shouts.length;
    let talking = 0;
    const startTalking = window.setTimeout(() => {
      talking = window.setInterval(() => setLine((n) => Math.min(n + 1, ride.shouts.length - 1)), each);
    }, inside);
    const arriving = window.setTimeout(() => done.current(), length * 1000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(startTalking);
      window.clearInterval(talking);
      window.clearTimeout(arriving);
    };
  }, [length, ride]);

  return (
    <div className="busride busride-3d" role="status" aria-live="polite">
      <style>{`
        .busride-3d { position: absolute; inset: 0; z-index: 40; background: #14181a; color: #fbf8f1; }
        .busride-3d canvas { position: absolute; inset: 0; }
        .busride-3d-top { position: absolute; left: 0; right: 0; top: calc(14px + env(safe-area-inset-top)); text-align: center; padding: 0 16px; pointer-events: none;
          text-shadow: 0 2px 8px rgba(0,0,0,0.6); }
        .busride-3d-kicker { font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #f0b90b; }
        .busride-3d-route { font-size: clamp(18px, 4.6vw, 26px); font-weight: 800; margin-top: 4px; }
        .busride-3d-fare { font-size: 12px; opacity: 0.85; margin-top: 2px; }
        .busride-3d-bubble { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(26px + env(safe-area-inset-bottom)); max-width: min(420px, 88vw);
          padding: 11px 15px; border-radius: 16px; background: #fbf8f1; color: #1f2a26; font-weight: 700; text-align: center; box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
        .busride-3d-bar { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(12px + env(safe-area-inset-bottom)); width: min(420px, 86vw); height: 5px;
          border-radius: 3px; background: rgba(0,0,0,0.45); overflow: hidden; }
        .busride-3d-bar span { display: block; height: 100%; background: #f0b90b; transform-origin: left; animation: busride-3d-fill ${length}s linear forwards; }
        @keyframes busride-3d-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      `}</style>
      <Canvas dpr={[1, 1.5]} camera={{ fov: 62, near: 0.05, far: 400, position: [7, 1.65, 3] }}>
        <RideWorld progress={progress} />
      </Canvas>
      <div className="busride-3d-top">
        <div className="busride-3d-kicker">{ride.kicker}</div>
        <div className="busride-3d-route busride-route">{from} → {to}</div>
        <div className="busride-3d-fare">Fare paid: ₦{fare.toLocaleString()}</div>
      </div>
      <div className="busride-3d-bubble">{ride.shouts[line].replaceAll("{to}", to)}</div>
      <div className="busride-3d-bar">
        <span />
      </div>
    </div>
  );
}
