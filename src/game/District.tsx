import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  type DirectionalLight,
  type InstancedMesh,
  type Sprite,
} from "three";
import {
  gateSign,
  type DistrictData,
  type Gate,
  type PlaceLabel,
} from "./districtData";
import {
  buildDistrictMeshes,
  buildPalmTree,
  buildShadeTree,
  type MeshData,
} from "./districtGeometry";
import {
  drawFacade,
  drawGateSign,
  drawGrass,
  drawSign,
} from "./districtTextures";
import { playerFocus } from "./focus";
import { cameraInput } from "./input";
import { buildStreetProps } from "./streetProps";

const HAZE = "#c9d9e6"; // distant things fade into this
const HAZE_START = 180;
const HAZE_END = 950;
const SUN_DIRECTION: [number, number, number] = [60, 80, 40];
const SUN_DISTANCE = 1.4; // the light sits this many times SUN_DIRECTION from the player
const SHADOW_MAP = 2048;
const GROUND_SIZE = 6000;
const GRASS_TILE = 28; // metres covered by one copy of the grass picture

// Signs stay readable by growing with distance, up to a limit, and vanish when far.
const SIGN_GROWTH = 0.05;
const SIGN_STYLE = {
  landmark: { range: 520, largest: 16 },
  place: { range: 170, largest: 5 },
  road: { range: 150, largest: 4 },
};

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setAttribute("uv", new BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function toTexture(canvas: HTMLCanvasElement, tiled = false): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  if (tiled) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
  }
  return texture;
}

