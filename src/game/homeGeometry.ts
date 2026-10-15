// Turns a house plan and its furniture into triangles. Like the street, everything is
// built from boxes in code, so a house needs no model files and loads at once.

import type { FurnitureOption, HomePlan, PlacedItem } from "../api/home";
import { MeshBuilder, type MeshData } from "./districtGeometry";
import { WALL_HEIGHT, footprint, roomSize, stairsRect } from "./homeLayout";
import { hexToLinear, type RGB } from "./tint";

const WALL = 0.15; // wall thickness
const STEPS = 10;

type Vec3 = [number, number, number];

function shade(color: RGB, amount: number): RGB {
  return { r: color.r * amount, g: color.g * amount, b: color.b * amount };
}

// ---- how each kind of house is finished --------------------------------

type Finish = { wall: RGB; floorA: RGB; floorB: RGB; trim: RGB; door: RGB };

const FINISHES: Record<string, Finish> = {
  // Bare cement floor, cream emulsion.
  selfcon: {
    wall: hexToLinear("#e9dfc4"),
    floorA: hexToLinear("#9d9a92"),
    floorB: hexToLinear("#96938b"),
    trim: hexToLinear("#6a5a48"),
    door: hexToLinear("#5a3d28"),
  },
  // Brown and cream tiles, the classic family flat.
  flat: {
    wall: hexToLinear("#dfe6d6"),
    floorA: hexToLinear("#c9b392"),
    floorB: hexToLinear("#b89b76"),
    trim: hexToLinear("#5d4a39"),
    door: hexToLinear("#4f3524"),
  },
  // Big pale tiles, white walls.
  duplex: {
    wall: hexToLinear("#f1eee6"),
    floorA: hexToLinear("#ddd6c8"),
    floorB: hexToLinear("#cfc7b6"),
    trim: hexToLinear("#3c3a38"),
    door: hexToLinear("#3b2a20"),
  },
  // A hostel room: terrazzo floor, and walls that were last painted some years ago.
  hostel4: {
    wall: hexToLinear("#d9d3b4"),
    floorA: hexToLinear("#8f948e"),
    floorB: hexToLinear("#878c86"),
    trim: hexToLinear("#3d5a46"),
    door: hexToLinear("#4a5d49"),
  },
  hostel2: {
    wall: hexToLinear("#e3ddc4"),
    floorA: hexToLinear("#a39f92"),
    floorB: hexToLinear("#9a968a"),
    trim: hexToLinear("#3d5a46"),
    door: hexToLinear("#4a5d49"),
  },
};

const OUTSIDE = hexToLinear("#9fb58a");
const GLASS = hexToLinear("#9cc4dc");
const LOUVRE = hexToLinear("#d9e6ec");
const STEP = hexToLinear("#8a6a4c");
const DARK = hexToLinear("#1d1a18");

// ---- the room ----------------------------------------------------------

