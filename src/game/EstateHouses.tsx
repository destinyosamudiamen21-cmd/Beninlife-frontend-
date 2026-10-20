import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, CanvasTexture, SRGBColorSpace, type Group } from "three";
import type { HousePlot } from "../api/estates";
import { buildBoxes, type BoxSpec } from "./boxBuilder";
import type { MeshData } from "./districtGeometry";
import { frontBoxes, local, turnOf } from "./estateFronts";

export { plotDoors } from "./estateFronts";

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function plate(lines: string[], mine: boolean): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = mine ? "#1f2a24" : "#f4efe4";
  context.fillRect(0, 0, 512, 160);
  context.strokeStyle = mine ? "#e6b44a" : "#8a7a66";
  context.lineWidth = 8;
  context.strokeRect(6, 6, 500, 148);
  context.fillStyle = mine ? "#ffd56b" : "#2a2420";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "700 56px system-ui, sans-serif";
  context.fillText(lines[0], 256, lines[1] ? 58 : 80, 480);
  if (lines[1]) {
    context.font = "500 34px system-ui, sans-serif";
    context.fillText(lines[1], 256, 116, 480);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function who(plot: HousePlot): string {
  if (plot.count === 0) return "To let";
  const names = plot.residents.slice(0, 2).map((name) => `@${name}`).join(", ");
  return plot.count > 2 ? `${names} +${plot.count - 2}` : names;
}

type Props = { plots: HousePlot[] };

/**
 * The houses players live in, on this district's streets: a front door, gate posts with
 * lamps, a plate with the number and who lives there, and over the player's own house a
 * gold light that can be seen from down the road.
 */
export function EstateHouses({ plots }: Props) {
  const meshes = useMemo(() => {
    const solid: BoxSpec[] = [];
    const glow: BoxSpec[] = [];
    for (const plot of plots) {
      const front = frontBoxes(plot);
      solid.push(...front.solid);
      glow.push(...front.glow);
    }
    return { solid: toGeometry(buildBoxes(solid)), glow: toGeometry(buildBoxes(glow)) };
  }, [plots]);
  const plates = useMemo(
    () => plots.map((plot) => ({
      plot,
      texture: plate(plot.mine ? ["Your house", plot.kind === "luxury" ? plot.estate_name : `No. ${plot.number}`] : [plot.kind === "luxury" ? plot.estate_name : `No. ${plot.number}`, who(plot)], plot.mine),
    })),
    [plots],
  );
  useEffect(() => () => {
    meshes.solid.dispose();
    meshes.glow.dispose();
    plates.forEach((entry) => entry.texture?.dispose());
  }, [meshes, plates]);

  const mine = plots.find((plot) => plot.mine) ?? null;
  const marker = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (marker.current) {
      marker.current.position.y = 7 + Math.sin(clock.elapsedTime * 2) * 0.35;
      marker.current.rotation.y = clock.elapsedTime * 0.8;
    }
  });

  return (
    <group name="estate-houses">
      <mesh geometry={meshes.solid} castShadow receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh geometry={meshes.glow}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      {plates.map(({ plot, texture }) => {
        if (!texture) return null;
        const luxury = plot.kind === "luxury";
        // On the wall beside the door; Palm Court's goes on the glass by its residents' door.
        const [x, z] = local(plot, luxury ? -2.4 : -1.25, luxury ? -1.14 : -1.2);
        return (
          <mesh key={`${plot.estate}:${plot.number}`} position={[x, luxury ? 1.7 : 1.85, z]} rotation={[0, turnOf(plot.facing), 0]}>
            <planeGeometry args={[0.96, 0.3]} />
            <meshBasicMaterial map={texture} toneMapped={false} />
          </mesh>
        );
      })}
      {mine && (
        <group position={[mine.x, 0, mine.z]}>
          {/* A shaft of gold light over the door, to find it from the end of the street. */}
          <mesh position={[0, 14, 0]}>
            <cylinderGeometry args={[0.18, 0.18, 28, 8, 1, true]} />
            <meshBasicMaterial color="#ffcf5a" transparent opacity={0.28} toneMapped={false} depthWrite={false} />
          </mesh>
          <group ref={marker} position={[0, 7, 0]}>
            {/* A little house: walls and a roof. */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[1.1, 0.8, 1.1]} />
              <meshBasicMaterial color="#ffd56b" toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.72, 0]} rotation={[0, Math.PI / 4, 0]}>
              <coneGeometry args={[1.0, 0.65, 4]} />
              <meshBasicMaterial color="#e6a43a" toneMapped={false} />
            </mesh>
          </group>
        </group>
      )}
    </group>
  );
}
