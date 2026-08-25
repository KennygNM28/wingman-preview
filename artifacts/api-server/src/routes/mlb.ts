import { Router, type IRouter } from "express";
import {
  GetMlbBettingTrendsQueryParams,
  GetMlbBettingTrendsResponse,
  GetMlbScoreboardQueryParams,
  GetMlbScoreboardResponse,
  PostMlbWingmanBody,
  PostMlbWingmanResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard";
const ESPN_SUMMARY_URL =
  "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary";
const MLB_URL = "https://statsapi.mlb.com/api/v1/schedule";

type AnyRecord = Record<string, any>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function displayPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/[+-]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function normalizeStatus(state: string | undefined): {
  status: "upcoming" | "live" | "final" | "postponed" | "canceled";
  label: string;
} {
  const normalized = (state ?? "").toLowerCase();
  if (
    normalized === "in" ||
    normalized === "live" ||
    normalized.includes("progress")
  ) {
    return { status: "live", label: "LIVE" };
  }
  if (normalized === "post" || normalized.includes("final")) {
    return { status: "final", label: "FINAL" };
  }
  if (normalized.includes("postpon")) {
    return { status: "postponed", label: "POSTPONED" };
  }
  if (normalized.includes("cancel")) {
    return { status: "canceled", label: "CANCELED" };
  }
  return { status: "upcoming", label: "UPCOMING" };
}

function normalizeTeam(
  competitor: AnyRecord,
  scoreOverride?: unknown,
): AnyRecord {
  const team = asRecord(competitor.team);
  const name = String(team.displayName ?? team.name ?? "TBD");
  const abbreviation = String(
    team.abbreviation ?? team.shortDisplayName?.slice(0, 3) ?? "TBD",
  );
  const score =
    asNumber(scoreOverride) ??
    asNumber(competitor.score) ??
    asNumber(competitor.runs);
  const record = Array.isArray(competitor.records)
    ? String(
        asRecord(competitor.records[0]).summary ??
          asRecord(competitor.records[0]).displayValue ??
          "",
      ) || null
    : competitor.record
      ? String(competitor.record)
      : null;

  return {
    abbreviation,
    name,
    shortName: String(team.shortDisplayName ?? team.name ?? name),
    score,
    record,
    logo:
      typeof team.logo === "string"
        ? team.logo
        : typeof team.logos?.[0]?.href === "string"
          ? team.logos[0].href
          : null,
  };
}

function parseEspnOddsRecord(odds: AnyRecord): AnyRecord | null {
  if (!Object.keys(odds).length) return null;

  const pointSpread = asRecord(odds.pointSpread);
  const awayPointSpread = asRecord(asRecord(pointSpread.away).close);
  const homePointSpread = asRecord(asRecord(pointSpread.home).close);
  const moneyline = asRecord(odds.moneyline);
  const awayMoneyline = asRecord(asRecord(moneyline.away).close);
  const homeMoneyline = asRecord(asRecord(moneyline.home).close);
  const totalMarket = asRecord(odds.total);
  const overMarket = asRecord(asRecord(totalMarket.over).close);
  const underMarket = asRecord(asRecord(totalMarket.under).close);
  const baseSpread = asNumber(odds.spread);
  const awayFavorite = asRecord(odds.awayTeamOdds).favorite === true;
  const homeFavorite = asRecord(odds.homeTeamOdds).favorite === true;
  const total = asNumber(odds.overUnder);

  return {
    awaySpread:
      displayPrice(awayPointSpread.line) ??
      (baseSpread === null ? null : awayFavorite ? -baseSpread : baseSpread),
    homeSpread:
      displayPrice(homePointSpread.line) ??
      (baseSpread === null ? null : homeFavorite ? -baseSpread : baseSpread),
    awaySpreadPrice: displayPrice(awayPointSpread.odds),
    homeSpreadPrice: displayPrice(homePointSpread.odds),
    awayMoneyline: displayPrice(awayMoneyline.odds) ?? displayPrice(asRecord(odds.awayTeamOdds).moneyLine),
    homeMoneyline: displayPrice(homeMoneyline.odds) ?? displayPrice(asRecord(odds.homeTeamOdds).moneyLine),
    total,
    overPrice: displayPrice(overMarket.odds) ?? displayPrice(odds.overOdds),
    underPrice: displayPrice(underMarket.odds) ?? displayPrice(odds.underOdds),
  };
}

function parseEspnOdds(competition: AnyRecord): AnyRecord | null {
  const odds = parseEspnOddsRecord(asRecord(competition.odds?.[0]));
  if (!odds) return null;

  const rawOdds = asRecord(competition.odds?.[0]);
  return {
    ...odds,
    awayMoneyline: odds.awayMoneyline ?? displayPrice(asRecord(rawOdds.awayTeamOdds).moneyLine),
    homeMoneyline: odds.homeMoneyline ?? displayPrice(asRecord(rawOdds.homeTeamOdds).moneyLine),
  };
}

function parseEspn(data: AnyRecord, date: string) {
  const games = (Array.isArray(data.events) ? data.events : []).map(
    (event: AnyRecord) => {
      const competition = asRecord(event.competitions?.[0]);
      const statusInfo = asRecord(event.status ?? competition.status);
      const statusType = asRecord(statusInfo.type);
      const competitors = Array.isArray(competition.competitors)
        ? competition.competitors
        : [];
      const away = competitors.find(
        (item: AnyRecord) => item.homeAway === "away",
      );
      const home = competitors.find(
        (item: AnyRecord) => item.homeAway === "home",
      );
      const normalized = normalizeStatus(
        String(statusType.state ?? statusType.name ?? ""),
      );
      const liveLabel =
        statusType.shortDetail ?? statusType.detail ?? normalized.label;
      const linescore = asRecord(competition.linescores?.[0]);
      const situation = asRecord(competition.situation);
      const odds = parseEspnOdds(competition);

      return {
        id: String(event.id ?? `${date}-${event.name ?? "game"}`),
        status: normalized.status,
         statusLabel: normalized.label,
        startTime: String(event.date ?? competition.date ?? `${date}T00:00:00Z`),
        venue: String(asRecord(competition.venue).fullName ?? "Venue TBD"),
        inning:
          normalized.status === "live"
            ? String(liveLabel)
            : null,
        balls:
          normalized.status === "live" ? asNumber(situation.balls) : null,
        strikes:
          normalized.status === "live" ? asNumber(situation.strikes) : null,
        outs: normalized.status === "live" ? asNumber(situation.outs) : null,
        onFirst:
          normalized.status === "live" ? asBoolean(situation.onFirst) : null,
        onSecond:
          normalized.status === "live" ? asBoolean(situation.onSecond) : null,
        onThird:
          normalized.status === "live" ? asBoolean(situation.onThird) : null,
        away: normalizeTeam(away ?? {}),
        home: normalizeTeam(home ?? {}),
        betting: odds,
      };
    },
  );

  return GetMlbScoreboardResponse.parse({
    date,
    provider: "ESPN",
    providerUrl: `${ESPN_URL}?dates=${date.replaceAll("-", "")}`,
    games,
    warning: null,
  });
}

function parseMlb(data: AnyRecord, date: string) {
  const scheduleDates = Array.isArray(data.dates) ? data.dates : [];
  const sourceGames = scheduleDates.flatMap((scheduleDate: AnyRecord) =>
    Array.isArray(scheduleDate.games) ? scheduleDate.games : [],
  );
  const games = sourceGames.map((game: AnyRecord) => {
    const normalized = normalizeStatus(String(game.status?.abstractGameState ?? ""));
    const detailedState = String(
      game.status?.detailedState ?? normalized.label,
    );
    const linescore = asRecord(game.linescore);
    const inning =
      normalized.status === "live" && linescore.currentInning
        ? `${linescore.inningHalf === "Top" ? "Top" : "Bot"} ${linescore.currentInning}`
        : null;
    const away = asRecord(game.teams?.away);
    const home = asRecord(game.teams?.home);
    const awayTeam = asRecord(away.team);
    const homeTeam = asRecord(home.team);
    const toTeam = (team: AnyRecord, competitor: AnyRecord) =>
      normalizeTeam(
        {
          team: {
            displayName: team.name,
            name: team.name,
            shortDisplayName: team.name,
            abbreviation: team.abbreviation,
            logos: team.id
              ? [{ href: `https://www.mlbstatic.com/team-logos/${team.id}.svg` }]
              : [],
          },
          score: competitor.score,
        },
        competitor.score,
      );

    return {
      id: String(game.gamePk),
      status: normalized.status,
      statusLabel:
        normalized.status === "live" ? detailedState.toUpperCase() : normalized.label,
      startTime: String(game.gameDate ?? `${date}T00:00:00Z`),
      venue: String(asRecord(game.venue).name ?? "Venue TBD"),
      inning,
      balls: normalized.status === "live" ? asNumber(linescore.balls) : null,
      strikes:
        normalized.status === "live" ? asNumber(linescore.strikes) : null,
      outs: normalized.status === "live" ? asNumber(linescore.outs) : null,
      onFirst:
        normalized.status === "live"
          ? asBoolean(linescore.onFirst ?? linescore.firstBase)
          : null,
      onSecond:
        normalized.status === "live"
          ? asBoolean(linescore.onSecond ?? linescore.secondBase)
          : null,
      onThird:
        normalized.status === "live"
          ? asBoolean(linescore.onThird ?? linescore.thirdBase)
          : null,
      away: toTeam(awayTeam, away),
      home: toTeam(homeTeam, home),
      betting: null,
    };
  });

  return GetMlbScoreboardResponse.parse({
    date,
    provider: "MLB",
    providerUrl: `${MLB_URL}?sportId=1&date=${date}`,
    games,
    warning: "Betting markets are available when the ESPN feed provides them.",
  });
}

async function fetchJson(url: string): Promise<AnyRecord> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "WingmanSports/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Provider returned ${response.status}`);
  }
  return asRecord(await response.json());
}

