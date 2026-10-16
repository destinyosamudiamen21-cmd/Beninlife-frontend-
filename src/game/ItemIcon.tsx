import { memo } from "react";
import type { FurnitureOption } from "../api/home";
import { PAINT, partsOf, type Part } from "./homeGeometry";
import type { RGB } from "./tint";

const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);

function toHex({ r, g, b }: RGB, light: number): string {
  // The paints are kept in linear light for the 3D; a picture wants them back as the eye sees them.
  const channel = (value: number) => Math.round(Math.min(1, Math.pow(Math.max(0, value * light), 1 / 2.2)) * 255).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Turn a piece so it shows its front: the picture looks at it from the front-left, from above. */
function project(x: number, y: number, z: number): [number, number] {
  return [(x - z) * COS, (x + z) * SIN - y];
}

/**
 * A little picture of a piece of furniture, drawn from the same boxes as the piece in the
 * house: every box shown as its top and its two sides that face the viewer.
 */
export const ItemIcon = memo(function ItemIcon({ option, cell, size = 56 }: { option: FurnitureOption; cell: number; size?: number }) {
  const parts: Part[] = partsOf(option, cell);
  const polys: { points: [number, number][]; fill: string; depth: number }[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  // Larger x + z is drawn lower down the picture, so nearer: the sides that show are the
  // right (+x) and the front (+z), which is the front of the piece itself.
  for (const [px, pz, hx, hz, y0, y1, paint] of parts) {
    const colour = PAINT[paint] ?? PAINT.wood;
    const x0 = px - hx, x1 = px + hx, z0 = pz - hz, z1 = pz + hz;
    const top: [number, number][] = [project(x0, y1, z0), project(x1, y1, z0), project(x1, y1, z1), project(x0, y1, z1)];
    const right: [number, number][] = [project(x1, y0, z0), project(x1, y1, z0), project(x1, y1, z1), project(x1, y0, z1)];
    const front: [number, number][] = [project(x0, y0, z1), project(x1, y0, z1), project(x1, y1, z1), project(x0, y1, z1)];
    const depth = px + pz + y0 * 0.05;
    polys.push({ points: right, fill: toHex(colour, 0.74), depth });
    polys.push({ points: front, fill: toHex(colour, 0.9), depth });
    polys.push({ points: top, fill: toHex(colour, 1.08), depth });
    for (const [x, y] of [...top, ...right, ...front]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  // The furthest boxes first, so nearer ones are painted over them.
  const order = polys.map((poly, index) => ({ poly, index })).sort((a, b) => a.poly.depth - b.poly.depth || a.index - b.index);
  const span = Math.max(maxX - minX, maxY - minY, 0.2);
  const pad = span * 0.08;
  return (
    <svg className="item-icon" width={size} height={size} viewBox={`${minX - pad} ${minY - pad} ${span + pad * 2} ${span + pad * 2}`} aria-hidden="true">
      {order.map(({ poly }, index) => (
        <polygon key={index} points={poly.points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" ")} fill={poly.fill} stroke={poly.fill} strokeWidth={span * 0.004} />
      ))}
    </svg>
  );
});
