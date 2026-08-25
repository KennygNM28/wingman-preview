import { Router, type IRouter } from "express";
import {
  GetCommunityFeedQueryParams,
  GetCommunityFeedResponse,
} from "@workspace/api-zod";
import { CURATED_X_BETTING_EXPERT_HANDLES } from "./community-experts";

const router: IRouter = Router();
const REDDIT_BASE_URL = "https://www.reddit.com";
const HACKER_NEWS_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date";
const ESPN_NEWS_FEEDS = [
  { label: "ESPN MLB", sport: "MLB", url: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news?limit=100" },
  { label: "ESPN NFL", sport: "NFL", url: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=100" },
  { label: "ESPN NBA", sport: "NBA", url: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=100" },
  { label: "ESPN NCAAF", sport: "NCAA", url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/news?limit=100" },
  { label: "ESPN NCAAB", sport: "NCAA", url: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/news?limit=100" },
  { label: "ESPN NHL", sport: "NHL", url: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news?limit=100" },
  { label: "ESPN WNBA", sport: "WNBA", url: "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/news?limit=100" },
] as const;
const COVERS_ODDSSHARK_URL = "https://www.covers.com/oddsshark";
const X_RECENT_SEARCH_URL = "https://api.x.com/2/tweets/search/recent";
const X_SEARCH_PAGE_URL =
  "https://x.com/search?q=%28moneyline%20OR%20spread%20OR%20total%20OR%20prop%20OR%20parlay%20OR%20odds%20OR%20pick%29&src=typed_query";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const HACKER_NEWS_BETTING_QUERIES = [
  "sports betting",
  "sportsbook odds",
  "MLB odds",
  "NBA odds",
  "NFL odds",
];

type AnyRecord = Record<string, any>;
type CommunitySection = "betting" | "news";

type CommunityPost = {
  id: string;
  source: string;
  community: string;
  author: string | null;
  headline: string;
  excerpt: string | null;
  publishedAt: string;
  url: string;
  score?: number | null;
  comments?: number | null;
  likes?: number | null;
  reposts?: number | null;
  isCuratedExpert: boolean;
  sport: string | null;
  market: string | null;
};

type ProviderResult = {
  source: string;
  sourceUrl: string;
  posts: CommunityPost[];
  warning: string | null;
};

const FEED_SOURCES: Record<
  CommunitySection,
  Array<{ subreddit: string; label: string }>
> = {
  betting: [
    { subreddit: "sportsbook", label: "Reddit · r/sportsbook" },
    { subreddit: "sportsbetting", label: "Reddit · r/sportsbetting" },
  ],
  news: [
    { subreddit: "sports", label: "Reddit · r/sports" },
    { subreddit: "baseball", label: "Reddit · r/baseball" },
    { subreddit: "nfl", label: "Reddit · r/nfl" },
    { subreddit: "nba", label: "Reddit · r/nba" },
    { subreddit: "CFB", label: "Reddit · r/CFB" },
    { subreddit: "CollegeBasketball", label: "Reddit · r/CollegeBasketball" },
  ],
};

const CURATED_X_EXPERTS = new Set(CURATED_X_BETTING_EXPERT_HANDLES);
const RECOGNIZED_BETTING_MEDIA_SOURCES = new Set(["X", "Covers / OddsShark"]);

const POLICY_TOPIC_PATTERN =
  /\b(?:policy|policies|legal(?:ity|ize|ized|ization)?|laws?|regulat(?:e|ed|ion|ions|ory)|legislat(?:e|ed|ion|ions)|tax(?:es|ation)?|licen[cs](?:e|ed|ing|es)|state launch(?:es|ed)?|court case|lawsuit|compliance|ballot measure|ban(?:ned)?|responsible gambling|problem gambling)\b/i;

const GAMBLING_CONTEXT_PATTERN =
  /\b(?:sports betting|betting|gambling|casino|sportsbook|sports book|wager(?:ing|s)?)\b/i;

const BETTING_SIGNAL_PATTERN =
  /\b(?:sports betting|sportsbook|sports book|betting|gambling|wager(?:ing|s)?|moneyline|money line|spread|against the spread|ats|total|over\/under|over under|o\/u|player prop|prop bet|props|parlay|same[- ]game parlay|first inning|first five|f5|pick(?:s)?|odds|line movement|steam move|units?|to win)\b/i;

const BETTING_AUTHOR_ROLE_PATTERN =
  /\b(?:sportsbook|sports book|betting[- ]?media|betting analyst|sports analyst|handicapper|capper|picks?|betting podcast|podcast|odds|wager(?:ing|s)?|tipster|sports show|sports host|sportswriter)\b/i;

const SPORTS_NEWS_AUTHOR_ROLE_PATTERN =
  /\b(?:sports reporter|reporter|insider|journalist|sportswriter|sports writer|beat writer|columnist|analyst|sports anchor|sports host|editor|correspondent)\b/i;

const CURATED_X_SPORTS_NEWS_HANDLES = new Set([
  "espn", "sportscenter", "adamschefter", "jeffpassan", "shamscharania",
  "mlb", "nfl", "nba", "nhl", "wnba", "fieldyates", "rapsheet",
  "jonmorosi", "ken_rosenthal", "wojespn",
]);

const INDUSTRY_BUSINESS_PATTERN =
  /\b(?:acquisition|acquired|merger|earnings|revenue|valuation|stock|shares|ipo|invest(?:or|ment)|funding|partnership|partnerships|business|industry|quarterly report|market report|corporate|company news)\b/i;

const MARKET_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Moneyline", pattern: /\b(?:moneyline|money line)\b/i },
  { label: "Spread", pattern: /\b(?:spread|against the spread|ats)\b/i },
  { label: "Total", pattern: /\b(?:total|over\/under|over under|o\/u)\b/i },
  { label: "Player prop", pattern: /\b(?:player prop|prop bet|props?)\b/i },
  { label: "Parlay", pattern: /\b(?:parlay|same[- ]game parlay)\b/i },
  { label: "First inning", pattern: /\b(?:first inning|1st inning|nrfi|yrfi)\b/i },
  { label: "First five innings", pattern: /\b(?:first five|1st five|f5)\b/i },
  { label: "Pick", pattern: /\b(?:pick|picks)\b/i },
  { label: "Odds", pattern: /\bodds\b/i },
  { label: "Line movement", pattern: /\b(?:line movement|steam move)\b/i },
  { label: "Units", pattern: /\bunits?\b/i },
];

const SPORT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "MLB", pattern: /\b(?:mlb|baseball|major league baseball)\b/i },
  { label: "NFL", pattern: /\b(?:nfl|football|major league football)\b/i },
  { label: "NBA", pattern: /\b(?:nba|basketball)\b/i },
  { label: "NHL", pattern: /\b(?:nhl|hockey)\b/i },
  { label: "WNBA", pattern: /\bwnba\b/i },
  { label: "MLS", pattern: /\b(?:mls|soccer|football league)\b/i },
  { label: "NCAA", pattern: /\b(?:ncaa|college basketball|college football)\b/i },
  { label: "UFC", pattern: /\b(?:ufc|mma)\b/i },
  { label: "Golf", pattern: /\b(?:pga|golf)\b/i },
  { label: "Tennis", pattern: /\btennis\b/i },
  { label: "NASCAR", pattern: /\bnascar\b/i },
  { label: "Formula 1", pattern: /\b(?:formula 1|f1)\b/i },
];

const UNAMBIGUOUS_TEAM_PATTERN =
  /\b(?:yankees|red sox|orioles|blue jays|guardians|tigers|white sox|royals|astros|angels|athletics|mariners|braves|marlins|mets|nationals|phillies|brewers|cubs|pirates|cardinals|diamondbacks|rockies|dodgers|padres|lakers|celtics|knicks|nets|bulls|bucks|warriors|suns|mavericks|chiefs|eagles|cowboys|49ers|seahawks|broncos|raiders|chargers|steelers|ravens|bengals|browns|penguins|bruins|maple leafs|canadiens|avalanche|red wings|blackhawks|oilers|knights|flames|islanders|devils|sabres|predators|blues|nyy|nym|lad|atl|tb|det|hou|sea|sd|sf|lal|gsw|phx)\b/i;

const AMBIGUOUS_TEAM_PATTERN =
  /\b(?:rays|twins|rangers|giants|heat|stars|bills|bears|jets|wild|lions|dolphins|packers|vikings|reds|mariners|clippers|thunder|magic|pelicans|hawks)\b/i;

const NAMED_MATCHUP_PATTERN =
 /\b[A-Z][A-Za-z.'-]{2,}(?:\s+[A-Z][A-Za-z.'-]{2,}){0,2}\s+(?:vs\.?|at|@)\s+[A-Z][A-Za-z.'-]{2,}/;

const GENERIC_PROPER_NOUNS = new Set([
  "sports betting",
  "responsible gambling",
  "legal sports",
  "first five",
]);

const NON_PLAYER_PROPER_NOUN_TOKENS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "jan",
  "january",
  "feb",
  "february",
  "mar",
  "march",
  "apr",
  "april",
  "may",
  "jun",
  "june",
  "jul",
  "july",
  "aug",
  "august",
  "sep",
  "sept",
  "september",
  "oct",
  "october",
  "nov",
  "november",
  "dec",
  "december",
  "week",
  "today",
  "tomorrow",
  "predictions",
  "picks",
  "odds",
]);

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compactText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact || null;
}

