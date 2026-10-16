// A car, drawn: the shapes from carShapes.ts with real car materials. Paint has a clear
// coat over it and reflects a studio, the way a car in a showroom does; the glass is dark
// and shiny; the brake lights glow when the driver brakes. The same component draws a car
// in the showroom, parked on the street, at home, and the one being driven.

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, MeshBasicMaterial, MeshPhysicalMaterial,
  MeshStandardMaterial, PMREMGenerator, SRGBColorSpace,
  type Group, type Material, type Scene, type Texture, type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Look } from "../api/appearance";
import { CAR_COLOURS, CAR_SPECS, carParts, readCarLook, type Mat, type Mesh } from "./carShapes";

export { CAR_COLOURS };

const MATS: Mat[] = [
  "paint", "glass", "trim", "chrome", "rubber", "under", "head", "tail", "plate", "rim", "disc", "caliper",
  "interior", "seat", "cladding", "grille", "amber",
];

// ---- geometry, once per model ---------------------------------------------------------------

function toGeometry(mesh: Mesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(mesh.uvs, 2));
  const index: number[] = [];
  MATS.forEach((mat, materialIndex) => {
    const list = mesh.groups[mat];
    if (!list?.length) return;
    geometry.addGroup(index.length, list.length, materialIndex);
    for (const i of list) index.push(i);
  });
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

const geometries = new Map<string, { body: BufferGeometry; wheel: BufferGeometry }>();
function geometryOf(model: string) {
  let found = geometries.get(model);
  if (!found) {
    const parts = carParts(model);
    found = { body: toGeometry(parts.body), wheel: toGeometry(parts.wheel) };
    geometries.set(model, found);
  }
  return found;
}

// ---- materials, shared where they can be ----------------------------------------------------

let studio: Texture | null = null;
/** A soft studio to reflect in the paint and the glass, made once from three.js's own room. */
function studioFor(gl: WebGLRenderer): Texture {
  if (!studio) {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    // (Its type comes through three's examples, which name Scene through their own import of three.)
    studio = pmrem.fromScene(room as unknown as Scene, 0.04).texture;
    room.dispose();
    pmrem.dispose();
  }
  return studio;
}

const shared = new Map<string, Material>();
function sharedMaterial(key: string, make: () => Material): Material {
  let material = shared.get(key);
  if (!material) {
    material = make();
    shared.set(key, material);
  }
  return material;
}

function paintOf(colour: string, env: Texture): Material {
  const hex = CAR_COLOURS[colour] ?? colour;
  return sharedMaterial(`paint:${hex}`, () => new MeshPhysicalMaterial({
    color: new Color(hex), metalness: 0.5, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04,
    envMap: env, envMapIntensity: 1.1,
  }));
}

function standard(key: string, color: string, options: Partial<{ metalness: number; roughness: number; emissive: string; emissiveIntensity: number }>, env: Texture | null): Material {
  return sharedMaterial(key, () => new MeshStandardMaterial({
    color: new Color(color), metalness: options.metalness ?? 0, roughness: options.roughness ?? 0.6,
    emissive: new Color(options.emissive ?? "#000000"), emissiveIntensity: options.emissiveIntensity ?? 0,
    envMap: env ?? undefined,
  }));
}

function rimColour(model: string): string {
  const colour = CAR_SPECS[model]?.rim.colour ?? "silver";
  return colour === "black" ? "#17181b" : colour === "dark" ? "#3c3f44" : colour === "chrome" ? "#e2e5ea" : "#bfc3c8";
}