/** Floor, walls, door, windows and stairs for one floor of a house. */
export function buildRoom(plan: HomePlan, floor: number): MeshData {
  const builder = new MeshBuilder();
  const finish = FINISHES[plan.kind] ?? FINISHES.flat;
  const room = plan.floors[floor] ?? plan.floors[0];
  const { width, depth } = roomSize(plan, floor);
  const cell = plan.cell;
  const strip = stairsRect(plan);
  const stairs = plan.stairs;

  // Floor, one square per cell, coloured as tiles two cells wide.
  for (let cx = 0; cx < room.w; cx++) {
    for (let cz = 0; cz < room.d; cz++) {
      const inWell =
        floor > 0 &&
        stairs !== null &&
        cx >= stairs.x &&
        cx < stairs.x + stairs.w &&
        cz >= stairs.z &&
        cz < stairs.z + stairs.d;
      if (inWell) continue; // upstairs, the stairs come up through a hole in the floor
      const tile =
        ((cx >> 1) + (cz >> 1)) % 2 === 0 ? finish.floorA : finish.floorB;
      const x0 = cx * cell,
        z0 = cz * cell;
      builder.face(
        [
          [x0, 0, z0],
          [x0 + cell, 0, z0],
          [x0 + cell, 0, z0 + cell],
          [x0, 0, z0 + cell],
        ],
        tile,
        [0, 1, 0]
      );
    }
  }

  // The ground outside, laid as a frame round the house. Nothing lies under the house
  // itself, so upstairs the stairs can be seen going down through the floor.
  const far = 60,
    edge = WALL;
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
  ground(-far, -edge, -far, depth + far);
  ground(width + edge, width + far, -far, depth + far);
  ground(-edge, width + edge, -far, -edge);
  ground(-edge, width + edge, depth + edge, depth + far);

  // Walls. The camera looks in from the front, so the front wall is only a low kerb.
  builder.box(
    width / 2,
    -WALL / 2,
    width / 2 + WALL,
    WALL / 2,
    0,
    WALL_HEIGHT,
    finish.wall
  );
  builder.box(
    -WALL / 2,
    depth / 2,
    WALL / 2,
    depth / 2,
    0,
    WALL_HEIGHT,
    shade(finish.wall, 0.93)
  );
  builder.box(
    width + WALL / 2,
    depth / 2,
    WALL / 2,
    depth / 2,
    0,
    WALL_HEIGHT,
    shade(finish.wall, 0.93)
  );
  builder.box(
    width / 2,
    depth + WALL / 2,
    width / 2 + WALL,
    WALL / 2,
    0,
    0.3,
    shade(finish.wall, 0.85)
  );
  builder.box(width / 2, 0.02, width / 2, 0.02, 0, 0.1, finish.trim); // skirting board

  const windowOnBack = (centre: number) => {
    builder.box(centre, 0.02, 0.68, 0.02, 0.95, 2.05, finish.trim);
    builder.box(centre, 0.035, 0.6, 0.02, 1.03, 1.97, GLASS);
    for (let y = 1.15; y < 1.95; y += 0.16)
      builder.box(centre, 0.05, 0.6, 0.012, y, y + 0.03, LOUVRE);
  };
  const windowOnSide = (x: number, centre: number) => {
    builder.box(x, centre, 0.02, 0.68, 0.95, 2.05, finish.trim);
    builder.box(
      x < width / 2 ? x + 0.015 : x - 0.015,
      centre,
      0.02,
      0.6,
      1.03,
      1.97,
      GLASS
    );
  };

  const doorCentre = (plan.door.x + plan.door.w / 2) * cell;
  if (floor === 0) {
    const half = (plan.door.w * cell) / 2;
    builder.box(doorCentre, 0.02, half + 0.04, 0.02, 0, 2.14, finish.trim);
    builder.box(doorCentre, 0.04, half - 0.04, 0.025, 0, 2.06, finish.door);
    builder.box(
      doorCentre + half - 0.16,
      0.07,
      0.03,
      0.02,
      0.95,
      1.05,
      hexToLinear("#c9b26a")
    ); // handle
  }

  // Doors that come with the room, in the left wall: the way to the bathroom down the corridor.
  if (floor === 0) {
    for (const fixture of plan.fixtures ?? []) {
      if (fixture.kind !== "door") continue;
      const centre = (fixture.z + 0.5) * cell;
      builder.box(0.02, centre, 0.02, 0.49, 0, 2.14, finish.trim);
      builder.box(0.04, centre, 0.025, 0.41, 0, 2.06, finish.door);
      builder.box(
        0.07,
        centre + 0.27,
        0.02,
        0.03,
        0.95,
        1.05,
        hexToLinear("#c9b26a")
      ); // handle
      builder.box(0.03, centre, 0.02, 0.3, 2.2, 2.42, hexToLinear("#f1efe9")); // the sign over it
    }
  }

  // Windows go wherever the door and the stairs are not.
  const backSpots =
    floor === 0 ? [width * 0.2, width * 0.82] : [width * 0.28, width * 0.72];
  for (const spot of backSpots) {
    const clearOfDoor = floor > 0 || Math.abs(spot - doorCentre) > 1.6;
    const clearOfStairs = !strip || spot - 0.7 > strip.maxX;
    if (clearOfDoor && clearOfStairs && spot > 0.8 && spot < width - 0.8)
      windowOnBack(spot);
  }
  windowOnSide(width - 0.02, depth * 0.45);
  if (!strip) windowOnSide(0.02, depth * 0.45);

  if (strip && stairs) {
    const run = (strip.maxZ - strip.minZ) / STEPS;
    const rise = WALL_HEIGHT / STEPS;
    const middle = (strip.minX + strip.maxX) / 2;
    const half = (strip.maxX - strip.minX) / 2;

    if (floor === 0) {
      // Going up: the bottom step is at the front, each one behind it is a step higher.
      for (let i = 0; i < STEPS; i++) {
        const front = strip.maxZ - i * run;
        builder.box(
          middle,
          front - run / 2,
          half,
          run / 2,
          0,
          (i + 1) * rise,
          shade(STEP, i % 2 ? 0.92 : 1)
        );
      }
    } else {
      // Coming down: the same stairs seen from above, dropping away towards the front.
      for (let i = 0; i < STEPS; i++) {
        const back = strip.minZ + i * run;
        builder.box(
          middle,
          back + run / 2,
          half,
          run / 2,
          -WALL_HEIGHT,
          -i * rise,
          shade(STEP, i % 2 ? 0.92 : 1)
        );
      }
      // The sides of the hole, so it does not show the outside through the floor.
      const top: number = 0,
        bottom = -WALL_HEIGHT;
      const corner = (x: number, y: number, z: number): Vec3 => [x, y, z];
      builder.face(
        [
          corner(strip.maxX, bottom, strip.minZ),
          corner(strip.maxX, bottom, strip.maxZ),
          corner(strip.maxX, top, strip.maxZ),
          corner(strip.maxX, top, strip.minZ),
        ],
        DARK,
        [-1, 0, 0]
      );
      builder.face(
        [
          corner(strip.minX, bottom, strip.maxZ),
          corner(strip.maxX, bottom, strip.maxZ),
          corner(strip.maxX, top, strip.maxZ),
          corner(strip.minX, top, strip.maxZ),
        ],
        DARK,
        [0, 0, -1]
      );
      builder.face(
        [
          corner(strip.minX, bottom, strip.minZ),
          corner(strip.minX, bottom, strip.maxZ),
          corner(strip.minX, top, strip.maxZ),
          corner(strip.minX, top, strip.minZ),
        ],
        DARK,
        [1, 0, 0]
      );
      // A rail round the hole, open at the back where the top step is. Posts and a
      // handrail, not a solid panel, so the stairs can be seen going down.
      const railStart = strip.minZ + cell;
      const railX = strip.maxX + 0.03,
        railZ = strip.maxZ + 0.03;
      builder.box(
        railX,
        (railStart + railZ) / 2,
        0.03,
        (railZ - railStart) / 2 + 0.03,
        0.88,
        0.95,
        finish.trim
      );
      builder.box(middle, railZ, half + 0.06, 0.03, 0.88, 0.95, finish.trim);
      for (let z = railStart; z <= railZ + 1e-6; z += cell)
        builder.box(
          railX,
          Math.min(z, railZ),
          0.025,
          0.025,
          0,
          0.88,
          finish.trim
        );
      for (let x = strip.minX + 0.03; x < railX - 0.1; x += cell)
        builder.box(x, railZ, 0.025, 0.025, 0, 0.88, finish.trim);
    }
  }

  return builder.build();
}

