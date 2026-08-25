# SportsDataIO production setup

Wingman never stores a key in frontend code. Configure provider credentials in Replit Secrets.

Current public-split hook recognizes:
- `SPORTSDATAIO_API_KEY`
- `SPORTSDATAIO_SPLITS_URL_TEMPLATE`

The split template is intentionally account/provider-specific because SportsDataIO identifiers are not ESPN event IDs. Configure it only with a licensed endpoint/mapping that returns legitimate market split records. Without it, Wingman simply hides Bets % / Money % instead of inventing values.

Recommended next production-data integration:
1. Current multi-book odds and line movement.
2. Betting splits for spread / moneyline / total.
3. Current player props.
4. Historical player-prop markets for posted-line hit-rate research.
5. Provider event-ID mapping so all current and historical markets can be normalized behind Wingman's provider layer.

## v11 historical fallback hook

For licensed historical odds, v11 also recognizes:

- `SPORTSDATAIO_HISTORICAL_ODDS_URL_TEMPLATE`

The configured endpoint/bridge may use these placeholders: `{league}`, `{espnEventId}`, `{gameId}`, `{date}`, `{away}`, `{home}`. This exists because provider event IDs do not necessarily match ESPN event IDs. If no valid licensed historical response is returned, Wingman falls back to ESPN summary/pickcenter, then ESPN scoreboard odds, and finally an honest unavailable state.
