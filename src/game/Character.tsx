import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useFBX } from "@react-three/drei";
import {
  LoopOnce,
  LoopRepeat,
  SRGBColorSpace,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Bone,
  type Color,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Look } from "../api/appearance";
import { stayOnSpot } from "./clipFit";
import {
  FIGHT_CLIPS,
  MOVE_SECONDS,
  bodyShift,
  clipFor,
  danceFileReady,
  fightClock,
  moveNow,
  type BodyShift,
  type FightPose,
} from "./fightMoves";
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
// `fight` is the start of the names of its fighting animations: "/models/fight-" + "jab" + ".fbx".
type BodyConfig = {
  model: string;
  walk: string;
  run: string;
  height: number;
  fight: string;
};

// Fighting animations made for no body in particular. Every body falls back to these.
const SHARED_FIGHT = "/models/fight-";
// Dances are the same files for every body: "/models/dance-" + "legwork" + ".fbx".
const DANCE = "dance-";
const FIGHT_KEYS = FIGHT_CLIPS.map((name) => `fight-${name}`);

const MAN: BodyConfig = {
  model: "/models/character.fbx",
  walk: "/models/walk.fbx",
  run: "/models/run.fbx",
  height: 1.75,
  fight: SHARED_FIGHT,
};
const WOMAN: BodyConfig = {
  model: "/models/woman.fbx",
  walk: "/models/woman-walk.fbx",
  run: "/models/woman-run.fbx",
  height: 1.63,
  fight: "/models/woman-fight-",
};
const BODIES: Record<string, BodyConfig | undefined> = {
  man: MAN,
  woman: WOMAN,
};

const FALLBACK_SCALE = 0.01; // only used if a model has no skeleton to measure
const WALK_THRESHOLD = 0.3; // metres per second
const RUN_THRESHOLD = 2.8; // between walk (2) and sprint (3.5)
const BLEND_RATE = 12; // higher is a snappier change between animations
const FIGHT_BLEND_RATE = 22; // a punch has to start at once
const TEXTURE_RETRY_SECONDS = 0.25;
const TEXTURE_RETRIES = 40; // give embedded textures 10 seconds to load, then stop asking
const MIXAMO_PREFIX = /^mixamorig\d*/;
const DEBUG_CHARACTER = false; // set to true to log each model's size and parts once

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
  name: string,
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

// ---- fighting and dancing animations ----------------------------------------
// These files are optional. A missing one must not stop the character loading, so they
// are fetched by hand: no Suspense, and a failure is just "not there".

const optionalFiles = new Map<string, Promise<Group | null>>();

function loadOptional(url: string): Promise<Group | null> {
  let pending = optionalFiles.get(url);
  if (!pending) {
    pending = fetch(url)
      .then(async (response) => {
        // The dev server answers a missing file with the game's own web page.
        const kind = response.headers.get("content-type") ?? "";
        if (!response.ok || kind.includes("text/html")) return null;
        return new FBXLoader().parse(await response.arrayBuffer(), "");
      })
      .catch((error: unknown) => {
        console.warn(`[Character] could not read ${url}:`, error);
        return null;
      });
    optionalFiles.set(url, pending);
  }
  return pending;
}

/** How high the hips bone stands in a file's own skeleton, or 0 if it has none. */
function hipsHeight(root: Object3D, prefix: string): number {
  let height = 0;
  root.traverse((child) => {
    if (
      height === 0 &&
      (child as Bone).isBone &&
      child.name.replace(MIXAMO_PREFIX, prefix) === `${prefix}Hips`
    ) {
      height = child.position.y;
    }
  });
  return height;
}

/**
 * A fighting animation made on one body, fitted to another. Only what is safe to carry
 * across is kept: how each bone turns, and where the hips go. The hips are scaled by how
 * tall this body's hips stand (`restHips`) next to the body the animation was made on, so
 * a shorter fighter keeps their feet on the floor. Returns null if it cannot move this
 * body at all.
 */
function fightClip(
  source: Group,
  name: string,
  prefix: string,
  model: Object3D,
  restHips: number
): AnimationClip | null {
  try {
    const clip = namedClip(source, name, prefix);
    if (!clip) return null;

    const hips = `${prefix}Hips`;
    const boneOf = (trackName: string) =>
      trackName.slice(0, trackName.lastIndexOf("."));
    clip.tracks = clip.tracks.filter(
      (track) =>
        model.getObjectByName(boneOf(track.name)) !== undefined &&
        (track.name.endsWith(".quaternion") ||
          track.name === `${hips}.position`)
    );
    if (clip.tracks.length === 0) {
      console.warn(
        `[Character] "${name}" does not fit this body's skeleton, so it is not used.`
      );
      return null;
    }

    const theirs = hipsHeight(source, prefix);
    const position = clip.tracks.find(
      (track) => track.name === `${hips}.position`
    );
    if (
      position &&
      restHips > 0 &&
      theirs > 0 &&
      Math.abs(restHips / theirs - 1) > 0.02
    ) {
      const ratio = restHips / theirs;
      for (let i = 0; i < position.values.length; i++)
        position.values[i] *= ratio;
    }
    return clip;
  } catch (error) {
    console.warn(`[Character] could not use "${name}":`, error);
    return null;
  }
}

