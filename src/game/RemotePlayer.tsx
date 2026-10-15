import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Overhead, SprayedNotes } from "./BodyExtras";
import { Character } from "./Character";
import {
  danceTurn,
  fightClock,
  moveNow,
  newPose,
  poseMove,
  setGuard,
  stepSpeed,
  strike,
} from "./fightMoves";
import type { NetPlayer, RosterEntry } from "./types";

type Props = {
  entry: RosterEntry;
  playersRef: { current: Map<string, NetPlayer> };
  /**
   * How high the ground is at a spot, for footbridges and platforms. The server only says
   * where a player is on the floor plan, so someone standing where a bridge is, is drawn up on it.
   */
  heightAt?: (x: number, z: number) => number;
  /** What they just said out loud, or "". */
  said?: string;
  /** True while their voice is coming through. */
  talking?: boolean;
};

export function RemotePlayer({
  entry,
  playersRef,
  heightAt,
  said = "",
  talking = false,
}: Props) {
  const bodyRef = useRef<Group>(null);
  const speedRef = useRef(0);
  const [placed, setPlaced] = useState(false);

  // What their body is doing, as the server last said: dancing, sitting, flat on the floor.
  const pose = useMemo(newPose, []);
  useEffect(() => {
    const move = poseMove(entry.pose);
    if (move) strike(pose, move);
    else setGuard(pose, false);
  }, [entry.pose, pose]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    const target = playersRef.current.get(entry.id);
    if (!body || !target) return;

    // First position we hear about: appear there instead of sliding in from the origin.
    if (!placed) {
      body.position.set(
        target.x,
        heightAt?.(target.x, target.z) ?? 0,
        target.z
      );
      body.rotation.y = target.rot;
      setPlaced(true);
      return;
    }

    const ease = 1 - Math.exp(-delta * 10);
    const prevX = body.position.x;
    const prevZ = body.position.z;

    body.position.x += (target.x - body.position.x) * ease;
    body.position.z += (target.z - body.position.z) * ease;
    if (heightAt) {
      const floor = heightAt(body.position.x, body.position.z);
      body.position.y += (floor - body.position.y) * ease;
    }

    // A dancer turns as they dance, on top of the way the server says they face.
    const now = fightClock();
    const move = moveNow(pose, now);
    const facing = target.rot + danceTurn(move, now - pose.started);
    const turn = facing - body.rotation.y;
    body.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * ease;

    const moved = Math.hypot(body.position.x - prevX, body.position.z - prevZ);
    // Dancing on the spot, the feet still go: the dance borrows the walk for its legs.
    speedRef.current = Math.max(moved / Math.max(delta, 1e-3), stepSpeed(move));
  });

  return (
    <group ref={bodyRef} visible={placed}>
      <Character
        speedRef={speedRef}
        look={entry.look}
        fight={entry.pose ? pose : null}
      />
      {placed && entry.pose === "spray" && <SprayedNotes />}
      {placed && (
        <Overhead
          name={entry.username}
          said={said}
          out={entry.pose === "out"}
          talking={talking}
        />
      )}
    </group>
  );
}
