# Wingman v12.2 — StackBlitz Review

This build is for visual and functional review before returning to Replit.

## Upload
This ZIP is packaged with the project files at the ZIP root to avoid the double-nested-folder problem from earlier builds.

1. Extract the ZIP once.
2. Upload the extracted `wingman-stackblitz-v12.2` folder into a blank Node.js StackBlitz project.
3. In the terminal run:
   - `cd wingman-stackblitz-v12.2`
   - `pnpm install`
   - `pnpm start`

You should NOT need to `cd` into a second folder with the same name.

## Ports
- Web/Vite: 5173
- Wingman API: 8080

v12.2 explicitly prevents StackBlitz's web `PORT` from being reused by the API, which was the likely reason the local API process kept dying in previous tests.

## Preview fallbacks
- The Action: Wingman API first → StackBlitz/Vite direct ESPN fallback.
- Team directories: Wingman API first → direct current ESPN directory → local cache → complete pro fallback / emergency college preview seed.
- The Numbers historical research: Wingman API first → direct ESPN history + event summary/pickcenter fallback. Missing odds are excluded, not fabricated.
- SportsDataIO Bet % / Money % appears only when legitimate credentials/data are configured.

Do not use Bolt AI to rewrite the project while reviewing this package.
