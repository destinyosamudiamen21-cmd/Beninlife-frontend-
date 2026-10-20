// The small pictures the phone and the city map use: one line-drawing for each app, each
// kind of place and each way of getting about. They are drawn here, as shapes, so the
// game needs no picture files and no icon font, and every picture takes the colour of the
// text around it.

type Shape = { d?: string; c?: [number, number, number]; fill?: boolean };

/** Every picture is drawn on a 24 by 24 square. `d` is a line; `c` is a circle (x, y, radius). */
const GLYPHS: Record<string, Shape[]> = {
  // ---- phone apps ----
  chat: [{ d: "M4 5h16v11H10l-5 4v-4H4z" }, { d: "M8 9h8M8 12h5" }],
  people: [{ c: [9, 8, 3] }, { d: "M3 20c0-3.5 2.5-6 6-6s6 2.5 6 6" }, { c: [17, 9, 2.4] }, { d: "M16.5 14.2c2.8.3 4.5 2.4 4.5 5.8" }],
  bank: [{ c: [12, 12, 8.5] }, { d: "M9 16.5v-9l6 9v-9M7.5 10.7h9M7.5 13.3h9" }],
  map: [{ d: "M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" }, { d: "M9 4v13.5M15 6.5V20" }],
  data: [{ d: "M5 20v-3M10 20v-7M15 20V9M20 20V4" }],
  work: [{ d: "M4 8h16v11H4z" }, { d: "M9 8V6h6v2" }, { d: "M4 13h16" }],
  school: [{ d: "M2 9l10-5 10 5-10 5z" }, { d: "M6 11.2V16c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.8M22 9v5" }],
  person: [{ c: [12, 8, 4] }, { d: "M4 21c0-4.2 3.5-7 8-7s8 2.8 8 7" }],
  help: [{ c: [12, 12, 9] }, { d: "M9.4 9.4a2.7 2.7 0 1 1 4 2.4c-.9.5-1.4 1.1-1.4 2.2M12 17.2v.1" }],
  // ---- places ----
  bus: [{ d: "M5 5h14a2 2 0 0 1 2 2v9H3V7a2 2 0 0 1 2-2zM3 11h18" }, { c: [7.5, 17.5, 1.7] }, { c: [16.5, 17.5, 1.7] }],
  bed: [{ d: "M3 19V7M3 15h18v4M21 15v-2a3 3 0 0 0-3-3h-7v5" }, { c: [7, 11.5, 1.6] }],
  book: [{ d: "M12 7a3 3 0 0 0-3-2H4v13h5a3 3 0 0 1 3 2 3 3 0 0 1 3-2h5V5h-5a3 3 0 0 0-3 2zM12 7v13" }],
  coin: [{ c: [12, 12, 8.5] }, { d: "M9 16.5v-9l6 9v-9M7.5 10.7h9M7.5 13.3h9" }],
  pot: [{ d: "M5 10h14v4a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5zM3 10h18M9 6.5c0-1.3 1.2-1.2 1.2-2.5M13.5 6.5c0-1.3 1.2-1.2 1.2-2.5" }],
  pad: [{ d: "M7.5 8h9a4.5 4.5 0 0 1 4.5 4.5v1.3a3 3 0 0 1-5.4 1.8L15 15H9l-.6.6A3 3 0 0 1 3 13.8v-1.3A4.5 4.5 0 0 1 7.5 8zM8 10.5v3M6.5 12h3" }, { c: [16.3, 12, 0.9], fill: true }],
  ball: [{ c: [12, 12, 8.5] }, { d: "M12 3.5v17M5.5 6.6c3 2.6 3 8.2 0 10.8M18.5 6.6c-3 2.6-3 8.2 0 10.8" }],
  fist: [{ d: "M7 11.5V8a3 3 0 0 1 3-3h4a4.5 4.5 0 0 1 4.5 4.5v2A4.5 4.5 0 0 1 14 16H9.5A2.5 2.5 0 0 1 7 13.5zM7 11.5h4.5M9.5 16v3.5h6V16" }],
  stall: [{ d: "M3 9l2.2-4h13.6L21 9M3 9a2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0A2.25 2.25 0 0 0 21 9M5 11.5V19h14v-7.5M5 15h14" }],
  note: [{ d: "M9 17.5V6l10-2v11.5" }, { c: [6.8, 17.5, 2.2] }, { c: [16.8, 15.5, 2.2] }],
  mask: [{ d: "M7 3.5h10l1 6.5c0 6-2.8 10.5-6 10.5S6 16 6 10zM6.6 7h10.8M8.8 10.6h2.4M12.8 10.6h2.4M12 12v2.4M10.4 16.6h3.2" }],
  pillar: [{ d: "M3 9l9-5 9 5zM5.5 9v8M10 9v8M14 9v8M18.5 9v8M3 19.5h18" }],
  tree: [{ c: [12, 9, 6] }, { d: "M12 21v-7M12 17l3-3" }],
  dot: [{ c: [12, 12, 3.5], fill: true }],
  // ---- ways of getting about ----
  walk: [{ c: [13, 4.8, 1.8] }, { d: "M12.5 8.5l-3 4 3.5 2.2V20M9.8 12.3L8 20M12.8 9l2.6 3.2 2.6.3" }],
  keke: [{ d: "M4 16.5V10a4 4 0 0 1 4-4h6l5 6v4.5zM14 6v6h5" }, { c: [7.5, 17.5, 1.7] }, { c: [16.5, 17.5, 1.7] }],
  bike: [{ c: [5.5, 16, 3] }, { c: [18.5, 16, 3] }, { d: "M5.5 16l4-6.5h5.5l3.5 6.5M9.5 9.5L8.5 6.5H6.5M15 9.5l1.2-3" }],
  cab: [{ d: "M3 16.5v-3.2l2.2-1L7 8h10l1.8 4.3 2.2 1v3.2zM6.5 12.3h11" }, { c: [7.5, 16.8, 1.6] }, { c: [16.5, 16.8, 1.6] }],
  drive: [{ c: [12, 12, 8.5] }, { c: [12, 12, 2.2] }, { d: "M12 14.2v6.2M3.8 10.6l6.1 1M20.2 10.6l-6.1 1" }],
  // ---- buttons ----
  send: [{ d: "M4 11.5l16-7-6.5 16-2.6-6.4z" }],
  plus: [{ d: "M12 5v14M5 12h14" }],
  minus: [{ d: "M5 12h14" }],
  back: [{ d: "M15 5l-7 7 7 7" }],
  close: [{ d: "M6 6l12 12M18 6L6 18" }],
  north: [{ d: "M12 3l5 16-5-3.5L7 19z" }],
  turn: [{ d: "M19 12a7 7 0 1 1-2.4-5.3M19.5 3.5v4.2h-4.2" }],
  shield: [{ d: "M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" }, { d: "M9 12l2.2 2.2L15.5 10" }],
  cross: [{ d: "M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z" }],
  bag: [{ d: "M5 8h14l-1.2 12H6.2zM9 8V6.5a3 3 0 0 1 6 0V8" }],
  cart: [{ d: "M3 4h2.5l2.2 11h10.6L20 7.5H6.4" }, { c: [9, 19, 1.5] }, { c: [17, 19, 1.5] }],
  film: [{ d: "M4 5h16v14H4zM4 9h16M4 15h16M8 5v4M12 5v4M16 5v4M8 15v4M12 15v4M16 15v4" }],
  glass: [{ d: "M6 4h12l-1 6.5a5 5 0 0 1-10 0zM12 15.5V20M8.5 20h7" }],
  fish: [{ d: "M3 12c3-5 9-6 13-3l4-3v12l-4-3c-4 3-10 2-13-3z" }, { c: [8, 11, 0.9], fill: true }],
  ghost: [{ d: "M5 20V11a7 7 0 0 1 14 0v9l-2.3-2-2.4 2-2.3-2-2.3 2-2.4-2z" }, { c: [9.5, 11, 1.1], fill: true }, { c: [14.5, 11, 1.1], fill: true }],
  flag: [{ d: "M7 21V4M7 4l10 3.5L7 11" }, { d: "M4 21h8" }],
  bridge: [{ d: "M2 10h20M4 10v9M20 10v9M9 10v5M15 10v5M2 15h20" }],
  key: [{ c: [8, 15, 4] }, { d: "M11 12l8-8M16 7l2.5 2.5M14 9l2 2" }],
  paw: [{ d: "M12 13c-3 0-5.5 2.6-5.5 4.7 0 1.6 1.4 2.3 2.8 2.3 1.2 0 1.8-.7 2.7-.7s1.5.7 2.7.7c1.4 0 2.8-.7 2.8-2.3 0-2.1-2.5-4.7-5.5-4.7z" }, { c: [6, 10, 1.6] }, { c: [9.5, 6.5, 1.6] }, { c: [14.5, 6.5, 1.6] }, { c: [18, 10, 1.6] }],
  pin: [{ d: "M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" }, { c: [12, 10, 2.3] }],
  car: [{ d: "M3 16v-3.5l2.2-5h13.6l2.2 5V16zM3 12.5h18M7.5 7.5l-1 5M16.5 7.5l1 5" }, { c: [7, 16.5, 2] }, { c: [17, 16.5, 2] }],
};

export type GlyphName = string;

/** Does a picture with this name exist? */
export function hasGlyph(name: string): boolean {
  return name in GLYPHS;
}

/** One of the small pictures, in the colour of the text around it. An unknown name draws a dot. */
export function Glyph({ name, size = 22, stroke = 1.9 }: { name: GlyphName; size?: number; stroke?: number }) {
  const shapes = GLYPHS[name] ?? GLYPHS.dot;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes.map((shape, index) =>
        shape.c ? (
          <circle key={index} cx={shape.c[0]} cy={shape.c[1]} r={shape.c[2]} fill={shape.fill ? "currentColor" : "none"} />
        ) : (
          <path key={index} d={shape.d} fill={shape.fill ? "currentColor" : "none"} />
        ),
      )}
    </svg>
  );
}
