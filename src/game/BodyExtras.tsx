import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { DoubleSide, type Group } from "three";

type OverheadProps = {
  /** The name under everything else. Left out for the player's own body. */
  name?: string;
  /** What they just said out loud, or "". */
  said?: string;
  /** True when they have passed out. */
  out?: boolean;
  /** True while their voice is coming through. */
  talking?: boolean;
};

/** What floats over a player's head: what they said, whether they are out cold, and their name. */
export function Overhead({ name, said, out, talking }: OverheadProps) {
  if (!name && !said && !out) return null;
  return (
    <Html
      position={[0, 2.05, 0]}
      center
      zIndexRange={[4, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div className='overhead'>
        {said && <div className='overhead-said'>{said}</div>}
        {out && (
          <div className='overhead-out'>
            <span aria-hidden='true'>😵</span>
            <b>PASSED OUT</b>
          </div>
        )}
        {name && (
          <div className='nametag'>
            {talking && <span aria-label='talking'>🔊 </span>}
            {name}
          </div>
        )}
      </div>
    </Html>
  );
}

const NOTES = 10;
const NOTE_SECONDS = 1.1; // how long one note is in the air
const NOTE_COLOURS = ["#3f8f5a", "#c9a45a", "#3f8f5a", "#7fb88f", "#c9a45a"];

/** Naira notes thrown in the air, one after another, for as long as this is drawn. */
export function SprayedNotes() {
  const group = useRef<Group>(null);
  const clock = useRef(0);

  useFrame((_, delta) => {
    clock.current += delta;
    const notes = group.current?.children;
    if (!notes) return;
    for (let i = 0; i < notes.length; i++) {
      // Each note leaves the hand in turn, rises, drifts out to its own side and flutters down.
      const t =
        ((clock.current + (i * NOTE_SECONDS) / NOTES) % NOTE_SECONDS) /
        NOTE_SECONDS;
      const angle = i * 2.4;
      const reach = 0.25 + t * (0.7 + (i % 3) * 0.25);
      notes[i].position.set(
        Math.sin(angle) * reach,
        1.5 + 1.5 * t - 2.2 * t * t,
        0.35 + Math.cos(angle) * reach * 0.6
      );
      notes[i].rotation.set(t * 9 + i, t * 5, i);
      notes[i].visible = t < 0.96;
    }
  });

  return (
    <group ref={group}>
      {Array.from({ length: NOTES }, (_, i) => (
        <mesh key={i}>
          <planeGeometry args={[0.17, 0.085]} />
          <meshBasicMaterial
            color={NOTE_COLOURS[i % NOTE_COLOURS.length]}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
