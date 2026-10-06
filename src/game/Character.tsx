import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useFBX } from "@react-three/drei";
import {
  SRGBColorSpace,
  Vector3,
  type AnimationClip,
  type Bone,
  type Color,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Look } from "../api/appearance";
import {
  averageLinear,
  hexToLinear,
  readPixels,
  tintFor,
  type Pixels,
  type RGB,
  type UVSource,
} from "./tint";

// One entry per body the server offers. `height` is how tall the model should stand, in metres.
type BodyConfig = { model: string; walk: string; run: string; height: number };

const MAN: BodyConfig = {
  model: "/models/character.fbx",
  walk: "/models/walk.fbx",
  run: "/models/run.fbx",
  height: 1.75,
};
const WOMAN: BodyConfig = {
  model: "/models/woman.fbx",
  walk: "/models/woman-walk.fbx",
  run: "/models/woman-run.fbx",
  height: 1.63,
};
const BODIES: Record<string, BodyConfig | undefined> = {
  man: MAN,
  woman: WOMAN,
};

const FALLBACK_SCALE = 0.01; // only used if a model has no skeleton to measure
const WALK_THRESHOLD = 0.3; // metres per second
const RUN_THRESHOLD = 2.8; // between walk (2) and sprint (3.5)
const BLEND_RATE = 12; // higher is a snappier change between animations
const TEXTURE_RETRY_SECONDS = 0.25;
const TEXTURE_RETRIES = 40; // give embedded textures 10 seconds to load, then stop asking
const MIXAMO_PREFIX = /^mixamorig\d*/;
const DEBUG_CHARACTER = true; // logs each model's size and parts once; set to false before the demo

// ---- animation ----------------------------------------------------------

type MoveState = "idle" | "walk" | "run";
const STATES: MoveState[] = ["idle", "walk", "run"];

// If a clip is missing, fall back to the next best one instead of a T-pose.
const FALLBACKS: Record<MoveState, MoveState[]> = {
  idle: ["idle"],
  walk: ["walk", "run", "idle"],
  run: ["run", "walk", "idle"],
};

function stateForSpeed(speed: number): MoveState {
  if (speed > RUN_THRESHOLD) return "run";
  if (speed > WALK_THRESHOLD) return "walk";
  return "idle";
}

function findBonePrefix(root: Object3D): string {
  let prefix: string | null = null;
  root.traverse((child) => {
    if (prefix || !(child as Bone).isBone) return;
    const match = child.name.match(MIXAMO_PREFIX);
    if (match) prefix = match[0];
  });
  return prefix ?? "mixamorig";
}

function namedClip(
  source: Group,
  name: MoveState,
  prefix: string
): AnimationClip | null {
  const best = source.animations.reduce<AnimationClip | undefined>(
    (top, clip) =>
      !top || clip.tracks.length > top.tracks.length ? clip : top,
    undefined
  );
  if (!best || best.tracks.length === 0) {
    console.warn(
      `[Character] "${name}" has no animation data. Re-download it from Mixamo.`
    );
    return null;
  }
  const copy = best.clone();
  copy.name = name;
  copy.tracks.forEach((track) => {
    track.name = track.name.replace(MIXAMO_PREFIX, prefix);
  });
  return copy;
}

// ---- appearance ---------------------------------------------------------

type Part = "skin" | "hair" | "top" | "bottom" | "shoes";
type TintedMaterial = Material & { color: Color; map?: Texture | null };
// One mesh's material, plus where on the texture that mesh draws from.
// `average` is filled in the first time the texture can be read.
type TintTarget = {
  material: TintedMaterial;
  uv: UVSource | null;
  average?: RGB | null;
};
type Parts = Record<Part, TintTarget[]>;

const PARTS: Part[] = ["skin", "hair", "top", "bottom", "shoes"];

const LOOK_FIELD: Record<Part, keyof Look> = {
  skin: "skin_tone",
  hair: "hair_color",
  top: "top_color",
  bottom: "bottom_color",
  shoes: "shoe_color",
};

// Checked in order against a mesh name, or failing that its material name.
// Clothing comes before skin so "Ch22_Shirt" is never mistaken for a body part.
const PART_PATTERNS: [Part, RegExp][] = [
  ["hair", /hair|beard/i],
  ["shoes", /shoe|sneaker|boot/i],
  ["top", /top|shirt|jacket|hoodie|sweater|dress/i],
  ["bottom", /bottom|pant|trouser|jean|short|skirt/i],
  ["skin", /body|skin|head|face/i],
];

