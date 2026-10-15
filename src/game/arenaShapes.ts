// Turns the fight club into triangles: the gym indoors, the people watching, and the
// front door on the street. Like the houses, everything is built from boxes in code, so
// it needs no model files and loads at once.

import { ARENA } from "./arenaLayout";
import type { Door } from "./districtData";
import { MeshBuilder, type MeshData } from "./districtGeometry";
import { PERSON } from "./streetProps";
import { hexToLinear, type RGB } from "./tint";

type Vec3 = [number, number, number];

function shade(color: RGB, amount: number): RGB {
  return { r: color.r * amount, g: color.g * amount, b: color.b * amount };
}

// ---- colours: change these to restyle the club -----------------------------

const BRICK = hexToLinear("#8a4a36");
const MORTAR = hexToLinear("#6f3a2b");
const DADO = hexToLinear("#3a2a26"); // the dark band painted round the bottom of the walls
const CEMENT = hexToLinear("#8f8c85");
const CEMENT_DARK = hexToLinear("#85827b");
const MAT = hexToLinear("#5a1f1f");
const MAT_DARK = hexToLinear("#4a1919");
const BRONZE = hexToLinear("#b0803a");
const BRONZE_DARK = hexToLinear("#6e4c22");
const BRONZE_LIGHT = hexToLinear("#d3a85a");
const CORAL = hexToLinear("#c8372d"); // the red of Benin coral beads
const CANVAS = hexToLinear("#c9cdd2");
const SKIRT = hexToLinear("#1f2a44");
const STEEL = hexToLinear("#3b3f45");
const CHAIN = hexToLinear("#8e9399");
const LEATHER = hexToLinear("#221d1b");
const OXBLOOD = hexToLinear("#5b1d1d");
const TAPE = hexToLinear("#a9a59b");
const WOOD = hexToLinear("#8a6a4c");
const WOOD_DARK = hexToLinear("#5d4a39");
const RUBBER = hexToLinear("#1b1b1d");
const WHITE = hexToLinear("#ecebe6");
const BLUE = hexToLinear("#2f5f9e");
const LAMP = hexToLinear("#fff3c4");
const GLASS = hexToLinear("#9cc4dc");
const OUTSIDE = hexToLinear("#b0714b");
const GOLD = hexToLinear("#d9b13b");

const SKINS = [
  "#a9714b",
  "#8d5a3b",
  "#774a2f",
  "#613a25",
  "#4b2c1c",
  "#35201a",
].map(hexToLinear);
const TOPS = [
  "#2f6fd6",
  "#2f9e54",
  "#d64545",
  "#e88a2b",
  "#6a4fe0",
  "#d63f8c",
  "#2a9d8f",
  "#ede6d6",
  "#c79a2b",
  "#3a3d42",
].map(hexToLinear);
const TROUSERS = ["#3a3d42", "#2b3a55", "#5d4a39", "#1f2a26", "#6b736f"].map(
  hexToLinear
);

// ---- building blocks -------------------------------------------------------

/** A repeatable random number from 0 to 1 for a whole number. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** An upright post with `sides` flat sides: round enough for a bag, a pole or a cup. */
function prism(
  builder: MeshBuilder,
  x: number,
  z: number,
  radius: number,
  y0: number,
  y1: number,
  color: RGB,
  sides = 8
): void {
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2,
      b = ((i + 1) / sides) * Math.PI * 2;
    const ax = x + Math.cos(a) * radius,
      az = z + Math.sin(a) * radius;
    const bx = x + Math.cos(b) * radius,
      bz = z + Math.sin(b) * radius;
    const out: Vec3 = [Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)];
    builder.face(
      [
        [ax, y0, az],
        [bx, y0, bz],
        [bx, y1, bz],
        [ax, y1, az],
      ],
      shade(color, 0.86 + 0.14 * Math.abs(out[0])),
      out
    );
    builder.face(
      [
        [x, y1, z],
        [ax, y1, az],
        [bx, y1, bz],
      ],
      color,
      [0, 1, 0]
    );
    builder.face(
      [
        [x, y0, z],
        [ax, y0, az],
        [bx, y0, bz],
      ],
      shade(color, 0.6),
      [0, -1, 0]
    );
  }
}

