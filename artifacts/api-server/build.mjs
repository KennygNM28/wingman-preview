import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { rm } from "node:fs/promises";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(artifactDir, "dist");
const workspaceRoot = path.resolve(artifactDir, "../..");

try {
  await rm(distDir, { recursive: true, force: true });
  await build({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    target: "node20",
    bundle: true,
    packages: "external",
    alias: {
      "@workspace/api-zod": path.resolve(workspaceRoot, "lib/api-zod/src/index.ts"),
    },
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    sourcemap: "linked",
    logLevel: "info",
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}
