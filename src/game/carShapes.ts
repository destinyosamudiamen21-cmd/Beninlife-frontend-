// The cars, as shapes: every one is built here from numbers, the way a body shop would
// draw it. No 3D imports, so it can be tested and pictured alone; Car.tsx turns it into
// meshes.
//
// A body is "lofted": a cross-section (like a slice of bread) is worked out every few
// centimetres from the back bumper to the front, and the slices are joined up. Each
// slice knows how high the roof, the bonnet or the boot is there, how high the window
// line is, how wide the car is, and where the wheel arches cut into the bottom. Glass,
// pillars, lights and trim are parts of that same skin, painted differently.
//
// The car faces +z (its nose is at +z). +y is up. The driver sits on the left, at +x:
// Nigeria drives on the right.
//
// These are the game's own designs: no maker's badges or signature grilles.

/** The paint colours, by id. Must match car_service.COLOURS on the server (tools/check_cars.py looks). */
export const CAR_COLOURS: Record<string, string> = {
  black: "#0d0e10", white: "#e9e8e3", silver: "#a9adb1", grey: "#4b5056", wine: "#4a0f19",
  navy: "#14213d", gold: "#b9a07a", red: "#8f0e12", green: "#173a2a",
  orange: "#d9480f", lime: "#6a9a12", chalk: "#b9b6ad", blue: "#1f4fa8",
};

export type Mat =
  | "paint" | "glass" | "trim" | "chrome" | "rubber" | "under" | "head" | "tail" | "plate"
  | "rim" | "disc" | "caliper" | "interior" | "seat" | "cladding" | "grille" | "amber";

export type Mesh = {
  positions: number[];
  normals: number[];
  /** Texture coordinates: only the number plates use them; everything else is (0, 0). */
  uvs: number[];
  /** One list of triangles for each material. */
  groups: Partial<Record<Mat, number[]>>;
};

export type WheelPlace = { x: number; y: number; z: number; front: boolean; side: 1 | -1 };

export type CarParts = {
  body: Mesh;
  /** One wheel, axle along x, its outer face towards +x. Car.tsx turns it for the right side. */
  wheel: Mesh;
  wheels: WheelPlace[];
  /** Where the driver's hips are, in the car. */
  seat: { x: number; y: number; z: number };
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  radius: number;
};

type Key = [number, number];   // [how far along, 0 back bumper to 1 front bumper; height in metres]

type RimStyle = "five" | "split" | "multi" | "blade" | "mesh" | "steel";

export type CarSpec = {
  length: number;
  width: number;
  wheelbase: number;
  frontOverhang: number;
  wheelR: number;          // the whole wheel, tyre and all
  rimR: number;            // the metal part
  tyreW: number;
  clearance: number;
  /** The top of the car along its length: boot or tailgate, rear window, roof, windscreen, bonnet. */
  top: Key[];
  /** The window line: where the doors end and the glass starts. */
  belt: Key[];
  /** Where along the top the rear glass, the roof and the windscreen are (0..1). */
  backlight: [number, number];
  windshield: [number, number];
  roofW: number;           // how wide the roof is, against the body (the "tumblehome")
  crown: number;           // how much higher the middle of the roof is than its edges
  suv?: boolean;           // black plastic round the bottom, rails on the roof
  blackRoof?: boolean;
  chromeLine?: boolean;    // a chrome strip round the side windows
  grille: { w: number; h: number; y: number; style: "bars" | "mesh" | "slats" | "wide" | "slim" };
  heads: { w: number; h: number; y: number; style: "round" | "slim" | "block" };
  tails: { w: number; h: number; y: number; style: "corners" | "bar" | "tall" };
  rim: { style: RimStyle; spokes: number; colour: "silver" | "dark" | "black" | "chrome" };
  caliper: string;
  endRound: number;        // metres over which the ends round off
  /** A rear wing on two uprights: its height, where it sits (0 back .. 1 front), how wide, how deep. */
  wing?: { y: number; at: number; w: number; chord: number };
  /** Black air intakes in the sides behind the doors, as on a mid-engined car. */
  intakes?: boolean;
  /** Two seats only: no back bench. */
  twoSeat?: boolean;
};

// ---- the eight cars ----------------------------------------------------------------------
// Heights in metres. "top" and "belt" are read from the back of the car to the front.

