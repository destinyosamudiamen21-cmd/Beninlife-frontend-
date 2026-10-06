import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import { Character } from "./Character";
import type { NetPlayer, RosterEntry } from "./types";

const FOLLOW_SMOOTHING = 10; // how quickly a remote player catches up to their latest position
const NAMETAG_HEIGHT = 2.05; // metres, just above a 1.75 m head

type Props = {
  entry: RosterEntry;
  playersRef: { current: Map<string, NetPlayer> };
};

export function RemotePlayer({ entry, playersRef }: Props) {
  const bodyRef = useRef<Group>(null);
  const speedRef = useRef(0);
  const [placed, setPlaced] = useState(false);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    const target = playersRef.current.get(entry.id);
    if (!body || !target) return;

    // First position we hear about: appear there instead of sliding in from the origin.
    if (!placed) {
      body.position.set(target.x, 0, target.z);
      body.rotation.y = target.rot;
      setPlaced(true);
      return;
    }

    const ease = 1 - Math.exp(-delta * FOLLOW_SMOOTHING);
    const prevX = body.position.x;
    const prevZ = body.position.z;

    body.position.x += (target.x - body.position.x) * ease;
    body.position.z += (target.z - body.position.z) * ease;

    const turn = target.rot - body.rotation.y;
    body.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * ease;

    // Speed is worked out from how far they moved, so their walk and run animations
    // play without the server sending anything extra.
    const moved = Math.hypot(body.position.x - prevX, body.position.z - prevZ);
    speedRef.current = moved / Math.max(delta, 1e-3);
  });

  return (
    <group ref={bodyRef} visible={placed}>
      <Character speedRef={speedRef} look={entry.look} />
      {placed && (
        <Html
          position={[0, NAMETAG_HEIGHT, 0]}
          center
          zIndexRange={[4, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className='nametag'>{entry.username}</div>
        </Html>
      )}
    </group>
  );
}
