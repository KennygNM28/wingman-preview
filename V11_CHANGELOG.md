# Wingman v11 Review Build

## Visual alignment
- Restored the approved mobile Wingman visual language instead of the unrelated desktop-dashboard direction.
- Added a self-contained suited Wingman vector mark; no external image asset is required.
- Added a larger suited Wingman hero silhouette with red stadium-style glow.
- Added Wingman Sports top header, league / Home Field subtitle, alerts and top-right profile control.
- Tightened the hero, search control, quick-tool strip, Action controls and center Wingman navigation to match the approved mobile mockup.
- Strengthened the beveled 3D card treatment with a restrained white rim glow and inner highlight.

## Functionality / bug fixes
- Added a dedicated `/wingman` destination while preserving the compact Ask Wingman experience on The Action.
- Wingman nav now opens the dedicated Ask Your Wingman experience rather than only scrolling the Home page.
- Added explicit this-season / last-season / recent-game timeframe handling to non-MLB Wingman adapters.
- Improved football stat-group disambiguation for passing, rushing and receiving box-score metrics.
- Historical market provider order is now licensed provider -> ESPN summary/pickcenter -> ESPN scoreboard -> unavailable.
- Added cached optional licensed historical odds integration point.
- Added current-market context to The Numbers and Bet % / Money % heat treatment when legitimate splits are available.
- Bet % / Money % now sits directly beside the corresponding spread / ML / total outcome on Action cards.
- Simplified the API esbuild bundle and removed the Pino worker/plugin path that could fail in StackBlitz WebContainers.

## Validation
- Static TypeScript/TSX syntax audit: 130 files, 0 parse errors.
- Complete pro fallback counts verified: MLB 30, NFL 32, NBA 30.
- Old combined Community page absent.
- Final navigation labels present in active layout.
