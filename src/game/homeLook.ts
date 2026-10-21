// How a house is lit and what its surfaces are made of. Plain three.js objects, so the game
// (HomeScene) and the test renderer use exactly the same ones.
//
// The idea is a lived-in home at night, as in the best Nigerian houses: dark rich walls, white
// trims, warm downlights throwing cones of light down the walls, floors that shine. Ambient
// light is kept low so the light has somewhere to fall; the glow (homeLighting.ts) does the rest.

import {
  AdditiveBlending, AmbientLight, BackSide, BoxGeometry, CanvasTexture, Color, DirectionalLight, Group, HemisphereLight,
  LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, PMREMGenerator, PointLight, Scene, SRGBColorSpace,
  type Texture, type WebGLRenderer,
} from "three";
import type { Sheen } from "./homeLighting";

// ---- the glow texture ---------------------------------------------------------------------

const SIZE = 512;
const HALF = SIZE / 2;

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Four soft shapes in one texture: the cone down a wall, a pool, a bright disc, a fading strip.
 * White on black: the colour comes from the mesh, the brightness from here. */
export function glowTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(SIZE, SIZE);
  const put = (px: number, py: number, value: number) => {
    const i = (py * SIZE + px) * 4;
    const v = Math.max(0, Math.min(255, Math.round(value * 255)));
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    image.data[i + 3] = 255;
  };
  for (let py = 0; py < HALF; py++) {
    for (let px = 0; px < HALF; px++) {
      const u = (px + 0.5) / HALF, v = (py + 0.5) / HALF;   // v: 0 at the top of each quarter
      const x = u * 2 - 1;
      // The cone (top left): a bright scallop under the light, widening and fading down the wall.
      const width = 0.16 + 0.84 * Math.pow(v, 0.62);
      const across = smooth(1, 0.35, Math.abs(x) / width);
      const down = Math.pow(1 - v, 1.35) * smooth(0, 0.07, v);
      const hot = Math.exp(-((x * x) / 0.018 + ((v - 0.16) * (v - 0.16)) / 0.012)) * 0.9;
      put(px, py, Math.min(1, across * down * 0.85 + hot));
      // The pool (top right): soft and round.
      const r = Math.hypot(x, v * 2 - 1);
      put(px + HALF, py, Math.pow(Math.max(0, 1 - r), 2.2));
      // The disc (bottom left): a bright bulb with a little halo.
      put(px, py + HALF, smooth(0.62, 0.42, r) + Math.max(0, 1 - r) * 0.35);
      // The strip (bottom right): bright along the top, fading down, soft at the ends.
      put(px + HALF, py + HALF, Math.pow(1 - v, 2.4) * smooth(0, 0.08, u) * smooth(1, 0.92, u));
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

// ---- reflections --------------------------------------------------------------------------

/** What shiny things in a house reflect: a dim warm room with rows of bright downlights and a
 * glowing window. Made once, from a little scene, so it needs no picture files. */
export function homeEnvironment(renderer: WebGLRenderer): Texture {
  const room = new Scene();
  const box = new Mesh(new BoxGeometry(14, 4, 14), new MeshBasicMaterial({ color: "#2b231b", side: BackSide }));
  box.position.y = 2;
  room.add(box);
  const bulb = new MeshBasicMaterial({ color: new Color(9, 7.2, 5.2) });
  for (let x = -5; x <= 5; x += 2.5) {
    for (let z = -5; z <= 5; z += 2.5) {
      const light = new Mesh(new BoxGeometry(0.35, 0.05, 0.35), bulb);
      light.position.set(x, 3.95, z);
      room.add(light);
    }
  }
  const window = new Mesh(new BoxGeometry(4, 1.6, 0.05), new MeshBasicMaterial({ color: new Color(1.4, 1.6, 2.0) }));
  window.position.set(0, 1.8, -6.95);
  room.add(window);
  const generator = new PMREMGenerator(renderer);
  const texture = generator.fromScene(room, 0.03).texture;
  generator.dispose();
  room.traverse((thing) => {
    if (thing instanceof Mesh) {
      thing.geometry.dispose();
      (thing.material as MeshBasicMaterial).dispose();
    }
  });
  return texture;
}

// ---- materials ----------------------------------------------------------------------------

export type HomeMaterials = {
  walls: MeshStandardMaterial;          // walls, trims, ceilings, stairs: painted, matt
  floors: Record<Sheen, MeshStandardMaterial>;
  furniture: MeshStandardMaterial;
  glow: MeshBasicMaterial;              // the light falling on things, added on top
};

export function homeMaterials(): HomeMaterials {
  const floor = (roughness: number, envMapIntensity: number) =>
    new MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, envMapIntensity });
  return {
    walls: new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, envMapIntensity: 0.35 }),
    floors: { polished: floor(0.16, 1.25), satin: floor(0.34, 0.95), matte: floor(0.92, 0.25) },
    furniture: new MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.02, envMapIntensity: 0.6 }),
    glow: new MeshBasicMaterial({
      map: glowTexture(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
  };
}

export function disposeMaterials(materials: HomeMaterials): void {
  materials.walls.dispose();
  Object.values(materials.floors).forEach((material) => material.dispose());
  materials.furniture.dispose();
  materials.glow.map?.dispose();
  materials.glow.dispose();
}

// ---- lights -------------------------------------------------------------------------------

export const LIGHT = {
  ambient: 0.32,
  sky: "#ffe7c7", ground: "#2a2118", hemisphere: 0.55,
  key: 0.85,               // the light the shadows come from: warm, from above
  room: 5,                 // each room's own light, at head height so the ceiling is not burnt out ...
  roomColour: "#ffc98a",
  roomReach: 9,            // ... and how far it reaches
};

/** The lights of one storey: low ambient, a warm key from above for shadows, and a warm light
 * in the middle of each of the biggest rooms. */
export function homeLights(rooms: { x: number; z: number }[], centre: { x: number; z: number }): Group {
  const group = new Group();
  group.add(new AmbientLight("#fff1dc", LIGHT.ambient));
  group.add(new HemisphereLight(LIGHT.sky, LIGHT.ground, LIGHT.hemisphere));
  const key = new DirectionalLight("#ffe2b8", LIGHT.key);
  key.position.set(centre.x + 3, 14, centre.z + 5);
  key.target.position.set(centre.x, 0, centre.z);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const reach = 20;
  Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 50 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.03;
  group.add(key, key.target);
  for (const room of rooms) {
    const light = new PointLight(LIGHT.roomColour, LIGHT.room, LIGHT.roomReach, 2);
    light.position.set(room.x, 1.7, room.z);
    group.add(light);
  }
  return group;
}

export { SRGBColorSpace };