/** A flat rectangle lying on the floor. */
function rug(
  builder: MeshBuilder,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  color: RGB
): void {
  builder.face(
    [
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1],
    ],
    color,
    [0, 1, 0]
  );
}

/**
 * A cast-bronze plaque on the back wall, in the manner of the plaques of the Oba's
 * palace: a raised border, a field of small studs, and a figure built from plain shapes.
 */
function plaque(
  builder: MeshBuilder,
  x: number,
  y: number,
  kind: number
): void {
  const z = 0.03,
    halfW = 0.55,
    halfH = 0.75;
  builder.box(
    x,
    z,
    halfW + 0.07,
    0.03,
    y - halfH - 0.07,
    y + halfH + 0.07,
    BRONZE_DARK
  );
  builder.box(x, z + 0.03, halfW, 0.02, y - halfH, y + halfH, BRONZE);
  // Studs in the corners of the field.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      builder.box(
        x + sx * (halfW - 0.12),
        z + 0.055,
        0.05,
        0.012,
        y + sy * (halfH - 0.12) - 0.05,
        y + sy * (halfH - 0.12) + 0.05,
        BRONZE_LIGHT
      );
    }
  }
  const raised = z + 0.06;
  if (kind % 3 === 0) {
    // A standing figure: crowned head, broad chest, a sword held upright.
    builder.box(x, raised, 0.13, 0.02, y + 0.28, y + 0.52, BRONZE_LIGHT);
    builder.box(x, raised, 0.17, 0.02, y + 0.5, y + 0.6, BRONZE_DARK);
    builder.box(x, raised, 0.24, 0.02, y - 0.2, y + 0.26, BRONZE_LIGHT);
    builder.box(x, raised, 0.28, 0.02, y - 0.55, y - 0.2, BRONZE_LIGHT);
    builder.box(x + 0.38, raised, 0.03, 0.02, y - 0.35, y + 0.5, BRONZE_DARK);
    builder.box(x + 0.38, raised, 0.09, 0.02, y + 0.36, y + 0.5, BRONZE_DARK);
  } else if (kind % 3 === 1) {
    // A leopard, the Oba's animal: long body, head, four legs, tail.
    builder.box(x, raised, 0.34, 0.02, y - 0.05, y + 0.2, BRONZE_LIGHT);
    builder.box(x - 0.36, raised, 0.12, 0.02, y + 0.08, y + 0.34, BRONZE_LIGHT);
    for (const leg of [-0.26, -0.08, 0.1, 0.28])
      builder.box(
        x + leg,
        raised,
        0.04,
        0.02,
        y - 0.38,
        y - 0.05,
        BRONZE_LIGHT
      );
    builder.box(x + 0.4, raised, 0.03, 0.02, y + 0.1, y + 0.45, BRONZE_LIGHT);
    for (const spot of [-0.2, 0, 0.2])
      builder.box(
        x + spot,
        raised + 0.012,
        0.035,
        0.01,
        y + 0.04,
        y + 0.11,
        BRONZE_DARK
      );
  } else {
    // A woven knot of four bars, the kind that borders the old plaques.
    builder.box(x, raised, 0.36, 0.02, y + 0.2, y + 0.28, BRONZE_LIGHT);
    builder.box(x, raised, 0.36, 0.02, y - 0.28, y - 0.2, BRONZE_LIGHT);
    builder.box(x - 0.24, raised, 0.04, 0.02, y - 0.45, y + 0.45, BRONZE_LIGHT);
    builder.box(x + 0.24, raised, 0.04, 0.02, y - 0.45, y + 0.45, BRONZE_LIGHT);
    builder.box(x, raised + 0.012, 0.09, 0.01, y - 0.09, y + 0.09, CORAL);
  }
}

// ---- the gym -----------------------------------------------------------------