function partFor(name: string): Part | null {
  for (const [part, pattern] of PART_PATTERNS) {
    if (pattern.test(name)) return part;
  }
  return null;
}

type Prepared = {
  model: Object3D;
  scale: number;
  parts: Parts;
  materials: Material[];
  report: string[];
};

const bonePosition = new Vector3();

/**
 * How tall the skeleton stands in the model's own units, toes to top of head.
 * Model files do not agree on units, so the size is measured rather than assumed.
 */
function skeletonHeight(model: Object3D): number | null {
  let lowest = Infinity;
  let highest = -Infinity;
  model.traverse((child) => {
    if (!(child as Bone).isBone) return;
    child.getWorldPosition(bonePosition);
    lowest = Math.min(lowest, bonePosition.y);
    highest = Math.max(highest, bonePosition.y);
  });
  const height = highest - lowest;
  return Number.isFinite(height) && height > 0 ? height : null;
}

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Clone the shared model so this player owns its skeleton and its materials. */
function prepareModel(source: Group, targetHeight: number): Prepared {
  const model = SkeletonUtils.clone(source);

  // Measure at scale 1 in the rest pose, then work out the scale that gives the target height.
  model.scale.set(1, 1, 1);
  model.updateMatrixWorld(true);
  const nativeHeight = skeletonHeight(model);
  const scale = nativeHeight ? targetHeight / nativeHeight : FALLBACK_SCALE;

  const meshes: Mesh[] = [];
  model.traverse((child) => {
    if ((child as Mesh).isMesh) meshes.push(child as Mesh);
  });

  // Some characters use one texture sheet for skin, shirt, trousers and shoes together.
  // Find those: a material whose meshes belong to more than one part.
  const spread = new Map<Material, Set<Part>>();
  for (const mesh of meshes) {
    const part = partFor(mesh.name);
    for (const material of materialsOf(mesh)) {
      const found = spread.get(material) ?? new Set<Part>();
      if (part) found.add(part);
      spread.set(material, found);
    }
  }

  const parts: Parts = { skin: [], hair: [], top: [], bottom: [], shoes: [] };
  const materials: Material[] = [];
  const report: string[] = [
    nativeHeight
      ? `size: ${nativeHeight.toFixed(1)} units tall, scaled by ${scale.toFixed(
          5
        )} to ${targetHeight} m`
      : `size: no skeleton found, using scale ${FALLBACK_SCALE}`,
  ];

  for (const mesh of meshes) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const uv =
      (mesh.geometry.getAttribute("uv") as UVSource | undefined) ?? null;

    // Every mesh gets its own copy of its material. That keeps one player's colours off
    // another player, and lets a shirt and trousers that share a texture be tinted apart.
    const ownCopy = (original: Material): Material => {
      const copy = original.clone();
      materials.push(copy);

      const sharedSheet = (spread.get(original)?.size ?? 0) > 1;
      const part =
        partFor(mesh.name) ?? (sharedSheet ? null : partFor(original.name));
      report.push(
        `${mesh.name} (${original.name || "unnamed"}) -> ${
          part ?? "not tinted"
        }`
      );

      if (part && "color" in copy) {
        const tinted = copy as TintedMaterial;
        tinted.userData.baseColor = tinted.color.clone();
        parts[part].push({ material: tinted, uv });
      }
      return copy;
    };

    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(ownCopy)
      : ownCopy(mesh.material);
  }

  return { model, scale, parts, materials, report };
}

const pixelCache = new WeakMap<Texture, Pixels | null>();

/**
 * Readable pixels of a texture, or "pending" while its image is still loading.
 * Textures packed inside an FBX file arrive a moment after the model itself.
 */
function texturePixels(texture: Texture): Pixels | null | "pending" {
  if (pixelCache.has(texture)) return pixelCache.get(texture) ?? null;

  const image = texture.image as
    | (CanvasImageSource & { complete?: boolean })
    | null
    | undefined;
  if (!image || image.complete === false) return "pending";

  const pixels = readPixels(image);
  pixelCache.set(texture, pixels);
  return pixels;
}

/** Average colour of the part of the texture this mesh uses. */
function targetAverage(target: TintTarget): RGB | null | "pending" {
  if (target.average !== undefined) return target.average;

  const map = target.material.map;
  if (!map) {
    target.average = null;
    return null;
  }
  const pixels = texturePixels(map);
  if (pixels === "pending") return "pending";

  target.average = pixels
    ? averageLinear(
        pixels,
        map.colorSpace === SRGBColorSpace,
        target.uv,
        map.flipY
      )
    : null;
  return target.average;
}

