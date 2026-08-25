# Wingman v10 Review Checklist

## Branding / navigation
- [x] The Action
- [x] The Numbers
- [x] Wingman center destination and visible label
- [x] The Word
- [x] The Huddle
- [x] Profile / Settings accessed from top-right control
- [x] Ask Your Wingman heading
- [x] Self-contained suited Wingman character mark; no missing external logo dependency
- [x] Red / black / white design system
- [x] Beveled / 3D cards with subtle white rim glow and dimensional shadow

## The Action
- [x] MLB / NFL / NBA / NCAAF / NCAAB league support
- [x] Multi-select sport preference filter
- [x] Favorite teams prioritized
- [x] Betting / Scores toggle
- [x] Spread / moneyline / total presentation
- [x] Bet % / Money % rendered only when legitimate split data is returned
- [x] Watch / Hot / Very Hot differential badges
- [x] Clickable game cards
- [x] Game Center with innings/periods, team stats and player box scores when provider publishes them

## Team directory / personalization
- [x] Shared runtime `/sports/teams` directory
- [x] Complete pro fallback architecture
- [x] Current ESPN team directory for college leagues when reachable
- [x] Searchable team selector in The Numbers
- [x] Searchable Favorites selector
- [x] Selected sports persisted locally
- [x] Favorite teams persisted locally

## Ask Your Wingman
- [x] MLB deep-stat path retained
- [x] NFL route enabled
- [x] NBA route enabled
- [x] NCAAF route enabled
- [x] NCAAB route enabled
- [x] Non-MLB team recent-form metrics
- [x] Non-MLB player recent box-score metric path
- [x] Follow-up context supported by generic route
- [ ] Non-MLB breadth equal to MLB/Statcast depth — future enrichment, not fabricated

## The Numbers
- [x] Overall cover
- [x] Home cover
- [x] Road cover
- [x] Favorite cover
- [x] Underdog cover
- [x] Favorite ML win rate
- [x] Over rate
- [x] Last 10 / Last 30 / Season windows
- [x] Per-game ESPN scoreboard → summary/pickcenter historical fallback
- [x] Provider summary / source labels
- [x] Missing lines excluded honestly
- [x] Player Props screen and exact-line research architecture
- [ ] Legitimate current + historical prop feed — provider required
- [ ] Sportsbook comparison — provider required
- [ ] Line-movement timeline — provider required

## Community / content
- [x] The Word separate route
- [x] Betting / News filtering
- [x] Last-24-hours newest-first logic
- [x] Source attribution
- [x] The Huddle separate route
- [x] Bet / Question / Poll / Discussion / Social labels
- [x] Love / Lean / Fade
- [x] Local review persistence
- [ ] Durable accounts/community backend — later production phase
- [ ] Verified bet grading / ROI / leaderboard / following — later production phase

## StackBlitz review readiness
- [x] Replit-only Vite plugins removed from active review app
- [x] Replit-only PORT / BASE_PATH requirements removed
- [x] Web default port 5173
- [x] API default port 8080
- [x] Vite `/api` proxy to local API server
- [x] Root `pnpm start` launches web + API
- [x] `.stackblitzrc` included
- [x] Missing external image dependency removed
- [x] TypeScript/TSX syntax pass: 81 files, 0 syntax errors
- [ ] Full dependency install/build must run in StackBlitz because this offline environment cannot access npm registry
