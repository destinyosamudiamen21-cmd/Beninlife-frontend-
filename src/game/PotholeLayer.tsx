// The potholes on this district's roads, drawn just above the tarmac.

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import type { DistrictData } from "./districtData";
import { buildPotholes, potholesFor } from "./potholes";

export function PotholeLayer({ district }: { district: DistrictData }) {
  const geometry = useMemo(() => {
    const mesh = buildPotholes(potholesFor(district));
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(mesh.positions, 3));
    g.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
    g.setAttribute("color", new BufferAttribute(mesh.colors, 3));
    g.setIndex(new BufferAttribute(mesh.indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [district]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshLambertMaterial vertexColors polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-12} />
    </mesh>
  );
}