/** A repeatable number from 0 to 1 for a tree, so every player sees the same trees. */
function scatter(n: number): number {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// ---- sun ---------------------------------------------------------------

/**
 * Shadows are only drawn in a square around the player, so the sun follows the
 * player. Zooming out widens the square, otherwise distant shadows would vanish.
 */
function Sun() {
  const lightRef = useRef<DirectionalLight>(null);
  const reach = useRef(0);

  useFrame(() => {
    const light = lightRef.current;
    if (!light) return;

    const { x, z } = playerFocus;
    light.position.set(
      x + SUN_DIRECTION[0] * SUN_DISTANCE,
      SUN_DIRECTION[1] * SUN_DISTANCE,
      z + SUN_DIRECTION[2] * SUN_DISTANCE
    );
    light.target.position.set(x, 0, z);
    light.target.updateMatrixWorld();

    const wanted = Math.min(170, Math.max(55, cameraInput.zoom * 30));
    if (Math.abs(wanted - reach.current) > 2) {
      reach.current = wanted;
      const camera = light.shadow.camera;
      camera.left = -wanted;
      camera.right = wanted;
      camera.top = wanted;
      camera.bottom = -wanted;
      camera.updateProjectionMatrix();
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      color='#fff3df'
      intensity={1.7}
      castShadow
      shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
      shadow-camera-near={1}
      shadow-camera-far={420}
      shadow-bias={-0.0004}
      shadow-normalBias={0.05}
    />
  );
}

// ---- trees -------------------------------------------------------------

type TreesProps = { trees: number[]; kind: number; geometry: BufferGeometry };

/** Every tree of one kind is drawn in a single call: one shape, many positions. */
function Trees({ trees, kind, geometry }: TreesProps) {
  const meshRef = useRef<InstancedMesh>(null);

  const spots = useMemo(() => {
    const list: { x: number; z: number; size: number; seed: number }[] = [];
    for (let i = 0; i + 3 < trees.length; i += 4) {
      if (trees[i + 2] === kind)
        list.push({
          x: trees[i],
          z: trees[i + 1],
          size: trees[i + 3],
          seed: i,
        });
    }
    return list;
  }, [trees, kind]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const placer = new Object3D();
    const tint = new Color();

    spots.forEach((spot, index) => {
      placer.position.set(spot.x, 0, spot.z);
      placer.rotation.set(0, scatter(spot.seed) * Math.PI * 2, 0);
      placer.scale.set(
        spot.size,
        spot.size * (0.9 + scatter(spot.seed + 1) * 0.25),
        spot.size
      );
      placer.updateMatrix();
      mesh.setMatrixAt(index, placer.matrix);
      mesh.setColorAt(
        index,
        tint.setScalar(0.82 + scatter(spot.seed + 2) * 0.36)
      );
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [spots]);

  if (spots.length === 0) return null;
  return (
    <instancedMesh
      key={spots.length}
      ref={meshRef}
      args={[geometry, undefined, spots.length]}
      castShadow
      receiveShadow
    >
      <meshLambertMaterial vertexColors />
    </instancedMesh>
  );
}

// ---- signs -------------------------------------------------------------

function PlaceSign({ label }: { label: PlaceLabel }) {
  const spriteRef = useRef<Sprite>(null);

  const sign = useMemo(() => {
    const canvas = drawSign(label.text, label.k);
    return { texture: toTexture(canvas), aspect: canvas.width / canvas.height };
  }, [label.text, label.k]);

  useEffect(() => () => sign.texture.dispose(), [sign]);

  useFrame(({ camera }) => {
    const sprite = spriteRef.current;
    if (!sprite) return;
    const style = SIGN_STYLE[label.k] ?? SIGN_STYLE.place;
    const distance = camera.position.distanceTo(sprite.position);
    sprite.visible = distance < style.range;
    if (!sprite.visible) return;
    const height = Math.min(
      Math.max(distance * SIGN_GROWTH, 0.9),
      style.largest
    );
    sprite.scale.set(height * sign.aspect, height, 1);
  });

  return (
    <sprite ref={spriteRef} position={[label.x, label.y, label.z]}>
      <spriteMaterial
        map={sign.texture}
        transparent
        depthWrite={false}
        fog={false}
      />
    </sprite>
  );
}

function GateName({ gate }: { gate: Gate }) {
  const texture = useMemo(
    () => toTexture(drawGateSign(gate.text)),
    [gate.text]
  );
  useEffect(() => () => texture.dispose(), [texture]);

  const board = gateSign(gate);
  return (
    <mesh position={[gate.x, board.y, board.z]}>
      <planeGeometry args={[board.width, board.height]} />
      <meshLambertMaterial map={texture} />
    </mesh>
  );
}

// ---- the district ------------------------------------------------------

export function District({ data }: { data: DistrictData }) {
  const assets = useMemo(() => {
    const meshes = buildDistrictMeshes(data);
    const street = buildStreetProps(data);
    const grass = toTexture(drawGrass(), true);
    grass.repeat.set(GROUND_SIZE / GRASS_TILE, GROUND_SIZE / GRASS_TILE);
    return {
      walls: toGeometry(meshes.walls),
      roofs: toGeometry(meshes.roofs),
      structures: toGeometry(meshes.structures),
      layers: meshes.layers.map(toGeometry),
      props: toGeometry(street.props),
      pads: toGeometry(street.pads),
      hasProps: street.props.indices.length > 0,
      hasPads: street.pads.indices.length > 0,
      shadeTree: toGeometry(buildShadeTree()),
      palmTree: toGeometry(buildPalmTree()),
      facade: toTexture(drawFacade(), true),
      grass,
    };
  }, [data]);

  // Hand the memory back to the graphics card when the district is left.
  useEffect(
    () => () => {
      for (const geometry of [
        assets.walls,
        assets.roofs,
        assets.structures,
        assets.props,
        assets.pads,
        assets.shadeTree,
        assets.palmTree,
        ...assets.layers,
      ]) {
        geometry.dispose();
      }
      assets.facade.dispose();
      assets.grass.dispose();
    },
    [assets]
  );

  return (
    <>
      <color attach='background' args={[HAZE]} />
      <fog attach='fog' args={[HAZE, HAZE_START, HAZE_END]} />
      <Sky distance={450000} sunPosition={SUN_DIRECTION} />
      <hemisphereLight args={["#dfefff", "#7b7a52", 0.7]} />
      <Sun />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshLambertMaterial map={assets.grass} />
      </mesh>

      {/* The ground of markets and parks goes down first, under the yards and roads. */}
      {assets.hasPads && (
        <mesh geometry={assets.pads} receiveShadow>
          <meshLambertMaterial
            vertexColors
            polygonOffset
            polygonOffsetFactor={-0.5}
            polygonOffsetUnits={-2}
          />
        </mesh>
      )}

      {/* Yards, roads and paint lie almost on the ground. Each layer is nudged towards the
          camera a little more than the one below, so they never flicker through each other. */}
      {assets.layers.map((geometry, index) => (
        <mesh
          key={index}
          geometry={geometry}
          receiveShadow
          renderOrder={index + 1}
        >
          <meshLambertMaterial
            vertexColors
            polygonOffset
            polygonOffsetFactor={-(index + 1)}
            polygonOffsetUnits={-(index + 1) * 4}
          />
        </mesh>
      ))}

      <mesh geometry={assets.walls} castShadow receiveShadow>
        <meshLambertMaterial vertexColors map={assets.facade} />
      </mesh>
      <mesh geometry={assets.roofs} castShadow receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh geometry={assets.structures} castShadow receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>

      {/* Market stalls, electricity poles and wires, parked buses and kekes. */}
      {assets.hasProps && (
        <mesh geometry={assets.props} castShadow receiveShadow>
          <meshLambertMaterial vertexColors />
        </mesh>
      )}

      <Trees trees={data.trees} kind={0} geometry={assets.shadeTree} />
      <Trees trees={data.trees} kind={1} geometry={assets.palmTree} />

      {data.gates.map((gate) => (
        <GateName key={`${gate.x},${gate.z}`} gate={gate} />
      ))}
      {data.labels.map((label) => (
        <PlaceSign key={`${label.text},${label.x},${label.z}`} label={label} />
      ))}
    </>
  );
}