// ---- furniture ---------------------------------------------------------

const PAINT: Record<string, RGB> = {
  wood: hexToLinear("#9a6b43"),
  darkwood: hexToLinear("#5b3d28"),
  white: hexToLinear("#f1efe9"),
  cream: hexToLinear("#e6dcc0"),
  blue: hexToLinear("#3f6fb0"),
  wine: hexToLinear("#8a2f3a"),
  gold: hexToLinear("#c79a2b"),
  sofa: hexToLinear("#6a5a4e"),
  sofaDark: hexToLinear("#54463c"),
  sofaLight: hexToLinear("#8a786a"),
  black: hexToLinear("#1d1d1f"),
  screen: hexToLinear("#27384a"),
  metal: hexToLinear("#b9b9b4"),
  steel: hexToLinear("#c9ccd0"),
  clay: hexToLinear("#a8573a"),
  leaf: hexToLinear("#3f7d3a"),
  leafLight: hexToLinear("#5a9a45"),
  rug: hexToLinear("#8a3a2f"),
  rugLight: hexToLinear("#d9b46a"),
  tile: hexToLinear("#bcd6e0"),
  glass: hexToLinear("#9cc4dc"),
};

/**
 * One box of a piece of furniture: centre x, centre z, half width, half depth, bottom, top, paint.
 * Measured in metres from the middle of the item, before it is turned. The back of the item is -z.
 */
type Part = [number, number, number, number, number, number, string];

