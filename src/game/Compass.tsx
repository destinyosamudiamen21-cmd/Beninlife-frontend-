import { useEffect, useRef } from "react";
import { Glyph } from "./glyphs";

type Props = {
  /** How far the view is turned right now, in radians. Asked every frame. */
  read: () => number;
  /** Pressed: turn the view back to north. */
  onReset: () => void;
  className?: string;
};

/**
 * A round button with a needle that always points north, however the view is turned.
 * Pressing it turns the view back. The needle is moved straight on the page, once a
 * frame, so turning the camera never makes React draw anything again.
 */
export function Compass({ read, onReset, className = "" }: Props) {
  const needle = useRef<HTMLSpanElement>(null);
  const reader = useRef(read);
  useEffect(() => {
    reader.current = read;
  });

  useEffect(() => {
    let frame = 0;
    let shown = NaN;
    const tick = () => {
      const yaw = reader.current();
      if (needle.current && Math.abs(yaw - shown) > 0.002) {
        shown = yaw;
        needle.current.style.transform = `rotate(${yaw}rad)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <button
      type='button'
      className={`compass ${className}`}
      onClick={onReset}
      aria-label='Turn the view back to north'
      title='North'
    >
      {/* The styles live here so this file is the whole compass: nothing to add to index.css. */}
      <style>{`
        .compass { width: 44px; height: 44px; border-radius: 50%; border: 2px solid #e2b657; background: #1c1512; color: #f6efe0;
          display: grid; place-items: center; padding: 0; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); pointer-events: auto; flex-shrink: 0; }
        .compass span { display: grid; place-items: center; color: #e2b657; will-change: transform; }
        .compass:active { transform: scale(0.94); }
      `}</style>
      <span ref={needle}>
        <Glyph name='north' size={22} stroke={2} />
      </span>
    </button>
  );
}
