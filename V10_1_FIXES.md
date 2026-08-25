# v10.1 StackBlitz fixes

- Replaced all pnpm `catalog:` dependency references with explicit package versions.
- Removed the workspace catalog block for compatibility with older StackBlitz pnpm resolvers.
- Pinned the package manager metadata to pnpm 9.15.9 and Node 20+.
- Kept the original monorepo folder structure required by the API and frontend workspaces.
- Added clearer StackBlitz folder-upload instructions.