function legs(
  x: number,
  z: number,
  size: number,
  top: number,
  paint: string
): Part[] {
  return [
    [-x, -z, size, size, 0, top, paint],
    [x, -z, size, size, 0, top, paint],
    [-x, z, size, size, 0, top, paint],
    [x, z, size, size, 0, top, paint],
  ];
}

const SHAPES: Record<string, Part[]> = {
  mattress: [
    [0, 0, 0.47, 0.97, 0, 0.2, "cream"],
    [0, -0.72, 0.3, 0.16, 0.2, 0.28, "white"],
    [0, 0.3, 0.47, 0.6, 0.2, 0.22, "blue"],
  ],
  // Two beds, one above the other, in a steel frame with a ladder at the foot.
  bunk: [
    ...legs(0.46, 0.96, 0.025, 1.75, "metal"),
    [0, 0, 0.47, 0.97, 0.3, 0.36, "metal"],
    [0, 0, 0.44, 0.94, 0.36, 0.5, "cream"],
    [0, -0.7, 0.3, 0.16, 0.5, 0.58, "white"],
    [0, 0.3, 0.44, 0.6, 0.5, 0.52, "blue"],
    [0, 0, 0.47, 0.97, 1.25, 1.31, "metal"],
    [0, 0, 0.44, 0.94, 1.31, 1.45, "cream"],
    [0, -0.7, 0.3, 0.16, 1.45, 1.53, "white"],
    [0, 0.3, 0.44, 0.6, 1.45, 1.47, "wine"],
    [0, -0.96, 0.47, 0.02, 1.45, 1.75, "metal"],
    [0.46, 0.2, 0.02, 0.6, 1.6, 1.64, "metal"],
    [0.3, 0.98, 0.02, 0.02, 0, 1.31, "metal"],
    [0.1, 0.98, 0.02, 0.02, 0, 1.31, "metal"],
    [0.2, 0.98, 0.12, 0.02, 0.45, 0.48, "metal"],
    [0.2, 0.98, 0.12, 0.02, 0.85, 0.88, "metal"],
  ],
  bed: [
    [0, 0, 0.74, 0.99, 0, 0.28, "wood"],
    [0, 0.04, 0.69, 0.92, 0.28, 0.5, "white"],
    [0, -0.95, 0.74, 0.04, 0, 1.0, "wood"],
    [-0.34, -0.68, 0.25, 0.15, 0.5, 0.6, "cream"],
    [0.34, -0.68, 0.25, 0.15, 0.5, 0.6, "cream"],
    [0, 0.32, 0.7, 0.6, 0.5, 0.54, "wine"],
  ],
  bigbed: [
    [0, 0, 0.99, 0.99, 0, 0.3, "darkwood"],
    [0, 0.04, 0.94, 0.92, 0.3, 0.55, "white"],
    [0, -0.95, 0.99, 0.04, 0, 1.2, "darkwood"],
    [-0.46, -0.68, 0.32, 0.15, 0.55, 0.66, "cream"],
    [0.46, -0.68, 0.32, 0.15, 0.55, 0.66, "cream"],
    [0, 0.32, 0.95, 0.6, 0.55, 0.6, "gold"],
  ],
  wardrobe: [
    [0, 0, 0.74, 0.24, 0, 2.0, "wood"],
    [0, 0, 0.75, 0.25, 2.0, 2.05, "darkwood"],
    [0, 0.243, 0.012, 0.004, 0.08, 1.92, "darkwood"],
    [-0.08, 0.238, 0.015, 0.012, 0.9, 1.12, "metal"],
    [0.08, 0.238, 0.015, 0.012, 0.9, 1.12, "metal"],
  ],
  plastic_chair: [
    [0, 0.02, 0.2, 0.19, 0.4, 0.44, "white"],
    [0, -0.18, 0.2, 0.025, 0.44, 0.86, "white"],
    ...legs(0.17, 0.15, 0.02, 0.4, "white"),
  ],
  chair: [
    [0, 0.02, 0.2, 0.19, 0.42, 0.46, "wood"],
    [0, 0.02, 0.17, 0.16, 0.46, 0.5, "wine"],
    [0, -0.18, 0.2, 0.025, 0.46, 0.95, "wood"],
    ...legs(0.17, 0.15, 0.025, 0.42, "darkwood"),
  ],
  armchair: [
    [0, 0.06, 0.46, 0.4, 0, 0.42, "sofa"],
    [0, -0.38, 0.46, 0.1, 0, 0.92, "sofa"],
    [-0.4, 0.06, 0.07, 0.4, 0.42, 0.62, "sofaDark"],
    [0.4, 0.06, 0.07, 0.4, 0.42, 0.62, "sofaDark"],
    [0, 0.1, 0.32, 0.3, 0.42, 0.5, "sofaLight"],
  ],
  sofa: [
    [0, 0.06, 0.97, 0.4, 0, 0.42, "sofa"],
    [0, -0.38, 0.97, 0.1, 0, 0.92, "sofa"],
    [-0.9, 0.06, 0.07, 0.4, 0.42, 0.64, "sofaDark"],
    [0.9, 0.06, 0.07, 0.4, 0.42, 0.64, "sofaDark"],
    [-0.42, 0.1, 0.4, 0.3, 0.42, 0.5, "sofaLight"],
    [0.42, 0.1, 0.4, 0.3, 0.42, 0.5, "sofaLight"],
  ],
  table: [
    [0, 0, 0.46, 0.46, 0.68, 0.74, "wood"],
    ...legs(0.4, 0.4, 0.035, 0.68, "darkwood"),
  ],
  tv: [
    [0, 0, 0.72, 0.22, 0, 0.48, "darkwood"],
    [0, 0, 0.12, 0.08, 0.48, 0.52, "black"],
    [0, -0.02, 0.6, 0.025, 0.52, 1.22, "black"],
    [0, 0.008, 0.56, 0.004, 0.56, 1.18, "screen"],
  ],
  shelf: [
    [-0.47, 0, 0.02, 0.22, 0, 1.8, "wood"],
    [0.47, 0, 0.02, 0.22, 0, 1.8, "wood"],
    [0, -0.21, 0.47, 0.012, 0, 1.8, "darkwood"],
    [0, 0, 0.47, 0.22, 0.02, 0.06, "wood"],
    [0, 0, 0.47, 0.22, 0.45, 0.49, "wood"],
    [0, 0, 0.47, 0.22, 0.9, 0.94, "wood"],
    [0, 0, 0.47, 0.22, 1.35, 1.39, "wood"],
    [0, 0, 0.47, 0.22, 1.76, 1.8, "wood"],
    [-0.2, 0, 0.18, 0.15, 0.49, 0.75, "wine"],
    [0.15, 0, 0.2, 0.15, 0.94, 1.15, "blue"],
    [-0.1, 0, 0.25, 0.15, 1.39, 1.58, "gold"],
  ],
  // A reading desk: books, a lamp, and a drawer that sticks.
  desk: [
    [0, 0, 0.48, 0.23, 0.7, 0.75, "wood"],
    ...legs(0.44, 0.19, 0.025, 0.7, "darkwood"),
    [0.25, 0, 0.2, 0.2, 0.45, 0.7, "darkwood"],
    [-0.24, -0.06, 0.13, 0.1, 0.75, 0.79, "wine"],
    [-0.22, -0.06, 0.12, 0.09, 0.79, 0.82, "blue"],
    [-0.24, -0.05, 0.1, 0.08, 0.82, 0.845, "gold"],
    [0.32, -0.12, 0.05, 0.05, 0.75, 0.77, "black"],
    [0.32, -0.12, 0.012, 0.012, 0.77, 1.05, "metal"],
    [0.28, -0.08, 0.07, 0.06, 1.03, 1.1, "black"],
  ],
  rug: [
    [0, 0, 0.98, 0.73, 0, 0.02, "rug"],
    [0, 0, 0.8, 0.55, 0.02, 0.026, "rugLight"],
    [0, 0, 0.6, 0.35, 0.026, 0.032, "rug"],
  ],
  dining: [
    [0, 0, 0.96, 0.46, 0.72, 0.78, "darkwood"],
    ...legs(0.88, 0.38, 0.04, 0.72, "darkwood"),
  ],
  cooker: [
    [0, 0, 0.23, 0.23, 0, 0.85, "white"],
    [0, 0, 0.23, 0.23, 0.85, 0.87, "black"],
    [0, 0.232, 0.18, 0.004, 0.15, 0.6, "black"],
    [-0.1, -0.08, 0.06, 0.06, 0.87, 0.89, "metal"],
    [0.1, -0.08, 0.06, 0.06, 0.87, 0.89, "metal"],
  ],
  fridge: [
    [0, 0, 0.23, 0.23, 0, 1.65, "steel"],
    [0, 0.232, 0.22, 0.003, 1.1, 1.12, "black"],
    [0.16, 0.24, 0.012, 0.01, 0.6, 1.0, "metal"],
    [0.16, 0.24, 0.012, 0.01, 1.2, 1.5, "metal"],
  ],
  fan: [
    [0, 0, 0.18, 0.18, 0, 0.05, "black"],
    [0, 0, 0.02, 0.02, 0.05, 1.2, "metal"],
    [0, 0, 0.2, 0.05, 1.15, 1.55, "black"],
    [0, 0.055, 0.17, 0.005, 1.18, 1.52, "steel"],
  ],
  lamp: [
    [0, 0, 0.12, 0.12, 0, 0.04, "black"],
    [0, 0, 0.015, 0.015, 0.04, 1.4, "metal"],
    [0, 0, 0.16, 0.16, 1.35, 1.65, "cream"],
  ],
  plant: [
    [0, 0, 0.15, 0.15, 0, 0.3, "clay"],
    [0, 0, 0.2, 0.2, 0.3, 0.75, "leaf"],
    [0.05, -0.03, 0.12, 0.12, 0.75, 1.05, "leafLight"],
  ],
  // A tiled corner with a glass side, a shower head on its pipe, and the bucket every bathroom has.
  shower: [
    [0, 0, 0.48, 0.48, 0, 0.06, "white"],
    [0, -0.46, 0.48, 0.02, 0.06, 2.0, "tile"],
    [-0.46, 0, 0.02, 0.48, 0.06, 1.9, "glass"],
    [0.3, -0.42, 0.015, 0.015, 0.06, 1.95, "metal"],
    [0.3, -0.32, 0.07, 0.1, 1.9, 1.95, "metal"],
    [-0.18, 0.16, 0.13, 0.13, 0.06, 0.34, "blue"],
    [-0.18, 0.16, 0.11, 0.11, 0.34, 0.345, "glass"],
  ],
  // Cistern at the back, bowl in front of it, the lid standing up.
  toilet: [
    [0, -0.36, 0.2, 0.1, 0.4, 0.82, "white"],
    [0, 0.05, 0.16, 0.24, 0, 0.38, "white"],
    [0, 0.07, 0.19, 0.27, 0.38, 0.42, "cream"],
    [0, -0.24, 0.18, 0.02, 0.42, 0.78, "white"],
    [0, -0.36, 0.04, 0.04, 0.82, 0.84, "metal"],
  ],
};

