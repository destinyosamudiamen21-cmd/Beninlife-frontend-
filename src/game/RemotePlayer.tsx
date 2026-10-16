import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Overhead, SprayedNotes } from "./BodyExtras";
import { Car, type CarMotion } from "./Car";
import { carParts, readCarLook } from "./carShapes";
import { Character } from "./Character";
import { danceTurn, fightClock, moveNow, newPose, poseMove, setGuard, stepSpeed, strike } from "./fightMoves";
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

export function RemotePlayer({ entry, playersRef, heightAt, said = "", talking = false }: Props) {
  const bodyRef = useRef<Group>(null);
  const speedRef = useRef(0);
  const [placed, setPlaced] = useState(false);
  const lastSpeed = useRef(0);

  // What their body is doing, as the server last said: dancing, sitting, flat on the floor.
  const pose = useMemo(newPose, []);
  // Their car, if they are driving: its wheels roll as far as it moved, and the front ones
  // turn as much as it turned.
  const car = entry.car || "";
  const motion = useMemo<CarMotion>(() => ({ spin: 0, steer: 0, brake: 0 }), []);
  const wheel = useMemo(() => (car ? carParts(readCarLook(car).model) : null), [car]);
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
      body.position.set(target.x, heightAt?.(target.x, target.z) ?? 0, target.z);
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
    if (wheel) {
      // Which way it moved: forwards or backing up.
      const forward = (body.position.x - prevX) * Math.sin(body.rotation.y) + (body.position.z - prevZ) * Math.cos(body.rotation.y);
      motion.spin += forward / wheel.radius;
      const speed = forward / Math.max(delta, 1e-3);
      const yawRate = (Math.atan2(Math.sin(turn), Math.cos(turn)) * ease) / Math.max(delta, 1e-3);
      const steer = Math.abs(speed) > 0.5 ? Math.atan((yawRate * wheel.wheelbase) / speed) : 0;
      motion.steer += (Math.max(-0.55, Math.min(0.55, steer)) - motion.steer) * 0.2;
      // Slowing down hard: the brake lights come on.
      const before = motion.brake;
      const slowing = Math.abs(speed) < Math.abs(lastSpeed.current) - 4 * delta;
      motion.brake = slowing && Math.abs(speed) > 0.3 ? 1 : before * 0.9;
      lastSpeed.current = speed;
    }
    // Dancing on the spot, the feet still go: the dance borrows the walk for its legs.
    speedRef.current = Math.max(moved / Math.max(delta, 1e-3), stepSpeed(move));
  });

  return (
    <group ref={bodyRef} visible={placed}>
      <group visible={!car}>
        <Character speedRef={speedRef} look={entry.look} fight={entry.pose ? pose : null} />
      </group>
      {car && <Car look={car} motion={motion} driver={entry.look} />}
      {placed && entry.pose === "spray" && <SprayedNotes />}
      {placed && <Overhead name={entry.username} said={said} out={entry.pose === "out"} talking={talking} />}
    </group>
  );
}