router.get("/mlb/scoreboard", async (req, res): Promise<void> => {
  const parsed = GetMlbScoreboardQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Use a date in YYYY-MM-DD format.", detail: parsed.error.message });
    return;
  }

  const { date } = parsed.data;
  const errors: string[] = [];

  try {
    const data = parseEspn(
      await fetchJson(`${ESPN_URL}?dates=${date.replaceAll("-", "")}`),
      date,
    );
    res.json(data);
    return;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown ESPN error";
    errors.push(`ESPN: ${detail}`);
    req.log.warn({ date, detail }, "ESPN MLB scoreboard failed; trying MLB feed");
  }

  try {
    const data = parseMlb(
      await fetchJson(`${MLB_URL}?sportId=1&date=${date}&hydrate=team,venue,linescore`),
      date,
    );
    res.json(data);
    return;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown MLB error";
    errors.push(`MLB: ${detail}`);
    req.log.error({ date, detail }, "Both MLB scoreboard providers failed");
  }

  res.status(502).json({
    error: "Live MLB data is temporarily unavailable.",
    detail: errors.join(" | "),
  });
});

type WingmanMetric =
  | "first_inning_scoring"
  | "team_runs_per_game"
  | "team_batting_average"
  | "team_home_runs"
  | "pitcher_runs_allowed_avg"
  | "pitcher_era"
  | "pitcher_whip"
  | "pitcher_strikeouts"
  | "hitter_batting_average"
  | "hitter_ops"
  | "hitter_home_runs"
  | "hitter_strikeouts"
  | "pitch_type_performance";

type WingmanTimeframe = "current_season" | "last_3_seasons" | "previous_season";

type WingmanSearchContext = {
  sport?: "MLB";
  entityType?: "team" | "player";
  entityId?: number;
  entityName?: string;
  entityShortName?: string;
  playerGroup?: "pitcher" | "hitter";
  metric?: WingmanMetric;
  timeframe?: WingmanTimeframe;
};

type WingmanStatCard = { label: string; value: string; detail?: string };
type WingmanGenericResult = {
  title: string;
  entityName: string;
  timeframeLabel: string;
  primaryLabel: string;
  primaryValue: string;
  stats: WingmanStatCard[];
  sampleLabel?: string;
  source: string;
  note?: string;
};

const MLB_STATS_BASE = "https://statsapi.mlb.com/api/v1";
const BASEBALL_SAVANT_CSV = "https://baseballsavant.mlb.com/statcast_search/csv";

