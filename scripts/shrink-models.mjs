// Makes small GLB copies of the character models, for phones. Run from the frontend folder:
//   node scripts/shrink-models.mjs ~/Downloads/FBX2glTF-darwin-x64
// Reads public/models/*.fbx, writes public/models-glb/*.glb. The FBX files are not touched.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  meshopt,
  prune,
  resample,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const fbx2gltf = process.argv[2];
if (!fbx2gltf || !existsSync(fbx2gltf)) {
  console.error(
    "Give the path to FBX2glTF, e.g. node scripts/shrink-models.mjs ~/Downloads/FBX2glTF-darwin-x64"
  );
  process.exit(1);
}

const SOURCE = "public/models";
const OUT = "public/models-glb";
const TEMP = path.join(os.tmpdir(), "beninlife-glb");
const BODIES = new Set(["character", "woman"]); // the only files that need their skin
mkdirSync(OUT, { recursive: true });
mkdirSync(TEMP, { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });

const mb = (file) => (statSync(file).size / 1024 / 1024).toFixed(1) + " MB";

for (const file of readdirSync(SOURCE)
  .filter((f) => f.endsWith(".fbx"))
  .sort()) {
  const name = path.basename(file, ".fbx");
  const input = path.join(SOURCE, file);
  const converted = path.join(TEMP, name); // FBX2glTF adds ".glb"
  const output = path.join(OUT, `${name}.glb`);

  // 1. FBX to GLB, as it is.
  execFileSync(
    fbx2gltf,
    ["--binary", "--input", input, "--output", converted],
    { stdio: "ignore" }
  );
  const doc = await io.read(`${converted}.glb`);
  const root = doc.getRoot();

  if (BODIES.has(name)) {
    // 2a. A body: keep everything, but pack the shape and shrink the pictures.
    await doc.transform(
      dedup(),
      weld(),
      prune({ keepLeaves: true }),
      textureCompress({
        encoder: sharp,
        targetFormat: "webp",
        resize: [1024, 1024],
      }),
      meshopt({ encoder: MeshoptEncoder })
    );
  } else {
    // 2b. An animation: throw the body away, keep the bones and how they move.
    for (const node of root.listNodes()) {
      node.setMesh(null);
      node.setSkin(null);
    }
    for (const list of [
      root.listMeshes(),
      root.listSkins(),
      root.listMaterials(),
      root.listTextures(),
    ]) {
      for (const item of list) item.dispose();
    }
    // keepLeaves: the last bones (finger tips, the top of the head) have nothing under them but are still bones.
    await doc.transform(resample(), dedup(), prune({ keepLeaves: true }));
  }

  await io.write(output, doc);
  console.log(
    `${name.padEnd(16)} ${mb(input).padStart(9)}  ->  ${mb(output).padStart(8)}`
  );
}
console.log(
  `\nDone. The small copies are in ${OUT}/. Your .fbx files are unchanged.`
);
