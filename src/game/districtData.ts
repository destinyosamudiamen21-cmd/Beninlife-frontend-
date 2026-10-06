// The shape of a baked district file (public/map/<id>.json) and the helpers
// that both the renderer and the collision code need. No 3D imports here.

export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type RoofKind = "hip" | "gable" | "flat";

export type Building = {
  /** A rectangle: centre x, centre z, half length, half width, angle of the long side. */
  r?: number[];
  /** Any other outline: x, z, x, z, ... */
  p?: number[];
  /** Floors. */
  f: number;
  /** A fixed random number for this building. Colours are picked from it. */
  s: number;
  /** Roof shape. */
  k: RoofKind;
  /** What the map says it is, when it says more than "building". */
  t?: string;
};

export type Surface = "asphalt" | "worn" | "dirt" | "paved";

export type Road = {
  /** Road type from the map: trunk, residential, footway, bridge, steps ... */
  t: string;
  /** Width in metres. */
  w: number;
  s: Surface;
  /** Centre line: x, z, x, z, ... */
  p: number[];
  /** 1 when the road gets painted lane markings. */
  m?: number;
  /** Height of each point, only for bridges and the stairs up to them. */
  y?: number[];
};

export type Area = { t: string; p: number[] };

export type Gate = { x: number; z: number; half: number; text: string };

export type PlaceLabel = {
  text: string;
  x: number;
  z: number;
  /** Height of the sign above the ground. */
  y: number;
  k: "landmark" | "place" | "road";
};

export type DistrictData = {
  id: string;
  name: string;
  attribution: string;
  bounds: Bounds;
  spawn: number[];
  floorHeight: number;
  buildings: Building[];
  roads: Road[];
  areas: Area[];
  gates: Gate[];
  /** Bridge supports: x, z, height, x, z, height, ... */
  pillars: number[];
  /** x, z, kind (0 shade tree, 1 palm), size, repeated. */
  trees: number[];
  labels: PlaceLabel[];
  /** Market stalls: x, z, angle of the table, what it sells (index into GOODS), repeated. */
  stalls?: number[];
  /** Sellers standing behind stalls: x, z, the way they face, what they sell, repeated. */
  vendors?: number[];
  /** Where touts wait: x, z, what they push, repeated. */
  touts?: number[];
  /** Runs of electricity poles joined by wire: each is x, z, x, z, ... */
  wires?: number[][];
  /** Parked vehicles: x, z, angle, kind (0 bus, 1 keke, 2 car), repeated. */
  vehicles?: number[];
};

const cache = new Map<string, Promise<DistrictData>>();

/** Download a district once. Asking again returns the same copy. */
export function loadDistrict(id: string): Promise<DistrictData> {
  let pending = cache.get(id);
  if (!pending) {
    pending = fetch(`/map/${id}.json`).then((response) => {
      if (!response.ok)
        throw new Error(`Map "${id}" did not load (${response.status}).`);
      return response.json() as Promise<DistrictData>;
    });
    pending.catch(() => cache.delete(id)); // let a failed download be tried again
    cache.set(id, pending);
  }
  return pending;
}

// ---- outlines ----------------------------------------------------------

/** Twice the signed area of an outline. The sign tells which way round it runs. */
export function ringArea2(ring: number[]): number {
  let total = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    total += ring[i] * ring[j + 1] - ring[j] * ring[i + 1];
  }
  return total;
}

/** The four corners of a rectangle record, as x, z, x, z, ... */
export function rectangleRing(r: number[], grow = 0): number[] {
  const [cx, cz, halfLong, halfShort, angle] = r;
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  const a = halfLong + grow;
  const b = halfShort + grow;
  return [
    cx - a * ux + b * uz,
    cz - a * uz - b * ux,
    cx + a * ux + b * uz,
    cz + a * uz - b * ux,
    cx + a * ux - b * uz,
    cz + a * uz + b * ux,
    cx - a * ux - b * uz,
    cz - a * uz + b * ux,
  ];
}

/**
 * A building's outline on the ground. Every outline runs the same way round,
 * so "outside" is always on the same side of each wall.
 */
export function footprint(building: Building): number[] {
  const ring = building.r
    ? rectangleRing(building.r)
    : (building.p ?? []).slice();
  if (ringArea2(ring) < 0) {
    const reversed: number[] = [];
    for (let i = ring.length - 2; i >= 0; i -= 2)
      reversed.push(ring[i], ring[i + 1]);
    return reversed;
  }
  return ring;
}

// ---- the gate ----------------------------------------------------------

export const GATE = {
  pillar: 1.3, // half width of an outer pillar
  island: 2.6, // half width of the middle support, between the two roads
  depth: 1.5, // half depth of the pillars, front to back
  beamDepth: 1.7, // half depth of the beam: it stands proud of the pillars so the name is never hidden
  beamBottom: 6.4, // clear height for anything passing under
  beamTop: 8.8,
  pillarTop: 9.8,
};

export type Box = {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  height: number;
};

/** The solid parts of a gate that stand on the ground. Drawn and collided with. */
export function gatePillars(gate: Gate): Box[] {
  return [
    {
      x: gate.x - gate.half,
      z: gate.z,
      halfX: GATE.pillar,
      halfZ: GATE.depth,
      height: GATE.pillarTop,
    },
    {
      x: gate.x + gate.half,
      z: gate.z,
      halfX: GATE.pillar,
      halfZ: GATE.depth,
      height: GATE.pillarTop,
    },
    {
      x: gate.x,
      z: gate.z,
      halfX: GATE.island,
      halfZ: GATE.depth,
      height: GATE.beamBottom,
    },
  ];
}

/** Where the name board sits on the front of the beam: centre height, width and height. */
export function gateSign(gate: Gate): {
  y: number;
  z: number;
  width: number;
  height: number;
} {
  const height = (GATE.beamTop - GATE.beamBottom) * 0.8;
  return {
    y: (GATE.beamTop + GATE.beamBottom) / 2,
    z: gate.z + GATE.beamDepth + 0.04,
    width: Math.min(height * 12, gate.half * 2 - 2 * GATE.pillar - 1),
    height,
  };
}

export const BRIDGE_PILLAR = 0.55; // half width of a footbridge support
export const TREE_TRUNK = 0.3; // how wide a tree is to walk into