const MLB_TEAMS = [
  { id: 108, name: "Los Angeles Angels", short: "Angels", aliases: ["angels", "la angels"] },
  { id: 109, name: "Arizona Diamondbacks", short: "Diamondbacks", aliases: ["diamondbacks", "dbacks", "arizona"] },
  { id: 110, name: "Baltimore Orioles", short: "Orioles", aliases: ["orioles", "baltimore"] },
  { id: 111, name: "Boston Red Sox", short: "Red Sox", aliases: ["red sox", "boston"] },
  { id: 112, name: "Chicago Cubs", short: "Cubs", aliases: ["cubs", "chicago cubs"] },
  { id: 113, name: "Cincinnati Reds", short: "Reds", aliases: ["reds", "cincinnati"] },
  { id: 114, name: "Cleveland Guardians", short: "Guardians", aliases: ["guardians", "cleveland"] },
  { id: 115, name: "Colorado Rockies", short: "Rockies", aliases: ["rockies", "colorado"] },
  { id: 116, name: "Detroit Tigers", short: "Tigers", aliases: ["tigers", "detroit"] },
  { id: 117, name: "Houston Astros", short: "Astros", aliases: ["astros", "houston"] },
  { id: 118, name: "Kansas City Royals", short: "Royals", aliases: ["royals", "kansas city", "kc royals"] },
  { id: 119, name: "Los Angeles Dodgers", short: "Dodgers", aliases: ["dodgers", "la dodgers"] },
  { id: 120, name: "Washington Nationals", short: "Nationals", aliases: ["nationals", "washington", "nats"] },
  { id: 121, name: "New York Mets", short: "Mets", aliases: ["mets", "ny mets"] },
  { id: 133, name: "Athletics", short: "Athletics", aliases: ["athletics", "oakland", "a's"] },
  { id: 134, name: "Pittsburgh Pirates", short: "Pirates", aliases: ["pirates", "pittsburgh"] },
  { id: 135, name: "San Diego Padres", short: "Padres", aliases: ["padres", "san diego"] },
  { id: 136, name: "Seattle Mariners", short: "Mariners", aliases: ["mariners", "seattle"] },
  { id: 137, name: "San Francisco Giants", short: "Giants", aliases: ["giants", "san francisco"] },
  { id: 138, name: "St. Louis Cardinals", short: "Cardinals", aliases: ["cardinals", "st louis", "st. louis"] },
  { id: 139, name: "Tampa Bay Rays", short: "Rays", aliases: ["rays", "tampa bay"] },
  { id: 140, name: "Texas Rangers", short: "Rangers", aliases: ["texas rangers", "rangers"] },
  { id: 141, name: "Toronto Blue Jays", short: "Blue Jays", aliases: ["blue jays", "toronto", "jays"] },
  { id: 142, name: "Minnesota Twins", short: "Twins", aliases: ["twins", "minnesota"] },
  { id: 143, name: "Philadelphia Phillies", short: "Phillies", aliases: ["phillies", "philadelphia"] },
  { id: 144, name: "Atlanta Braves", short: "Braves", aliases: ["braves", "atlanta"] },
  { id: 145, name: "Chicago White Sox", short: "White Sox", aliases: ["white sox", "chicago white sox"] },
  { id: 146, name: "Miami Marlins", short: "Marlins", aliases: ["marlins", "miami"] },
  { id: 147, name: "New York Yankees", short: "Yankees", aliases: ["yankees", "ny yankees"] },
  { id: 158, name: "Milwaukee Brewers", short: "Brewers", aliases: ["brewers", "milwaukee"] },
];

function detectTeam(question: string) {
  const normalized = question.toLowerCase();
  return MLB_TEAMS.find((team) => team.aliases.some((alias) => normalized.includes(alias)));
}

function detectTimeframe(question: string): WingmanTimeframe | undefined {
  const normalized = question.toLowerCase();
  if (/\b(?:this year|this season|current year|current season|season to date|ytd)\b/.test(normalized)) return "current_season";
  if (/\b(?:last year|previous year|last season|previous season)\b/.test(normalized)) return "previous_season";
  if (/\b(?:last|past|previous)\s*3\s*(?:years?|seasons?)\b|\b3\s*(?:years?|seasons?)\b/.test(normalized)) return "last_3_seasons";
  return undefined;
}

function detectMetric(question: string): WingmanMetric | undefined {
  const q = question.toLowerCase();
  if (/\b(?:first|1st)\s+inning\b/.test(q) && /\b(?:score|scores|scored|scoring|run|runs)\b/.test(q)) return "first_inning_scoring";
  if (detectTeam(q)) {
    if (/\b(?:runs per game|average runs|avg runs|score per game|scoring average)\b/.test(q)) return "team_runs_per_game";
    if (/\b(?:team batting average|batting average|team average)\b/.test(q)) return "team_batting_average";
    if (/\b(?:team home runs|home runs|homers)\b/.test(q)) return "team_home_runs";
  }
  if (/\b(?:pitch type|pitch types|pitches|fastball|slider|curveball|changeup|sinker|cutter)\b/.test(q) && /\b(?:best|handle|handles|hit|hits|against|damage|performance|perform)\b/.test(q)) return "pitch_type_performance";
  if (/\b(?:runs? (?:allowed|given up|give up)|allow(?:ed|s)? runs?|runs? surrendered)\b/.test(q) && /\b(?:pitcher|pitching|era|starter|start)\b/.test(q)) return "pitcher_runs_allowed_avg";
  if (/\b(?:era|earned run average)\b/.test(q)) return "pitcher_era";
  if (/\bwhip\b/.test(q)) return "pitcher_whip";
  if (/\b(?:strikeouts?|k\/9|ks)\b/.test(q) && /\b(?:pitcher|pitching|starter|throws?|thrown)\b/.test(q)) return "pitcher_strikeouts";
  if (/\b(?:batting average|average|avg)\b/.test(q) && /\b(?:hitter|batter|batting|hit)\b/.test(q)) return "hitter_batting_average";
  if (/\bops\b/.test(q)) return "hitter_ops";
  if (/\b(?:home runs?|homers?|hr)\b/.test(q) && /\b(?:hitter|batter|batting|hit)\b/.test(q)) return "hitter_home_runs";
  if (/\b(?:strikeouts?|ks)\b/.test(q) && /\b(?:hitter|batter|batting|at the plate)\b/.test(q)) return "hitter_strikeouts";
  if (/\b(?:runs per game|average runs|avg runs|score per game|scoring average)\b/.test(q)) return "team_runs_per_game";
  if (/\b(?:team batting average|batting average|team average)\b/.test(q)) return "team_batting_average";
  if (/\b(?:team home runs|home runs|homers)\b/.test(q)) return "team_home_runs";
  return undefined;
}