/** Every item id this file knows how to draw. Anything else is drawn as a plain crate. */
export const KNOWN_SHAPES = Object.keys(SHAPES);

/** All the furniture on one floor, as one mesh. */
export function buildFurniture(
  plan: HomePlan,
  floor: number,
  items: PlacedItem[],
  catalogue: FurnitureOption[]
): MeshData {
  const builder = new MeshBuilder();
  const options = new Map(catalogue.map((option) => [option.id, option]));

  for (const item of items) {
    if (item.floor !== floor) continue;
    const option = options.get(item.item);
    if (!option) continue;

    const { w, d } = footprint(option, item.rot);
    const centreX = (item.x + w / 2) * plan.cell;
    const centreZ = (item.z + d / 2) * plan.cell;
    const turns = ((item.rot % 4) + 4) % 4;
    const parts: Part[] = SHAPES[item.item] ?? [
      [
        0,
        0,
        (option.w * plan.cell) / 2 - 0.03,
        (option.d * plan.cell) / 2 - 0.03,
        0,
        0.6,
        "wood",
      ],
    ];

    for (const [px, pz, halfX, halfZ, bottom, top, paint] of parts) {
      // A quarter turn moves (x, z) to (-z, x) and swaps the box's width and depth.
      let x = px,
        z = pz,
        hx = halfX,
        hz = halfZ;
      for (let turn = 0; turn < turns; turn++) {
        [x, z] = [-z, x];
        [hx, hz] = [hz, hx];
      }
      builder.box(
        centreX + x,
        centreZ + z,
        hx,
        hz,
        bottom,
        top,
        PAINT[paint] ?? PAINT.wood
      );
    }
  }
  return builder.build();
}
