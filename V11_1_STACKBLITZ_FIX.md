# Wingman v11.1 — StackBlitz compatibility patch

This patch addresses the first v11 StackBlitz runtime failure.

- Bundles the local `@workspace/api-zod` TypeScript source into the API output instead of asking Node/WebContainers to execute the workspace TypeScript package directly at runtime.
- Makes `pnpm start` keep the Vite review preview running even if the API exits, so visual review is not blocked by a backend error.
- Keeps `pnpm run start:strict` available for a strict two-process validation pass.

Use: `cd wingman-stackblitz-v11.1`, `pnpm install`, `pnpm start`.
