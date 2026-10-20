// Many coloured boxes merged into one mesh: one draw call for a whole building's details.
// Plain data, no 3D imports, so it can be tested on its own (and built on a phone quickly).

import type { MeshData } from "./districtGeometry";
import { hexToLinear } from "./tint";

/** Centre x, centre z, half width, half depth, bottom, top, colour (#rrggbb), and a turn about the
 * box's own middle (radians, as a car's heading: 0 is along +z). */
export type BoxSpec = [number, number, number, number, number, number, string, number?];

const FACES: [number[], number[][]][] = [
  [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
  [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
  [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
  [[0, 0, 1], [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]]],
  [[0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]],
];

const cache = new Map<string, [number, number, number]>();
function linear(hex: string): [number, number, number] {
  let found = cache.get(hex);
  if (!found) {
    const { r, g, b } = hexToLinear(hex);
    found = [r, g, b];
    cache.set(hex, found);
  }
  return found;
}

/** The boxes as one mesh. Faces that point down are left out when `noBottoms` (nobody sees under a wall). */
export function buildBoxes(boxes: BoxSpec[], noBottoms = true): MeshData {
  const faces = noBottoms ? FACES.filter(([normal]) => normal[1] !== -1) : FACES;
  const count = boxes.length * faces.length * 4;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices = new Uint32Array(boxes.length * faces.length * 6);
  let v = 0;
  let i = 0;
  for (const [cx, cz, hx, hz, y0, y1, colour, turn = 0] of boxes) {
    const [r, g, b] = linear(colour);
    const cy = (y0 + y1) / 2;
    const hy = (y1 - y0) / 2;
    const c = Math.cos(turn), s = Math.sin(turn);
    for (const [normal, corners] of faces) {
      // Turned about y: x' = x cos + z sin, z' = -x sin + z cos (so +z goes to (sin, cos)).
      const nx = normal[0] * c + normal[2] * s;
      const nz = -normal[0] * s + normal[2] * c;
      for (const [ux, uy, uz] of corners) {
        const lx = ux * hx, lz = uz * hz;
        positions[v * 3] = cx + lx * c + lz * s;
        positions[v * 3 + 1] = cy + uy * hy;
        positions[v * 3 + 2] = cz - lx * s + lz * c;
        normals[v * 3] = nx;
        normals[v * 3 + 1] = normal[1];
        normals[v * 3 + 2] = nz;
        colors[v * 3] = r;
        colors[v * 3 + 1] = g;
        colors[v * 3 + 2] = b;
        v++;
      }
      const base = v - 4;
      indices.set([base, base + 1, base + 2, base, base + 2, base + 3], i);
      i += 6;
    }
  }
  return { positions, normals, colors, uvs, indices };
}
