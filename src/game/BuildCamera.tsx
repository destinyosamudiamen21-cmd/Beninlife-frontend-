import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Lot } from "../api/home";
import { buildCam } from "./homeBuild";

const SMOOTH = 10;       // how quickly the camera catches up with where it was asked to be
const MIN_DIST = 5;
const MAX_DIST = 46;
const DRAG_START = 6;    // pixels a finger must move before it is a drag, not a tap
const goal = new Vector3();
const look = new Vector3();
const lookNow = new Vector3();

/**
 * The camera while building: up above the house, looking down at it, as in The Sims.
 * Drag to slide it about, pinch or scroll to come closer, twist two fingers to turn it.
 * The buttons in the build panel turn it and zoom it too, through `buildCam`.
 */
export function BuildCamera({ lot, cell }: { lot: Lot; cell: number }) {
  const camera = useThree((state) => state.camera);
  const element = useThree((state) => state.gl.domElement);
  const ready = useRef(false);

  useEffect(() => {
    const pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
    let dragging = false;
    let pinch: { dist: number; angle: number } | null = null;
    const clamp = () => {
      buildCam.x = Math.max(lot.min_x * cell - 4, Math.min(lot.max_x * cell + 4, buildCam.x));
      buildCam.z = Math.max(lot.min_z * cell - 6, Math.min(lot.max_z * cell + 4, buildCam.z));
      buildCam.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, buildCam.dist));
    };
    const twoFingers = () => {
      const [a, b] = [...pointers.values()];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
    };
    const down = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
      dragging = false;
      pinch = pointers.size === 2 ? twoFingers() : null;
    };
    const move = (event: PointerEvent) => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (pointers.size >= 2 && pinch) {
        const now = twoFingers();
        if (now.dist > 0 && pinch.dist > 0) buildCam.dist *= pinch.dist / now.dist;
        buildCam.yaw -= now.angle - pinch.angle;
        pinch = now;
        dragging = true;
        clamp();
        return;
      }
      if (!dragging && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < DRAG_START) return;
      dragging = true;
      // Slide the ground with the finger: what is under it stays under it, near enough.
      const scale = (buildCam.dist * 1.6) / Math.max(element.clientHeight, 1);
      const sin = Math.sin(buildCam.yaw), cos = Math.cos(buildCam.yaw);
      buildCam.x += -dx * scale * cos - dy * scale * sin;
      buildCam.z += dx * scale * sin - dy * scale * cos;
      clamp();
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      pinch = pointers.size === 2 ? twoFingers() : null;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      buildCam.dist *= Math.exp(event.deltaY * 0.0012);
      clamp();
    };
    element.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      element.removeEventListener("wheel", wheel);
    };
  }, [element, lot, cell]);

  useFrame((_, delta) => {
    const { x, z, dist, yaw, pitch } = buildCam;
    const flat = Math.cos(pitch) * dist;
    goal.set(x + Math.sin(yaw) * flat, Math.sin(pitch) * dist, z + Math.cos(yaw) * flat);
    look.set(x, 0, z);
    if (!ready.current) {
      camera.position.copy(goal);
      lookNow.copy(look);
      ready.current = true;
    } else {
      const ease = 1 - Math.exp(-Math.min(delta, 0.1) * SMOOTH);
      camera.position.lerp(goal, ease);
      lookNow.lerp(look, ease);
    }
    camera.lookAt(lookNow);
  });
  return null;
}