function excerpt(value: unknown): string | null {
  const compact = compactText(value);
  if (!compact) return null;
  return compact.length > 280 ? `${compact.slice(0, 277)}...` : compact;
}

function validIsoTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  if (typeof value === "string") {
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds)
      ? new Date(milliseconds).toISOString()
      : null;
  }

  return null;
}

function isRecent(timestamp: string, now: number): boolean {
  const milliseconds = Date.parse(timestamp);
  return (
    Number.isFinite(milliseconds) &&
    milliseconds > now - TWENTY_FOUR_HOURS_MS &&
    milliseconds <= now
  );
}

function normalizeHandle(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^@/, "").toLowerCase();
  return normalized || null;
}

function isCuratedXExpert(author: string | null): boolean {
  const handle = normalizeHandle(author);
  return Boolean(handle && CURATED_X_EXPERTS.has(handle));
}

function isRecognizedBettingAuthor(
  source: string,
  author: string | null,
  profileText: string | null,
  verified: boolean,
): boolean {
  if (source !== "X") return false;

  const profile = profileText ?? "";
  const hasBettingFocus = BETTING_SIGNAL_PATTERN.test(profile);
  const hasRecognizedRole = BETTING_AUTHOR_ROLE_PATTERN.test(profile);

  return (
    isCuratedXExpert(author) ||
    (hasBettingFocus && (hasRecognizedRole || verified))
  );
}

