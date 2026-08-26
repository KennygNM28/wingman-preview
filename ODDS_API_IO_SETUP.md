# Odds-API.io backup setup

Wingman now supports Odds-API.io as a cached fallback for current moneyline, spread/run-line, and total markets.

Provider order for The Action:

1. Existing Wingman/SportsDataIO/ESPN market data
2. Odds-API.io fills only missing current markets
3. Existing league/ESPN game data remains unchanged
4. Missing markets stay unavailable rather than being fabricated

## Free-tier setup

1. Create an account at https://odds-api.io/
2. On the free plan, select two bookmakers. Recommended for Wingman testing: DraftKings and FanDuel.
3. In Vercel -> wingman-preview -> Settings -> Environment Variables, add:
   - `ODDS_API_KEY` = your Odds-API.io API key
   - `ODDS_API_BOOKMAKERS` = `DraftKings,FanDuel`
4. Apply the variables to Production and Preview.
5. Redeploy the latest deployment.

## Quota protection

- Wingman calls Odds-API.io only when a current upcoming/live game is missing a core market.
- The Vercel endpoint is cached for 15 minutes (`s-maxage=900`).
- Event odds use `/v3/odds/multi`, which fetches up to 10 events per provider request.
- The backup never supplies Bet% or Money%; those remain provider-gated.

## Endpoint

`GET /api/odds?league=mlb&date=YYYY-MM-DD`

Supported Wingman league keys: `mlb`, `nfl`, `nba`, `ncaaf`, `ncaab`.
