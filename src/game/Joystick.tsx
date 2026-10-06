import { useRef, useState, type PointerEvent } from "react";
import { touchInput } from "./input";

const RADIUS = 50;

export function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (e: PointerEvent<HTMLDivElement>) => {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    touchInput.x = dx / RADIUS;
    touchInput.z = dy / RADIUS;
    touchInput.sprint = dist > RADIUS * 0.9;
  };

  const end = () => {
    pointerId.current = null;
    setKnob({ x: 0, y: 0 });
    touchInput.x = 0;
    touchInput.z = 0;
    touchInput.sprint = false;
  };

  return (
    <div
      ref={baseRef}
      className='joystick'
      onPointerDown={(e) => {
        pointerId.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (pointerId.current === e.pointerId) update(e);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className='joystick-knob'
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