function identifyMarket(text: string): string | null {
  return MARKET_PATTERNS.find(({ pattern }) => pattern.test(text))?.label ?? null;
}

function identifySport(text: string): string | null {
  return SPORT_PATTERNS.find(({ pattern }) => pattern.test(text))?.label ?? null;
}

function isPolicyChatter(text: string): boolean {
  return (
    /\b(?:responsible gambling|problem gambling)\b/i.test(text) ||
    POLICY_TOPIC_PATTERN.test(text) ||
    INDUSTRY_BUSINESS_PATTERN.test(text)
  );
}

function hasNamedPlayerOrMatchup(text: string): boolean {
  if (NAMED_MATCHUP_PATTERN.test(text)) return true;

  const properNounPairs = text.match(
    /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+\b/g,
  );
  return Boolean(
    properNounPairs?.some(
      (pair) =>
        !GENERIC_PROPER_NOUNS.has(pair.toLowerCase()) &&
        !pair
          .toLowerCase()
          .split(/\s+/)
          .some((token) => NON_PLAYER_PROPER_NOUN_TOKENS.has(token)),
    ),
  );
}

function isClearlySpecificBet(text: string): boolean {
  const market = identifyMarket(text);
  if (!market || isPolicyChatter(text)) return false;

  const hasSport = identifySport(text) !== null;
  return (
    UNAMBIGUOUS_TEAM_PATTERN.test(text) ||
    (hasSport &&
      (AMBIGUOUS_TEAM_PATTERN.test(text) || hasNamedPlayerOrMatchup(text)))
  );
}

function hasMeaningfulPublicEngagement(post: CommunityPost): boolean {
  const comments = post.comments ?? 0;
  const score = post.score ?? 0;
  const reactions = (post.likes ?? 0) + (post.reposts ?? 0);
  return comments >= 1 || score >= 2 || reactions >= 2;
}