function metricGroup(metric: WingmanMetric | undefined): "team" | "pitcher" | "hitter" | undefined {
  if (!metric) return undefined;
  if (["first_inning_scoring", "team_runs_per_game", "team_batting_average", "team_home_runs"].includes(metric)) return "team";
  if (["pitcher_runs_allowed_avg", "pitcher_era", "pitcher_whip", "pitcher_strikeouts"].includes(metric)) return "pitcher";
  return "hitter";
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function seasonRange(timeframe: WingmanTimeframe) {
  const now = new Date();
  const year = now.getUTCFullYear();
  if (timeframe === "previous_season") return { startDate: `${year - 1}-03-01`, endDate: `${year - 1}-11-15`, label: `${year - 1} season`, season: year - 1 };
  if (timeframe === "last_3_seasons") return { startDate: `${year - 2}-03-01`, endDate: isoDate(now), label: `last 3 seasons (${year - 2}-${year})`, season: year };
  return { startDate: `${year}-03-01`, endDate: isoDate(now), label: `${year} season`, season: year };
}

async function firstInningScoring(teamId: number, timeframe: WingmanTimeframe) {
  const range = seasonRange(timeframe);
  const params = new URLSearchParams({ sportId: "1", teamId: String(teamId), startDate: range.startDate, endDate: range.endDate, gameType: "R", hydrate: "linescore" });
  const data = await fetchJson(`${MLB_URL}?${params}`);
  const games = (Array.isArray(data.dates) ? data.dates : []).flatMap((day: AnyRecord) => Array.isArray(day.games) ? day.games : []);
  let qualifyingGames = 0;
  let scoredGames = 0;
  let totalFirstInningRuns = 0;

  for (const game of games) {
    const detailedState = String(game?.status?.detailedState ?? "").toLowerCase();
    if (!detailedState.includes("final") && !detailedState.includes("completed")) continue;
    const innings = Array.isArray(game?.linescore?.innings) ? game.linescore.innings : [];
    const first = innings.find((inning: AnyRecord) => Number(inning?.num) === 1) ?? innings[0];
    if (!first) continue;
    const awayId = Number(game?.teams?.away?.team?.id);
    const homeId = Number(game?.teams?.home?.team?.id);
    const side = awayId === teamId ? first.away : homeId === teamId ? first.home : null;
    if (!side || typeof side.runs !== "number") continue;
    qualifyingGames += 1;
    totalFirstInningRuns += side.runs;
    if (side.runs > 0) scoredGames += 1;
  }

  return {
    ...range,
    qualifyingGames,
    scoredGames,
    totalFirstInningRuns,
    rate: qualifyingGames ? Math.round((scoredGames / qualifyingGames) * 1000) / 10 : 0,
    averageRuns: qualifyingGames ? Math.round((totalFirstInningRuns / qualifyingGames) * 1000) / 1000 : 0,
  };
}

const SEARCH_STOPWORDS = new Set(["what", "whats", "what's", "how", "often", "does", "do", "did", "the", "a", "an", "is", "are", "was", "were", "pitcher", "pitchers", "hitter", "hitters", "batter", "batters", "player", "players", "average", "avg", "runs", "run", "allowed", "given", "give", "up", "era", "whip", "strikeouts", "strikeout", "home", "this", "season", "year", "last", "past", "previous", "best", "handle", "handles", "pitches", "pitch", "type", "types", "against", "performance", "perform", "which", "has", "have", "his", "her", "their", "and", "or"]);

function playerSearchCandidates(question: string): string[] {
  const cleaned = question.replace(/\'s\b/gi, "").replace(/[^a-zA-Z' .-]/g, " ").replace(/\s+/g, " ").trim();
  const explicit = [
    cleaned.match(/(?:pitcher|hitter|batter|player)\s+([A-Za-z'.-]+(?:\s+[A-Za-z'.-]+){1,2})/i)?.[1],
    cleaned.match(/(?:does|did|for|about)\s+([A-Za-z'.-]+\s+[A-Za-z'.-]+)\s+(?:handle|hit|allow|give|have|throw)/i)?.[1],
  ].filter(Boolean) as string[];
  const words = cleaned.split(" ").filter((word) => word.length > 1 && !SEARCH_STOPWORDS.has(word.toLowerCase()));
  const windows: string[] = [];
  for (const size of [3, 2]) {
    for (let index = 0; index <= words.length - size; index += 1) {
      windows.push(words.slice(index, index + size).join(" "));
    }
  }
  return [...new Set([...explicit, ...windows])].slice(0, 10);
}