/** Colour every part. Returns true if a texture was not ready and this should be retried. */
function applyLook(parts: Parts, look: Look | null | undefined): boolean {
  let pending = false;

  for (const part of PARTS) {
    for (const target of parts[part]) {
      const { material } = target;
      if (!look) {
        material.color.copy(material.userData.baseColor as Color);
        continue;
      }
      const tint = hexToLinear(look[LOOK_FIELD[part]]);
      const average = targetAverage(target);
      if (average === "pending") pending = true;

      const { r, g, b } = tintFor(tint, average === "pending" ? null : average);
      material.color.setRGB(r, g, b);
    }
  }
  return pending;
}

const reportedModels = new Set<string>();

// ---- component ----------------------------------------------------------

type Props = {
  speedRef: { current: number };
  look?: Look | null;
};

type ModelProps = Props & { body: BodyConfig };

function CharacterModel({ body, speedRef, look }: ModelProps) {
  const groupRef = useRef<Group>(null);

  const base = useFBX(body.model);
  const walkFbx = useFBX(body.walk);
  const runFbx = useFBX(body.run);

  const { model, scale, parts, materials, report } = useMemo(
    () => prepareModel(base, body.height),
    [base, body.height]
  );
  const prefix = useMemo(() => findBonePrefix(model), [model]);

  const clips = useMemo(
    () =>
      [
        namedClip(base, "idle", prefix),
        namedClip(walkFbx, "walk", prefix),
        namedClip(runFbx, "run", prefix),
      ].filter((clip): clip is AnimationClip => clip !== null),
    [base, walkFbx, runFbx, prefix]
  );

  const { actions } = useAnimations(clips, groupRef);
  const weights = useRef<Record<MoveState, number>>({
    idle: 1,
    walk: 0,
    run: 0,
  });
  const retriesLeft = useRef(0);
  const retryTimer = useRef(0);

  // All three animations play all the time; only their weights change.
  useEffect(() => {
    weights.current = { idle: 1, walk: 0, run: 0 };
    for (const state of STATES) {
      actions[state]?.reset().setEffectiveWeight(weights.current[state]).play();
    }
  }, [actions]);

  // Colour the model before the next frame is drawn, so it never flashes untinted.
  useLayoutEffect(() => {
    retriesLeft.current = applyLook(parts, look) ? TEXTURE_RETRIES : 0;
  }, [parts, look]);

  useEffect(() => {
    return () => materials.forEach((material) => material.dispose());
  }, [materials]);

  useEffect(() => {
    if (!DEBUG_CHARACTER || reportedModels.has(body.model)) return;
    reportedModels.add(body.model);
    console.info(`[Character] ${body.model}:`, report);
  }, [body.model, report]);

  useFrame((_, delta) => {
    const wanted = stateForSpeed(speedRef.current);
    const target = FALLBACKS[wanted].find((state) => actions[state]) ?? "idle";
    const blend = 1 - Math.exp(-delta * BLEND_RATE);

    for (const state of STATES) {
      const action = actions[state];
      if (!action) continue;
      const goal = state === target ? 1 : 0;
      weights.current[state] += (goal - weights.current[state]) * blend;
      action.setEffectiveWeight(weights.current[state]);
    }

    // A texture was not loaded yet when the look was applied: try again shortly.
    if (retriesLeft.current > 0) {
      retryTimer.current += delta;
      if (retryTimer.current >= TEXTURE_RETRY_SECONDS) {
        retryTimer.current = 0;
        retriesLeft.current = applyLook(parts, look)
          ? retriesLeft.current - 1
          : 0;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={model} scale={scale} />
    </group>
  );
}

type BoundaryProps = { fallback: ReactNode; children: ReactNode };

/** If a body's model files fail to load, show the fallback instead of blanking the whole scene. */
class ModelBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(
      "[Character] model failed to load, using the fallback:",
      error
    );
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Character({ speedRef, look }: Props) {
  const body = (look ? BODIES[look.body] : undefined) ?? MAN;
  const fallback =
    body === MAN ? null : (
      <CharacterModel body={MAN} speedRef={speedRef} look={look} />
    );

  return (
    <ModelBoundary key={body.model} fallback={fallback}>
      <Suspense fallback={null}>
        <CharacterModel body={body} speedRef={speedRef} look={look} />
      </Suspense>
    </ModelBoundary>
  );
}

useFBX.preload(MAN.model);
useFBX.preload(MAN.walk);
useFBX.preload(MAN.run);
