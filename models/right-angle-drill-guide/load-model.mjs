import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
export async function loadModel() {
  const root = path.resolve(import.meta.dirname, "../..");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "drill-guide-"));
  try {
    const outfile = path.join(temp,"geometry.mjs");
    await build({entryPoints:[path.join(root,"src/models/rightAngleDrillGuide.ts")],outfile,bundle:true,platform:"node",format:"esm"});
    return await import(pathToFileURL(outfile));
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
}
