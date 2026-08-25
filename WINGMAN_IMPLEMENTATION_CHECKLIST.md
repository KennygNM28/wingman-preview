# Wingman v11 Acceptance Checklist

This checklist is the acceptance criteria for the review build. Items marked provider-gated intentionally do not fabricate unavailable data.

- ✅ **Final navigation:** **The Action · The Numbers · Wingman · The Word · The Huddle**. Profile/Settings is in the top-right account control.
- ✅ **Ask Your Wingman:** MLB keeps the richer Stats API/Statcast engine. NFL, NBA, NCAAF and NCAAB use league-aware ESPN team/player adapters, recent-game/season timeframe handling, entity resolution and a dedicated Wingman screen.
- ✅ **Complete team directories:** MLB/NFL/NBA have complete local fallback directories (30/32/30). NCAAF/NCAAB load the current ESPN team directory dynamically. Favorites and The Numbers both use the same `/api/sports/teams` source.
- ✅ **Searchable team selectors:** The Numbers and Favorites use searchable mobile selectors.
- ✅ **The Action:** multi-sport filtering, persisted favorites, betting info toggle, spread/ML/total, favorite games first, clickable Game Center, inning/period breakdown, team stats and player box scores.
- ✅ **Bet % + Money %:** spread, moneyline and total outcomes display legitimate Bet % + Money % when returned by the configured split provider. Differential rules are 10–19 WATCH, 20–29 HOT, 30+ VERY HOT. Missing split data is hidden rather than estimated.
- ✅ **The Numbers:** overall/home/road/favorite/underdog cover rates, favorite ML win rate, totals, real sample sizes, Last 10/30/Season, current-market panel, and historical fallback chain.
- 🟡 **Player Props:** UI and exact-posted-line hit-rate architecture are present; true current + historical prop data remains provider-gated.
- ✅ **The Word:** separate 24-hour newest-first Betting/News section, source attribution, relevance/engagement filtering, and legalization/policy noise filtering.
- ✅ **The Huddle:** separate Bet / Question / Poll / Discussion / Social community area with filters, posting, polls and Love / Lean / Fade.
- ✅ **Profile:** favorite teams, selected sports, saved research / alerts / preferences / privacy foundations.
- ✅ **Regression cleanup:** no stale combined Community page and no duplicate frontend team arrays.
- 🟡 **Sportsbook comparison + line movement:** visible provider-ready foundations only; real book-by-book history requires a licensed multi-book odds feed.
- ⏳ **Later Huddle features:** verified bet grading, ROI/units, user records, follows, high-success user search and leaderboards remain future account/backend work.

## Provider fallback order

Historical betting markets use:
1. SportsDataIO / licensed historical endpoint when configured with `SPORTSDATAIO_HISTORICAL_ODDS_URL_TEMPLATE`.
2. ESPN event summary / pickcenter.
3. ESPN scoreboard market data.
4. Honest unavailable state; no fabricated odds.

Current Bet % / Money % uses only configured legitimate split data. Player-prop split badges remain hidden unless a future provider explicitly supplies those fields for the prop market.