const NO_CLIPS: AnimationClip[] = [];

/** The file a move is played from: the body's own if it has one, or else the one every body shares. */
async function moveSource(
  body: BodyConfig,
  key: string
): Promise<Group | null> {
  if (key.startsWith(DANCE)) return loadOptional(`/models/${key}.fbx`);
  const name = key.slice("fight-".length);
  const own =
    body.fight === SHARED_FIGHT
      ? null
      : await loadOptional(`${body.fight}${name}.fbx`);
  return own ?? loadOptional(`${SHARED_FIGHT}${name}.fbx`);
}

/**
 * The fighting and dancing animations this body has loaded so far, named "fight-jab",
 * "dance-legwork" and so on, and a way to ask for more.
 *
 * Nothing is fetched until it is asked for: someone who only ever walks the street loads
 * none of them, and someone dancing loads the one dance they are doing. Asking for the
 * same ones again costs nothing, so it is safe to ask every frame. Those asked for
 * together arrive together: each arrival makes every animation start over for a moment,
 * so a fighter's eight moves must not turn up one at a time.
 */
function useMoveClips(
  body: BodyConfig,
  prefix: string,
  model: Object3D,
  restHips: number
): { clips: AnimationClip[]; ask: (keys: readonly string[]) => void } {
  const [clips, setClips] = useState<AnimationClip[]>(NO_CLIPS);
  const asked = useRef(new Set<string>());
  const current = useRef<Object3D | null>(model);

  // A different body starts again from nothing: the animations were fitted to the old one.
  useEffect(() => {
    if (current.current !== model) {
      asked.current = new Set();
      setClips(NO_CLIPS);
    }
    current.current = model;
    return () => {
      current.current = null; // gone: whatever is still loading is dropped when it arrives
    };
  }, [body, prefix, model, restHips]);

  const ask = useCallback(
    (keys: readonly string[]) => {
      let fresh: string[] | null = null;
      for (const key of keys) {
        if (asked.current.has(key)) continue;
        asked.current.add(key);
        (fresh ??= []).push(key);
      }
      if (!fresh) return; // the usual case, every frame: nothing new, nothing done

      void Promise.all(
        fresh.map(async (key) => {
          const source = await moveSource(body, key);
          if (!source || current.current !== model) return null;
          const clip = fightClip(source, key, prefix, model, restHips);
          if (clip && key.startsWith(DANCE)) {
            // A dance goes round and round on the spot, so any travelling in it is taken out.
            const hips = clip.tracks.find(
              (track) => track.name === `${prefix}Hips.position`
            );
            if (hips) stayOnSpot(hips.times, hips.values);
            danceFileReady(key.slice(DANCE.length));
          }
          return clip;
        })
      ).then((found) => {
        const arrived = found.filter(
          (clip): clip is AnimationClip => clip !== null
        );
        if (arrived.length === 0 || current.current !== model) return;
        setClips((loaded) => [
          ...loaded,
          ...arrived.filter(
            (clip) => !loaded.some((other) => other.name === clip.name)
          ),
        ]);
      });
    },
    [body, prefix, model, restHips]
  );

  return { clips, ask };
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
  /** Set for someone fighting, dancing, sitting or passed out: what their body is doing, written as it goes. */
  fight?: FightPose | null;
};

type ModelProps = Props & { body: BodyConfig };