function buildRing(builder: MeshBuilder): void {
  const { x, z, canvas, apron, floor, post } = ARENA.ring;

  // The platform and its skirt, with a band of red round the top edge.
  builder.box(x, z, apron, apron, 0, floor - 0.08, SKIRT);
  builder.box(x, z, apron + 0.01, apron + 0.01, floor - 0.08, floor, CORAL);
  rug(
    builder,
    x - apron,
    x + apron,
    z - apron,
    z + apron,
    floor + 0.004,
    shade(CANVAS, 0.8)
  );
  rug(
    builder,
    x - canvas,
    x + canvas,
    z - canvas,
    z + canvas,
    floor + 0.008,
    CANVAS
  );
  // The club's mark in the middle of the canvas: a bronze square set cornerwise.
  builder.face(
    [
      [x - 0.9, floor + 0.012, z],
      [x, floor + 0.012, z - 0.9],
      [x + 0.9, floor + 0.012, z],
      [x, floor + 0.012, z + 0.9],
    ],
    shade(BRONZE, 0.9),
    [0, 1, 0]
  );
  builder.face(
    [
      [x - 0.5, floor + 0.016, z],
      [x, floor + 0.016, z - 0.5],
      [x + 0.5, floor + 0.016, z],
      [x, floor + 0.016, z + 0.5],
    ],
    CANVAS,
    [0, 1, 0]
  );

  // Corner posts and their pads: red for the player's corner, blue for the other.
  const corners: [number, number, RGB][] = [
    [-1, 1, CORAL],
    [1, -1, BLUE],
    [-1, -1, WHITE],
    [1, 1, WHITE],
  ];
  for (const [sx, sz, pad] of corners) {
    const px = x + sx * canvas,
      pz = z + sz * canvas;
    prism(builder, px, pz, 0.07, floor, floor + post, STEEL);
    builder.box(
      px - sx * 0.1,
      pz - sz * 0.1,
      0.11,
      0.11,
      floor + 0.35,
      floor + post - 0.05,
      pad,
      Math.PI / 4
    );
  }
  // Four ropes on each side.
  const heights = [0.42, 0.72, 1.02, 1.32];
  const colours = [CORAL, WHITE, BLUE, WHITE];
  heights.forEach((height, index) => {
    const y = floor + height;
    for (const side of [-1, 1]) {
      builder.box(
        x,
        z + side * canvas,
        canvas,
        0.022,
        y - 0.022,
        y + 0.022,
        colours[index]
      );
      builder.box(
        x + side * canvas,
        z,
        0.022,
        canvas,
        y - 0.022,
        y + 0.022,
        colours[index]
      );
    }
  });

  // Steps up at the front, and a stool and a bucket in each fighter's corner.
  for (let step = 0; step < 3; step++) {
    builder.box(
      x - canvas + 0.7,
      z + apron + 0.2 + step * 0.3,
      0.6,
      0.15,
      0,
      floor - (step + 1) * 0.225,
      WOOD_DARK
    );
  }
  for (const side of [-1, 1]) {
    const sx = x + side * (apron + 0.55);
    prism(
      builder,
      sx,
      z + apron - 0.4,
      0.2,
      0,
      0.5,
      side < 0 ? CORAL : BLUE,
      10
    );
    prism(builder, sx, z + apron + 0.25, 0.16, 0, 0.32, TAPE, 10);
  }
}

function buildBags(builder: MeshBuilder): void {
  const first = ARENA.bags[0],
    last = ARENA.bags[ARENA.bags.length - 1];
  const beam = 4.1;
  // The beam they hang from, bolted back to the wall.
  builder.box(
    first.x,
    (first.z + last.z) / 2,
    0.07,
    (last.z - first.z) / 2 + 0.9,
    beam,
    beam + 0.16,
    STEEL
  );
  for (const z of [first.z - 0.8, last.z + 0.8])
    builder.box(
      first.x / 2,
      z,
      first.x / 2,
      0.05,
      beam + 0.02,
      beam + 0.14,
      STEEL
    );

  ARENA.bags.forEach((bag, index) => {
    const top = 2.35,
      bottom = 0.8;
    builder.box(bag.x, bag.z, 0.014, 0.014, top, beam, CHAIN);
    const skin = index === 1 ? OXBLOOD : LEATHER;
    prism(builder, bag.x, bag.z, ARENA.bagRadius, bottom, top, skin, 10);
    prism(
      builder,
      bag.x,
      bag.z,
      ARENA.bagRadius + 0.006,
      top - 0.5,
      top - 0.38,
      TAPE,
      10
    ); // a ring of tape
    if (index === 2)
      prism(
        builder,
        bag.x,
        bag.z,
        ARENA.bagRadius + 0.006,
        bottom + 0.3,
        bottom + 0.5,
        TAPE,
        10
      ); // an old one, patched
    rug(
      builder,
      bag.x - 1.0,
      bag.x + 1.6,
      bag.z - 1.1,
      bag.z + 1.1,
      0.012,
      index % 2 ? MAT_DARK : MAT
    );
  });
}

