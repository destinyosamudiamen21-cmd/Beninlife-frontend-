import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry } from "three";
import { buildStreetFront } from "./clubShapes";
import type { DistrictData, Door } from "./districtData";
import type { MeshData } from "./districtGeometry";
import { playerFocus } from "./focus";
import { buildBridgeRoofs } from "./footbridge";
import { buildFlyover } from "./streetFlyover";

const DOOR_REACH = 2.6; // metres from a door's spot at which it can be used

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
  data: DistrictData;
  /** The door the player is standing at, or null. Called only when it changes. */
  onNearDoor: (door: Door | null) => void;
};

/**
 * What a district has besides its streets and buildings: the roof over its footbridge,
 * and the front of every door a player can go through and every spot they can use (a
 * shuttle stop, a buka). It also watches for the player walking up to one of them.
 */
export function StreetExtras({ data, onNearDoor }: Props) {
  const doors = useMemo(() => data.doors ?? [], [data]);
  // A district with no footbridge has no roof to draw.
  const roofs = useMemo(() => {
    const mesh = buildBridgeRoofs(data);
    return mesh.indices.length > 0 ? toGeometry(mesh) : null;
  }, [data]);
  const fronts = useMemo(() => doors.map((door) => toGeometry(buildStreetFront(door))), [doors]);
  // Ikpoba Hill has its flyover over the main road.
  const flyover = useMemo(() => {
    if (data.id !== "ikpoba") return null;
    const built = buildFlyover();
    return { solid: toGeometry(built.solid), glow: toGeometry(built.glow) };
  }, [data]);
  useEffect(
    () => () => {
      roofs?.dispose();
      fronts.forEach((front) => front.dispose());
      flyover?.solid.dispose();
      flyover?.glow.dispose();
    },
    [roofs, fronts, flyover],
  );

  const near = useRef<Door | null>(null);
  useFrame(() => {
    let found: Door | null = null;
    // A door is at street level: someone on the bridge above it is not at it.
    if (playerFocus.y < 0.5) {
      for (const door of doors) {
        if (Math.hypot(playerFocus.x - door.x, playerFocus.z - door.z) < DOOR_REACH) found = door;
      }
    }
    if (found !== near.current) {
      near.current = found;
      onNearDoor(found);
    }
  });
  // Leaving the district must not leave a door "open" behind it.
  useEffect(() => () => onNearDoor(null), [onNearDoor]);

  return (
    <>
      {roofs && (
        <mesh geometry={roofs} castShadow receiveShadow>
          <meshLambertMaterial vertexColors />
        </mesh>
      )}
      {flyover && (
        <>
          <mesh geometry={flyover.solid} castShadow receiveShadow>
            <meshLambertMaterial vertexColors />
          </mesh>
          <mesh geometry={flyover.glow}>
            <meshBasicMaterial vertexColors toneMapped={false} />
          </mesh>
        </>
      )}
      {fronts.map((front, index) => (
        <mesh key={doors[index].id} geometry={front} castShadow receiveShadow>
          <meshLambertMaterial vertexColors />
        </mesh>
      ))}
    </>
  );
}
