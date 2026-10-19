/**
 * Measuring a character model for native wear (dressShapes.ts): where its joints are at
 * rest, and how each bone a garment hangs on is turned and sized. Plain three.js, so it
 * can be checked on the real models outside the game.
 */
import { Quaternion, Vector3, type Bone, type Object3D } from "three";
import { DRESS_BONES, type DressBone, type Fit, type V3 } from "./dressShapes";

const STRIP = /^mixamorig\d*:?/;

/** A bone native wear hangs on, and how to undo its turn and size at rest, so a piece made
 * in metres, facing forward, sits on it the right way up. */
export type RestBone = { bone: Bone; turn: Quaternion; size: number };

/** What it takes to dress a body: where its joints are at rest, and the bones to hang things on. */
export type Dressable = { fit: Fit; bones: Partial<Record<DressBone, RestBone>> };

const spot = new Vector3();
const turn = new Quaternion();
const size = new Vector3();

/**
 * Measure a freshly cloned model, still at scale 1 and in its rest pose, so native wear can
 * be made to fit it. `scale` is what the model will be drawn at. Returns null for a model
 * without the bones a garment needs (it is then just not dressed).
 */
export function measureDressable(model: Object3D, scale: number): Dressable | null {
  model.updateMatrixWorld(true);
  const found = new Map<string, Bone>();
  model.traverse((child) => {
    if ((child as Bone).isBone) found.set(child.name.replace(STRIP, ""), child as Bone);
  });
  const raw = (name: string): V3 | null => {
    const bone = found.get(name);
    if (!bone) return null;
    bone.getWorldPosition(spot);
    return [spot.x * scale, spot.y * scale, spot.z * scale];
  };
  const hips = raw("Hips"), spine1 = raw("Spine1"), spine2 = raw("Spine2"), neck = raw("Neck"), head = raw("Head");
  if (!hips || !spine1 || !spine2 || !neck || !head) return null;
  // Garments are made round the middle of the body: measure everything from above the hips.
  const centre = (p: V3): V3 => [p[0] - hips[0], p[1], p[2] - hips[2]];
  const topEnd = raw("HeadTop_End");
  const arm = raw("LeftArm");
  const fit: Fit = {
    hips: centre(hips), spine1: centre(spine1), spine2: centre(spine2), neck: centre(neck), head: centre(head),
    top: topEnd ? topEnd[1] : head[1] + (head[1] - neck[1]) * 2,
    knee: raw("LeftLeg")?.[1] ?? hips[1] * 0.52,
    ankle: raw("LeftFoot")?.[1] ?? hips[1] * 0.09,
    shoulder: arm ? Math.abs(arm[0] - hips[0]) : 0.19,
    leftHand: centre(raw("LeftHand") ?? [0.72, spine2[1] + 0.15, 0]),
    rightHand: centre(raw("RightHand") ?? [-0.72, spine2[1] + 0.15, 0]),
  };
  const bones: Dressable["bones"] = {};
  for (const name of DRESS_BONES) {
    const bone = found.get(name);
    if (!bone) continue;
    bone.getWorldQuaternion(turn);
    bone.getWorldScale(size);
    bones[name] = { bone, turn: turn.clone().invert(), size: size.x || 1 };
  }
  // The pieces are made relative to the fit's (centred) bone positions; the real bones are
  // not moved, so the pieces go where the garment should be, round the body.
  return { fit, bones };
}

