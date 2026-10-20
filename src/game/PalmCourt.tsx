import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, SRGBColorSpace, type Mesh } from "three";
import { buildBoxes, type BoxSpec } from "./boxBuilder";
import type { MeshData } from "./districtGeometry";
import { buildPalmCourt } from "./palmCourtShapes";

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const boxes = (list: BoxSpec[]) => toGeometry(buildBoxes(list));

/** Words on a board, as a texture: the hotel's name in gold, the terrace's in white. */
export function signTexture(text: string, colour: string, back: string, aspect: number): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.height = 128;
  canvas.width = Math.min(2048, Math.round(128 * aspect));
  const context = canvas.getContext("2d");
  if (!context) return null;
  if (back !== "#00000000") {
    context.fillStyle = back;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.fillStyle = colour;
  context.textAlign = "center";
  context.textBaseline = "middle";
  let size = 84;
  context.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`;
  while (context.measureText(text).width > canvas.width * 0.92 && size > 20) {
    size -= 4;
    context.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`;
  }
  if (back === "#00000000") {
    context.shadowColor = colour;
    context.shadowBlur = 18;
  }
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Palm Court in GRA, drawn over the two plain boxes the map has there: the Ivory Palm Hotel
 * and the Palm Court Homes terrace with its pool on the roof. Drawn only in GRA.
 */
export function PalmCourt() {
  const parts = useMemo(() => buildPalmCourt(), []);
  const meshes = useMemo(
    () => ({
      solid: boxes(parts.solid),
      glass: boxes(parts.glass),
      railing: boxes(parts.railing),
      glow: boxes(parts.glow),
      water: boxes(parts.water),
      jets: boxes(parts.jets),
    }),
    [parts],
  );
  const signs = useMemo(
    () => parts.signs.map((sign) => ({ ...sign, texture: signTexture(sign.text, sign.colour, sign.back, sign.width / sign.height) })),
    [parts],
  );
  useEffect(
    () => () => {
      Object.values(meshes).forEach((geometry) => geometry.dispose());
      signs.forEach((sign) => sign.texture?.dispose());
    },
    [meshes, signs],
  );

  // The fountain's jets rise and fall.
  const jets = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (jets.current) jets.current.scale.y = 0.85 + Math.sin(clock.elapsedTime * 3.1) * 0.12;
  });

  return (
    <group name="palm-court">
      <mesh geometry={meshes.solid} castShadow receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh geometry={meshes.glass}>
        <meshStandardMaterial vertexColors metalness={0.6} roughness={0.12} />
      </mesh>
      <mesh geometry={meshes.railing}>
        <meshStandardMaterial vertexColors transparent opacity={0.35} metalness={0.2} roughness={0.05} depthWrite={false} side={DoubleSide} />
      </mesh>
      <mesh geometry={meshes.glow}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      <mesh geometry={meshes.water}>
        <meshStandardMaterial vertexColors transparent opacity={0.82} metalness={0.1} roughness={0.05} emissive="#0a5f7f" emissiveIntensity={0.5} />
      </mesh>
      <mesh ref={jets} geometry={meshes.jets}>
        <meshBasicMaterial vertexColors transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {signs.map((sign) =>
        sign.texture ? (
          <mesh key={sign.text} position={[sign.x, sign.y, sign.z]}>
            <planeGeometry args={[sign.width, sign.height]} />
            <meshBasicMaterial map={sign.texture} transparent toneMapped={false} depthWrite={false} />
          </mesh>
        ) : null,
      )}
    </group>
  );
}
