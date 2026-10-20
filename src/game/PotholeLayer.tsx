// The potholes on this district's roads, drawn just above the tarmac.

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import type { DistrictData } from "./districtData";
import { buildMuddyWater, buildPotholes, potholesFor } from "./potholes";
import type { MeshData } from "./districtGeometry";

function toGeometry(mesh: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  g.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  g.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  g.setIndex(new BufferAttribute(mesh.indices, 1));
  g.computeBoundingSphere();
  return g;
}

export function PotholeLayer({ district }: { district: DistrictData }) {
  const geometry = useMemo(() => toGeometry(buildPotholes(potholesFor(district))), [district]);
  const mud = useMemo(() => {
    const mesh = buildMuddyWater(potholesFor(district));
    return mesh.indices.length > 0 ? toGeometry(mesh) : null;
  }, [district]);
  useEffect(() => () => {
    geometry.dispose();
    mud?.dispose();
  }, [geometry, mud]);
  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshLambertMaterial vertexColors polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-12} />
      </mesh>
      {mud && (
        <mesh geometry={mud} receiveShadow>
          {/* Standing water: dark, brown, and shiny where the sky catches it. */}
          <meshStandardMaterial vertexColors roughness={0.08} metalness={0.35} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-16} />
        </mesh>
      )}
    </>
  );
}
