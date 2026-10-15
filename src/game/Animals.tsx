import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { AnimationMixer, Box3, BufferAttribute, BufferGeometry, type AnimationClip, type Group, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { animalShape, legSwing, startWander, stepWander, type AnimalKind, type AnimalShape, type Herd, type Wander } from "./zooAnimals";
import type { MeshData } from "./districtGeometry";

const MAX_STEP = 0.1; // seconds: a frame after a long pause does not send anyone through the fence

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

// ---- a real model, if one has been put in public/models/animals --------------------------------

type Model = { scene: Object3D; clips: AnimationClip[]; scale: number; lift: number };
const models = new Map<AnimalKind, Promise<Model | null>>();

/** Look once for public/models/animals/<kind>.glb. Missing is normal: the drawn animal is used. */
function loadModel(kind: AnimalKind, height: number): Promise<Model | null> {
  let pending = models.get(kind);
  if (!pending) {
    pending = fetch(`/models/animals/${kind}.glb`)
      .then(async (response) => {
        // The dev server answers a missing file with the game's own web page.
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || type.includes("text/html")) return null;
        const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "");
        const box = new Box3().setFromObject(gltf.scene);
        const tall = box.max.y - box.min.y;
        if (!(tall > 0)) return null;
        const scale = height / tall;
        return { scene: gltf.scene, clips: gltf.animations, scale, lift: -box.min.y * scale };
      })
      .catch((error: unknown) => {
        console.warn(`[Animals] could not read ${kind}.glb:`, error);
        return null;
      });
    models.set(kind, pending);
  }
  return pending;
}

function useModel(kind: AnimalKind, height: number): Model | null {
  const [model, setModel] = useState<Model | null>(null);
  useEffect(() => {
    let live = true;
    void loadModel(kind, height).then((found) => live && setModel(found));
    return () => {
      live = false;
    };
  }, [kind, height]);
  return model;
}

// ---- one herd --------------------------------------------------------------------------------

function HerdOf({ herd, offset }: { herd: Herd; offset: number }) {
  const shape: AnimalShape = animalShape(herd.kind);
  const body = useMemo(() => toGeometry(shape.body), [shape]);
  useEffect(() => () => body.dispose(), [body]);
  const model = useModel(herd.kind, shape.height);

  const walks = useMemo<Wander[]>(() => Array.from({ length: herd.count }, (_, i) => startWander(herd.pen, offset + i)), [herd, offset]);
  const roots = useRef<(Group | null)[]>([]);
  const lifts = useRef<(Group | null)[]>([]);
  const legs = useRef<(Group | null)[][]>([]);

  // A copy of the model for each animal, each with its own animation playing.
  const copies = useMemo(() => {
    if (!model) return [];
    return walks.map(() => {
      const scene = SkeletonUtils.clone(model.scene);
      const mixer = new AnimationMixer(scene);
      if (model.clips[0]) mixer.clipAction(model.clips[0]).play();
      return { scene, mixer };
    });
  }, [model, walks]);
  useEffect(() => () => copies.forEach((copy) => copy.mixer.stopAllAction()), [copies]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, MAX_STEP);
    walks.forEach((walk, index) => {
      stepWander(walk, herd.pen, shape, dt);
      const root = roots.current[index];
      if (root) {
        root.position.set(walk.x, 0, walk.z);
        root.rotation.y = walk.rot;
      }
      // A long rest is taken lying down (lions) or sitting (chimps).
      const lift = lifts.current[index];
      if (lift) lift.position.y += ((walk.pause > 2.5 ? -shape.rest : 0) - lift.position.y) * Math.min(1, dt * 3);
      const swung = legs.current[index];
      if (swung) swung.forEach((leg, n) => leg && (leg.rotation.x = legSwing(walk, shape, n)));
      const copy = copies[index];
      if (copy) copy.mixer.update(dt * (0.3 + walk.pace));
    });
  });

  return (
    <>
      {walks.map((_, index) => (
        <group key={index} ref={(group: Group | null) => void (roots.current[index] = group)}>
          {copies[index] && model ? (
            <primitive object={copies[index].scene} scale={model.scale} position-y={model.lift} />
          ) : (
            <group ref={(group: Group | null) => void (lifts.current[index] = group)}>
              <mesh geometry={body} castShadow>
                <meshLambertMaterial vertexColors />
              </mesh>
              {shape.legs.map((leg, n) => (
                <group
                  key={n}
                  position={[leg.x, leg.y, leg.z]}
                  ref={(group: Group | null) => {
                    legs.current[index] ??= [];
                    legs.current[index][n] = group;
                  }}
                >
                  <mesh position-y={-leg.length / 2} castShadow>
                    <boxGeometry args={[leg.half * 2, leg.length, leg.half * 2]} />
                    <meshLambertMaterial color={leg.colour} />
                  </mesh>
                </group>
              ))}
            </group>
          )}
        </group>
      ))}
    </>
  );
}

/** Every animal in a room, each wandering its own pen. */
export function Animals({ herds }: { herds: Herd[] }) {
  let offset = 0;
  return (
    <>
      {herds.map((herd, index) => {
        const start = offset;
        offset += herd.count;
        return <HerdOf key={index} herd={herd} offset={start} />;
      })}
    </>
  );
}