/** A Nigerian number plate: white, the state across the top, the number big in the middle. */
function plateTexture(plate: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = "#f4f4f0";
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = "#1d3a8a";
    g.lineWidth = 3;
    g.strokeRect(2, 2, 252, 60);
    g.fillStyle = "#1d6b3a";
    g.font = "bold 13px sans-serif";
    g.textAlign = "center";
    g.fillText("EDO STATE", 128, 16);
    g.fillStyle = "#1d3a8a";
    g.font = "bold 34px sans-serif";
    g.fillText(plate || "BEN 000 AA", 128, 54);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

let shadowTexture: CanvasTexture | null = null;
function shadowMaterial(): Material {
  return sharedMaterial("shadow", () => {
    if (!shadowTexture) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const g = canvas.getContext("2d");
      if (g) {
        const fade = g.createRadialGradient(32, 32, 4, 32, 32, 32);
        fade.addColorStop(0, "rgba(0,0,0,0.55)");
        fade.addColorStop(0.6, "rgba(0,0,0,0.35)");
        fade.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = fade;
        g.fillRect(0, 0, 64, 64);
      }
      shadowTexture = new CanvasTexture(canvas);
    }
    return new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  });
}

// ---- the car --------------------------------------------------------------------------------

/** Things a driven car changes every frame, without React. */
export type CarMotion = {
  spin: number;    // radians the wheels have turned
  steer: number;   // radians the front wheels are turned (+ is left)
  brake: number;   // 0 off .. 1 hard on
};

type Props = {
  /** "model|colour|plate", as the server sends it. */
  look: string;
  motion?: CarMotion;
  /** Someone at the wheel, if anyone. */
  driver?: Look | null;
  /** Draw a soft shadow under it. Off where the floor already has one. */
  shadow?: boolean;
};

export function Car({ look, motion, driver = null, shadow = true }: Props) {
  const { model, colour, plate } = readCarLook(look);
  const gl = useThree((state) => state.gl);
  const parts = carParts(model);
  const geometry = geometryOf(model);
  const wheelRefs = useRef<(Group | null)[]>([]);
  const spinRefs = useRef<(Group | null)[]>([]);

  const env = useMemo(() => studioFor(gl), [gl]);
  const plateMap = useMemo(() => plateTexture(plate), [plate]);
  // The tail lights are this car's own when someone is driving it, so its brake lights
  // come on without lighting up every other car of the same kind.
  const tail = useMemo(
    () => (motion
      ? new MeshStandardMaterial({ color: new Color("#6a0407"), emissive: new Color("#ff1414"), emissiveIntensity: 0.25, roughness: 0.2, metalness: 0.3 })
      : standard("tail", "#6a0407", { emissive: "#ff1414", emissiveIntensity: 0.22, roughness: 0.2, metalness: 0.3 }, null)),
    [motion],
  );
  const plateMaterial = useMemo(() => new MeshStandardMaterial({ map: plateMap, roughness: 0.5 }), [plateMap]);
  useEffect(() => () => {
    plateMap.dispose();
    plateMaterial.dispose();
    if (motion) tail.dispose();
  }, [plateMap, plateMaterial, tail, motion]);

  const materials = useMemo(() => {
    const byMat: Record<Mat, Material> = {
      paint: paintOf(colour, env),
      glass: sharedMaterial("glass", () => new MeshPhysicalMaterial({
        color: new Color("#0a0e12"), metalness: 0, roughness: 0.04, transparent: true, opacity: 0.68, envMap: env, envMapIntensity: 1.6,
      })),
      trim: standard("trim", "#0b0b0c", { metalness: 0.3, roughness: 0.25 }, env),
      chrome: standard("chrome", "#e8eaee", { metalness: 1, roughness: 0.07 }, env),
      rubber: standard("rubber", "#161617", { roughness: 0.92 }, null),
      under: standard("under", "#0d0d0d", { roughness: 1 }, null),
      head: standard("head", "#f2f5ff", { metalness: 0.4, roughness: 0.08, emissive: "#fff6e6", emissiveIntensity: 0.55 }, env),
      tail,
      plate: plateMaterial,
      rim: standard(`rim:${rimColour(model)}`, rimColour(model), { metalness: 0.9, roughness: 0.18 }, env),
      disc: standard("disc", "#2e2e30", { metalness: 0.6, roughness: 0.5 }, env),
      caliper: standard(`caliper:${CAR_SPECS[model]?.caliper}`, CAR_SPECS[model]?.caliper ?? "#3a3a3a", { roughness: 0.4 }, null),
      interior: standard("interior", "#1c1a18", { roughness: 0.85 }, null),
      seat: standard("seat", "#3a2a20", { roughness: 0.7 }, null),
      cladding: standard("cladding", "#151515", { roughness: 0.75 }, null),
      grille: standard("grille", "#0d0d0f", { metalness: 0.3, roughness: 0.4 }, env),
      amber: standard("amber", "#c27410", { emissive: "#ff8a00", emissiveIntensity: 0.3, roughness: 0.2 }, null),
    };
    return MATS.map((mat) => byMat[mat]);
  }, [colour, env, model, tail, plateMaterial]);

  useFrame(() => {
    if (!motion) return;
    for (let i = 0; i < parts.wheels.length; i++) {
      const wheel = parts.wheels[i];
      const pivot = wheelRefs.current[i];
      const spin = spinRefs.current[i];
      if (pivot) pivot.rotation.y = wheel.front ? motion.steer : 0;
      if (spin) spin.rotation.x = motion.spin;
    }
    if (tail instanceof MeshStandardMaterial) tail.emissiveIntensity = 0.25 + motion.brake * 1.6;
  });

  return (
    <group>
      <mesh geometry={geometry.body} material={materials} castShadow />
      {parts.wheels.map((wheel, i) => (
        <group key={i} ref={(g: Group | null) => { wheelRefs.current[i] = g; }} position={[wheel.x, wheel.y, wheel.z]}>
          <group ref={(g: Group | null) => { spinRefs.current[i] = g; }} rotation={[0.4 * i, 0, 0]}>
            <mesh geometry={geometry.wheel} material={materials} scale={[wheel.side, 1, 1]} castShadow />
          </group>
        </group>
      ))}
      {shadow && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} material={shadowMaterial()}>
          <planeGeometry args={[parts.width * 1.25, parts.length * 1.12]} />
        </mesh>
      )}
      {driver && <Driver look={driver} seat={parts.seat} />}
    </group>
  );
}

