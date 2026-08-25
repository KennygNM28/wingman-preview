# Wingman Offline Master v9 — Implementation Checklist

Legend: ✅ implemented in this offline build · 🟡 implemented foundation / provider-gated · ⏳ future product layer

## Brand + Navigation
- ✅ Bottom navigation: **The Action · The Numbers · Wingman · The Word · The Huddle**.
- ✅ Profile/Settings removed from bottom nav and accessible from the top-right account control (including Home hero).
- ✅ Center nav keeps the Wingman logo and now visibly says **Wingman**.
- ✅ Main search identity says **Ask Your Wingman**.
- ✅ Existing Wingman red / black / white theme, logo and suited hero are retained.
- ✅ The Word uses a talking-head/conversation-style icon; The Huddle uses a group icon.

## The Action
- ✅ Ask Your Wingman lives at the top; live/current games are directly beneath it.
- ✅ MLB / NFL / NBA / NCAAF / NCAAB league support.
- ✅ Optional multi-sport filter persists locally.
- ✅ Favorite teams persist locally and are prioritized in game lists.
- ✅ Betting info can be shown/hidden.
- ✅ Game cards show team-specific spread, moneyline and Over/Under when available.
- ✅ Game cards are clickable and open Game Center.
- ✅ Game Center includes inning/quarter/half scoring, team stats and player box scores when the source publishes them.
- ✅ Current game market cards can show **Bets/Tickets % + Money/Handle %** for every spread, ML and total outcome where legitimate provider split data exists.
- ✅ Money differential = Money % − Bet %.
- ✅ Heat rules: 10–19 pts **WATCH**, 20–29 pts **🔥 HOT**, 30+ pts **🔥 VERY HOT**.
- ✅ If split data is missing, odds render normally with no invented percentages/badge.
- 🟡 SportsDataIO current split integration is provider-ready and requires Replit secrets/configuration.

## Team Directory + Favorites
- ✅ One canonical team-directory API is used by The Numbers and Profile/Favorites.
- ✅ MLB, NFL and NBA have complete local fallback lists (30 / 32 / 30) if ESPN team discovery is temporarily unavailable.
- ✅ NCAAF and NCAAB load the comprehensive current ESPN team directory at runtime (limit 1000) instead of a frozen 10-team list.
- ✅ Team selectors are searchable and mobile-friendly.
- ✅ Favorite teams reuse the same canonical directory to prevent list drift.

## Ask Your Wingman
- ✅ MLB keeps the richer existing MLB Stats API + Baseball Savant/Statcast engine.
- ✅ MLB supports team scoring, first inning, pitcher ERA/WHIP/runs allowed/strikeouts, hitter AVG/OPS/HR/K and pitch-type performance.
- ✅ NFL general stat adapter added: team points for/allowed, win rate and recent player passing/rushing/receiving/receptions/TD/INT/sack-style box-score questions where ESPN exposes the stat.
- ✅ NBA general stat adapter added: team points for/allowed/win rate and player points/rebounds/assists/threes/steals/blocks from recent ESPN box scores.
- ✅ NCAAF and NCAAB use the same league-aware team/player resolver and recent-game/box-score adapter.
- ✅ Follow-up context is preserved for player/team + metric when a user changes timeframe (for example “last 5 games”).
- ✅ Non-MLB Analyze is no longer disabled.
- ✅ Responses show source + sample rather than presenting unsupported values as facts.
- 🟡 ESPN publishes different box-score fields by league/game; unsupported player metrics return an honest unavailable/incomplete sample instead of fabrication.

## The Numbers
- ✅ **Bets** renamed to **The Numbers**.
- ✅ Team Trends + Player Props modes.
- ✅ Historical metrics include overall cover, home cover, road cover, favorite cover, underdog cover, favorite ML win rate and Over rate when legitimate archived lines are found.
- ✅ Last 10 / Last 30 / Season windows.
- ✅ Missing market lines are excluded from samples, never treated as losses.
- ✅ Historical fallback: ESPN scoreboard odds → ESPN event summary/pickcenter closing line per completed game.
- ✅ Summary lookups use bounded concurrency to avoid hammering the provider.
- ✅ Historical range errors are isolated so one ESPN/NCAA range failure does not automatically kill the whole request.
- ✅ The response identifies which archived market sources actually supplied lines.
- ✅ Player Props mode is designed around the **actual posted prop line** and explicitly refuses to fabricate history while a licensed current+historical prop feed is unconfigured.
- 🟡 SportsDataIO remains the preferred production betting source for current splits/props and richer historical markets once credentials/endpoints are configured.
- 🟡 Player-prop Bet % / Money % only renders if a real provider supplies both values for that exact prop market.
- 🟡 Line movement and multi-sportsbook best-line comparison require a licensed multi-book odds feed; current UI/data contracts are ready for a provider layer but do not invent book data.

## The Word
- ✅ Separate bottom-nav destination.
- ✅ Betting / Sports News filters.
- ✅ Last 24 hours, newest first.
- ✅ Source attribution + external links.
- ✅ Existing server filtering excludes generic legalization/regulatory/business chatter from the sports-focused feed.
- 🟡 X/social engagement coverage depends on available provider/API credentials; trusted public news sources continue as fallback.

## The Huddle
- ✅ Separate bottom-nav destination.
- ✅ Post types: Bet, Question, Poll, Discussion, Social.
- ✅ Filter by post type.
- ✅ Community bet reactions: **Love · Lean · Fade**.
- ✅ Local post composer, polls and persistence for prototype testing.
- ✅ Data shape leaves room for later pre-event bet verification and automatic grading.
- ⏳ Durable accounts/backend posts, verified W/L/P grading, units/ROI, user following, high-success user search and leaderboards are future account/community-server work.

## Profile / Control Room
- ✅ Favorite team management using the canonical team directory.
- ✅ Selected sports management.
- ✅ Saved Research / Alerts / Preferences / Privacy entry points.
- ✅ Favorites and sport preferences persist locally without requiring login yet.
- ⏳ Full cloud account sync and following stats are later account work.

## Cleanup / Regression Prevention
- ✅ Removed the obsolete combined Community page from routing/source.
- ✅ Removed The Numbers' duplicated hardcoded team array.
- ✅ Removed Profile's duplicated hardcoded team array.
- ✅ Removed Home's duplicate league definition; shared league metadata is centralized.
- ✅ Deprecated `/bets`, `/community`, `/action`, `/wingman` URLs redirect to current destinations.

## Configuration still needed for production betting data
- 🟡 `SPORTSDATAIO_API_KEY`
- 🟡 `SPORTSDATAIO_SPLITS_URL_TEMPLATE` (account/provider-specific mapping for current public betting splits)
- 🟡 A licensed historical/player-prop endpoint or provider mapping for true archived prop markets, line movement and book-by-book comparisons.

## Offline validation performed
- ✅ TypeScript/TSX files were syntax-parsed with `tsc` without syntax diagnostics.
- 🟡 Full workspace typecheck cannot complete in this container because the archived project did not include installed Node/Vite type packages; `tsconfig.base.json` has been restored in this ZIP so Replit can install dependencies and run its normal workspace build.