function buildCorner(builder: MeshBuilder): void {
  const { table, tyre, rack, bench } = ARENA;

  // The coach's table: a radio, water, a first-aid box.
  builder.box(table.x, table.z, table.halfX, table.halfZ, 0.7, 0.76, WOOD);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      builder.box(
        table.x + sx * (table.halfX - 0.06),
        table.z + sz * (table.halfZ - 0.06),
        0.035,
        0.035,
        0,
        0.7,
        WOOD_DARK
      );
  builder.box(table.x, table.z - 0.35, 0.14, 0.26, 0.76, 0.98, STEEL);
  for (let i = 0; i < 3; i++)
    prism(
      builder,
      table.x - 0.12 + i * 0.13,
      table.z + 0.25,
      0.04,
      0.76,
      0.99,
      GLASS,
      6
    );
  builder.box(table.x + 0.1, table.z + 0.55, 0.16, 0.12, 0.76, 0.92, WHITE);
  builder.box(table.x + 0.1, table.z + 0.55, 0.05, 0.02, 0.92, 0.925, CORAL);

  // A tractor tyre and the sledgehammer that goes with it.
  prism(builder, tyre.x, tyre.z, tyre.radius, 0, 0.42, RUBBER, 14);
  prism(
    builder,
    tyre.x,
    tyre.z,
    tyre.radius * 0.5,
    0.42,
    0.425,
    shade(CEMENT, 0.5),
    14
  );
  builder.box(tyre.x + 0.95, tyre.z + 0.1, 0.03, 0.5, 0, 0.06, WOOD, 0.4);
  builder.box(tyre.x + 0.78, tyre.z - 0.32, 0.09, 0.14, 0, 0.16, STEEL, 0.4);

  // Weights against the right wall: a rack of dumb-bells and plates leaning beside it.
  builder.box(rack.x, rack.z, rack.halfX, rack.halfZ, 0, 0.06, STEEL);
  for (const shelf of [0.42, 0.86]) {
    builder.box(
      rack.x,
      rack.z,
      rack.halfX,
      rack.halfZ,
      shelf,
      shelf + 0.05,
      STEEL
    );
    for (let i = 0; i < 5; i++) {
      const z = rack.z - rack.halfZ + 0.3 + i * 0.5;
      builder.box(rack.x, z, 0.24, 0.035, shelf + 0.09, shelf + 0.15, CHAIN);
      for (const end of [-1, 1])
        builder.box(
          rack.x + end * 0.2,
          z,
          0.06,
          0.09 + i * 0.008,
          shelf + 0.05,
          shelf + 0.23,
          RUBBER
        );
    }
  }
  for (const sz of [-1, 1])
    builder.box(
      rack.x,
      rack.z + sz * rack.halfZ,
      rack.halfX,
      0.03,
      0,
      0.92,
      STEEL
    );
  for (let i = 0; i < 3; i++)
    prism(
      builder,
      rack.x - 0.1,
      rack.z + rack.halfZ + 0.5 + i * 0.12,
      0.3 - i * 0.04,
      0,
      0.6 - i * 0.08,
      RUBBER,
      12
    );

  // A bench by the left wall, with gloves left on it.
  builder.box(bench.x, bench.z, bench.halfX, bench.halfZ, 0.4, 0.46, WOOD);
  for (const sz of [-1, 1])
    builder.box(
      bench.x,
      bench.z + sz * (bench.halfZ - 0.15),
      bench.halfX - 0.04,
      0.04,
      0,
      0.4,
      WOOD_DARK
    );
  for (const [dz, color] of [
    [-0.5, CORAL],
    [-0.25, CORAL],
    [0.4, BLUE],
  ] as [number, RGB][]) {
    builder.box(bench.x, bench.z + dz, 0.1, 0.09, 0.46, 0.6, color);
  }
}

