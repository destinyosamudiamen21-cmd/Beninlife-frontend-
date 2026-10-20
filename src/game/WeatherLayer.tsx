import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Fog,
  type InstancedMesh,
  type LineSegments,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  Object3D,
} from "three";
import type { DistrictData } from "./districtData";
import { FLOOD_ZONES, floodAt, rainAt, waterRibbon, weatherNow } from "./weather";

const BOX = 70;                // metres round the camera the rain falls in
const FALL = 17;               // metres a second
const STREAK = 0.55;           // metres long
const RIPPLES = 48;            // rings spreading on the flood water at once
const GLOOM = new Color("#6f7a83");   // what the sky goes in a downpour

/** A ribbon of water along a flooded road, as the 3D library wants it. */
function waterGeometry(p: number[], half: number): BufferGeometry {
  const ribbon = waterRibbon(p, half);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(ribbon.positions, 3));
  geometry.setAttribute("color", new BufferAttribute(ribbon.colors, 4));
  geometry.setIndex(new BufferAttribute(ribbon.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

type Props = {
  district: DistrictData;
  /** The server's clock minus this browser's, in milliseconds. */
  clockOffset: number;
  /** A phone: fewer drops. */
  light: boolean;
};

/**
 * The weather on the street: rain falling round the camera, the sky going grey, and the
 * water standing on the roads that flood. Everything it works out it also leaves in
 * `weatherNow`, for the car, the walkers and the traffic.
 */
export function WeatherLayer({ district, clockOffset, light }: Props) {
  const drops = light ? 650 : 1800;
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  // The rain: short lines, each a drop, falling and wrapping round inside a box on the camera.
  const rain = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(drops * 6);
    for (let i = 0; i < drops; i++) {
      const x = (Math.random() - 0.5) * BOX, y = Math.random() * 30, z = (Math.random() - 0.5) * BOX;
      positions.set([x, y, z, x + 0.06, y + STREAK, z + 0.04], i * 6);
    }
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.boundingSphere = null;
    return geometry;
  }, [drops]);
  const zones = useMemo(() => (FLOOD_ZONES[district.id] ?? []).map((zone) => ({ zone, geometry: waterGeometry(zone.p, zone.half) })), [district.id]);
  useEffect(() => () => {
    rain.dispose();
    zones.forEach((zone) => zone.geometry.dispose());
  }, [rain, zones]);

  const rainRef = useRef<LineSegments>(null);
  const domeRef = useRef<Mesh>(null);
  const waterRefs = useRef<(Mesh | null)[]>([]);
  const ripplesRef = useRef<InstancedMesh>(null);
  const ripples = useMemo(() => Array.from({ length: RIPPLES }, () => ({ x: 0, z: 0, age: 1 + Math.random(), life: 1 })), []);
  const dummy = useMemo(() => new Object3D(), []);
  const baseFog = useRef<{ color: Color; far: number } | null>(null);

  useEffect(() => {
    weatherNow.district = district.id;
    return () => {
      weatherNow.district = "";
      weatherNow.rain = 0;
      weatherNow.flood = 0;
      // Whatever the rain did to the sky is undone.
      const fog = scene.fog as Fog | null;
      if (fog && baseFog.current) {
        fog.color.copy(baseFog.current.color);
        fog.far = baseFog.current.far;
      }
    };
  }, [district.id, scene]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const now = Date.now() + clockOffset;
    const wet = rainAt(now);
    const flood = floodAt(now);
    weatherNow.rain = wet;
    weatherNow.flood = flood;
    weatherNow.serverMs = now;

    // The sky closes in.
    const fog = scene.fog as Fog | null;
    if (fog) {
      if (!baseFog.current) baseFog.current = { color: fog.color.clone(), far: fog.far };
      fog.color.copy(baseFog.current.color).lerp(GLOOM, wet * 0.85);
      fog.far = baseFog.current.far * (1 - 0.62 * wet);
    }
    const dome = domeRef.current;
    if (dome) {
      dome.visible = wet > 0.01;
      dome.position.copy(camera.position);
      (dome.material as MeshBasicMaterial).opacity = wet * 0.72;
    }

    // The drops fall, and wrap round to the top of the box when they reach the ground.
    const lines = rainRef.current;
    if (lines) {
      lines.visible = wet > 0.02;
      if (lines.visible) {
        lines.position.set(camera.position.x, 0, camera.position.z);
        (lines.material as MeshBasicMaterial).opacity = 0.18 + 0.4 * wet;
        const array = rain.attributes.position.array as Float32Array;
        const shown = Math.floor(drops * Math.min(1, wet * 1.3));
        const fall = FALL * dt;
        for (let i = 0; i < drops; i++) {
          const o = i * 6;
          if (i >= shown) {
            array[o + 1] = array[o + 4] = -50;   // out of sight below the ground
            continue;
          }
          let y = array[o + 1] - fall;
          if (y < 0) {
            y += 28 + Math.random() * 2;
            const x = (Math.random() - 0.5) * BOX, z = (Math.random() - 0.5) * BOX;
            array[o] = x;
            array[o + 2] = z;
            array[o + 3] = x + 0.06;
            array[o + 5] = z + 0.04;
          }
          array[o + 1] = y;
          array[o + 4] = y + STREAK;
        }
        rain.attributes.position.needsUpdate = true;
      }
    }

    // The flood: the water rises with how full the drains are.
    zones.forEach(({ zone }, index) => {
      const water = waterRefs.current[index];
      if (!water) return;
      const level = Math.max(zone.always, flood);
      water.visible = level > 0.02;
      water.position.y = 0.11 + zone.depth * level * 0.9;
      const material = water.material as MeshStandardMaterial;
      material.opacity = Math.min(0.92, 0.35 + level * 0.7);
    });

    // Rings where the drops hit the water, near the camera.
    const rings = ripplesRef.current;
    if (rings) {
      const floodZone = zones[0];
      rings.visible = wet > 0.05 && flood > 0.05 && floodZone !== undefined;
      if (rings.visible && floodZone) {
        const surface = 0.12 + floodZone.zone.depth * Math.max(floodZone.zone.always, flood) * 0.9;
        ripples.forEach((ring, i) => {
          ring.age += dt / ring.life;
          if (ring.age >= 1) {
            // A new drop somewhere near the camera, on the water.
            const p = floodZone.zone.p;
            const k = Math.floor(Math.random() * (p.length / 2 - 1)) * 2;
            const t = Math.random();
            ring.x = p[k] + (p[k + 2] - p[k]) * t + (Math.random() - 0.5) * floodZone.zone.half * 1.6;
            ring.z = p[k + 1] + (p[k + 3] - p[k + 1]) * t + (Math.random() - 0.5) * floodZone.zone.half * 1.6;
            if (Math.hypot(ring.x - camera.position.x, ring.z - camera.position.z) > 60) {
              ring.x = camera.position.x + (Math.random() - 0.5) * 40;
              ring.z = camera.position.z + (Math.random() - 0.5) * 40;
            }
            ring.age = 0;
            ring.life = 0.5 + Math.random() * 0.6;
          }
          const size = 0.15 + ring.age * 0.9;
          dummy.position.set(ring.x, surface + 0.01, ring.z);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.scale.set(size, size, size);
          dummy.updateMatrix();
          rings.setMatrixAt(i, dummy.matrix);
        });
        rings.instanceMatrix.needsUpdate = true;
        (rings.material as MeshBasicMaterial).opacity = 0.35 * wet;
      }
    }
  });

  return (
    <>
      {/* A grey veil round the camera that hides the blue sky while it pours. */}
      <mesh ref={domeRef} renderOrder={-1} visible={false}>
        <sphereGeometry args={[520, 24, 12]} />
        <meshBasicMaterial color={GLOOM} side={BackSide} transparent opacity={0} depthWrite={false} fog={false} />
      </mesh>
      <lineSegments ref={rainRef} geometry={rain} frustumCulled={false} visible={false}>
        <lineBasicMaterial color="#c9d6e2" transparent opacity={0.4} depthWrite={false} />
      </lineSegments>
      {zones.map(({ zone, geometry }, index) => (
        <mesh
          key={zone.name}
          ref={(mesh: Mesh | null) => {
            waterRefs.current[index] = mesh;
          }}
          geometry={geometry}
          visible={false}
          renderOrder={8}
        >
          <meshStandardMaterial
            color="#6b5a40"
            vertexColors
            transparent
            opacity={0.8}
            roughness={0.12}
            metalness={0.25}
            depthWrite={false}
            side={DoubleSide}
            polygonOffset
            polygonOffsetFactor={-12}
            polygonOffsetUnits={-40}
          />
        </mesh>
      ))}
      <instancedMesh ref={ripplesRef} args={[undefined, undefined, RIPPLES]} frustumCulled={false} visible={false}>
        <ringGeometry args={[0.8, 1, 20]} />
        <meshBasicMaterial color="#e6eef2" transparent opacity={0.3} depthWrite={false} blending={AdditiveBlending} />
      </instancedMesh>
    </>
  );
}