export const CAR_SPECS: Record<string, CarSpec> = {
  // A small saloon from the late 2000s: soft corners, a short boot, chrome bars.
  kaze_sprint: {
    length: 4.54, width: 1.76, wheelbase: 2.60, frontOverhang: 0.88, wheelR: 0.31, rimR: 0.19, tyreW: 0.2, clearance: 0.15,
    top: [[0, 0.93], [0.07, 1.0], [0.19, 1.03], [0.37, 1.42], [0.58, 1.47], [0.74, 1.0], [0.9, 0.9], [1, 0.76]],
    belt: [[0, 0.93], [0.2, 0.96], [0.75, 0.93], [1, 0.82]],
    backlight: [0.19, 0.37], windshield: [0.58, 0.74], roofW: 0.8, crown: 0.035,
    chromeLine: false,
    grille: { w: 0.62, h: 0.13, y: 0.62, style: "bars" },
    heads: { w: 0.4, h: 0.17, y: 0.67, style: "block" },
    tails: { w: 0.36, h: 0.2, y: 0.82, style: "corners" },
    rim: { style: "steel", spokes: 8, colour: "silver" }, caliper: "#3a3a3a", endRound: 0.16,
  },
  // The 2009 big soft saloon: tall boot, long doors, a wide chrome grille.
  kaze_muscle: {
    length: 4.81, width: 1.82, wheelbase: 2.78, frontOverhang: 0.95, wheelR: 0.33, rimR: 0.205, tyreW: 0.215, clearance: 0.16,
    top: [[0, 0.97], [0.07, 1.04], [0.2, 1.07], [0.38, 1.43], [0.6, 1.47], [0.75, 1.03], [0.9, 0.93], [1, 0.78]],
    belt: [[0, 0.97], [0.2, 1.0], [0.75, 0.96], [1, 0.84]],
    backlight: [0.2, 0.38], windshield: [0.6, 0.75], roofW: 0.8, crown: 0.04,
    chromeLine: true,
    grille: { w: 0.78, h: 0.16, y: 0.64, style: "bars" },
    heads: { w: 0.42, h: 0.18, y: 0.7, style: "block" },
    tails: { w: 0.42, h: 0.22, y: 0.84, style: "corners" },
    rim: { style: "multi", spokes: 6, colour: "silver" }, caliper: "#3a3a3a", endRound: 0.16,
  },
  // A boxy German compact SUV: upright glass, flat roof, square shoulders.
  falke_kx: {
    length: 4.53, width: 1.84, wheelbase: 2.76, frontOverhang: 0.86, wheelR: 0.37, rimR: 0.24, tyreW: 0.235, clearance: 0.2,
    top: [[0, 1.06], [0.035, 1.12], [0.07, 1.6], [0.12, 1.68], [0.62, 1.7], [0.73, 1.2], [0.88, 1.1], [1, 0.92]],
    belt: [[0, 1.1], [0.15, 1.12], [0.74, 1.07], [1, 0.98]],
    backlight: [0.035, 0.12], windshield: [0.62, 0.73], roofW: 0.86, crown: 0.02,
    suv: true, chromeLine: true,
    grille: { w: 0.78, h: 0.24, y: 0.78, style: "slats" },
    heads: { w: 0.42, h: 0.17, y: 0.86, style: "block" },
    tails: { w: 0.42, h: 0.2, y: 1.0, style: "corners" },
    rim: { style: "split", spokes: 5, colour: "silver" }, caliper: "#3a3a3a", endRound: 0.14,
  },
  // A German sport saloon: long bonnet, short boot, low and wide on big wheels.
  falke_c40: {
    length: 4.69, width: 1.81, wheelbase: 2.84, frontOverhang: 0.81, wheelR: 0.335, rimR: 0.23, tyreW: 0.225, clearance: 0.13,
    top: [[0, 0.96], [0.06, 1.0], [0.16, 1.02], [0.36, 1.39], [0.56, 1.43], [0.71, 0.99], [0.88, 0.87], [1, 0.72]],
    belt: [[0, 0.96], [0.18, 0.98], [0.72, 0.92], [1, 0.8]],
    backlight: [0.16, 0.36], windshield: [0.56, 0.71], roofW: 0.76, crown: 0.035,
    chromeLine: true,
    grille: { w: 0.66, h: 0.24, y: 0.55, style: "mesh" },
    heads: { w: 0.44, h: 0.13, y: 0.7, style: "slim" },
    tails: { w: 0.44, h: 0.14, y: 0.87, style: "corners" },
    rim: { style: "multi", spokes: 10, colour: "dark" }, caliper: "#b0161c", endRound: 0.15,
  },
  // The 2024 saloon: sharp nose, sloping back, black roof, black wheels.
  kaze_corvana24: {
    length: 4.92, width: 1.84, wheelbase: 2.83, frontOverhang: 1.0, wheelR: 0.345, rimR: 0.24, tyreW: 0.235, clearance: 0.14,
    top: [[0, 0.95], [0.05, 0.99], [0.14, 1.0], [0.38, 1.4], [0.57, 1.44], [0.73, 0.97], [0.9, 0.85], [1, 0.69]],
    belt: [[0, 0.95], [0.16, 0.98], [0.74, 0.92], [1, 0.78]],
    backlight: [0.14, 0.38], windshield: [0.57, 0.73], roofW: 0.77, crown: 0.03,
    blackRoof: true,
    grille: { w: 0.9, h: 0.26, y: 0.44, style: "wide" },
    heads: { w: 0.46, h: 0.09, y: 0.69, style: "slim" },
    tails: { w: 0.5, h: 0.09, y: 0.88, style: "bar" },
    rim: { style: "blade", spokes: 10, colour: "black" }, caliper: "#2a2a2a", endRound: 0.17,
  },
  // The executive saloon: long, calm, a light strip across the back.
  falke_e5: {
    length: 4.95, width: 1.88, wheelbase: 2.96, frontOverhang: 0.85, wheelR: 0.345, rimR: 0.245, tyreW: 0.245, clearance: 0.14,
    top: [[0, 0.98], [0.06, 1.03], [0.17, 1.05], [0.37, 1.43], [0.58, 1.47], [0.73, 1.0], [0.89, 0.89], [1, 0.74]],
    belt: [[0, 0.98], [0.18, 1.0], [0.73, 0.94], [1, 0.82]],
    backlight: [0.17, 0.37], windshield: [0.58, 0.73], roofW: 0.78, crown: 0.035,
    chromeLine: true,
    grille: { w: 0.7, h: 0.27, y: 0.56, style: "mesh" },
    heads: { w: 0.46, h: 0.11, y: 0.7, style: "slim" },
    tails: { w: 0.52, h: 0.1, y: 0.9, style: "bar" },
    rim: { style: "split", spokes: 5, colour: "dark" }, caliper: "#555a60", endRound: 0.16,
  },
  // The big German SUV: seven seats, high bonnet, wide shoulders, huge wheels.
  falke_gx: {
    length: 4.92, width: 2.02, wheelbase: 2.99, frontOverhang: 0.93, wheelR: 0.39, rimR: 0.27, tyreW: 0.265, clearance: 0.21,
    top: [[0, 1.08], [0.035, 1.16], [0.08, 1.64], [0.14, 1.75], [0.6, 1.78], [0.72, 1.24], [0.88, 1.14], [1, 0.96]],
    belt: [[0, 1.12], [0.16, 1.16], [0.73, 1.12], [1, 1.02]],
    backlight: [0.035, 0.14], windshield: [0.6, 0.72], roofW: 0.82, crown: 0.025,
    suv: true, chromeLine: true,
    grille: { w: 0.86, h: 0.3, y: 0.8, style: "slats" },
    heads: { w: 0.46, h: 0.13, y: 0.9, style: "slim" },
    tails: { w: 0.5, h: 0.12, y: 1.04, style: "bar" },
    rim: { style: "five", spokes: 5, colour: "silver" }, caliper: "#555a60", endRound: 0.15,
  },
  // ---- the VIP corner: the dearest cars in Benin --------------------------------------------
  // The German coupé SUV with the big engine: tall nose, roof sloping all the way down to the tail.
  falke_sx63: {
    length: 4.94, width: 2.0, wheelbase: 2.93, frontOverhang: 0.95, wheelR: 0.38, rimR: 0.28, tyreW: 0.28, clearance: 0.18,
    top: [[0, 1.05], [0.04, 1.12], [0.1, 1.22], [0.3, 1.6], [0.58, 1.69], [0.71, 1.22], [0.88, 1.12], [1, 0.94]],
    belt: [[0, 1.12], [0.15, 1.14], [0.72, 1.1], [1, 1.0]],
    backlight: [0.1, 0.3], windshield: [0.58, 0.71], roofW: 0.8, crown: 0.03,
    chromeLine: false,
    grille: { w: 0.78, h: 0.34, y: 0.74, style: "bars" },
    heads: { w: 0.46, h: 0.12, y: 0.9, style: "slim" },
    tails: { w: 0.52, h: 0.1, y: 1.04, style: "bar" },
    rim: { style: "five", spokes: 5, colour: "black" }, caliper: "#c8161c", endRound: 0.15,
  },
  // The German rear-engined track car: round eyes, a fastback, and a wing you can see from Ring Road.
  ravello_rs: {
    length: 4.57, width: 1.9, wheelbase: 2.46, frontOverhang: 0.98, wheelR: 0.35, rimR: 0.26, tyreW: 0.3, clearance: 0.1,
    top: [[0, 0.82], [0.06, 0.98], [0.18, 1.06], [0.4, 1.27], [0.55, 1.29], [0.68, 1.0], [0.86, 0.86], [1, 0.62]],
    belt: [[0, 0.9], [0.2, 0.94], [0.68, 0.88], [1, 0.74]],
    backlight: [0.18, 0.4], windshield: [0.55, 0.68], roofW: 0.72, crown: 0.04,
    grille: { w: 0.9, h: 0.12, y: 0.32, style: "wide" },
    heads: { w: 0.3, h: 0.2, y: 0.74, style: "round" },
    tails: { w: 0.62, h: 0.06, y: 0.9, style: "bar" },
    rim: { style: "five", spokes: 5, colour: "dark" }, caliper: "#f2c200", endRound: 0.2,
    wing: { y: 1.42, at: 0.05, w: 1.72, chord: 0.36 }, twoSeat: true,
  },
  // The Italian wedge: a knife of a nose, the cabin pushed forward, intakes like gills.
  vento_saetta: {
    length: 4.95, width: 2.05, wheelbase: 2.78, frontOverhang: 1.05, wheelR: 0.35, rimR: 0.26, tyreW: 0.31, clearance: 0.1,
    top: [[0, 0.86], [0.08, 0.96], [0.25, 1.03], [0.42, 1.12], [0.55, 1.13], [0.66, 0.92], [0.84, 0.78], [1, 0.55]],
    belt: [[0, 0.88], [0.25, 0.94], [0.66, 0.86], [1, 0.66]],
    backlight: [0.25, 0.42], windshield: [0.55, 0.7], roofW: 0.62, crown: 0.03,
    grille: { w: 1.1, h: 0.14, y: 0.28, style: "wide" },
    heads: { w: 0.42, h: 0.06, y: 0.6, style: "slim" },
    tails: { w: 0.5, h: 0.05, y: 0.8, style: "bar" },
    rim: { style: "blade", spokes: 10, colour: "black" }, caliper: "#ff6f00", endRound: 0.12,
    intakes: true, twoSeat: true, wing: { y: 1.08, at: 0.03, w: 1.6, chord: 0.22 },
  },
  // The French hypercar: a horseshoe of a grille, a swoop down the side, and nothing faster in the city.
  valmont_noir: {
    length: 4.55, width: 2.04, wheelbase: 2.71, frontOverhang: 0.98, wheelR: 0.36, rimR: 0.27, tyreW: 0.31, clearance: 0.11,
    top: [[0, 0.88], [0.08, 1.0], [0.24, 1.08], [0.42, 1.2], [0.56, 1.21], [0.68, 1.0], [0.86, 0.88], [1, 0.66]],
    belt: [[0, 0.9], [0.24, 0.96], [0.68, 0.9], [1, 0.74]],
    backlight: [0.24, 0.42], windshield: [0.56, 0.68], roofW: 0.66, crown: 0.04,
    grille: { w: 0.36, h: 0.34, y: 0.52, style: "mesh" },
    heads: { w: 0.4, h: 0.07, y: 0.68, style: "slim" },
    tails: { w: 0.7, h: 0.05, y: 0.86, style: "bar" },
    rim: { style: "mesh", spokes: 12, colour: "dark" }, caliper: "#1e5bb8", endRound: 0.18,
    intakes: true, twoSeat: true,
  },
  // The German mid-engined V10: low, wide, a blade behind the doors.
  ostra_r10: {
    length: 4.43, width: 1.94, wheelbase: 2.65, frontOverhang: 0.97, wheelR: 0.35, rimR: 0.26, tyreW: 0.29, clearance: 0.11,
    top: [[0, 0.95], [0.08, 1.05], [0.25, 1.12], [0.42, 1.22], [0.56, 1.24], [0.68, 1.0], [0.86, 0.85], [1, 0.66]],
    belt: [[0, 0.96], [0.25, 1.0], [0.68, 0.92], [1, 0.76]],
    backlight: [0.25, 0.42], windshield: [0.56, 0.68], roofW: 0.68, crown: 0.035,
    grille: { w: 0.9, h: 0.3, y: 0.5, style: "mesh" },
    heads: { w: 0.42, h: 0.08, y: 0.7, style: "slim" },
    tails: { w: 0.48, h: 0.07, y: 0.88, style: "bar" },
    rim: { style: "five", spokes: 5, colour: "dark" }, caliper: "#c8161c", endRound: 0.15,
    intakes: true, twoSeat: true,
  },
  // The German sports coupé on the track spec: tall twin grille, carbon roof, a lip of a wing.
  bauer_s4: {
    length: 4.8, width: 1.89, wheelbase: 2.86, frontOverhang: 0.88, wheelR: 0.35, rimR: 0.25, tyreW: 0.27, clearance: 0.12,
    top: [[0, 0.96], [0.06, 1.02], [0.16, 1.04], [0.36, 1.36], [0.55, 1.38], [0.7, 0.98], [0.88, 0.88], [1, 0.72]],
    belt: [[0, 0.96], [0.18, 0.98], [0.7, 0.92], [1, 0.8]],
    backlight: [0.16, 0.36], windshield: [0.55, 0.7], roofW: 0.74, crown: 0.035,
    blackRoof: true,
    grille: { w: 0.52, h: 0.38, y: 0.58, style: "slats" },
    heads: { w: 0.42, h: 0.1, y: 0.72, style: "slim" },
    tails: { w: 0.44, h: 0.12, y: 0.88, style: "corners" },
    rim: { style: "split", spokes: 5, colour: "black" }, caliper: "#1e5bb8", endRound: 0.15,
    wing: { y: 1.1, at: 0.035, w: 1.4, chord: 0.2 },
  },
  // The Japanese flagship SUV: tall as a wall, upright, a big chrome-ringed grille.
  lumea_rs: {
    length: 5.1, width: 1.99, wheelbase: 2.85, frontOverhang: 1.0, wheelR: 0.4, rimR: 0.28, tyreW: 0.265, clearance: 0.23,
    top: [[0, 1.12], [0.03, 1.2], [0.06, 1.74], [0.12, 1.86], [0.62, 1.89], [0.73, 1.33], [0.88, 1.24], [1, 1.04]],
    belt: [[0, 1.18], [0.15, 1.22], [0.74, 1.2], [1, 1.1]],
    backlight: [0.03, 0.12], windshield: [0.62, 0.73], roofW: 0.88, crown: 0.02,
    suv: true, chromeLine: true,
    grille: { w: 1.04, h: 0.48, y: 0.78, style: "wide" },
    heads: { w: 0.42, h: 0.13, y: 1.02, style: "slim" },
    tails: { w: 0.48, h: 0.14, y: 1.1, style: "bar" },
    rim: { style: "mesh", spokes: 12, colour: "chrome" }, caliper: "#555a60", endRound: 0.14,
  },
};