/** Floor, walls and everything fixed in the gym. */
export function buildArenaRoom(): MeshData {
  const builder = new MeshBuilder();
  const { width, depth, wallHeight: high, stands } = ARENA;
  const wall = 0.2;

  // The floor: bare cement in big squares, with dark mats round the ring.
  for (let cx = 0; cx < width; cx += 2) {
    for (let cz = 0; cz < depth; cz += 2) {
      rug(
        builder,
        cx,
        cx + 2,
        cz,
        cz + 2,
        0,
        ((cx + cz) / 2) % 2 === 0 ? CEMENT : CEMENT_DARK
      );
    }
  }
  const ring = ARENA.ring;
  rug(
    builder,
    ring.x - ring.apron - 1.2,
    ring.x + ring.apron + 1.2,
    ring.z - ring.apron - 1.2,
    ring.z + ring.apron + 1.2,
    0.01,
    shade(RUBBER, 1.5)
  );

  // The ground outside, laid as a frame round the building.
  const far = 60;
  const ground = (x0: number, x1: number, z0: number, z1: number) =>
    builder.face(
      [
        [x0, -0.02, z0],
        [x1, -0.02, z0],
        [x1, -0.02, z1],
        [x0, -0.02, z1],
      ],
      OUTSIDE,
      [0, 1, 0]
    );
  ground(-far, -wall, -far, depth + far);
  ground(width + wall, width + far, -far, depth + far);
  ground(-wall, width + wall, -far, -wall);
  ground(-wall, width + wall, depth + wall, depth + far);

  // Brick walls. The camera looks in from the front, so the front wall is only a low kerb.
  builder.box(width / 2, -wall / 2, width / 2 + wall, wall / 2, 0, high, BRICK);
  builder.box(
    -wall / 2,
    depth / 2,
    wall / 2,
    depth / 2,
    0,
    high,
    shade(BRICK, 0.9)
  );
  builder.box(
    width + wall / 2,
    depth / 2,
    wall / 2,
    depth / 2,
    0,
    high,
    shade(BRICK, 0.9)
  );
  builder.box(
    width / 2,
    depth + wall / 2,
    width / 2 + wall,
    wall / 2,
    0,
    0.3,
    shade(BRICK, 0.8)
  );
  // Courses of mortar, and a dark band painted round the bottom.
  for (let y = 1.5; y < high; y += 0.42) {
    builder.box(width / 2, 0.004, width / 2, 0.004, y, y + 0.025, MORTAR);
    builder.box(
      0.004,
      depth / 2,
      0.004,
      depth / 2,
      y,
      y + 0.025,
      shade(MORTAR, 0.9)
    );
    builder.box(
      width - 0.004,
      depth / 2,
      0.004,
      depth / 2,
      y,
      y + 0.025,
      shade(MORTAR, 0.9)
    );
  }
  builder.box(width / 2, 0.008, width / 2, 0.008, 0, 1.25, DADO);
  builder.box(0.008, depth / 2, 0.008, depth / 2, 0, 1.25, shade(DADO, 0.9));
  builder.box(
    width - 0.008,
    depth / 2,
    0.008,
    depth / 2,
    0,
    1.25,
    shade(DADO, 0.9)
  );
  builder.box(width / 2, 0.012, width / 2, 0.012, 1.25, 1.33, CORAL);

  // Bronze plaques along the back wall, and one long banner between them.
  [2.2, 4.4, 17.6, 19.8].forEach((x, index) => plaque(builder, x, 3.1, index));
  builder.box(width / 2, 0.03, 4.6, 0.03, 3.55, 4.75, CORAL);
  builder.box(width / 2, 0.05, 4.45, 0.02, 3.68, 4.62, shade(LEATHER, 1.2));
  builder.box(width / 2, 0.065, 4.45, 0.012, 3.68, 3.76, GOLD);
  builder.box(width / 2, 0.065, 4.45, 0.012, 4.54, 4.62, GOLD);
  [-3, -1.5, 0, 1.5, 3].forEach((dx, index) => {
    // A row of bronze diamonds down the banner, where a painted name would go.
    const cx = width / 2 + dx,
      cy = 4.15,
      r = index === 2 ? 0.34 : 0.24;
    builder.face(
      [
        [cx - r, cy, 0.075],
        [cx, cy - r, 0.075],
        [cx + r, cy, 0.075],
        [cx, cy + r, 0.075],
      ],
      index === 2 ? BRONZE_LIGHT : BRONZE,
      [0, 0, 1]
    );
  });

  // High windows on the side walls, their louvres open.
  for (const z of [3.2, 7.0, 10.8]) {
    for (const [x, inward] of [
      [0.02, 1],
      [width - 0.02, -1],
    ] as [number, number][]) {
      builder.box(x, z, 0.02, 0.85, 3.3, 4.5, WOOD_DARK);
      builder.box(x + inward * 0.015, z, 0.02, 0.77, 3.38, 4.42, GLASS);
      for (let y = 3.5; y < 4.4; y += 0.2)
        builder.box(x + inward * 0.03, z, 0.012, 0.77, y, y + 0.03, WHITE);
    }
  }
  // Trophies on a shelf on the right wall, above the coach.
  builder.box(width - 0.2, 9.3, 0.18, 1.2, 2.2, 2.26, WOOD);
  for (let i = 0; i < 4; i++) {
    const z = 8.4 + i * 0.6,
      tall = 0.22 + hash(i) * 0.2;
    prism(builder, width - 0.2, z, 0.06, 2.26, 2.3, WOOD_DARK, 6);
    prism(builder, width - 0.2, z, 0.025, 2.3, 2.3 + tall * 0.5, GOLD, 6);
    prism(builder, width - 0.2, z, 0.08, 2.3 + tall * 0.5, 2.3 + tall, GOLD, 8);
  }

  // Lamps hanging over the ring.
  for (const [dx, dz] of [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6],
  ]) {
    const lx = ring.x + dx,
      lz = ring.z + dz;
    builder.box(lx, lz, 0.012, 0.012, 4.55, high + 1.5, STEEL);
    prism(builder, lx, lz, 0.34, 4.42, 4.55, STEEL, 10);
    prism(builder, lx, lz, 0.26, 4.39, 4.42, LAMP, 10);
  }

  // The stands: two long steps of benches along the back wall.
  const middle = (stands.minX + stands.maxX) / 2,
    half = (stands.maxX - stands.minX) / 2;
  builder.box(
    middle,
    stands.front / 2,
    half,
    stands.front / 2,
    0,
    0.42,
    WOOD_DARK
  );
  builder.box(
    middle,
    stands.front / 4,
    half,
    stands.front / 4,
    0.42,
    0.88,
    WOOD_DARK
  );
  builder.box(
    middle,
    stands.front * 0.75,
    half,
    stands.front / 4 - 0.02,
    0.42,
    0.46,
    WOOD
  );
  builder.box(
    middle,
    stands.front / 4,
    half,
    stands.front / 4 - 0.02,
    0.88,
    0.92,
    WOOD
  );

  buildRing(builder);
  buildBags(builder);
  buildCorner(builder);
  return builder.build();
}

