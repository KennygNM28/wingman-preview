# Wingman v12.2 — StackBlitz feed + team-directory fix

## Fixed from the v12.1 StackBlitz test

- Fixed API/web port collision in StackBlitz: the API now uses `API_PORT=8080` and no longer inherits StackBlitz's web `PORT=5173`.
- The Action scoreboard now tries the Wingman API first and automatically falls back through the Vite dev server directly to ESPN if the local API proxy is unavailable.
- Empty/invalid API bodies no longer surface as the cryptic `Unexpected end of JSON input` error.
- Added a StackBlitz-safe `/espn` proxy so ESPN fallbacks do not depend on browser CORS.
- The Numbers and Profile team selectors now populate immediately from cached/static fallbacks instead of rendering an empty list while the API is unavailable.
- MLB fallback contains all 30 teams; NFL all 32; NBA all 30 with ESPN-compatible abbreviations.
- NCAAF/NCAAB still attempt the comprehensive current ESPN directory first; successful directories are cached locally. Emergency college seeds are used only if both the Wingman API and ESPN directory are unavailable.
- The Numbers current market uses the same scoreboard fallback path as The Action.
- The Numbers historical trends now use the Wingman API first, then an honest direct ESPN history + summary/pickcenter fallback in StackBlitz. Missing historical lines are excluded rather than fabricated.

## Validation

- TypeScript syntax/transpile scan: 133 TS/TSX files, 0 syntax errors.
- No external `@assets` image imports in the active frontend.
- StackBlitz start command pins API port 8080 and web port 5173.