function isEligibleBettingPost(post: CommunityPost): boolean {
  const text = [post.headline, post.excerpt].filter(Boolean).join(" ");
  if (isPolicyChatter(text)) return false;

  const bettingContext = [text, post.sport, post.market]
    .filter(Boolean)
    .join(" ");
  const hasConcreteReference = isClearlySpecificBet(bettingContext);
  const isRecognizedAuthor =
    RECOGNIZED_BETTING_MEDIA_SOURCES.has(post.source) &&
    post.isCuratedExpert &&
    BETTING_SIGNAL_PATTERN.test(bettingContext);

  return (
    hasConcreteReference &&
    (isRecognizedAuthor || hasMeaningfulPublicEngagement(post))
  );
}

function isEligibleNewsPost(post: CommunityPost): boolean {
  const text = [post.headline, post.excerpt].filter(Boolean).join(" ");
  const isTrustedPublisher = post.source.startsWith("ESPN");
  const isRecognizedAuthor =
    post.source === "X" &&
    (post.isCuratedExpert || CURATED_X_SPORTS_NEWS_HANDLES.has((post.author ?? "").replace(/^@/, "").toLowerCase()));
  const communityEligible =
    post.source === "Reddit" || post.source === "Hacker News"
      ? hasMeaningfulPublicEngagement(post)
      : true;
  return (
    !isPolicyChatter(text) &&
    !BETTING_SIGNAL_PATTERN.test(text) &&
    Boolean(post.headline.trim()) &&
    (isTrustedPublisher || isRecognizedAuthor || communityEligible)
  );
}

export const communityFilterTestUtils = {
  coversArticleToResponse,
  easternTimeToIso,
  filterAndSortPosts,
  hasMeaningfulPublicEngagement,
  isClearlySpecificBet,
  isCuratedXExpert,
  isEligibleBettingPost,
  isEligibleNewsPost,
  isRecognizedBettingAuthor,
  isPolicyChatter,
};

function filterAndSortPosts(
  posts: CommunityPost[],
  section: CommunitySection,
  now: number,
): CommunityPost[] {
  return posts
    .filter((post) => isRecent(post.publishedAt, now))
    .filter((post) =>
      section === "betting"
        ? isEligibleBettingPost(post)
        : isEligibleNewsPost(post),
    )
    .sort(
      (a, b) =>
        Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    )
    .slice(0, section === "news" ? 25 : 15);
}

function redditPostToResponse(post: AnyRecord): CommunityPost | null {
  const data = asRecord(post.data);
  const id = typeof data.name === "string"
    ? data.name
    : typeof data.id === "string"
      ? data.id
      : null;
  const author =
    typeof data.author === "string" && data.author !== "[deleted]"
      ? data.author
      : null;
  const timestamp = validIsoTimestamp(data.created_utc);
  const permalink =
    typeof data.permalink === "string" ? data.permalink : null;
  const headline = compactText(data.title);
  const community =
    typeof data.subreddit === "string" ? `r/${data.subreddit}` : null;

  if (!id || !timestamp || !permalink || !headline || !community) return null;

  const text = [headline, compactText(data.selftext)].filter(Boolean).join(" ");
  return {
    id,
    source: "Reddit",
    community,
    author,
    headline,
    excerpt: excerpt(data.selftext),
    publishedAt: timestamp,
    url: `${REDDIT_BASE_URL}${permalink}`,
    score: asNumber(data.score),
    comments: asNumber(data.num_comments),
    isCuratedExpert: false,
    sport: identifySport(text),
    market: identifyMarket(text),
  };
}