/** The person at the wheel: enough of them to see through the glass. */
function Driver({ look, seat }: { look: Look; seat: { x: number; y: number; z: number } }) {
  const skin = standard(`skin:${look.skin_tone}`, look.skin_tone, { roughness: 0.6 }, null);
  const top = standard(`top:${look.top_color}`, look.top_color, { roughness: 0.8 }, null);
  const hair = standard(`hair:${look.hair_color}`, look.hair_color, { roughness: 0.9 }, null);
  return (
    <group position={[seat.x, seat.y, seat.z]}>
      <mesh position={[0, 0.3, -0.02]} material={top}>
        <boxGeometry args={[0.4, 0.56, 0.24]} />
      </mesh>
      <mesh position={[0, 0.7, 0.02]} material={skin}>
        <sphereGeometry args={[0.11, 14, 10]} />
      </mesh>
      <mesh position={[0, 0.77, -0.005]} material={hair}>
        <sphereGeometry args={[0.105, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* Arms out to the wheel. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.19, 0.4, 0.2]} rotation={[-1.1, 0, side * 0.15]} material={top}>
          <boxGeometry args={[0.09, 0.4, 0.09]} />
        </mesh>
      ))}
    </group>
  );
}

/** The cars standing on this street: everyone's, the player's own too. */
export function ParkedCars({ cars }: { cars: readonly { id: string; look: string; x: number; z: number; rot: number }[] }) {
  return (
    <>
      {cars.map((car) => (
        <group key={car.id} position={[car.x, 0, car.z]} rotation-y={car.rot}>
          <Car look={car.look} />
        </group>
      ))}
    </>
  );
}