function CharacterModel({ body, speedRef, look, fight }: ModelProps) {
  const groupRef = useRef<Group>(null);
  const shiftRef = useRef<Group>(null);

  const base = useFBX(body.model);
  const walkFbx = useFBX(body.walk);
  const runFbx = useFBX(body.run);

  const { model, scale, parts, materials, report } = useMemo(
    () => prepareModel(base, body.height),
    [base, body.height]
  );
  const prefix = useMemo(() => findBonePrefix(model), [model]);

  // Fighting and dancing animations are loaded when they are first needed. Out on the
  // street `moveClips` stays empty and everything below behaves exactly as it always has.
  // (`base` is the file as it was loaded and is never animated, so its hips are at rest.)
  const restHips = useMemo(() => hipsHeight(base, prefix), [base, prefix]);
  const { clips: moveClips, ask } = useMoveClips(body, prefix, model, restHips);

  // Standing, walking and running are made once; the fighting and dancing ones join them as they arrive.
  const baseClips = useMemo(
    () =>
      [
        namedClip(base, "idle", prefix),
        namedClip(walkFbx, "walk", prefix),
        namedClip(runFbx, "run", prefix),
      ].filter((clip): clip is AnimationClip => clip !== null),
    [base, walkFbx, runFbx, prefix]
  );
  const clips = useMemo(
    () => (moveClips.length > 0 ? [...baseClips, ...moveClips] : baseClips),
    [baseClips, moveClips]
  );

  const { actions } = useAnimations(clips, groupRef);
  const weights = useRef<Record<string, number>>({ idle: 1 });
  const moveStarted = useRef(0);
  const needed = useRef<string[]>([]); // the one animation the move in hand needs
  const fightFailed = useRef(false);
  const shift = useRef<BodyShift>({
    forward: 0,
    side: 0,
    lift: 0,
    lean: 0,
    roll: 0,
  });
  const retriesLeft = useRef(0);
  const retryTimer = useRef(0);

  // The standing, walking and running animations play all the time, and so does the
  // fighting stance; only their weights change. A punch is started when it is thrown.
  useEffect(() => {
    weights.current = { idle: 1 };
    moveStarted.current = 0;
    for (const state of STATES) {
      actions[state]
        ?.reset()
        .setEffectiveWeight(state === "idle" ? 1 : 0)
        .play();
    }
    actions["fight-idle"]?.reset().setEffectiveWeight(0).play();
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
    let target: string =
      FALLBACKS[wanted].find((state) => actions[state]) ?? "idle";
    let rate = BLEND_RATE;
    let animated = false; // is an animation file doing the current move?

    bodyShift(null, 0, false, shift.current);
    if (fight && !fightFailed.current) {
      // Fighting is extra. If anything in it ever goes wrong it is switched off and says so
      // in the console; the character carries on standing and walking as it always has.
      try {
        const now = fightClock();
        const move = moveNow(fight, now);
        if (fight.guard) {
          // Squared up: every fighting move is fetched now, together, so the first punch does not wait for its file.
          ask(FIGHT_KEYS);
          if (target === "idle" && actions["fight-idle"]) target = "fight-idle";
        }

        const key = move ? clipFor(move) : null;
        if (key && key !== needed.current[0]) needed.current = [key]; // a list of one, made only when the move changes
        if (key) ask(needed.current);
        const action: AnimationAction | null = key
          ? actions[key] ?? null
          : null;
        if (move && key && action) {
          const dance = key.startsWith(DANCE);
          animated = true;
          target = key;
          rate = dance ? BLEND_RATE : FIGHT_BLEND_RATE;
          if (moveStarted.current !== fight.started) {
            // Begun this frame: play it from the start.
            moveStarted.current = fight.started;
            action.reset();
            if (dance || move === "win") {
              action.setLoop(LoopRepeat, Infinity); // keeps dancing, keeps celebrating
            } else {
              action.setLoop(LoopOnce, 1);
              action.clampWhenFinished = true; // a knocked-out fighter stays down
              action.setDuration(MOVE_SECONDS[move]); // fitted to the time the move takes
            }
            action.play();
          }
        }
        // Step in, lean back, go down: the part of a move that is not in any animation file.
        bodyShift(move, now - fight.started, animated, shift.current);
      } catch (error) {
        fightFailed.current = true;
        console.error(
          "[Character] fighting moves switched off after an error:",
          error
        );
      }
    }
    const body3d = shiftRef.current;
    if (body3d) {
      body3d.position.set(
        shift.current.side,
        shift.current.lift,
        shift.current.forward
      );
      body3d.rotation.set(shift.current.lean, 0, shift.current.roll);
    }

    const blend = 1 - Math.exp(-delta * rate);
    for (const clip of clips) {
      const action = actions[clip.name];
      if (!action) continue;
      const goal = clip.name === target ? 1 : 0;
      const weight =
        (weights.current[clip.name] ?? 0) +
        (goal - (weights.current[clip.name] ?? 0)) * blend;
      weights.current[clip.name] = weight;
      action.setEffectiveWeight(weight);
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
    <group ref={shiftRef}>
      <group ref={groupRef}>
        <primitive object={model} scale={scale} />
      </group>
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

export function Character({ speedRef, look, fight }: Props) {
  const body = (look ? BODIES[look.body] : undefined) ?? MAN;
  const fallback =
    body === MAN ? null : (
      <CharacterModel
        body={MAN}
        speedRef={speedRef}
        look={look}
        fight={fight}
      />
    );

  return (
    <ModelBoundary key={body.model} fallback={fallback}>
      <Suspense fallback={null}>
        <CharacterModel
          body={body}
          speedRef={speedRef}
          look={look}
          fight={fight}
        />
      </Suspense>
    </ModelBoundary>
  );
}

useFBX.preload(MAN.model);
useFBX.preload(MAN.walk);
useFBX.preload(MAN.run);
