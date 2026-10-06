import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  cameraInput,
  creatorInput,
  releaseTouch,
  setZoom,
  touchInput,
} from "./input";

const STICK_RADIUS = 60; // pixels of drag for full speed
const SPRINT_AT = 0.9; // fraction of the radius where walking becomes sprinting
const SPIN_PER_PIXEL = 0.012; // radians of character turn per pixel, in the creator
const WHEEL_ZOOM = 0.0015; // mouse wheel / two-finger scroll
const PINCH_WHEEL_ZOOM = 0.01; // trackpad pinch arrives as a ctrl+wheel event

type Point = { x: number; y: number };
type Stick = { origin: Point; knob: Point };
type Props = { mode: "play" | "spin" };

function gap(a: Point, b: Point): number {
  return Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
}

function localPoint(event: ReactPointerEvent<HTMLDivElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export function TouchControls({ mode }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const moveId = useRef<number | null>(null);
  const origin = useRef<Point>({ x: 0, y: 0 });
  const pinch = useRef<{ gap: number; zoom: number } | null>(null);
  const [stick, setStick] = useState<Stick | null>(null);

  useEffect(() => releaseTouch, []);

  // Stop the browser turning a quick drag into its own scroll or fling gesture.
  // Without this, Chrome swallows the first tap that follows a fast flick.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;

    const blockGesture = (event: TouchEvent) => event.preventDefault();
    layer.addEventListener("touchstart", blockGesture, { passive: false });
    layer.addEventListener("touchmove", blockGesture, { passive: false });
    return () => {
      layer.removeEventListener("touchstart", blockGesture);
      layer.removeEventListener("touchmove", blockGesture);
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
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const point = localPoint(event);
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
      pinch.current = { gap: gap(a, b), zoom: cameraInput.zoom };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = localPoint(event);
    pointers.current.set(event.pointerId, point);

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      setZoom(pinch.current.zoom * (pinch.current.gap / gap(a, b)));
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
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
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
