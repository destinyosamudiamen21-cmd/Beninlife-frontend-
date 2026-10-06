type Building = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
};

const COLORS = [
  "#d9c7a3",
  "#c97b4a",
  "#e8dcc2",
  "#9fb8a0",
  "#d4a24c",
  "#b8b2a7",
];
const WORLD_SEED = 2026;

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateBuildings(): Building[] {
  const rand = mulberry32(WORLD_SEED);
  const buildings: Building[] = [];

  for (let x = -200; x <= 200; x += 22) {
    for (const side of [-1, 1]) {
      if (rand() < 0.15) continue;
      const w = 10 + rand() * 8;
      const d = 10 + rand() * 6;
      const floors = 1 + Math.floor(rand() * 4);
      buildings.push({
        x: x + (rand() - 0.5) * 4,
        z: side * (14 + d / 2),
        w,
        d,
        h: floors * 3.2,
        color: COLORS[Math.floor(rand() * COLORS.length)],
      });
    }
  }
  return buildings;
}

const BUILDINGS = generateBuildings();
const LANE_MARKS = Array.from({ length: 50 }, (_, i) => -245 + i * 10);

export function World() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color='#8fae6b' />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[500, 12]} />
        <meshStandardMaterial color='#3a3d42' roughness={0.9} />
      </mesh>

      {[-1, 1].map((side) => (
        <mesh
          key={side}
          rotation-x={-Math.PI / 2}
          position={[0, 0.03, side * 7.5]}
          receiveShadow
        >
          <planeGeometry args={[500, 3]} />
          <meshStandardMaterial color='#b9b2a4' />
        </mesh>
      ))}

      {LANE_MARKS.map((x) => (
        <mesh key={x} rotation-x={-Math.PI / 2} position={[x, 0.02, 0]}>
          <planeGeometry args={[4, 0.25]} />
          <meshStandardMaterial color='#f2f2f2' />
        </mesh>
      ))}

      {BUILDINGS.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}