async function fetchRedditSubreddit(subreddit: string): Promise<AnyRecord[]> {
  const response = await fetch(
    `${REDDIT_BASE_URL}/r/${subreddit}/new.json?limit=100&raw_json=1`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "WingmanSports/1.0 public discovery feed",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Reddit returned ${response.status}`);
  }

  const payload = asRecord(await response.json());
  const listing = asRecord(payload.data);
  return Array.isArray(listing.children) ? listing.children : [];
}

async function fetchRedditSources(
  section: CommunitySection,
  now: number,
  req: { log: { warn: (data: AnyRecord, message: string) => void } },
): Promise<ProviderResult | null> {
  const sources = FEED_SOURCES[section];
  const results = await Promise.allSettled(
    sources.map(async (source) => ({
      source,
      posts: await fetchRedditSubreddit(source.subreddit),
    })),
  );
  const successful = results.filter(
    (result): result is PromiseFulfilledResult<{
      source: (typeof sources)[number];
      posts: AnyRecord[];
    }> => result.status === "fulfilled",
  );
  const failures = results
    .map((result, index) =>
      result.status === "rejected"
        ? `${sources[index].subreddit}: ${
            result.reason instanceof Error
              ? result.reason.message
              : "unknown error"
          }`
        : null,
    )
    .filter((failure): failure is string => failure !== null);

  failures.forEach((detail) => {
    req.log.warn({ section, detail }, "Public discovery source failed");
  });

  if (successful.length === 0) return null;

  const sourceLabels = successful.map(({ value }) => value.source.label);
  const posts = filterAndSortPosts(
    successful
      .flatMap(({ value }) => value.posts)
      .map(redditPostToResponse)
      .filter((post): post is CommunityPost => post !== null),
    section,
    now,
  );

  return {
    source: sourceLabels.join(" + "),
    sourceUrl: `${REDDIT_BASE_URL}/r/${sources[0].subreddit}/`,
    posts,
    warning:
      failures.length > 0
        ? `Some public ${section} feeds were unavailable; showing the sources that responded.`
        : null,
  };
}

async function fetchHackerNewsBetting(): Promise<AnyRecord[]> {
  const results = await Promise.allSettled(
    HACKER_NEWS_BETTING_QUERIES.map(async (query) => {
      const params = new URLSearchParams({
        query,
        tags: "story",
        hitsPerPage: "100",
      });
      const response = await fetch(`${HACKER_NEWS_SEARCH_URL}?${params}`, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "WingmanSports/1.0 public discovery feed",
        },
      });
      if (!response.ok) {
        throw new Error(`Hacker News search returned ${response.status}`);
      }
      const payload = asRecord(await response.json());
      return Array.isArray(payload.hits) ? payload.hits : [];
    }),
  );

  const postsById = new Map<string, AnyRecord>();
  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.forEach((post) => {
      if (typeof post.objectID === "string") postsById.set(post.objectID, post);
    });
  });

  if (postsById.size === 0) {
    throw new Error("Hacker News searches returned no posts");
  }

  return [...postsById.values()];
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/\s+/g, " ")
    .trim();
}

function easternTimeToIso(value: string): string | null {
  const match = value.match(
    /(\d{2})\/(\d{2})\/(\d{4})\s*[\s\S]*?(\d{2}):(\d{2})\s*ET/i,
  );
  if (!match) return null;

  const [, month, day, year, hour, minute] = match.map(Number);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (const easternOffsetHours of [4, 5]) {
    const candidate = new Date(
      Date.UTC(year, month - 1, day, hour, minute) +
        easternOffsetHours * 60 * 60 * 1000,
    );
    const parts = Object.fromEntries(
      formatter
        .formatToParts(candidate)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hour &&
      parts.minute === minute
    ) {
      return candidate.toISOString();
    }
  }

  return null;
}

function coversArticleToResponse(article: string): CommunityPost | null {
  const league = decodeHtml(
    article.match(/<span class="LH-league">([\s\S]*?)<\/span>/i)?.[1] ?? "",
  );
  const timestamp = easternTimeToIso(
    decodeHtml(
      article.match(
        /<span class="LH-datetime">([\s\S]*?)<\/span>\s*<\/div>/i,
      )?.[1] ?? "",
    ),
  );
  const titleMatch = article.match(
    /<p class="LH-title"><a href="([^"]+)">([\s\S]*?)<\/a>/i,
  );
  const summary = decodeHtml(
    article.match(/<span class="sr-only">([\s\S]*?)<\/span>\s*Read more/i)?.[1] ??
      "",
  );
  const url = titleMatch?.[1] ? decodeHtml(titleMatch[1]) : null;
  const headline = titleMatch?.[2] ? decodeHtml(titleMatch[2]) : null;
  if (!timestamp || !url || !headline) return null;

  const text = [headline, summary].filter(Boolean).join(" ");
  const sport =
    {
      MLB: "MLB",
      NFL: "NFL",
      NBA: "NBA",
      NHL: "NHL",
      WNBA: "WNBA",
      NCAAF: "NCAA",
      NCAAB: "NCAA",
    }[league.toUpperCase()] ?? identifySport(text);
  const id = `covers-${new URL(url).pathname.replace(/\W+/g, "-")}`;

  return {
    id,
    source: "Covers / OddsShark",
    community: "Covers Betting News",
    author: "Covers",
    headline,
    excerpt: excerpt(summary),
    publishedAt: timestamp,
    url,
    isCuratedExpert: true,
    sport,
    market: identifyMarket(text),
  };
}

async function fetchCoversBetting(now: number): Promise<ProviderResult> {
  const response = await fetch(COVERS_ODDSSHARK_URL, {
    cache: "no-store",
    headers: {
      Accept: "text/html",
      "User-Agent": "WingmanSports/1.0 public discovery feed",
    },
  });
  if (!response.ok) {
    throw new Error(`Covers returned ${response.status}`);
  }

  const html = await response.text();
  const articles = [...html.matchAll(/<article class="single-article-LH">([\s\S]*?)<\/article>/gi)]
    .map((match) => coversArticleToResponse(match[0]))
    .filter((post): post is CommunityPost => post !== null);

  return {
    source: "Covers / OddsShark",
    sourceUrl: COVERS_ODDSSHARK_URL,
    posts: filterAndSortPosts(articles, "betting", now),
    warning: null,
  };
}

function hackerNewsPostToResponse(post: AnyRecord): CommunityPost | null {
  const itemId = typeof post.objectID === "string" ? post.objectID : null;
  const headline = compactText(post.title ?? post.story_title);
  const timestamp = validIsoTimestamp(post.created_at);
  if (!itemId || !headline || !timestamp) return null;

  const text = [headline, compactText(post.story_text)].filter(Boolean).join(" ");
  return {
    id: `hn-${itemId}`,
    source: "Hacker News",
    community: "Hacker News",
    author: typeof post.author === "string" ? post.author : null,
    headline,
    excerpt: excerpt(post.story_text),
    publishedAt: timestamp,
    url:
      typeof post.url === "string" && post.url.length > 0
        ? post.url
        : `https://news.ycombinator.com/item?id=${itemId}`,
    score: asNumber(post.points),
    comments: asNumber(post.num_comments),
    isCuratedExpert: false,
    sport: identifySport(text),
    market: identifyMarket(text),
  };
}