// ---- small helpers ------------------------------------------------------------------------

/** A smooth curve through the keys, with no bumps the keys did not ask for (monotone cubic). */
function curve(keys: Key[]): (f: number) => number {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (f: number) => {
    if (f <= xs[0]) return ys[0];
    if (f >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (f > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (f - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

class Builder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  groups: Partial<Record<Mat, number[]>> = {};

  vertex(x: number, y: number, z: number, nx = 0, ny = 1, nz = 0, u = 0, v = 0): number {
    this.positions.push(x, y, z);
    this.uvs.push(u, v);
    const l = Math.hypot(nx, ny, nz) || 1;
    this.normals.push(nx / l, ny / l, nz / l);
    return this.positions.length / 3 - 1;
  }

  tri(mat: Mat, a: number, b: number, c: number): void {
    (this.groups[mat] ??= []).push(a, b, c);
  }

  quad(mat: Mat, a: number, b: number, c: number, d: number): void {
    this.tri(mat, a, b, c);
    this.tri(mat, a, c, d);
  }

  /** A flat polygon facing (nx, ny, nz), as a fan. Points go anticlockwise seen from the front. */
  flat(mat: Mat, points: [number, number, number][], nx: number, ny: number, nz: number, uv?: [number, number][]): void {
    const first = this.positions.length / 3;
    points.forEach(([x, y, z], i) => this.vertex(x, y, z, nx, ny, nz, uv?.[i][0] ?? 0, uv?.[i][1] ?? 0));
    for (let i = 1; i + 1 < points.length; i++) this.tri(mat, first, first + i, first + i + 1);
  }

  /** A box, axis-aligned in its own frame, turned `turn` radians about y. */
  box(mat: Mat, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, turn = 0): void {
    const c = Math.cos(turn), s = Math.sin(turn);
    const at = (x: number, y: number, z: number): [number, number, number] => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const faces: [number, number, number, [number, number, number][]][] = [
      [1, 0, 0, [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]],
      [-1, 0, 0, [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]],
      [0, 1, 0, [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]],
      [0, -1, 0, [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]],
      [0, 0, 1, [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
      [0, 0, -1, [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
    ];
    for (const [nx, ny, nz, corners] of faces) {
      const n = at(nx, ny, nz);
      this.flat(mat, corners.map(([x, y, z]) => at(x, y, z)), n[0] - cx, n[1] - cy, n[2] - cz);
    }
  }

  mesh(): Mesh {
    return { positions: this.positions, normals: this.normals, uvs: this.uvs, groups: this.groups };
  }
}

// ---- the body -----------------------------------------------------------------------------

const HALF = 10;   // points in half a slice, from the middle underneath round to the middle of the roof

/** Height of the car's top line at a point along it (z from the centre, front is +z). */
function roofAt(spec: CarSpec, z: number): number {
  const f = Math.min(1, Math.max(0, (z + spec.length / 2) / spec.length));
  const top = spec.top;
  for (let i = 1; i < top.length; i++) {
    if (f <= top[i][0]) {
      const [f0, y0] = top[i - 1], [f1, y1] = top[i];
      return y0 + ((y1 - y0) * (f - f0)) / Math.max(1e-6, f1 - f0);
    }
  }
  return top[top.length - 1][1];
}

type Slice = { z: number; pts: [number, number][]; green: number; zone: "deck" | "backlight" | "roof" | "windshield" | "hood"; end: number };

function slicer(spec: CarSpec) {
  const L = spec.length;
  const top = curve(spec.top);
  const belt = curve(spec.belt);
  const rearAxle = -L / 2 + (L - spec.wheelbase - spec.frontOverhang);
  const frontAxle = rearAxle + spec.wheelbase;
  const archR = spec.wheelR + 0.05;
  const hwBase = spec.width / 2;

  const bottomAt = (z: number) => {
    let y = spec.clearance;
    for (const az of [rearAxle, frontAxle]) {
      const dz = z - az;
      if (Math.abs(dz) < archR) {
        const arch = spec.wheelR + Math.sqrt(archR * archR - dz * dz) * 0.92;
        y = Math.max(y, arch);
      }
    }
    return y;
  };

  const zoneAt = (f: number): Slice["zone"] =>
    f < spec.backlight[0] ? "deck" : f < spec.backlight[1] ? "backlight" : f < spec.windshield[0] ? "roof" : f < spec.windshield[1] ? "windshield" : "hood";

  const slice = (f: number): Slice => {
    const z = -L / 2 + f * L;
    const fromEnd = Math.min(z + L / 2, L / 2 - z);
    const t = Math.min(1, fromEnd / spec.endRound);       // 0 at the very end, 1 once past the rounding
    const round = Math.sqrt(1 - (1 - t) * (1 - t));          // a quarter circle, seen from above
    // Seen from above the car is a long rounded box, a little narrower at the ends.
    const plan = 1 - 0.035 * Math.pow(Math.abs(f - 0.5) * 2, 4);
    const hw = hwBase * plan * (0.8 + 0.2 * round);
    const yTop0 = top(f);
    const yBelt0 = belt(f);
    let yb = bottomAt(z);
    // The bumpers curl under a little at both ends.
    yb += (spec.clearance + 0.1 - spec.clearance) * (1 - t) * (1 - t) + (fromEnd < 0.5 ? (0.5 - fromEnd) * 0.12 : 0);
    const yTop = yTop0 - 0.05 * (1 - t) * (1 - t);
    const green = smooth(yBelt0 + 0.02, yBelt0 + 0.14, yTop);
    const s = Math.min(yBelt0, yTop);                       // the shoulder: the window line, or the bonnet if lower
    const ym = Math.max(yb + 0.06, Math.min(s - 0.08, yb + (s - yb) * 0.42));
    const roofW = spec.roofW;
    const pts: [number, number][] = [];
    pts.push([0, yb]);
    pts.push([hw * 0.9, yb]);
    pts.push([hw * 0.985, Math.min(yb + 0.04, ym - 0.02)]);
    pts.push([hw, ym]);
    pts.push([hw * 0.995, s - 0.05]);
    pts.push([hw * 0.965, s]);
    // From the shoulder up: across the bonnet or boot where there is no glass, up the side
    // glass and over the roof where there is. One is blended into the other.
    const flatTop = (k: number, dy: number): [number, number] => [hw * k, yTop + dy];
    const glassAt: [number, number][] = [
      [hw * (0.955 - 0.01), s + 0.012],
      [hw * roofW, yTop - 0.045],
      [hw * roofW * 0.9, yTop - 0.004],
    ];
    const bonnetAt: [number, number][] = [flatTop(0.9, 0.006), flatTop(0.72, 0.016), flatTop(0.45, 0.026)];
    for (let i = 0; i < 3; i++) {
      pts.push([
        bonnetAt[i][0] + (glassAt[i][0] - bonnetAt[i][0]) * green,
        bonnetAt[i][1] + (glassAt[i][1] - bonnetAt[i][1]) * green,
      ]);
    }
    pts.push([0, yTop + (green > 0.5 ? spec.crown : 0.03)]);
    return { z, pts, green, zone: zoneAt(f), end: t };
  };

  return { slice, rearAxle, frontAxle, archR };
}

/** All the slices along the car: closer together near the ends and round the wheel arches. */
function stations(spec: CarSpec, rearAxle: number, frontAxle: number, archR: number): number[] {
  const L = spec.length;
  const out = new Set<number>();
  const N = 110;
  for (let i = 0; i <= N; i++) out.add(i / N);
  for (let i = 0; i <= 10; i++) {
    const k = (i / 10) * spec.endRound / L;
    out.add(k);
    out.add(1 - k);
  }
  for (const az of [rearAxle, frontAxle]) {
    for (let i = -16; i <= 16; i++) out.add((az + (i / 16) * archR + L / 2) / L);
    // The arch drops straight down at its two sides.
    for (const side of [-1, 1]) {
      out.add((az + side * (archR - 0.002) + L / 2) / L);
      out.add((az + side * (archR + 0.002) + L / 2) / L);
    }
  }
  for (const key of [...spec.top, ...spec.belt]) out.add(key[0]);
  return [...out].filter((f) => f >= 0 && f <= 1).sort((a, b) => a - b);
}

function buildBody(spec: CarSpec, b: Builder): void {
  const { slice, rearAxle, frontAxle, archR } = slicer(spec);
  const fs = stations(spec, rearAxle, frontAxle, archR);
  const slices = fs.map(slice);
  const ringSize = HALF * 2 - 2;   // right half 0..9, then the left half 8..1 back to the middle underneath

  // Which parts of the glass are pillars: its two ends and a post between the doors.
  const greenZs = slices.filter((s) => s.green > 0.6).map((s) => s.z);
  const glassFrom = Math.min(...greenZs), glassTo = Math.max(...greenZs);
  const bPillar = glassFrom + (glassTo - glassFrom) * (spec.suv ? 0.42 : 0.47);

  // Vertices: one ring per slice. Normals are worked out from the faces afterwards.
  const grid: number[][] = [];
  for (const s of slices) {
    const ring: number[] = [];
    for (let i = 0; i < HALF; i++) ring.push(b.vertex(s.pts[i][0], s.pts[i][1], s.z));
    for (let i = HALF - 2; i >= 1; i--) ring.push(b.vertex(-s.pts[i][0], s.pts[i][1], s.z));
    grid.push(ring);
  }

  // What each band of the skin is made of, between ring point i and i + 1 (right half;
  // the left is the mirror).
  const matOf = (s: Slice, s2: Slice, i: number): Mat => {
    const zMid = (s.z + s2.z) / 2;
    const green = Math.min(s.green, s2.green);
    if (i === 0) return "under";
    if (i === 1) return spec.suv ? "cladding" : "paint";
    if (i === 6) {
      if (green < 0.5) return "paint";
      const pillar = zMid < glassFrom + 0.07 || zMid > glassTo - 0.06 || Math.abs(zMid - bPillar) < 0.05;
      return pillar ? "trim" : "glass";
    }
    if (i === 5 && spec.chromeLine && green > 0.5) return "chrome";
    if (i === 7 && green > 0.5) return spec.blackRoof ? "trim" : "paint";
    if (i === 8 || i === 9) {
      if (green < 0.5) return "paint";
      const zone = s.zone === s2.zone ? s.zone : "roof";
      if (zone === "backlight" || zone === "windshield") return "glass";
      return spec.blackRoof ? "trim" : "paint";
    }
    return "paint";
  };

  for (let k = 0; k + 1 < slices.length; k++) {
    const a = grid[k], c = grid[k + 1];
    for (let j = 0; j < ringSize; j++) {
      const j2 = (j + 1) % ringSize;
      // Which band this is: 0..8 up the right side, and the same bands mirrored down the left.
      const band = j <= HALF - 2 ? j : ringSize - 1 - j;
      const mat = matOf(slices[k], slices[k + 1], band);
      // Outward-facing: the ring runs anticlockwise seen from behind (-z), slices go to +z.
      b.quad(mat, a[j], a[j2], c[j2], c[j]);
    }
  }

  // Normals: square to the skin, worked out from the slice's own curve and the slices a
  // little way in front and behind. (Averaging the faces instead lets the arches' straight
  // edges pull the normals of the whole side, and the paint shows stripes.)
  const p = b.positions;
  const pos = (k: number, j: number): [number, number, number] => {
    const i = grid[k][(j + ringSize) % ringSize] * 3;
    return [p[i], p[i + 1], p[i + 2]];
  };
  for (let k = 0; k < slices.length; k++) {
    let kb = k, kf = k;
    while (kb > 0 && slices[k].z - slices[kb].z < 0.015) kb--;
    while (kf < slices.length - 1 && slices[kf].z - slices[k].z < 0.015) kf++;
    for (let j = 0; j < ringSize; j++) {
      const a = pos(kb, j), c = pos(kf, j), r0 = pos(k, j - 1), r1 = pos(k, j + 1);
      const ax = c[0] - a[0], ay = c[1] - a[1], az = c[2] - a[2];
      const rx = r1[0] - r0[0], ry = r1[1] - r0[1], rz = r1[2] - r0[2];
      // Across the ring (its outward side is (ry, -rx)) crossed with along the car.
      let nx = ry * az - rz * ay, ny = rz * ax - rx * az, nz = rx * ay - ry * ax;
      if (nx * ry - ny * rx < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      const i = grid[k][j] * 3;
      b.normals[i] = nx / l; b.normals[i + 1] = ny / l; b.normals[i + 2] = nz / l;
    }
  }

  // The two ends: the bumpers' faces, closed off flat, with the grille, lights and plates on them.
  ends(spec, slices[0], slices[slices.length - 1], b);
  // Lights that wrap round the corners, painted onto the skin just above it.
  wraps(spec, slice, b);
  details(spec, slice, rearAxle, frontAxle, archR, b, glassFrom, glassTo, bPillar);
  lean(spec, b, rearAxle, frontAxle, archR);
}

/**
 * Real bumpers and bonnets are not walls: the higher up the front of a car, the further
 * back it is, and the same at the back. Everything near the two ends is sheared back by
 * its height, which keeps flat things flat (the lights and plates stay on their faces).
 */
function lean(spec: CarSpec, b: Builder, rearAxle: number, frontAxle: number, archR: number): void {
  const L = spec.length;
  const front = spec.suv ? 0.3 : 0.4, rear = spec.suv ? 0.12 : 0.26;
  const reachF = Math.max(0.2, Math.min(0.6, L / 2 - frontAxle - archR - 0.02));
  const reachR = Math.max(0.2, Math.min(0.6, rearAxle + L / 2 - archR - 0.02));
  const p = b.positions, n = b.normals;
  for (let i = 0; i < p.length; i += 3) {
    const y = p[i + 1] - spec.clearance, z = p[i + 2];
    let k = 0;
    if (z > L / 2 - reachF) k = -front * smooth(L / 2 - reachF, L / 2, z);
    else if (z < -L / 2 + reachR) k = rear * smooth(-L / 2 + reachR, -L / 2, z);
    if (k === 0) continue;
    p[i + 2] = z + k * y;
    // A shear z' = z + k y turns a normal (x, y, z) into (x, y - k z, z).
    const nx = n[i], ny = n[i + 1] - k * n[i + 2], nz = n[i + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    n[i] = nx / l; n[i + 1] = ny / l; n[i + 2] = nz / l;
  }
}

function ringOf(s: Slice): [number, number][] {
  const right = s.pts;
  const left: [number, number][] = [];
  for (let i = HALF - 2; i >= 1; i--) left.push([-right[i][0], right[i][1]]);
  return [...right, ...left];
}

function ends(spec: CarSpec, rear: Slice, front: Slice, b: Builder): void {
  for (const [s, dir] of [[rear, -1], [front, 1]] as const) {
    const ring = ringOf(s);
    // The face itself, as a fan from its middle.
    let cx = 0, cy = 0;
    for (const [, y] of ring) cy += y;
    cy /= ring.length;
    const centre = b.vertex(cx, cy, s.z, 0, 0, dir);
    const first = b.positions.length / 3;
    for (const [x, y] of ring) b.vertex(x, y, s.z, 0, 0, dir);
    for (let i = 0; i < ring.length; i++) {
      const a = first + i, c = first + ((i + 1) % ring.length);
      if (dir > 0) b.tri("paint", centre, a, c);
      else b.tri("paint", centre, c, a);
    }

    const z = s.z + dir * 0.004;
    const hw = Math.max(...ring.map(([x]) => x));
    const rect = (mat: Mat, x0: number, y0: number, x1: number, y1: number, dz = 0) => {
      const zz = z + dir * dz;
      const pts: [number, number, number][] = dir > 0
        ? [[x0, y0, zz], [x1, y0, zz], [x1, y1, zz], [x0, y1, zz]]
        : [[x1, y0, zz], [x0, y0, zz], [x0, y1, zz], [x1, y1, zz]];
      // Read left to right by someone standing in front of that end.
      b.flat(mat, pts, 0, 0, dir, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    };
    const disc = (mat: Mat, x: number, y: number, r: number, dz = 0) => {
      const zz = z + dir * dz;
      const pts: [number, number, number][] = [];
      for (let i = 0; i < 12; i++) {
        const a = ((dir > 0 ? i : -i) / 12) * Math.PI * 2;
        pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r, zz]);
      }
      b.flat(mat, pts, 0, 0, dir);
    };

    if (dir > 0) {
      const g = spec.grille;
      // A chrome surround, the dark grille, and bars or slats across it.
      rect("chrome", -g.w / 2 - 0.02, g.y - g.h / 2 - 0.02, g.w / 2 + 0.02, g.y + g.h / 2 + 0.02);
      rect("grille", -g.w / 2, g.y - g.h / 2, g.w / 2, g.y + g.h / 2, 0.001);
      const bars = g.style === "bars" ? 3 : g.style === "slats" ? 2 : g.style === "wide" ? 6 : g.style === "slim" ? 1 : 0;
      for (let i = 1; i <= bars; i++) {
        const y = g.y - g.h / 2 + (g.h * i) / (bars + 1);
        rect("chrome", -g.w / 2 + 0.01, y - 0.009, g.w / 2 - 0.01, y + 0.009, 0.002);
      }
      if (g.style === "mesh") {
        for (let i = -6; i <= 6; i++) rect("chrome", i * (g.w / 13) - 0.004, g.y - g.h / 2 + 0.01, i * (g.w / 13) + 0.004, g.y + g.h / 2 - 0.01, 0.002);
      }
      // The lower air intake and the plate.
      const intakeY = Math.max(spec.clearance + 0.16, g.y - g.h / 2 - 0.16);
      rect("grille", -hw * 0.62, intakeY - 0.06, hw * 0.62, intakeY + 0.06, 0.001);
      rect("plate", -0.26, intakeY + 0.07, 0.26, intakeY + 0.19, 0.003);
      // Headlights at both corners: a dark housing, and the lamps in it.
      const h = spec.heads;
      for (const side of [-1, 1]) {
        const xo = side * (hw - 0.03), xi = side * (hw - 0.03 - h.w);
        const x0 = Math.min(xo, xi), x1 = Math.max(xo, xi);
        rect("trim", x0 - 0.012, h.y - h.h / 2 - 0.012, x1 + 0.012, h.y + h.h / 2 + 0.012, 0.001);
        if (h.style === "slim") {
          // A line of LEDs along the top, and two projectors under it.
          rect("head", x0 + 0.01, h.y + h.h / 2 - 0.028, x1 - 0.01, h.y + h.h / 2 - 0.008, 0.003);
          for (const k of [0.3, 0.68]) disc("head", x0 + (x1 - x0) * (side > 0 ? k : 1 - k), h.y - h.h * 0.1, h.h * 0.26, 0.003);
        } else {
          // A chrome reflector with a big lamp and a smaller one in it.
          rect("chrome", x0 + 0.008, h.y - h.h / 2 + 0.008, x1 - 0.008, h.y + h.h / 2 - 0.008, 0.002);
          disc("head", x0 + (x1 - x0) * (side > 0 ? 0.32 : 0.68), h.y, h.h * 0.36, 0.003);
          disc("head", x0 + (x1 - x0) * (side > 0 ? 0.74 : 0.26), h.y, h.h * 0.26, 0.003);
        }
        // Fog lights low down.
        disc("head", side * (hw * 0.8), intakeY, 0.035, 0.002);
      }
    } else {
      const t = spec.tails;
      for (const side of [-1, 1]) {
        const x0 = side * (hw - 0.03), x1 = side * (hw - 0.03 - t.w);
        rect("trim", Math.min(x0, x1) - 0.01, t.y - t.h / 2 - 0.01, Math.max(x0, x1) + 0.01, t.y + t.h / 2 + 0.01, 0.001);
        rect("tail", Math.min(x0, x1), t.y - t.h / 2, Math.max(x0, x1), t.y + t.h / 2, 0.002);
        // A reflector low on the bumper.
        rect("tail", side * (hw - 0.12) - 0.07, spec.clearance + 0.2, side * (hw - 0.12) + 0.07, spec.clearance + 0.24, 0.002);
      }
      if (t.style === "bar") rect("tail", -hw + 0.05, t.y - 0.018, hw - 0.05, t.y + 0.018, 0.003);
      rect("plate", -0.26, t.y - t.h / 2 - 0.2, 0.26, t.y - t.h / 2 - 0.08, 0.003);
      // The tailpipes.
      for (const side of spec.suv || spec.rim.colour !== "silver" ? [-1, 1] : [1]) {
        rect("chrome", side * hw * 0.55 - 0.07, spec.clearance + 0.04, side * hw * 0.55 + 0.07, spec.clearance + 0.1, 0.006);
        rect("trim", side * hw * 0.55 - 0.055, spec.clearance + 0.05, side * hw * 0.55 + 0.055, spec.clearance + 0.09, 0.008);
      }
    }
  }
}

/** A patch of the skin, lifted a few millimetres off it: ring points iFrom..iTo, from zFrom to zTo. */
function patch(
  slice: (f: number) => Slice, spec: CarSpec, b: Builder, mat: Mat,
  zFrom: number, zTo: number, iFrom: number, iTo: number, lift = 0.004, side: 1 | -1 = 1,
): void {
  const L = spec.length;
  const steps = 8, across = 4;
  const at = (z: number, i: number, mirror: number): [number, number, number] => {
    const s = slice((z + L / 2) / L);
    const k = Math.floor(i), t = i - k;
    const a = s.pts[Math.min(k, HALF - 1)], c = s.pts[Math.min(k + 1, HALF - 1)];
    return [(a[0] + (c[0] - a[0]) * t) * mirror, a[1] + (c[1] - a[1]) * t, s.z];
  };
  const rows: number[][] = [];
  for (let u = 0; u <= steps; u++) {
    const z = zFrom + ((zTo - zFrom) * u) / steps;
    const row: number[] = [];
    for (let v = 0; v <= across; v++) {
      const i = iFrom + ((iTo - iFrom) * v) / across;
      const p = at(z, i, 1);
      // Outward, worked out on the right-hand side and mirrored: across the slice, square
      // to the way the ring runs up it.
      const q = at(z, Math.min(i + 0.05, HALF - 1.001), 1);
      const tx = q[0] - p[0], ty = q[1] - p[1];
      const l = Math.hypot(tx, ty) || 1;
      const nx = (ty / l) * side, ny = -tx / l;
      row.push(b.vertex(p[0] * side + nx * lift, p[1] + ny * lift, p[2], nx, ny, 0));
    }
    rows.push(row);
  }
  for (let u = 0; u < steps; u++) {
    for (let v = 0; v < across; v++) {
      if (side > 0) b.quad(mat, rows[u][v], rows[u][v + 1], rows[u + 1][v + 1], rows[u + 1][v]);
      else b.quad(mat, rows[u][v], rows[u + 1][v], rows[u + 1][v + 1], rows[u][v + 1]);
    }
  }
}

/** Where on a slice's side (as a ring index) a height is. */
function indexAtY(s: Slice, y: number): number {
  for (let i = 2; i < 5; i++) {
    const a = s.pts[i][1], c = s.pts[i + 1][1];
    if (y >= a && y <= c) return i + (c > a ? (y - a) / (c - a) : 0);
  }
  return y < s.pts[2][1] ? 2 : 5;
}

/** A patch between two heights on the side, from zFrom to zTo. */
function band(
  slice: (f: number) => Slice, spec: CarSpec, b: Builder, mat: Mat,
  zFrom: number, zTo: number, yFrom: number, yTo: number, lift: number, side: 1 | -1,
): void {
  const s = slice(((zFrom + zTo) / 2 + spec.length / 2) / spec.length);
  patch(slice, spec, b, mat, zFrom, zTo, indexAtY(s, yFrom), indexAtY(s, yTo), lift, side);
}

function wraps(spec: CarSpec, slice: (f: number) => Slice, b: Builder): void {
  const L = spec.length;
  const h = spec.heads, t = spec.tails;
  for (const side of [1, -1] as const) {
    // Headlights carry a little way round the front corners; tail lights round the back ones.
    band(slice, spec, b, "trim", L / 2 - spec.endRound - 0.1, L / 2 - 0.004, h.y - h.h / 2 - 0.012, h.y + h.h / 2 + 0.012, 0.003, side);
    band(slice, spec, b, "head", L / 2 - spec.endRound - 0.06, L / 2 - 0.004, h.y - h.h / 2 + 0.01, h.y + h.h / 2 - 0.01, 0.005, side);
    band(slice, spec, b, "tail", -L / 2 + 0.004, -L / 2 + spec.endRound + 0.12, t.y - t.h / 2, t.y + t.h / 2, 0.004, side);
    // Amber side repeaters on the front wings.
    const s = slice((L / 2 - spec.endRound - 0.4 + L / 2) / L);
    const y = s.pts[5][1] - 0.13;
    band(slice, spec, b, "amber", L / 2 - spec.endRound - 0.44, L / 2 - spec.endRound - 0.37, y - 0.012, y + 0.012, 0.005, side);
  }
}

function details(
  spec: CarSpec, slice: (f: number) => Slice, rearAxle: number, frontAxle: number, archR: number, b: Builder,
  glassFrom: number, glassTo: number, bPillar: number,
): void {
  const L = spec.length;
  const sliceAt = (z: number) => slice((z + L / 2) / L);
  for (const side of [1, -1] as const) {
    // Door shut lines: thin dark gaps from the sill to the window, front and back doors.
    for (const z of [glassTo - 0.02, bPillar, glassFrom + (spec.suv ? 0.18 : 0.12)]) {
      const s = sliceAt(z);
      band(slice, spec, b, "trim", z - 0.004, z + 0.004, s.pts[2][1] + 0.03, s.pts[5][1] - 0.005, 0.002, side);
    }
    // Door handles, chrome, just under the window line.
    for (const z of [bPillar + 0.3, glassFrom + (bPillar - glassFrom) * 0.3]) {
      const y = sliceAt(z).pts[5][1] - 0.1;
      band(slice, spec, b, "chrome", z - 0.09, z + 0.09, y - 0.018, y + 0.018, 0.01, side);
    }
    // Black plastic round the wheel arches on an SUV: a band just outside the arch.
    if (spec.suv) {
      for (const az of [rearAxle, frontAxle]) {
        const steps = 18;
        const inner: number[] = [], outer: number[] = [];
        for (let i = 0; i <= steps; i++) {
          const a = Math.PI * (i / steps);
          const z = az - Math.cos(a) * (archR + 0.004);
          const s = sliceAt(z);
          const x = s.pts[3][0] * side + side * 0.012;
          const y0 = spec.wheelR + Math.sin(a) * archR * 0.92;
          inner.push(b.vertex(x, y0 + 0.004, z - Math.cos(a) * 0.0, side, 0, 0));
          outer.push(b.vertex(x, y0 + 0.07, z - Math.cos(a) * 0.07, side, 0, 0));
        }
        for (let i = 0; i < steps; i++) {
          if (side > 0) b.quad("cladding", inner[i], outer[i], outer[i + 1], inner[i + 1]);
          else b.quad("cladding", inner[i], inner[i + 1], outer[i + 1], outer[i]);
        }
      }
    }
    // The mirror, on a stalk at the bottom of the front of the side glass.
    const mz = glassTo - 0.16;
    const s = sliceAt(mz);
    const mx = s.pts[5][0] * side;
    const my = s.pts[5][1] + 0.07;
    b.box("trim", mx + side * 0.025, my - 0.035, mz, 0.035, 0.012, 0.025);
    b.box(spec.blackRoof ? "trim" : "paint", mx + side * 0.09, my, mz - 0.02, 0.07, 0.045, 0.035, side * 0.15);
    b.box("trim", mx + side * 0.09, my, mz - 0.057, 0.062, 0.038, 0.003, side * 0.15);
  }
  // Roof rails on an SUV.
  if (spec.suv) {
    const roofFrom = -L / 2 + spec.backlight[1] * L + 0.05;
    const roofTo = -L / 2 + spec.windshield[0] * L - 0.08;
    const mid = (roofFrom + roofTo) / 2;
    const s = sliceAt(mid);
    const y = s.pts[8][1] + 0.05;
    for (const side of [1, -1]) {
      b.box(spec.chromeLine ? "chrome" : "trim", side * s.pts[8][0] * 0.95, y, mid, 0.022, 0.018, (roofTo - roofFrom) / 2);
      for (const z of [roofFrom + 0.05, roofTo - 0.05]) b.box("trim", side * s.pts[8][0] * 0.95, y - 0.03, z, 0.025, 0.03, 0.05);
    }
  }
  // A shark-fin aerial at the back of the roof, on the newer cars.
  if (spec.blackRoof || spec.rim.colour !== "silver" || spec.suv) {
    const z = -L / 2 + spec.backlight[1] * L + 0.12;
    const s = sliceAt(z);
    b.box("trim", 0, s.pts[9][1] + 0.012, z, 0.018, 0.022, 0.07);
    b.box("trim", 0, s.pts[9][1] + 0.035, z - 0.02, 0.012, 0.012, 0.04);
  }
  // A rear wing: two uprights off the deck, the blade on top, end plates at its tips.
  if (spec.wing) {
    const z = -L / 2 + spec.wing.at * L + spec.wing.chord / 2 + 0.08;
    const deck = sliceAt(z).pts[9][1];
    const { y, w, chord } = spec.wing;
    for (const side of [1, -1]) b.box("trim", side * w * 0.26, (deck + y) / 2, z, 0.025, (y - deck) / 2, 0.06);
    b.box("trim", 0, y, z, w / 2, 0.022, chord / 2);
    for (const side of [1, -1]) b.box("trim", side * w / 2, y - 0.04, z, 0.012, 0.09, chord / 2 + 0.02);
  }
  // Air intakes in the sides, just in front of the back wheels.
  if (spec.intakes) {
    const z = rearAxle + archR + 0.35;
    const s = sliceAt(z);
    const lowY = s.pts[3][1], highY = s.pts[5][1];
    for (const side of [1, -1]) {
      const x = side * (s.pts[4][0] + 0.004);
      b.box("grille", x, (lowY + highY) / 2, z, 0.012, (highY - lowY) * 0.42, 0.32, 0);
      b.box("trim", x, highY - 0.02, z + 0.05, 0.015, 0.025, 0.4, 0);
    }
  }
  // Inside: the dashboard, the seats and the steering wheel, seen through the glass.
  const cowl = -L / 2 + spec.windshield[1] * L;
  const sb = sliceAt(cowl - 0.25);
  const floorY = spec.clearance + 0.2;
  const beltY = sb.pts[5][1];
  b.box("interior", 0, beltY - 0.09, cowl - 0.32, spec.width / 2 - 0.12, 0.09, 0.18);
  const seatZ = cowl - 0.95;
  // Low supercars: squash the seat backs so the headrests stay under the roof.
  const sk = Math.min(1, (roofAt(spec, seatZ - 0.26) - 0.1 - floorY) / 1.01);
  for (const x of [0.38, -0.38]) {
    b.box("seat", x, floorY + 0.22, seatZ, 0.25, 0.07, 0.26);
    b.box("seat", x, floorY + 0.55 * sk, seatZ - 0.26, 0.24, 0.32 * sk, 0.06, 0);
    b.box("seat", x, floorY + 0.92 * sk, seatZ - 0.26, 0.13, 0.09 * sk, 0.05);
  }
  if (!spec.twoSeat) {
    b.box("seat", 0, floorY + 0.22, seatZ - 0.95, spec.width / 2 - 0.2, 0.07, 0.25);
    b.box("seat", 0, floorY + 0.55, seatZ - 1.2, spec.width / 2 - 0.22, 0.3, 0.06);
  }
  // The steering wheel: a ring of short boxes, on the left (the driver's side).
  {
    const cx = 0.38, cy = beltY + 0.02, cz = cowl - 0.52, r = 0.18;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const y = cy + Math.sin(a) * r * 0.95;
      const x = cx + Math.cos(a) * r;
      b.box("trim", x, y, cz + Math.sin(a) * r * 0.3, 0.02, 0.02, 0.02);
    }
    b.box("trim", cx, cy, cz + 0.1, 0.03, 0.03, 0.12);
  }
}

// ---- the wheel ----------------------------------------------------------------------------

function buildWheel(spec: CarSpec): Mesh {
  const b = new Builder();
  const R = spec.wheelR, r = spec.rimR, w = spec.tyreW;
  const segs = 36;
  // The tyre: a rounded ring, turned round the axle (x). Its outline seen in cross-section:
  const profile: [number, number][] = [
    [-w / 2 + 0.01, r * 0.98], [-w / 2, r + 0.02], [-w / 2 + 0.004, R - 0.03], [-w / 2 + 0.025, R - 0.004],
    [0, R], [w / 2 - 0.025, R - 0.004], [w / 2 - 0.004, R - 0.03], [w / 2, r + 0.02], [w / 2 - 0.01, r * 0.98],
  ];
  const rows: number[][] = [];
  for (let s = 0; s <= segs; s++) {
    const a = (s / segs) * Math.PI * 2;
    const c = Math.cos(a), sn = Math.sin(a);
    const row: number[] = [];
    for (let i = 0; i < profile.length; i++) {
      const [x, rad] = profile[i];
      const prev = profile[Math.max(0, i - 1)], next = profile[Math.min(profile.length - 1, i + 1)];
      const dx = next[0] - prev[0], dr = next[1] - prev[1];
      const nx = dr, nr = -dx;   // outward from the tyre's section
      row.push(b.vertex(x, rad * c, rad * sn, nx, nr * c, nr * sn));
    }
    rows.push(row);
  }
  for (let s = 0; s < segs; s++) {
    for (let i = 0; i + 1 < profile.length; i++) b.quad("rubber", rows[s][i], rows[s][i + 1], rows[s + 1][i + 1], rows[s + 1][i]);
  }

  // The rim's face: a lip round the edge, spokes out from the hub, and dark gaps between
  // them where the brake disc shows.
  const face = w / 2 - 0.035;
  const ring = (mat: Mat, r0: number, r1: number, x0: number, x1: number, a0 = 0, a1 = Math.PI * 2, n = segs) => {
    const first = b.positions.length / 3;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const c = Math.cos(a), sn = Math.sin(a);
      b.vertex(x0, r0 * c, r0 * sn, 1, 0, 0);
      b.vertex(x1, r1 * c, r1 * sn, 1, 0, 0);
    }
    for (let i = 0; i < n; i++) {
      const p = first + i * 2;
      b.quad(mat, p, p + 2, p + 3, p + 1);
    }
  };
  const metal: Mat = "rim";
  ring(metal, r, r - 0.025, face, face + 0.006);                 // the lip
  ring("disc", r - 0.025, 0.05, face - 0.07, face - 0.07);        // deep inside: the barrel and the brake disc
  const hub = r * 0.24;
  ring(metal, hub, 0.0, face + 0.012, face + 0.016);              // the centre cap
  ring("trim", hub * 0.55, 0.0, face + 0.017, face + 0.018);
  const spokes = spec.rim.spokes;
  const style = spec.rim.style;
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2;
    const twin = style === "split" ? [-0.09, 0.09] : [0];
    for (const off of twin) {
      const widthIn = style === "steel" ? 0.14 : style === "blade" ? 0.07 : style === "mesh" ? 0.05 : style === "multi" ? 0.06 : 0.11;
      const widthOut = style === "blade" ? 0.035 : style === "mesh" ? 0.03 : widthIn * 0.55;
      const sweep = style === "blade" ? 0.22 : 0;
      const ai = a + off, ao = a + off + sweep;
      const pts: [number, number, number][] = [
        [face + 0.01, hub * Math.cos(ai - widthIn / 2 / hub * 0.12), hub * Math.sin(ai - widthIn / 2 / hub * 0.12)],
        [face + 0.004, (r - 0.025) * Math.cos(ao - widthOut / r), (r - 0.025) * Math.sin(ao - widthOut / r)],
        [face + 0.004, (r - 0.025) * Math.cos(ao + widthOut / r), (r - 0.025) * Math.sin(ao + widthOut / r)],
        [face + 0.01, hub * Math.cos(ai + widthIn / 2 / hub * 0.12), hub * Math.sin(ai + widthIn / 2 / hub * 0.12)],
      ];
      b.flat(metal, pts, 1, 0, 0);
    }
    if (style === "mesh") {
      // A second ring of crossing spokes for the mesh look.
      const a2 = a + Math.PI / spokes;
      const pts: [number, number, number][] = [
        [face + 0.008, r * 0.55 * Math.cos(a2 - 0.08), r * 0.55 * Math.sin(a2 - 0.08)],
        [face + 0.004, (r - 0.03) * Math.cos(a2 - 0.03), (r - 0.03) * Math.sin(a2 - 0.03)],
        [face + 0.004, (r - 0.03) * Math.cos(a2 + 0.03), (r - 0.03) * Math.sin(a2 + 0.03)],
        [face + 0.008, r * 0.55 * Math.cos(a2 + 0.08), r * 0.55 * Math.sin(a2 + 0.08)],
      ];
      b.flat(metal, pts, 1, 0, 0);
    }
  }
  if (style === "steel") {
    // A plain wheel trim: one disc with round holes, near enough with a solid face.
    ring(metal, r - 0.03, hub, face + 0.008, face + 0.012);
  }
  // The brake calliper, behind the spokes at the top-back of the disc.
  b.box("caliper", face - 0.05, r * 0.62 * Math.sin(0.6), -r * 0.62 * Math.cos(0.6), 0.02, 0.05, 0.035, 0);
  return b.mesh();
}

// ---- putting it together ------------------------------------------------------------------

const made = new Map<string, CarParts>();

/** The parts of one car model, worked out once and kept. Unknown ids get the small saloon. */
export function carParts(model: string): CarParts {
  const known = made.get(model);
  if (known) return known;
  const spec = CAR_SPECS[model] ?? CAR_SPECS.kaze_sprint;
  const b = new Builder();
  buildBody(spec, b);
  const { rearAxle, frontAxle } = slicer(spec);
  const halfTrack = spec.width / 2 - spec.tyreW / 2 - 0.035;
  const wheels: WheelPlace[] = [];
  for (const [z, front] of [[rearAxle, false], [frontAxle, true]] as const) {
    for (const side of [1, -1] as const) wheels.push({ x: side * halfTrack, y: spec.wheelR, z, front, side });
  }
  const cowl = -spec.length / 2 + spec.windshield[1] * spec.length;
  const parts: CarParts = {
    body: b.mesh(),
    wheel: buildWheel(spec),
    wheels,
    // Eyes sit 0.66 above the seat; keep them a hand's width under the roof in the low cars.
    seat: { x: 0.38, y: Math.min(spec.clearance + 0.48, roofAt(spec, cowl - 0.95) - 0.16 - 0.66), z: cowl - 0.95 },
    length: spec.length,
    width: spec.width,
    height: Math.max(...spec.top.map((k) => k[1])),
    wheelbase: spec.wheelbase,
    radius: spec.wheelR,
  };
  made.set(model, parts);
  return parts;
}

/** "model|colour|plate", as the server sends it, taken apart. */
export function readCarLook(look: string): { model: string; colour: string; plate: string } {
  const [model = "", colour = "", plate = ""] = look.split("|");
  return { model, colour, plate };
}

/**
 * A car seen from the side, for pictures in menus: the outline of the body, the window
 * opening, and where the wheels are. Lengths in metres, z from the back (0) to the front.
 */
export function carOutline(model: string): {
  length: number; height: number; body: [number, number][]; glass: [number, number][]; wheels: { z: number; r: number; rim: number }[];
} {
  const spec = CAR_SPECS[model] ?? CAR_SPECS.kaze_sprint;
  const { slice, rearAxle, frontAxle } = slicer(spec);
  const L = spec.length;
  const top: [number, number][] = [], bottom: [number, number][] = [], glassTop: [number, number][] = [], glassBottom: [number, number][] = [];
  for (let i = 0; i <= 80; i++) {
    const s = slice(i / 80);
    const z = s.z + L / 2;
    top.push([z, s.pts[9][1]]);
    bottom.push([z, s.pts[0][1]]);
    if (s.green > 0.6) {
      glassTop.push([z, s.pts[7][1] - 0.01]);
      glassBottom.push([z, s.pts[5][1] + 0.03]);
    }
  }
  return {
    length: L,
    height: Math.max(...top.map((p) => p[1])),
    body: [...top, ...bottom.reverse()],
    glass: [...glassTop, ...glassBottom.reverse()],
    wheels: [rearAxle, frontAxle].map((z) => ({ z: z + L / 2, r: spec.wheelR, rim: spec.rimR })),
  };
}
