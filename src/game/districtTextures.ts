// Small pictures drawn in code instead of downloaded: the window pattern for
// walls, the grass, place signs and the lettering on the gate. Drawing them
// here means the map needs no image files at all.

function makeCanvas(
  width: number,
  height: number
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw to a canvas.");
  return [canvas, context];
}

/** A repeatable random number generator, so the textures look the same on every device. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One window bay on one floor. It is drawn in white and grey so each building's
 * own paint colour can be multiplied onto it. The left and right edges are plain
 * wall: walls too short for a window use just that strip.
 */
export function drawFacade(): HTMLCanvasElement {
  const size = 128;
  const [canvas, c] = makeCanvas(size, size);
  const random = seeded(7);

  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, size, size);

  // Rain streaks and dust: slightly darker towards the bottom of each floor.
  const grime = c.createLinearGradient(0, 0, 0, size);
  grime.addColorStop(0, "rgba(0,0,0,0)");
  grime.addColorStop(1, "rgba(60,40,25,0.10)");
  c.fillStyle = grime;
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    c.fillStyle = `rgba(0,0,0,${0.012 + random() * 0.03})`;
    c.fillRect(
      random() * size,
      random() * size,
      1 + random() * 2,
      2 + random() * 9
    );
  }

  // The floor slab showing as a line at the top of every storey.
  c.fillStyle = "rgba(0,0,0,0.13)";
  c.fillRect(0, 0, size, 4);
  c.fillStyle = "rgba(255,255,255,0.5)";
  c.fillRect(0, 4, size, 1);

  // Window: frame, dark glass, louvre blades, a sill.
  const left = 32,
    top = 28,
    width = 64,
    height = 54;
  c.fillStyle = "#c9c6c0";
  c.fillRect(left - 4, top - 4, width + 8, height + 8);
  const glass = c.createLinearGradient(0, top, 0, top + height);
  glass.addColorStop(0, "#1f2a36");
  glass.addColorStop(1, "#3b4c5d");
  c.fillStyle = glass;
  c.fillRect(left, top, width, height);
  c.fillStyle = "rgba(190,215,235,0.20)";
  for (let y = top + 3; y < top + height - 2; y += 6)
    c.fillRect(left, y, width, 2);
  c.fillStyle = "#c9c6c0";
  c.fillRect(left + width / 2 - 2, top, 4, height);
  c.fillStyle = "rgba(0,0,0,0.22)";
  c.fillRect(left - 7, top + height + 4, width + 14, 4);

  return canvas;
}

/** Tileable grass: a mid green with lighter and darker flecks. */
export function drawGrass(): HTMLCanvasElement {
  const size = 256;
  const [canvas, c] = makeCanvas(size, size);
  const random = seeded(21);

  c.fillStyle = "#6f9447";
  c.fillRect(0, 0, size, size);

  const blot = (x: number, y: number, radius: number, colour: string) => {
    // Drawn nine times, shifted by the tile size, so blots that cross an edge wrap round.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        c.beginPath();
        c.arc(x + dx, y + dy, radius, 0, Math.PI * 2);
        c.fillStyle = colour;
        c.fill();
      }
    }
  };
  for (let i = 0; i < 70; i++) {
    const shade = random();
    const colour =
      shade < 0.4
        ? "rgba(86,124,52,0.35)"
        : shade < 0.8
        ? "rgba(128,160,82,0.30)"
        : "rgba(150,130,80,0.22)";
    blot(random() * size, random() * size, 8 + random() * 26, colour);
  }
  for (let i = 0; i < 1400; i++) {
    c.fillStyle =
      random() < 0.5 ? "rgba(50,90,35,0.35)" : "rgba(160,185,100,0.30)";
    c.fillRect(
      random() * size,
      random() * size,
      1 + random() * 2,
      1 + random() * 2
    );
  }
  return canvas;
}

export type SignKind = "landmark" | "place" | "road";

/** A floating place sign: white lettering on a dark rounded plate. */
export function drawSign(text: string, kind: SignKind): HTMLCanvasElement {
  const fontSize = 56;
  const padX = 34,
    padY = 22;
  const font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  const [, m] = makeCanvas(8, 8);
  m.font = font;
  const textWidth = Math.ceil(m.measureText(text).width);

  const width = textWidth + padX * 2;
  const height = fontSize + padY * 2;
  const [canvas, c] = makeCanvas(width, height);

  const radius = kind === "road" ? 10 : height / 2;
  c.beginPath();
  c.moveTo(radius, 0);
  c.arcTo(width, 0, width, height, radius);
  c.arcTo(width, height, 0, height, radius);
  c.arcTo(0, height, 0, 0, radius);
  c.arcTo(0, 0, width, 0, radius);
  c.closePath();
  c.fillStyle = kind === "road" ? "rgba(21,92,58,0.92)" : "rgba(17,20,26,0.82)";
  c.fill();
  if (kind === "landmark") {
    c.lineWidth = 5;
    c.strokeStyle = "#ffcf5a";
    c.stroke();
  }

  c.font = font;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = kind === "landmark" ? "#ffe9b0" : "#ffffff";
  c.fillText(text, width / 2, height / 2 + 3);
  return canvas;
}

/** Raised lettering for the front of a gate. Returns a wide strip, 12 times wider than tall. */
export function drawGateSign(text: string): HTMLCanvasElement {
  const width = 1536,
    height = 128;
  const [canvas, c] = makeCanvas(width, height);

  c.fillStyle = "#6f2626";
  c.fillRect(0, 0, width, height);
  c.strokeStyle = "#e9d9a8";
  c.lineWidth = 5;
  c.strokeRect(8, 8, width - 16, height - 16);

  let fontSize = 82;
  const fit = () => {
    c.font = `800 ${fontSize}px Georgia, "Times New Roman", serif`;
    return c.measureText(text).width;
  };
  while (fit() > width - 120 && fontSize > 24) fontSize -= 4;

  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "rgba(0,0,0,0.45)";
  c.fillText(text, width / 2 + 3, height / 2 + 7);
  c.fillStyle = "#f3e7c3";
  c.fillText(text, width / 2, height / 2 + 4);
  return canvas;
}