async function fetchEspnNews(feed: (typeof ESPN_NEWS_FEEDS)[number]): Promise<CommunityPost[]> {
  const response = await fetch(feed.url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "WingmanSports/1.0 public discovery feed",
    },
  });
  if (!response.ok) {
    throw new Error(`${feed.label} news returned ${response.status}`);
  }
  const payload = asRecord(await response.json());
  return (Array.isArray(payload.articles) ? payload.articles : [])
    .map((article: AnyRecord) => espnArticleToResponse(article, feed))
    .filter((post): post is CommunityPost => post !== null);
}

function espnArticleToResponse(article: AnyRecord, feed: (typeof ESPN_NEWS_FEEDS)[number]): CommunityPost | null {
  const links = asRecord(asRecord(article.links).web);
  const id = typeof article.id === "string" ? article.id : null;
  const headline = compactText(article.headline);
  const timestamp = validIsoTimestamp(article.published);
  const url = typeof links.href === "string" ? links.href : null;
  if (!id || !headline || !timestamp || !url) return null;

  const text = [headline, compactText(article.description)]
    .filter(Boolean)
    .join(" ");
  return {
    id: `espn-${feed.label.toLowerCase().replace(/\s+/g, "-")}-${id}`,
    source: "ESPN News",
    community: feed.label,
    author: typeof article.byline === "string" ? article.byline : null,
    headline,
    excerpt: excerpt(article.description),
    publishedAt: timestamp,
    url,
    isCuratedExpert: false,
    sport: feed.sport,
    market: identifyMarket(text),
  };
}