async function resolvePlayer(question: string, desiredGroup?: "pitcher" | "hitter") {
  for (const candidate of playerSearchCandidates(question)) {
    try {
      const params = new URLSearchParams({ names: candidate, sportIds: "1" });
      const data = await fetchJson(`${MLB_STATS_BASE}/people/search?${params}`);
      const people = Array.isArray(data.people) ? data.people : [];
      const matched = people.find((person: AnyRecord) => {
        if (!desiredGroup) return true;
        const type = String(person?.primaryPosition?.type ?? "").toLowerCase();
        return desiredGroup === "pitcher" ? type === "pitcher" : type !== "pitcher";
      }) ?? people[0];
      if (matched?.id) {
        const type = String(matched?.primaryPosition?.type ?? "").toLowerCase();
        return {
          id: Number(matched.id),
          name: String(matched.fullName ?? candidate),
          group: type === "pitcher" ? "pitcher" as const : "hitter" as const,
        };
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function statValue(stat: AnyRecord, key: string): number | null {
  const value = stat?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function displayStat(value: unknown, digits = 2): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && value.trim() && Number.isNaN(Number(value))) return value;
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return Number.isInteger(number) ? String(number) : number.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

async function getSeasonStat(
  entity: "team" | "player",
  id: number,
  group: "hitting" | "pitching",
  timeframe: WingmanTimeframe,
): Promise<{ stat: AnyRecord; label: string }> {
  const range = seasonRange(timeframe);
  const endpoint = entity === "team" ? `${MLB_STATS_BASE}/teams/${id}/stats` : `${MLB_STATS_BASE}/people/${id}/stats`;
  const params = new URLSearchParams({ group, gameType: "R" });
  if (timeframe === "last_3_seasons") {
    params.set("stats", "byDateRange");
    params.set("startDate", range.startDate);
    params.set("endDate", range.endDate);
  } else {
    params.set("stats", "season");
    params.set("season", String(range.season));
  }
  const data = await fetchJson(`${endpoint}?${params}`);
  const splits = data?.stats?.[0]?.splits;
  const stat = Array.isArray(splits) && splits.length ? asRecord(splits[0]?.stat) : {};
  return { stat, label: range.label };
}

async function buildTeamResult(
  team: typeof MLB_TEAMS[number],
  metric: WingmanMetric,
  timeframe: WingmanTimeframe,
): Promise<WingmanGenericResult> {
  if (metric === "first_inning_scoring") {
    const result = await firstInningScoring(team.id, timeframe);
    return {
      title: `${team.short} first-inning scoring`,
      entityName: team.name,
      timeframeLabel: result.label,
      primaryLabel: "Games scoring in 1st",
      primaryValue: `${result.rate}%`,
      stats: [
        { label: "Scored", value: `${result.scoredGames}` },
        { label: "Games", value: `${result.qualifyingGames}` },
        { label: "Avg R/1st", value: result.averageRuns.toFixed(2) },
        { label: "1st-inning runs", value: `${result.totalFirstInningRuns}` },
      ],
      sampleLabel: `${result.qualifyingGames} completed regular-season games`,
      source: "MLB Stats API",
    };
  }

  const { stat, label } = await getSeasonStat("team", team.id, "hitting", timeframe);
  const games = statValue(stat, "gamesPlayed") ?? 0;
  const runs = statValue(stat, "runs") ?? 0;
  if (metric === "team_runs_per_game") {
    const runsPerGame = games ? runs / games : 0;
    return {
      title: `${team.short} scoring`,
      entityName: team.name,
      timeframeLabel: label,
      primaryLabel: "Runs per game",
      primaryValue: runsPerGame.toFixed(2),
      stats: [
        { label: "Runs", value: displayStat(runs, 0) },
        { label: "Games", value: displayStat(games, 0) },
        { label: "AVG", value: displayStat(stat.avg, 3) },
        { label: "OPS", value: displayStat(stat.ops, 3) },
      ],
      sampleLabel: `${displayStat(games, 0)} games`,
      source: "MLB Stats API",
    };
  }
  if (metric === "team_batting_average") {
    return {
      title: `${team.short} hitting`,
      entityName: team.name,
      timeframeLabel: label,
      primaryLabel: "Batting average",
      primaryValue: displayStat(stat.avg, 3),
      stats: [
        { label: "OPS", value: displayStat(stat.ops, 3) },
        { label: "OBP", value: displayStat(stat.obp, 3) },
        { label: "SLG", value: displayStat(stat.slg, 3) },
        { label: "Hits", value: displayStat(stat.hits, 0) },
      ],
      sampleLabel: `${displayStat(games, 0)} games`,
      source: "MLB Stats API",
    };
  }
  return {
    title: `${team.short} power`,
    entityName: team.name,
    timeframeLabel: label,
    primaryLabel: "Home runs",
    primaryValue: displayStat(stat.homeRuns, 0),
    stats: [
      { label: "HR", value: displayStat(stat.homeRuns, 0) },
      { label: "Runs", value: displayStat(stat.runs, 0) },
      { label: "SLG", value: displayStat(stat.slg, 3) },
      { label: "OPS", value: displayStat(stat.ops, 3) },
    ],
    sampleLabel: `${displayStat(games, 0)} games`,
    source: "MLB Stats API",
  };
}

async function buildPlayerResult(
  player: { id: number; name: string; group: "pitcher" | "hitter" },
  metric: WingmanMetric,
  timeframe: WingmanTimeframe,
): Promise<WingmanGenericResult> {
  const group = player.group === "pitcher" ? "pitching" : "hitting";
  const { stat, label } = await getSeasonStat("player", player.id, group, timeframe);
  if (metric === "pitcher_runs_allowed_avg") {
    const runs = statValue(stat, "runs") ?? 0;
    const starts = statValue(stat, "gamesStarted") ?? 0;
    const appearances = statValue(stat, "gamesPlayed") ?? statValue(stat, "gamesPitched") ?? 0;
    const divisor = starts > 0 ? starts : appearances;
    const average = divisor ? runs / divisor : 0;
    const basis = starts > 0 ? "Runs allowed/start" : "Runs allowed/appearance";
    return {
      title: `${player.name} run prevention`,
      entityName: player.name,
      timeframeLabel: label,
      primaryLabel: basis,
      primaryValue: average.toFixed(2),
      stats: [
        { label: "Runs allowed", value: displayStat(runs, 0) },
        { label: "ERA", value: displayStat(stat.era, 2) },
        { label: "WHIP", value: displayStat(stat.whip, 2) },
        { label: starts > 0 ? "Starts" : "Appearances", value: displayStat(divisor, 0) },
      ],
      sampleLabel: `${displayStat(divisor, 0)} ${starts > 0 ? "starts" : "appearances"}`,
      source: "MLB Stats API",
      note: "Runs allowed includes earned and unearned runs; ERA only counts earned runs.",
    };
  }

  const configs: Partial<Record<WingmanMetric, { primaryLabel: string; primaryKey: string; cards: [string, string][] }>> = {
    pitcher_era: { primaryLabel: "ERA", primaryKey: "era", cards: [["WHIP", "whip"], ["Strikeouts", "strikeOuts"], ["K/9", "strikeoutsPer9Inn"], ["IP", "inningsPitched"]] },
    pitcher_whip: { primaryLabel: "WHIP", primaryKey: "whip", cards: [["ERA", "era"], ["Walks", "baseOnBalls"], ["Hits allowed", "hits"], ["IP", "inningsPitched"]] },
    pitcher_strikeouts: { primaryLabel: "Strikeouts", primaryKey: "strikeOuts", cards: [["K/9", "strikeoutsPer9Inn"], ["ERA", "era"], ["WHIP", "whip"], ["IP", "inningsPitched"]] },
    hitter_batting_average: { primaryLabel: "Batting average", primaryKey: "avg", cards: [["OPS", "ops"], ["OBP", "obp"], ["SLG", "slg"], ["Hits", "hits"]] },
    hitter_ops: { primaryLabel: "OPS", primaryKey: "ops", cards: [["AVG", "avg"], ["OBP", "obp"], ["SLG", "slg"], ["HR", "homeRuns"]] },
    hitter_home_runs: { primaryLabel: "Home runs", primaryKey: "homeRuns", cards: [["OPS", "ops"], ["SLG", "slg"], ["RBI", "rbi"], ["AB", "atBats"]] },
    hitter_strikeouts: { primaryLabel: "Strikeouts", primaryKey: "strikeOuts", cards: [["PA", "plateAppearances"], ["AVG", "avg"], ["OPS", "ops"], ["Walks", "baseOnBalls"]] },
  };
  const config = configs[metric];
  if (!config) throw new Error("Unsupported player metric");
  return {
    title: `${player.name} ${player.group === "pitcher" ? "pitching" : "hitting"}`,
    entityName: player.name,
    timeframeLabel: label,
    primaryLabel: config.primaryLabel,
    primaryValue: displayStat(stat[config.primaryKey], config.primaryKey === "avg" || config.primaryKey === "ops" ? 3 : 2),
    stats: config.cards.map(([labelName, key]) => ({ label: labelName, value: displayStat(stat[key], ["avg", "ops", "obp", "slg"].includes(key) ? 3 : 2) })),
    source: "MLB Stats API",
  };
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value); value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift() ?? [];
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

const PITCH_NAMES: Record<string, string> = {
  FF: "4-Seam Fastball", SI: "Sinker", FC: "Cutter", SL: "Slider", ST: "Sweeper",
  CU: "Curveball", KC: "Knuckle Curve", CH: "Changeup", FS: "Splitter", SV: "Slurve", KN: "Knuckleball",
};

async function pitchTypePerformance(
  player: { id: number; name: string },
  timeframe: WingmanTimeframe,
): Promise<WingmanGenericResult> {
  const range = seasonRange(timeframe);
  const params = new URLSearchParams({ all: "true", type: "details", player_type: "batter", batter: String(player.id), game_date_gt: range.startDate, game_date_lt: range.endDate });
  const response = await fetch(`${BASEBALL_SAVANT_CSV}?${params}`, { headers: { Accept: "text/csv", "User-Agent": "WingmanSports/1.0" } });
  if (!response.ok) throw new Error(`Baseball Savant returned ${response.status}`);
  const rows = parseCsv(await response.text());
  const grouped = new Map<string, { pitches: number; pa: number; woba: number; denom: number; ev: number; evN: number; whiffs: number; swings: number }>();
  for (const row of rows) {
    const code = row.pitch_type;
    if (!code) continue;
    const item = grouped.get(code) ?? { pitches: 0, pa: 0, woba: 0, denom: 0, ev: 0, evN: 0, whiffs: 0, swings: 0 };
    item.pitches += 1;
    const description = row.description ?? "";
    if (/swing|foul|in_play/i.test(description)) item.swings += 1;
    if (/swinging_strike/i.test(description)) item.whiffs += 1;
    const denominator = Number(row.woba_denom);
    const value = Number(row.woba_value);
    if (Number.isFinite(denominator) && denominator > 0 && Number.isFinite(value)) {
      item.pa += 1; item.denom += denominator; item.woba += value;
    }
    const exitVelocity = Number(row.launch_speed);
    if (Number.isFinite(exitVelocity) && exitVelocity > 0) { item.ev += exitVelocity; item.evN += 1; }
    grouped.set(code, item);
  }
  const ranked = [...grouped.entries()]
    .map(([code, item]) => ({ code, ...item, woba: item.denom ? item.woba / item.denom : null, avgEv: item.evN ? item.ev / item.evN : null }))
    .filter((item) => item.pa >= 5)
    .sort((a, b) => (b.woba ?? -1) - (a.woba ?? -1));
  if (!ranked.length) throw new Error(`Not enough Statcast plate appearances by pitch type for ${player.name} in the ${range.label}.`);
  const best = ranked[0];
  const stats = ranked.slice(0, 4).map((item) => ({
    label: PITCH_NAMES[item.code] ?? item.code,
    value: item.woba === null ? "—" : item.woba.toFixed(3),
    detail: `${item.pa} PA ending on pitch${item.avgEv ? ` • ${item.avgEv.toFixed(1)} mph EV` : ""}`,
  }));
  return {
    title: `${player.name} by pitch type`,
    entityName: player.name,
    timeframeLabel: range.label,
    primaryLabel: "Best pitch-type wOBA",
    primaryValue: `${PITCH_NAMES[best.code] ?? best.code} • ${best.woba?.toFixed(3) ?? "—"}`,
    stats,
    sampleLabel: `${rows.length.toLocaleString()} pitches seen`,
    source: "Baseball Savant Statcast",
    note: "Ranking uses wOBA on plate appearances that ended on each pitch type; minimum 5 qualifying plate appearances.",
  };
}

function answerForResult(result: WingmanGenericResult): string {
  const sample = result.sampleLabel ? ` Sample: ${result.sampleLabel}.` : "";
  return `${result.entityName}: ${result.primaryLabel} is ${result.primaryValue} for the ${result.timeframeLabel}.${sample}`;
}

router.post("/mlb/wingman", async (req, res): Promise<void> => {
  const parsed = PostMlbWingmanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const question = parsed.data.question.trim();
  const previous = (parsed.data.context ?? {}) as WingmanSearchContext;
  const explicitTimeframe = detectTimeframe(question);
  const timeframe: WingmanTimeframe = explicitTimeframe ?? previous.timeframe ?? "current_season";
  const detectedMetric = detectMetric(question);
  const metric = detectedMetric ?? previous.metric;
  const desiredGroup = metricGroup(metric);
  const detectedTeam = detectTeam(question);
  let context: WingmanSearchContext = { ...previous, sport: "MLB", timeframe };
  if (detectedMetric) context.metric = detectedMetric;

  try {
    if (!metric) {
      res.status(422).json({ error: "Tell Wingman which stat you want. Try ERA, WHIP, runs allowed, batting average, OPS, home runs, strikeouts, team runs per game, first-inning scoring, or a batter's pitch-type performance.", context });
      return;
    }

    let result: WingmanGenericResult;
    if (desiredGroup === "team") {
      const priorTeam = previous.entityType === "team" && previous.entityId
        ? MLB_TEAMS.find((team) => team.id === previous.entityId)
        : undefined;
      const team = detectedTeam ?? priorTeam;
      if (!team) {
        res.status(422).json({ error: "Which MLB team should I analyze?", context });
        return;
      }
      context = {
        ...context,
        entityType: "team",
        entityId: team.id,
        entityName: team.name,
        entityShortName: team.short,
        playerGroup: undefined,
        metric,
      };
      result = await buildTeamResult(team, metric, timeframe);
    } else {
      let player = null as Awaited<ReturnType<typeof resolvePlayer>>;
      if (previous.entityType === "player" && previous.entityId && !detectedMetric) {
        player = {
          id: previous.entityId,
          name: previous.entityName ?? "Player",
          group: previous.playerGroup ?? (desiredGroup === "pitcher" ? "pitcher" : "hitter"),
        };
      }
      if (!player || detectedMetric) {
        player = await resolvePlayer(question, desiredGroup === "pitcher" ? "pitcher" : "hitter");
      }
      if (!player && previous.entityType === "player" && previous.entityId) {
        player = {
          id: previous.entityId,
          name: previous.entityName ?? "Player",
          group: previous.playerGroup ?? (desiredGroup === "pitcher" ? "pitcher" : "hitter"),
        };
      }
      if (!player) {
        res.status(422).json({ error: `Which ${desiredGroup === "pitcher" ? "pitcher" : "hitter"} should I analyze? Include the player's name.`, context });
        return;
      }
      context = {
        ...context,
        entityType: "player",
        entityId: player.id,
        entityName: player.name,
        entityShortName: player.name,
        playerGroup: player.group,
        metric,
      };
      result = metric === "pitch_type_performance"
        ? await pitchTypePerformance(player, timeframe)
        : await buildPlayerResult(player, metric, timeframe);
    }

    res.json(PostMlbWingmanResponse.parse({
      question,
      context,
      timeframeExplicit: Boolean(explicitTimeframe),
      result,
      answer: answerForResult(result),
    }));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown MLB analytics error";
    req.log.error({ detail, metric, timeframe, context }, "Wingman MLB analytics failed");
    res.status(502).json({ error: "Wingman could not load that MLB statistic right now.", detail, context });
  }
});

type BettingWindow = "10" | "30" | "season";
type HistoricalBetGame = {
  date: string;
  opponent: string;
  location: "home" | "away";
  teamScore: number;
  opponentScore: number;
  spread: number | null;
  coverResult: "W" | "L" | "P" | null;
  moneyline: number | null;
  total: number | null;
  totalResult: "O" | "U" | "P" | null;
};

const BETTING_TEAMS: Record<string, { id: number; name: string }> = {
  PHI: { id: 143, name: "Philadelphia Phillies" }, NYY: { id: 147, name: "New York Yankees" },
  BOS: { id: 111, name: "Boston Red Sox" }, LAD: { id: 119, name: "Los Angeles Dodgers" },
  SD: { id: 135, name: "San Diego Padres" }, NYM: { id: 121, name: "New York Mets" },
  ATL: { id: 144, name: "Atlanta Braves" }, HOU: { id: 117, name: "Houston Astros" },
  CHC: { id: 112, name: "Chicago Cubs" }, SEA: { id: 136, name: "Seattle Mariners" },
  TOR: { id: 141, name: "Toronto Blue Jays" }, TEX: { id: 140, name: "Texas Rangers" },
};

function metric(label: string, rows: Array<"W" | "L" | "P">) {
  const wins = rows.filter((value) => value === "W").length;
  const losses = rows.filter((value) => value === "L").length;
  const pushes = rows.filter((value) => value === "P").length;
  const graded = wins + losses;
  return { label, rate: graded ? Math.round((wins / graded) * 1000) / 10 : null, wins, losses, pushes, sample: rows.length };
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
}

function canonicalTeamName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function officialGameDate(game: AnyRecord): string {
  const official = String(game.officialDate ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(official)) return official;
  return String(game.gameDate ?? "").slice(0, 10);
}

type HistoricalEspnMatch = {
  eventId: string;
  competition: AnyRecord;
};

function findHistoricalEspnCompetition(
  scoreboard: AnyRecord,
  mlbGame: AnyRecord,
  consumedEventIds: Set<string>,
): HistoricalEspnMatch | null {
  const teams = asRecord(mlbGame.teams);
  const expectedAway = canonicalTeamName(asRecord(asRecord(teams.away).team).name);
  const expectedHome = canonicalTeamName(asRecord(asRecord(teams.home).team).name);
  const scheduledStart = Date.parse(String(mlbGame.gameDate ?? ""));
  if (!expectedAway || !expectedHome || !Number.isFinite(scheduledStart)) return null;

  const candidates = (Array.isArray(scoreboard.events) ? scoreboard.events : [])
    .map((event: AnyRecord, index: number) => ({
      event,
      competition: asRecord(event.competitions?.[0]),
      eventId: String(event.id ?? event.uid ?? `event-${index}`),
    }))
    .filter(({ competition, eventId }: { competition: AnyRecord; eventId: string }) => {
      if (consumedEventIds.has(eventId)) return false;
      const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
      const away = competitors.find((competitor: AnyRecord) => competitor.homeAway === "away");
      const home = competitors.find((competitor: AnyRecord) => competitor.homeAway === "home");
      return canonicalTeamName(away?.team?.displayName ?? away?.team?.name) === expectedAway
        && canonicalTeamName(home?.team?.displayName ?? home?.team?.name) === expectedHome;
    })
    .sort(({ event: a, competition: aCompetition }: HistoricalEspnMatch & { event: AnyRecord }, { event: b, competition: bCompetition }: HistoricalEspnMatch & { event: AnyRecord }) => {
      const aStart = Date.parse(String(a.date ?? aCompetition.date ?? ""));
      const bStart = Date.parse(String(b.date ?? bCompetition.date ?? ""));
      return Math.abs(aStart - scheduledStart) - Math.abs(bStart - scheduledStart);
    });

  const selected = candidates[0];
  return selected ? { eventId: selected.eventId, competition: selected.competition } : null;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

router.get("/mlb/betting-trends", async (req, res): Promise<void> => {
  const parsed = GetMlbBettingTrendsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { team: teamAbbr, window } = parsed.data;
  const team = BETTING_TEAMS[teamAbbr];
  if (!team) {
    res.status(400).json({ error: "Choose a supported MLB team and timeframe." });
    return;
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const startDate = window === "season" ? `${year}-03-01` : dateDaysAgo(window === "10" ? 45 : 120);
  const endDate = isoDate(now);
  const targetCount = window === "10" ? 10 : window === "30" ? 30 : Number.POSITIVE_INFINITY;

  try {
    const scheduleParams = new URLSearchParams({ sportId: "1", teamId: String(team.id), startDate, endDate, gameType: "R" });
    const schedule = await fetchJson(`${MLB_URL}?${scheduleParams}`);
    const mlbGames = (Array.isArray(schedule.dates) ? schedule.dates : [])
      .flatMap((day: AnyRecord) => Array.isArray(day.games) ? day.games : [])
      .filter((game: AnyRecord) => String(game?.status?.detailedState ?? "").toLowerCase().includes("final"))
      .sort((a: AnyRecord, b: AnyRecord) => String(b.gameDate).localeCompare(String(a.gameDate)))
      .slice(0, targetCount);
    const dates = [...new Set(mlbGames.map((game: AnyRecord) => officialGameDate(game)))];
    const daily = await mapWithConcurrency(dates, 8, async (date) => {
      try {
        return { date, data: await fetchJson(`${ESPN_URL}?dates=${date.replaceAll("-", "")}`) };
      } catch {
        return { date, data: null as AnyRecord | null };
      }
    });
    const byDate = new Map(daily.map((entry) => [entry.date, entry.data]));
    const consumedEventsByDate = new Map<string, Set<string>>();
    const matchedGames: Array<{
      date: string;
      eventId: string;
      competition: AnyRecord;
    }> = [];

    for (const mlbGame of mlbGames) {
      const date = officialGameDate(mlbGame);
      const espn = byDate.get(date);
      if (!espn) continue;
      const consumedEventIds = consumedEventsByDate.get(date) ?? new Set<string>();
      consumedEventsByDate.set(date, consumedEventIds);
      const matched = findHistoricalEspnCompetition(espn, mlbGame, consumedEventIds);
      if (!matched) continue;
      const competition = matched.competition;
      const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
      const teamComp = competitors.find((competitor: AnyRecord) => String(competitor?.team?.abbreviation ?? "").toUpperCase() === teamAbbr);
      const opponentComp = competitors.find((competitor: AnyRecord) => competitor !== teamComp);
      if (!teamComp || !opponentComp) continue;
      const teamScore = Number(teamComp.score);
      const opponentScore = Number(opponentComp.score);
      if (!Number.isFinite(teamScore) || !Number.isFinite(opponentScore)) continue;
      consumedEventIds.add(matched.eventId);
      matchedGames.push({ date, eventId: matched.eventId, competition });
    }

    const historicalRows = await mapWithConcurrency(matchedGames, 8, async ({ date, eventId, competition }) => {
      let summaryOdds: AnyRecord | null = null;
      try {
        const summary = await fetchJson(`${ESPN_SUMMARY_URL}?event=${encodeURIComponent(eventId)}`);
        summaryOdds = parseEspnOddsRecord(asRecord(summary.pickcenter?.[0]));
      } catch {
        // The completed game can still be represented without a historical market line.
      }
      const odds = summaryOdds ?? parseEspnOdds(competition);
      const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
      const teamComp = competitors.find((competitor: AnyRecord) => String(competitor?.team?.abbreviation ?? "").toUpperCase() === teamAbbr);
      const opponentComp = competitors.find((competitor: AnyRecord) => competitor !== teamComp);
      if (!teamComp || !opponentComp) return null;
      const teamScore = Number(teamComp.score);
      const opponentScore = Number(opponentComp.score);
      if (!Number.isFinite(teamScore) || !Number.isFinite(opponentScore)) return null;
      const location = teamComp.homeAway === "home" ? "home" : "away";
      const spread = odds ? (location === "home" ? odds.homeSpread : odds.awaySpread) : null;
      const moneyline = odds ? (location === "home" ? odds.homeMoneyline : odds.awayMoneyline) : null;
      const total = odds?.total ?? null;
      const adjusted = typeof spread === "number" ? teamScore + spread : null;
      const coverResult = adjusted === null ? null : adjusted > opponentScore ? "W" : adjusted < opponentScore ? "L" : "P";
      const combined = teamScore + opponentScore;
      const totalResult = typeof total === "number" ? combined > total ? "O" : combined < total ? "U" : "P" : null;
      return {
        date,
        opponent: String(opponentComp.team?.abbreviation ?? opponentComp.team?.shortDisplayName ?? "OPP"),
        location,
        teamScore,
        opponentScore,
        spread: typeof spread === "number" ? spread : null,
        coverResult,
        moneyline: typeof moneyline === "number" ? moneyline : null,
        total: typeof total === "number" ? total : null,
        totalResult,
      } satisfies HistoricalBetGame;
    });
    const history = historicalRows.filter((game): game is HistoricalBetGame => game !== null);

    const withSpread = history.filter((game) => game.coverResult !== null);
    const overall = withSpread.map((game) => game.coverResult!) as Array<"W" | "L" | "P">;
    const home = withSpread.filter((game) => game.location === "home").map((game) => game.coverResult!) as Array<"W" | "L" | "P">;
    const favorites = withSpread.filter((game) => (game.spread ?? 0) < 0).map((game) => game.coverResult!) as Array<"W" | "L" | "P">;
    const underdogs = withSpread.filter((game) => (game.spread ?? 0) > 0).map((game) => game.coverResult!) as Array<"W" | "L" | "P">;
    const favoriteMoneyline = history.filter((game) => game.moneyline !== null && game.moneyline < 0).map((game) => game.teamScore > game.opponentScore ? "W" as const : "L" as const);
    const overs = history.filter((game) => game.totalResult !== null).map((game) => game.totalResult === "O" ? "W" as const : game.totalResult === "U" ? "L" as const : "P" as const);
    const gamesWithOdds = history.filter((game) => game.spread !== null || game.moneyline !== null || game.total !== null).length;

    res.json(GetMlbBettingTrendsResponse.parse({
      team: teamAbbr,
      teamName: team.name,
      window,
      windowLabel: window === "10" ? "Last 10 completed games" : window === "30" ? "Last 30 completed games" : `${year} regular season`,
      gamesReviewed: mlbGames.length,
      gamesWithOdds,
      metrics: {
        overallCover: metric("Overall cover", overall),
        homeCover: metric("At home", home),
        favoriteCover: metric("As favorite", favorites),
        underdogCover: metric("As underdog", underdogs),
        favoriteMoneylineWin: metric("Favorite ML wins", favoriteMoneyline),
        overRate: metric("Games over total", overs),
      },
      recent: history.filter((game) => game.spread !== null || game.total !== null).slice(0, 8),
      warning: gamesWithOdds < Math.min(5, mlbGames.length)
        ? "Historical odds are only counted when ESPN publishes a usable line for the completed game, so sample sizes can be smaller than the number of games reviewed."
        : null,
    }));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown betting-history error";
    req.log.error({ detail, teamAbbr, window }, "MLB betting trends failed");
    res.status(502).json({ error: "Wingman could not load historical betting lines right now.", detail });
  }
});

export default router;