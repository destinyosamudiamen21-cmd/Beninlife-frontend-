// The fronts of the houses players live in (estate_service.py): a door in its frame, a step,
// gate posts with lamps, all turned to face the street. Plain data, no 3D imports, so the
// viewer in tests/gl can draw them too.

import type { HousePlot } from "../api/estates";
import type { BoxSpec } from "./boxBuilder";
import type { Door } from "./districtData";

// Each kind of home has its own front: the door's wood, the gate posts' paint.
const STYLE: Record<string, { door: string; post: string; trim: string }> = {
  selfcon: { door: "#5a3a24", post: "#b9b2a3", trim: "#2f6fd6" },
  bdpa: { door: "#6b2c2c", post: "#c8bfae", trim: "#3f6b4a" },
  flat: { door: "#3a3d42", post: "#d3cbbb", trim: "#7a2f3a" },
  duplex: { door: "#1d1d1f", post: "#efe9dc", trim: "#c9a24e" },
  luxury: { door: "#1d1d1f", post: "#f2f1ec", trim: "#c9a24e" },
};
const WARM = "#ffe2a6";

/** The turn that carries a plot's "out of the door" (+z) onto the way its door faces. */
export const turnOf = (facing: number) => Math.PI / 2 - facing;

/** A point in front of (+z) and to the right (+x) of a door, on the ground. */
export function local(plot: { x: number; z: number; facing: number }, lx: number, lz: number): [number, number] {
  const turn = turnOf(plot.facing);
  const c = Math.cos(turn), s = Math.sin(turn);
  return [plot.x + lx * c + lz * s, plot.z - lx * s + lz * c];
}

/** The boxes of one house's front: door, step, gate posts with lamps. Solid ones, and the lamps. */
export function frontBoxes(plot: HousePlot): { solid: BoxSpec[]; glow: BoxSpec[] } {
  const style = STYLE[plot.kind] ?? STYLE.selfcon;
  const turn = turnOf(plot.facing);
  const solid: BoxSpec[] = [];
  const glow: BoxSpec[] = [];
  const add = (list: BoxSpec[], lx: number, lz: number, hx: number, hz: number, y0: number, y1: number, colour: string) => {
    const [x, z] = local(plot, lx, lz);
    list.push([x, z, hx, hz, y0, y1, colour, turn]);
  };
  if (plot.kind !== "luxury") {
    // Palm Court draws its own front (PalmCourt.tsx).
    add(solid, 0, -1.26, 0.72, 0.05, 0, 2.35, "#ebe4d2");          // the frame
    add(solid, 0, -1.2, 0.56, 0.04, 0, 2.2, style.door);           // the door
    add(solid, 0.4, -1.14, 0.03, 0.03, 1.0, 1.12, "#c9a24e");      // its handle
    add(solid, 0, -0.95, 1.0, 0.3, 0, 0.14, "#b9b4a8");            // the step
    for (const side of [-1, 1]) {
      add(solid, side * 1.9, 0.05, 0.22, 0.22, 0, 1.6, style.post);
      add(solid, side * 1.9, 0.05, 0.27, 0.27, 1.6, 1.7, style.trim);
      add(glow, side * 1.9, 0.05, 0.12, 0.12, 1.7, 1.92, WARM);
    }
    add(glow, 0, -1.18, 0.16, 0.05, 2.45, 2.6, WARM);              // the light over the door
  }
  return { solid, glow };
}

/** The doors players can walk up to: their own goes in, anyone else's says who lives there. */
export function plotDoors(plots: HousePlot[]): Door[] {
  return plots.map((plot) => ({
    id: `home:${plot.estate}:${plot.number}`,
    text: plot.mine ? "your house" : plot.label,
    x: plot.x,
    z: plot.z,
    facing: plot.facing,
  }));
}

