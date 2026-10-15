import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { bearing, spread, turned, twistFilter, type Point } from "./gestures";
import {
  cameraInput,
  creatorInput,
  releaseTouch,
  setZoom,
  touchInput,
  turnCamera,
} from "./input";

const STICK_RADIUS = 60; // pixels of drag for full speed
const SPRINT_AT = 0.9; // fraction of the radius where walking becomes sprinting
const SPIN_PER_PIXEL = 0.012; // radians of character turn per pixel, in the creator
const WHEEL_ZOOM = 0.0015; // mouse wheel / two-finger scroll
const PINCH_WHEEL_ZOOM = 0.01; // trackpad pinch arrives as a ctrl+wheel event
const TWIST_START = 0.12; // radians two fingers must turn before the camera follows: a pinch always wobbles a little
const LOOK_PER_PIXEL = 0.006; // radians the camera swings per pixel of a right-button drag

type Stick = { origin: Point; knob: Point };
type Props = {
  mode: "play" | "spin";
  /** False where the camera cannot be swung round: indoors, where a room has only three walls. */
  turn?: boolean;
};

function localPoint(event: ReactPointerEvent<HTMLDivElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/**
 * The invisible layer over the game that fingers and the mouse act on.
 *
 * - One finger (or the left button) drags a stick: the player walks that way.
 * - Two fingers pinch to zoom and twist to swing the camera round the player.
 * - The right mouse button drags the camera round; the wheel zooms.
 */
export function TouchControls({ mode, turn = true }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const moveId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null); // the mouse, while its right button drags the camera
  const origin = useRef<Point>({ x: 0, y: 0 });
  const pinch = useRef<{ gap: number; zoom: number; bearing: number } | null>(
    null
  );
  const twist = useMemo(() => twistFilter(TWIST_START), []);
  const [stick, setStick] = useState<Stick | null>(null);

  useEffect(() => releaseTouch, []);

  // Stop the browser turning a quick drag into its own scroll or fling gesture.
  // Without this, Chrome swallows the first tap that follows a fast flick.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;

    const blockGesture = (event: TouchEvent) => event.preventDefault();
    const blockMenu = (event: MouseEvent) => event.preventDefault(); // the right button is for the camera
    layer.addEventListener("touchstart", blockGesture, { passive: false });
    layer.addEventListener("touchmove", blockGesture, { passive: false });
    layer.addEventListener("contextmenu", blockMenu);
    return () => {
      layer.removeEventListener("touchstart", blockGesture);
      layer.removeEventListener("touchmove", blockGesture);
      layer.removeEventListener("contextmenu", blockMenu);
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || mode !== "play") return undefined;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const pixels = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
      const rate = event.ctrlKey ? PINCH_WHEEL_ZOOM : WHEEL_ZOOM;
      setZoom(cameraInput.zoom * Math.exp(pixels * rate));
    };

    layer.addEventListener("wheel", onWheel, { passive: false });
    return () => layer.removeEventListener("wheel", onWheel);
  }, [mode]);

  const stopMoving = () => {
    moveId.current = null;
    releaseTouch();
    setStick(null);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = localPoint(event);
    if (event.pointerType === "mouse" && event.button !== 0) {
      // The right button swings the camera. It never walks the player or joins a pinch.
      if (event.button === 2 && mode === "play" && turn) {
        lookId.current = event.pointerId;
        origin.current = point;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (pointers.current.size === 1) {
      moveId.current = event.pointerId;
      origin.current = point;
      if (mode === "play") setStick({ origin: point, knob: point });
      return;
    }

    // A second finger turns the gesture into a pinch and cancels the walk.
    stopMoving();
    if (mode === "play" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        gap: spread(a, b),
        zoom: cameraInput.zoom,
        bearing: bearing(a, b),
      };
      twist.reset();
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = localPoint(event);
    if (event.pointerId === lookId.current) {
      // Dragging right pulls the near side of the world to the right, as if it were held.
      turnCamera(-(point.x - origin.current.x) * LOOK_PER_PIXEL);
      origin.current = point;
      return;
    }
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, point);

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      setZoom(pinch.current.zoom * (pinch.current.gap / spread(a, b)));
      // Twisting the two fingers turns the world with them.
      const now = bearing(a, b);
      const swing = twist.feed(turned(pinch.current.bearing, now));
      pinch.current.bearing = now;
      if (turn && swing !== 0) turnCamera(swing);
      return;
    }
    if (event.pointerId !== moveId.current) return;

    if (mode === "spin") {
      creatorInput.spin += (point.x - previous.x) * SPIN_PER_PIXEL;
      return;
    }

    let dx = point.x - origin.current.x;
    let dy = point.y - origin.current.y;
    const pull = Math.hypot(dx, dy);
    if (pull > STICK_RADIUS) {
      dx = (dx / pull) * STICK_RADIUS;
      dy = (dy / pull) * STICK_RADIUS;
    }

    touchInput.x = dx / STICK_RADIUS;
    touchInput.z = dy / STICK_RADIUS;
    touchInput.sprint = pull >= STICK_RADIUS * SPRINT_AT;
    setStick({
      origin: origin.current,
      knob: { x: origin.current.x + dx, y: origin.current.y + dy },
    });
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId === lookId.current) {
      lookId.current = null;
      return;
    }
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) {
      pinch.current = null;
    } else if (pinch.current) {
      // A third finger lifted: measure again from the two that are left, so nothing jumps.
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        gap: spread(a, b),
        zoom: cameraInput.zoom,
        bearing: bearing(a, b),
      };
      twist.reset();
    }
    if (event.pointerId === moveId.current || pointers.current.size === 0)
      stopMoving();
  };

  return (
    <div
      ref={layerRef}
      className='touch-layer'
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
    >
      {stick && (
        <>
          <div
            className='stick-ring'
            style={{ left: stick.origin.x, top: stick.origin.y }}
          />
          <div
            className='stick-knob'
            style={{ left: stick.knob.x, top: stick.knob.y }}
          />
        </>
      )}
    </div>
  );
}
