import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
  Object3D,
  type Points,
  SRGBColorSpace,
} from "three";
import type { Look } from "../api/appearance";
import { Character } from "./Character";
import { clubShow, notesFor, stepNotes, throwNotes, type Note, type ShowEvent } from "./clubEffects";
import { fightClock, newPose, strike } from "./fightMoves";

const NOTES = 260;
const CONFETTI = 240;
const SPARKS = 90;
const BEAM = 16;                   // metres a laser reaches
const LASERS = 10;
const PARADE_SECONDS = 11;
const LED = ["#ff1e3c", "#36ff6a", "#ff2d95", "#00e5ff", "#ffe600", "#9d4dff"];
const WAITRESS: Look = { body: "woman", skin_tone: "#613a25", hair_color: "#17120f", top_color: "#17171a", bottom_color: "#17171a", shoe_color: "#c79a2b" };

/** A naira note, drawn once: the pink-red ₦1000 everyone sprays. */
function noteTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 60;
  const g = canvas.getContext("2d");
  if (g) {
    const paper = g.createLinearGradient(0, 0, 128, 60);
    paper.addColorStop(0, "#c9a24a");
    paper.addColorStop(0.5, "#e7cf8a");
    paper.addColorStop(1, "#b5823a");
    g.fillStyle = paper;
    g.fillRect(0, 0, 128, 60);
    g.strokeStyle = "#6b4a1a";
    g.lineWidth = 3;
    g.strokeRect(3, 3, 122, 54);
    g.fillStyle = "#4a3410";
    g.font = "bold 26px sans-serif";
    g.fillText("₦1000", 30, 40);
    g.fillStyle = "rgba(60, 120, 60, 0.6)";
    g.beginPath();
    g.arc(18, 30, 10, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The lit board the bottle girls carry over the crowd. */
function signTexture(text: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = "#050806";
    g.fillRect(0, 0, 512, 128);
    g.shadowColor = "#36ff6a";
    g.shadowBlur = 24;
    g.strokeStyle = "#36ff6a";
    g.lineWidth = 6;
    g.strokeRect(10, 10, 492, 108);
    g.fillStyle = "#c8ffd2";
    g.font = "900 58px Impact, 'Arial Black', sans-serif";
    g.textAlign = "center";
    g.fillText(text, 256, 86);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

type Spot = { x: number; z: number };

type Props = {
  width: number;
  depth: number;
  height: number;
  /** Where the bottles come from. */
  bar: Spot;
  /** The DJ, where the lasers and the sparks are. */
  dj: Spot;
};

/** A bottle parade on its way: who for, and when it set off. */
type Parade = { event: ShowEvent; started: number; sign: string };

/**
 * The show over a club: lasers from the DJ booth, the LED frames on the ceiling chasing
 * colours, and whatever the spenders buy (clubShow.ts): notes in the air, bottles carried
 * through with sparklers, confetti, sparks.
 */
export function ClubShow({ width, depth, height, bar, dj }: Props) {
  // ---- what never stops: the lasers and the ceiling ----
  const beam = useMemo(() => {
    const geometry = new BoxGeometry(0.03, 0.03, BEAM);
    geometry.translate(0, 0, BEAM / 2);
    return geometry;
  }, []);
  const lasers = useRef<(Mesh | null)[]>([]);
  const grid = useMemo(() => {
    // Strips of light across the ceiling, both ways, every three metres.
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const strip = (x0: number, z0: number, x1: number, z1: number) => {
      const base = positions.length / 3;
      const nx = z1 - z0, nz = x0 - x1, len = Math.hypot(nx, nz) || 1, w = 0.05;
      const ox = (nx / len) * w, oz = (nz / len) * w, y = height - 0.12;
      positions.push(x0 - ox, y, z0 - oz, x0 + ox, y, z0 + oz, x1 + ox, y, z1 + oz, x1 - ox, y, z1 - oz);
      for (let i = 0; i < 4; i++) colors.push(1, 1, 1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (let x = 1.5; x < width; x += 3) strip(x, 0.5, x, depth - 0.5);
    for (let z = 1.5; z < depth; z += 3) strip(0.5, z, width - 0.5, z);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
    geometry.setIndex(indices);
    return geometry;
  }, [width, depth, height]);
  const palette = useMemo(() => LED.map((hex) => new Color(hex)), []);

  // ---- notes, confetti, sparks ----
  const note = useMemo(() => noteTexture(), []);
  const notes = useMemo<Note[]>(() => Array.from({ length: NOTES }, () => ({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, turn: 0, landed: 0 })), []);
  const notesRef = useRef<InstancedMesh>(null);
  const confetti = useMemo(() => Array.from({ length: CONFETTI }, () => ({ live: false, x: 0, y: 0, z: 0, spin: 0, speed: 0 })), []);
  const confettiRef = useRef<InstancedMesh>(null);
  const sparks = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(SPARKS * 3), 3));
    return geometry;
  }, []);
  const sparksRef = useRef<Points>(null);
  const sparkState = useMemo(() => Array.from({ length: SPARKS }, () => ({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, life: 0 })), []);
  const sparkUntil = useRef(0);
  const dummy = useMemo(() => new Object3D(), []);
  const confettiUntil = useRef(0);

  // ---- bottles coming through ----
  const parade = useRef<Parade | null>(null);
  const paradeRef = useRef<Group>(null);
  const signs = useMemo(() => ({ ace: signTexture("ACE OF SPADES"), gold: signTexture("DORIME!"), bottle: signTexture("VIP BOTTLES") }), []);
  const signRef = useRef<Mesh>(null);
  const walking = useRef(0);
  const holdPose = useMemo(() => newPose(), []);
  const seen = useRef(performance.now());

  useEffect(() => () => {
    beam.dispose();
    grid.dispose();
    note.dispose();
    sparks.dispose();
    Object.values(signs).forEach((texture) => texture.dispose());
  }, [beam, grid, note, sparks, signs]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = fightClock();

    // New things bought since the last frame.
    for (const event of clubShow.events) {
      if (event.at <= seen.current) continue;
      seen.current = event.at;
      if (event.kind === "spray") throwNotes(notes, event.x, event.z, notesFor(event.amount));
      if (event.kind === "takeover") {
        confettiUntil.current = t + 8;
        confetti.forEach((bit) => {
          bit.live = true;
          bit.x = Math.random() * width;
          bit.z = Math.random() * depth;
          bit.y = height - 0.2 - Math.random() * 2;
          bit.spin = Math.random() * 6;
          bit.speed = 0.5 + Math.random() * 0.8;
        });
        throwNotes(notes, event.x, event.z, 120);
      }
      if (event.kind === "ace" || event.kind === "takeover" || event.kind === "hype" || event.kind === "gold") sparkUntil.current = t + 4;
      if (event.kind === "ace" || event.kind === "gold" || event.kind === "bottle" || event.kind === "table") {
        parade.current = { event, started: t, sign: event.kind === "ace" ? "ace" : event.kind === "gold" ? "gold" : "bottle" };
      }
    }

    // The lasers sweep the room in a fan, faster on the drop.
    lasers.current.forEach((laser, i) => {
      if (!laser) return;
      const fan = (i / (LASERS - 1) - 0.5) * 1.6;
      laser.rotation.set(0.35 + Math.sin(t * 0.9 + i) * 0.18, fan + Math.sin(t * 0.7) * 0.6, 0);
      laser.visible = Math.floor(t * 2.5 + i * 0.5) % 5 !== 0;
    });

    // The ceiling's strips chase colours round.
    const colours = grid.getAttribute("color") as BufferAttribute | undefined;
    if (colours?.array) {
      const array = colours.array as Float32Array;
      const strips = array.length / 12;
      for (let s = 0; s < strips; s++) {
        const c = palette[Math.floor(t * 2 + s * 0.5) % palette.length];
        const pulse = 0.55 + 0.45 * Math.max(0, Math.sin(t * Math.PI * 2 + s));
        for (let k = 0; k < 4; k++) {
          array[s * 12 + k * 3] = c.r * pulse;
          array[s * 12 + k * 3 + 1] = c.g * pulse;
          array[s * 12 + k * 3 + 2] = c.b * pulse;
        }
      }
      colours.needsUpdate = true;
    }

    // Notes in the air and on the floor.
    const noteMesh = notesRef.current;
    if (noteMesh && (noteMesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) {
      stepNotes(notes, dt, t);
      notes.forEach((one, i) => {
        if (!one.live) {
          dummy.position.set(0, -50, 0);
          dummy.scale.setScalar(0.001);
        } else {
          dummy.position.set(one.x, one.y, one.z);
          dummy.scale.setScalar(1);
          if (one.y <= 0.02) dummy.rotation.set(-Math.PI / 2, 0, one.spin);
          else dummy.rotation.set(Math.sin(one.spin) * 1.2, one.spin, Math.cos(one.spin * 0.7) * 0.8);
        }
        dummy.updateMatrix();
        noteMesh.setMatrixAt(i, dummy.matrix);
      });
      noteMesh.instanceMatrix.needsUpdate = true;
    }

    // Confetti when the club is taken over.
    const bits = confettiRef.current;
    if (bits && (bits as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) {
      const on = t < confettiUntil.current;
      bits.visible = on;
      if (on) {
        confetti.forEach((bit, i) => {
          bit.y -= bit.speed * dt;
          if (bit.y < 0.02) bit.y = height - 0.3;
          bit.spin += dt * 4;
          dummy.position.set(bit.x + Math.sin(t * 2 + i) * 0.3, bit.y, bit.z);
          dummy.rotation.set(bit.spin, bit.spin * 0.7, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          bits.setMatrixAt(i, dummy.matrix);
        });
        bits.instanceMatrix.needsUpdate = true;
      }
    }

    // Cold sparks: fountains either side of the DJ.
    const points = sparksRef.current;
    if (points) {
      const on = t < sparkUntil.current;
      points.visible = on;
      const array = (sparks.getAttribute("position") as BufferAttribute | undefined)?.array as Float32Array | undefined;
      if (on && array) {
        sparkState.forEach((spark, i) => {
          spark.life -= dt;
          if (spark.life <= 0) {
            const side = i % 2 ? 1 : -1;
            spark.x = dj.x + side * 2.6;
            spark.z = dj.z + 0.4;
            spark.y = 0.6;
            spark.vx = (Math.random() - 0.5) * 0.6;
            spark.vz = (Math.random() - 0.5) * 0.6;
            spark.vy = 4 + Math.random() * 2.5;
            spark.life = 0.6 + Math.random() * 0.6;
          }
          spark.vy -= 9 * dt;
          spark.x += spark.vx * dt;
          spark.y += spark.vy * dt;
          spark.z += spark.vz * dt;
          array.set([spark.x, spark.y, spark.z], i * 3);
        });
        (sparks.getAttribute("position") as BufferAttribute).needsUpdate = true;
      }
    }

    // The bottles: from the bar to whoever ordered them, held high, then back.
    const group = paradeRef.current;
    if (group) {
      const now = parade.current;
      const age = now ? t - now.started : Infinity;
      group.visible = age < PARADE_SECONDS;
      walking.current = 0;
      if (now && age < PARADE_SECONDS) {
        const there = Math.min(1, age / 4), back = Math.max(0, (age - 7) / 4);
        const k = there - back;
        const x = bar.x + (now.event.x - bar.x) * k, z = bar.z + (now.event.z - bar.z) * k;
        const heading = Math.atan2(now.event.x - bar.x, now.event.z - bar.z) + (back > 0 ? Math.PI : 0);
        group.position.set(x, 0, z);
        group.rotation.y = heading;
        walking.current = there < 1 || back > 0 ? 1.2 : 0;
        if (age > 4 && age < 7 && holdPose.move !== "bounce") strike(holdPose, "bounce");
        if ((age <= 4 || age >= 7) && holdPose.move) holdPose.move = null;
        const sign = signRef.current;
        if (sign) {
          const material = sign.material as MeshBasicMaterial;
          if (material.map !== signs[now.sign as keyof typeof signs]) {
            material.map = signs[now.sign as keyof typeof signs];
            material.needsUpdate = true;
          }
          sign.position.y = 3.0 + Math.sin(t * 3) * 0.05;
        }
      }
    }
  });

  return (
    <>
      {/* Lasers from the DJ booth. */}
      <group position={[dj.x, height - 0.8, dj.z + 0.3]}>
        {Array.from({ length: LASERS }, (_, i) => (
          <mesh
            key={i}
            ref={(mesh: Mesh | null) => {
              lasers.current[i] = mesh;
            }}
            geometry={beam}
          >
            <meshBasicMaterial color={i % 2 ? "#36ff6a" : "#ff1e3c"} transparent opacity={0.75} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* The LED frames across the ceiling. */}
      <mesh geometry={grid}>
        <meshBasicMaterial vertexColors toneMapped={false} side={DoubleSide} />
      </mesh>
      {/* Notes. */}
      <instancedMesh ref={notesRef} args={[undefined, undefined, NOTES]} frustumCulled={false}>
        <planeGeometry args={[0.17, 0.08]} />
        <meshStandardMaterial map={note} side={DoubleSide} roughness={0.7} />
      </instancedMesh>
      {/* Confetti. */}
      <instancedMesh ref={confettiRef} args={[undefined, undefined, CONFETTI]} frustumCulled={false} visible={false}>
        <planeGeometry args={[0.06, 0.09]} />
        <meshBasicMaterial color="#ffd23f" side={DoubleSide} toneMapped={false} />
      </instancedMesh>
      {/* Sparks. */}
      <points ref={sparksRef} geometry={sparks} visible={false} frustumCulled={false}>
        <pointsMaterial color="#fff2b0" size={0.09} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </points>
      {/* The bottle girls, with the lit board over them. */}
      <group ref={paradeRef} visible={false}>
        {[-0.55, 0.55].map((side, i) => (
          <group key={i} position={[side, 0, i * -0.4]}>
            <Character speedRef={walking} look={WAITRESS} fight={holdPose} />
            {/* A bottle held up, and a sparkler stuck in its neck. */}
            <mesh position={[0.25, 2.05, 0.15]}>
              <cylinderGeometry args={[0.05, 0.06, 0.3, 10]} />
              <meshStandardMaterial color="#1a2a1a" metalness={0.6} roughness={0.2} />
            </mesh>
            <mesh position={[0.25, 2.3, 0.15]}>
              <sphereGeometry args={[0.07, 8, 6]} />
              <meshBasicMaterial color="#fff6c8" toneMapped={false} />
            </mesh>
            <pointLight position={[0.25, 2.35, 0.15]} color="#ffd98a" intensity={2.5} distance={4} decay={1.5} />
          </group>
        ))}
        <mesh ref={signRef} position={[0, 3.0, -0.2]}>
          <planeGeometry args={[2.0, 0.5]} />
          <meshBasicMaterial map={signs.ace} side={DoubleSide} toneMapped={false} />
        </mesh>
        {[-0.95, 0.95].map((side) => (
          <mesh key={side} position={[side, 2.4, -0.2]}>
            <boxGeometry args={[0.03, 1.2, 0.03]} />
            <meshStandardMaterial color="#2a2a2a" />
          </mesh>
        ))}
      </group>
    </>
  );
}
