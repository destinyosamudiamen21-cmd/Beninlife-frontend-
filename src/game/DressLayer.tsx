import { useEffect, useMemo } from "react";
import { createPortal } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import type { Look } from "../api/appearance";
import { dressParts } from "./dressShapes";
import type { Dressable } from "./dressFit";

export { measureDressable, type Dressable } from "./dressFit";

function toGeometry(mesh: ReturnType<typeof dressParts>[number]["mesh"]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

type Props = { dressable: Dressable | null; look?: Look | null; scale: number };

/** The native wear in `look.dress`, hung on the bones of the body it is drawn on. */
export function DressLayer({ dressable, look, scale }: Props) {
  const kind = look?.dress;
  const top = look?.top_color ?? "#ffffff", bottom = look?.bottom_color ?? "#333333", shoes = look?.shoe_color ?? "#222222";
  const pieces = useMemo(() => {
    if (!dressable || !kind) return [];
    return dressParts(kind, dressable.fit, { top, bottom, shoes })
      .filter((part) => dressable.bones[part.bone])
      .map((part) => ({ part, geometry: toGeometry(part.mesh), rest: dressable.bones[part.bone]! }));
  }, [dressable, kind, top, bottom, shoes]);

  useEffect(() => () => pieces.forEach((piece) => piece.geometry.dispose()), [pieces]);

  if (pieces.length === 0) return null;
  return (
    <>
      {pieces.map(({ part, geometry, rest }) =>
        createPortal(
          // Inside the bone: undo its turn and its size at rest, so metres facing forward come out right.
          <group key={part.bone} quaternion={rest.turn} scale={1 / (rest.size * scale)}>
            <mesh geometry={geometry} castShadow receiveShadow frustumCulled={false}>
              <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.82} metalness={0} />
            </mesh>
          </group>,
          rest.bone,
        ),
      )}
    </>
  );
}
