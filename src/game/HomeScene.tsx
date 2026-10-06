import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry } from "three";
import type { Home } from "../api/home";
import type { MeshData } from "./districtGeometry";
import { playerFocus } from "./focus";
import { buildFurniture, buildRoom } from "./homeGeometry";
import { roomSize, stairTrigger, type FloorChange } from "./homeLayout";

const OUTSIDE = "#cfdcc6"; // what shows beyond the walls

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

type Props = {
  home: Home;
  /** Which floor is shown: 0 is downstairs. Only one floor is drawn at a time. */
  floor: number;
  /** The player stepped onto the stairs. */
  onStairs: (change: FloorChange) => void;
};

/** The inside of a player's house: one floor of it, with its furniture. */
export function HomeScene({ home, floor, onStairs }: Props) {
  const { plan, items, catalogue } = home;
  const { width, depth } = roomSize(plan, floor);

  // The room only changes with the floor; the furniture changes whenever something is bought or moved.
  const room = useMemo(() => toGeometry(buildRoom(plan, floor)), [plan, floor]);
  const furniture = useMemo(
    () => toGeometry(buildFurniture(plan, floor, items, catalogue)),
    [plan, floor, items, catalogue]
  );
  useEffect(() => () => room.dispose(), [room]);
  useEffect(() => () => furniture.dispose(), [furniture]);

  // Watch for the player stepping onto the stairs. It fires once per visit to a floor.
  const climbed = useRef(false);
  useEffect(() => {
    climbed.current = false;
  }, [floor]);

  useFrame(() => {
    if (climbed.current) return;
    const change = stairTrigger(plan, floor, playerFocus.x, playerFocus.z);
    if (change) {
      climbed.current = true;
      onStairs(change);
    }
  });

  return (
    <>
      <color attach='background' args={[OUTSIDE]} />
      {/* Indoors the light comes from everywhere, so nothing is ever in deep shadow. */}
      <ambientLight intensity={1.4} />
      <hemisphereLight args={["#ffffff", "#8a7a66", 0.7]} />
      <directionalLight
        position={[width / 2 + 3, 9, depth + 5]}
        intensity={1.8}
        color='#fff4e2'
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />

      <mesh geometry={room} receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh geometry={furniture} castShadow receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
    </>
  );
}