// ---- the people watching -------------------------------------------------------

/** One person sitting on a bench: seat height, and which way their knees point is +z. */
function sitter(
  builder: MeshBuilder,
  x: number,
  z: number,
  seat: number,
  seed: number
): void {
  const skin = SKINS[Math.floor(hash(seed) * SKINS.length)];
  const top = TOPS[Math.floor(hash(seed + 7) * TOPS.length)];
  const legs = TROUSERS[Math.floor(hash(seed + 13) * TROUSERS.length)];
  const torso = PERSON.shoulder - PERSON.hip; // hips to shoulders
  builder.box(x, z, 0.19, 0.12, seat, seat + torso, top);
  builder.box(
    x,
    z + 0.005,
    0.105,
    0.115,
    seat + torso + 0.07,
    seat + torso + 0.29,
    skin
  );
  builder.box(
    x,
    z - 0.01,
    0.11,
    0.12,
    seat + torso + 0.25,
    seat + torso + 0.33,
    LEATHER
  );
  for (const side of [-1, 1]) {
    builder.box(
      x + side * PERSON.legGap,
      z + 0.25,
      0.078,
      0.22,
      seat - 0.02,
      seat + 0.13,
      legs
    ); // thigh
    builder.box(
      x + side * PERSON.legGap,
      z + 0.43,
      0.075,
      0.08,
      seat - 0.44,
      seat,
      legs
    ); // shin
    // Half of them have an arm in the air.
    const up = hash(seed + 31 + side) > 0.5;
    builder.box(
      x + side * PERSON.armGap,
      z + (up ? 0 : 0.06),
      0.05,
      0.055,
      up ? seat + torso - 0.05 : seat + 0.05,
      up ? seat + torso + 0.5 : seat + torso,
      up ? skin : top
    );
  }
}

