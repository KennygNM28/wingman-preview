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
    // Keep the StackBlitz API artifact self-contained. The previous external-package
    // build could start successfully in Replit but then die in WebContainers with
    // ERR_MODULE_NOT_FOUND when pnpm's workspace links were not available at runtime.
    packages: "bundle",
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