function xAuthorUrl(username: string | null, id: string): string {
  return username
    ? `https://x.com/${username}/status/${id}`
    : `https://x.com/i/web/status/${id}`;
}

async function fetchXBettingPosts(now: number): Promise<ProviderResult> {
  const token = process.env.X_BEARER_TOKEN?.trim();
  if (!token) {
    throw new Error("X_BEARER_TOKEN is not configured");
  }

  const params = new URLSearchParams({
    query:
      "(moneyline OR spread OR total OR prop OR parlay OR odds OR pick OR units) (MLB OR NBA OR NFL OR NHL OR WNBA OR baseball OR basketball OR football OR hockey OR soccer) -is:retweet lang:en",
    max_results: "100",
    "tweet.fields": "created_at,public_metrics,author_id,text",
    expansions: "author_id",
    "user.fields": "username,name,description,verified",
  });
  const response = await fetch(`${X_RECENT_SEARCH_URL}?${params}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`X recent search returned ${response.status}`);
  }

  const payload = asRecord(await response.json());
  const users: AnyRecord[] = Array.isArray(asRecord(payload.includes).users)
    ? asRecord(payload.includes).users
    : [];
  const usersById = new Map<string, AnyRecord>();
  users.forEach((user) => {
    const id = typeof user.id === "string" ? user.id : null;
    if (id) usersById.set(id, user);
  });
  const posts = Array.isArray(payload.data)
    ? payload.data
        .map((post: AnyRecord): CommunityPost | null => {
          const id = typeof post.id === "string" ? post.id : null;
          const text = compactText(post.text);
          const timestamp = validIsoTimestamp(post.created_at);
          if (!id || !text || !timestamp) return null;

          const user = asRecord(usersById.get(String(post.author_id)));
          const author =
            typeof user.username === "string" ? user.username : null;
          const profileText = [compactText(user.name), compactText(user.description)]
            .filter(Boolean)
            .join(" ");
          const metrics = asRecord(post.public_metrics);
          const title = text.length > 140 ? `${text.slice(0, 137)}...` : text;
          return {
            id: `x-${id}`,
            source: "X",
            community: "X",
            author,
            headline: title,
            excerpt: text === title ? null : text,
            publishedAt: timestamp,
            url: xAuthorUrl(author, id),
            score: null,
            comments: asNumber(metrics.reply_count),
            likes: asNumber(metrics.like_count),
            reposts: asNumber(metrics.retweet_count),
            isCuratedExpert: isRecognizedBettingAuthor(
              "X",
              author,
              profileText || null,
              user.verified === true,
            ),
            sport: identifySport(text),
            market: identifyMarket(text),
          };
        })
        .filter((post): post is CommunityPost => post !== null)
    : [];

  return {
    source: "X",
    sourceUrl: X_SEARCH_PAGE_URL,
    posts: filterAndSortPosts(posts, "betting", now),
    warning: null,
  };
}

function combineWarnings(...warnings: Array<string | null>): string | null {
  const combined = warnings.filter((warning): warning is string => Boolean(warning));
  return combined.length > 0 ? combined.join(" ") : null;
}

function buildFallbackWarning(
  section: CommunitySection,
  source: string,
  reasons: string[],
): string {
  const scope =
    section === "betting"
      ? "qualifying sports-betting analysis"
      : "sport-specific news";
  return `${reasons.join(" ")} Showing ${scope} from ${source} published in the past 24 hours.`;
}

async function fetchNewsAggregate(
  now: number,
  req: { log: { warn: (data: AnyRecord, message: string) => void } },
): Promise<ProviderResult> {
  const settled = await Promise.allSettled([
    ...ESPN_NEWS_FEEDS.map((feed) => fetchEspnNews(feed)),
    fetchRedditSources("news", now, req).then((result) => result?.posts ?? []),
  ]);
  const posts: CommunityPost[] = [];
  const failures: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      posts.push(...result.value);
    } else if (index < ESPN_NEWS_FEEDS.length) {
      failures.push(`${ESPN_NEWS_FEEDS[index].label} was unavailable.`);
    } else {
      failures.push("Reddit was unavailable.");
    }
  });
  const filtered = filterAndSortPosts(posts, "news", now);
  return {
    source: "Public sports news",
    sourceUrl: "https://www.espn.com/",
    posts: filtered,
    warning: filtered.length
      ? (failures.length ? `${failures.join(" ")} Feed shows verified public sports coverage from available sources.` : null)
      : `No qualifying sport news was found in the past 24 hours. ${failures.join(" ")}`,
  };
}

router.get("/community", async (req, res): Promise<void> => {
  const parsed = GetCommunityFeedQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Choose either the betting or news community section.",
      detail: parsed.error.message,
    });
    return;
  }

  const section = parsed.data.section as CommunitySection;
  const now = Date.now();

  if (section === "news") {
    const aggregate = await fetchNewsAggregate(now, req);
    res.json(GetCommunityFeedResponse.parse({ section, ...aggregate }));
    return;
  }

  const fallbackReasons: string[] = [];

  if (section === "betting" && process.env.X_BEARER_TOKEN?.trim()) {
    try {
      const xResult = await fetchXBettingPosts(now);
      if (xResult.posts.length > 0) {
        res.json(GetCommunityFeedResponse.parse({ section, ...xResult }));
        return;
      }
      fallbackReasons.push("X returned no qualifying recent posts.");
    } catch (error) {
      req.log.warn(
        {
          section,
          detail: error instanceof Error ? error.message : "Unknown X error",
        },
        "X betting provider failed",
      );
      fallbackReasons.push("X was unavailable.");
    }
  }

  const redditResult = await fetchRedditSources(section, now, req);
  if (redditResult?.posts.length) {
    res.json(
      GetCommunityFeedResponse.parse({
        section,
        ...redditResult,
        warning: combineWarnings(
          redditResult.warning,
          fallbackReasons.join(" ") || null,
        ),
      }),
    );
    return;
  }
  if (redditResult) {
    fallbackReasons.push("Reddit returned no qualifying recent posts.");
  } else {
    fallbackReasons.push("Reddit was unavailable.");
  }

  if (section === "betting") {
    try {
      const coversResult = await fetchCoversBetting(now);
      if (coversResult.posts.length > 0) {
        res.json(
          GetCommunityFeedResponse.parse({
            section,
            ...coversResult,
            warning: buildFallbackWarning(
              section,
              "Covers / OddsShark",
              fallbackReasons,
            ),
          }),
        );
        return;
      }
      fallbackReasons.push("Covers returned no qualifying recent posts.");
    } catch (error) {
      req.log.warn(
        {
          section,
          detail: error instanceof Error ? error.message : "Unknown Covers error",
        },
        "Covers betting provider failed",
      );
      fallbackReasons.push("Covers was unavailable.");
    }
  }

  try {
    if (section === "betting") {
      const posts = filterAndSortPosts(
        (await fetchHackerNewsBetting())
          .map(hackerNewsPostToResponse)
          .filter((post): post is CommunityPost => post !== null),
        section,
        now,
      );
      res.json(
        GetCommunityFeedResponse.parse({
          section,
          source: "Hacker News",
          sourceUrl: "https://news.ycombinator.com/",
          posts,
          warning:
            posts.length > 0
              ? buildFallbackWarning(section, "Hacker News", fallbackReasons)
              : `No qualifying sports-betting posts were found in the past 24 hours. ${fallbackReasons.join(" ")}`,
        }),
      );
      return;
    }

    res.json(
      GetCommunityFeedResponse.parse({
        section,
        source: "Public sports news feeds",
        sourceUrl: "https://www.espn.com/",
        posts: [],
        warning: `No qualifying sport news was found in the past 24 hours. ${fallbackReasons.join(" ")}`,
      }),
    );
    return;
  } catch (error) {
    req.log.warn(
      {
        section,
        detail: error instanceof Error ? error.message : "Unknown fallback error",
      },
      "Public discovery fallback failed",
    );
  }

  res.json(
    GetCommunityFeedResponse.parse({
      section,
      source: section === "betting" ? "Public betting feeds" : "Public sports news feeds",
      sourceUrl: section === "betting" ? REDDIT_BASE_URL : "https://www.espn.com/mlb/",
      posts: [],
      warning: `No qualifying ${section === "betting" ? "sports-betting analysis" : "sport news"} was available from public sources in the past 24 hours.`,
    }),
  );
});

export default router;