/**
 * The people on the stands. They come in two halves so that, in a fight, one half can
 * jump up while the other comes down.
 */
export function buildArenaCrowd(half: 0 | 1): MeshData {
  const builder = new MeshBuilder();
  const { stands } = ARENA;
  let seat = 0;
  for (const [z, height] of [
    [stands.front * 0.75 - 0.2, 0.46],
    [stands.front / 4 - 0.1, 0.92],
  ]) {
    for (let x = stands.minX + 0.5; x < stands.maxX - 0.3; x += 0.62) {
      seat++;
      if (hash(seat * 3) < 0.22) continue; // an empty place
      if (seat % 2 === half)
        sitter(builder, x + (hash(seat) - 0.5) * 0.12, z, height, seat);
    }
  }
  return builder.build();
}

// ---- the front door, out on the street -------------------------------------------

/**
 * What marks a door on the street: a step, a dark doorway in a bronze frame, a striped
 * awning on two posts, and a painted board on each side.
 */
export function buildDoorFront(door: Door): MeshData {
  const builder = new MeshBuilder();
  // "Out" is the way the door faces; "along" runs across the front of the building.
  const outX = Math.cos(door.facing),
    outZ = Math.sin(door.facing);
  const alongX = -outZ,
    alongZ = outX;
  const angle = Math.atan2(alongZ, alongX);
  const WALL_BACK = 1.3; // the door's spot is this far out from the wall
  const at = (along: number, out: number): [number, number] => [
    door.x + alongX * along + outX * (out - WALL_BACK),
    door.z + alongZ * along + outZ * (out - WALL_BACK),
  ];
  const box = (
    along: number,
    out: number,
    halfAlong: number,
    halfOut: number,
    y0: number,
    y1: number,
    color: RGB
  ) => {
    const [x, z] = at(along, out);
    builder.box(x, z, halfAlong, halfOut, y0, y1, color, angle);
  };
  const corner = (along: number, out: number, y: number): Vec3 => {
    const [x, z] = at(along, out);
    return [x, y, z];
  };

  box(0, 1.0, 2.6, 1.0, 0, 0.14, CEMENT); // the step
  box(0, 0.06, 1.3, 0.06, 0.14, 2.95, BRONZE_DARK); // the frame
  box(0, 0.1, 1.1, 0.06, 0.14, 2.75, shade(LEATHER, 0.7)); // the open doorway
  box(0, 0.13, 1.1, 0.04, 2.45, 2.75, BRONZE); // a bronze lintel
  for (const side of [-1, 1]) {
    box(side * 2.5, 0.07, 0.75, 0.07, 0.5, 3.1, CORAL); // a painted board each side
    box(side * 2.5, 0.1, 0.6, 0.05, 0.65, 2.95, shade(LEATHER, 1.2));
    box(side * 2.5, 0.13, 0.32, 0.03, 1.5, 2.2, BRONZE_LIGHT);
    box(side * 2.5, 0.13, 0.5, 0.03, 0.85, 0.95, GOLD);
    box(side * 2.4, 2.0, 0.05, 0.05, 0.14, 3.0, STEEL); // awning post
  }
  // The awning: red and black stripes, sloping down from the wall.
  const stripes = 6,
    halfWide = 2.6;
  for (let i = 0; i < stripes; i++) {
    const a = -halfWide + (i * 2 * halfWide) / stripes,
      b = a + (2 * halfWide) / stripes;
    builder.sheet(
      [
        corner(a, 0.05, 3.45),
        corner(b, 0.05, 3.45),
        corner(b, 2.1, 2.95),
        corner(a, 2.1, 2.95),
      ],
      i % 2 ? shade(LEATHER, 1.3) : CORAL,
      [outX, 1, outZ]
    );
  }
  // A bench against the wall for people waiting their turn.
  box(4.6, 0.3, 0.9, 0.2, 0.4, 0.46, WOOD);
  for (const end of [-1, 1])
    box(4.6 + end * 0.75, 0.3, 0.04, 0.18, 0, 0.4, WOOD_DARK);
  return builder.build();
}
