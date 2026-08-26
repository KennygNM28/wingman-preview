import { Router, type IRouter } from "express";
import {
  GetCommunityFeedQueryParams,
  GetCommunityFeedResponse,
} from "@workspace/api-zod";
import { CURATED_X_BETTING_EXPERT_HANDLES } from "./community-experts.js";

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

function rec(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

function arr(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.map(rec) : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanText(value: unknown): string {
  return str(value).replace(/\s+/g, " ").trim();
}

function stripHtml(value: unknown): string {
  return cleanText(
    str(value)
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">"),
  );
}

function toIso(value: unknown): string {
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function recentEnough(value: unknown): boolean {
  const time = new Date(value as any).getTime();
  return Number.isFinite(time) && Date.now() - time <= TWENTY_FOUR_HOURS_MS;
}

function bettingRelevant(text: string): boolean {
  return /(bet|betting|sportsbook|odds|spread|moneyline|total|over\/under|over under|prop|parlay|pick|unit|line movement|best bet|wager)/i.test(text);
}

function legalizationOnly(text: string): boolean {
  return /(legalization|legalize|legislation|bill passed|state legislature|sports betting law|gambling law|regulation only)/i.test(text) && !/(pick|odds|spread|moneyline|prop|parlay|bet of the day|best bet)/i.test(text);
}

function sportFromText(text: string): string | null {
  if (/\bmlb\b|baseball/i.test(text)) return "MLB";
  if (/\bnfl\b|football/i.test(text)) return "NFL";
  if (/\bnba\b|basketball/i.test(text)) return "NBA";
  if (/college football|\bncaaf\b/i.test(text)) return "NCAA";
  if (/college basketball|\bncaab\b|march madness/i.test(text)) return "NCAA";
  if (/\bnhl\b|hockey/i.test(text)) return "NHL";
  if (/\bwnba\b/i.test(text)) return "WNBA";
  return null;
}

function scoreItem(item: AnyRecord): number {
  const engagement = num(item.engagementScore);
  const published = new Date(item.publishedAt ?? 0).getTime();
  const freshness = Number.isFinite(published) ? Math.max(0, 24 - (Date.now() - published) / 3_600_000) : 0;
  const bettingBoost = item.section === "betting" ? 25 : 0;
  return engagement + freshness + bettingBoost;
}

function dedupe(items: AnyRecord[]): AnyRecord[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = cleanText(item.url || item.title).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson(url: string, init?: RequestInit): Promise<AnyRecord> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "WingmanSports/2.0",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  return rec(await response.json());
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "WingmanSports/2.0",
    },
  });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  return response.text();
}

async function getRedditItems(): Promise<AnyRecord[]> {
  const subs = ["sportsbook", "sportsbetting", "mlb", "nfl", "nba", "collegebasketball", "cfb"];
  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      const payload = await fetchJson(`${REDDIT_BASE_URL}/r/${sub}/new.json?limit=40&raw_json=1`);
      return arr(rec(payload.data).children).map((child) => {
        const data = rec(child.data);
        const title = cleanText(data.title);
        const body = cleanText(data.selftext);
        const text = `${title} ${body}`;
        const created = new Date(num(data.created_utc) * 1000).toISOString();
        const section: CommunitySection = bettingRelevant(text) || sub.includes("bet") || sub === "sportsbook" ? "betting" : "news";
        return {
          id: `reddit-${str(data.id)}`,
          section,
          sourceType: "Reddit",
          sourceLabel: `r/${sub}`,
          author: str(data.author),
          title,
          summary: body.slice(0, 280),
          url: `${REDDIT_BASE_URL}${str(data.permalink)}`,
          publishedAt: created,
          sport: sportFromText(text),
          engagementScore: num(data.score) + num(data.num_comments) * 2,
          comments: num(data.num_comments),
          relevanceReason: section === "betting" ? "Recent sports-betting discussion" : "Recent sport discussion",
        };
      });
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

async function getEspnItems(): Promise<AnyRecord[]> {
  const results = await Promise.allSettled(
    ESPN_NEWS_FEEDS.map(async (feed) => {
      const payload = await fetchJson(feed.url);
      const articles = Array.isArray(payload.articles) ? payload.articles : [];
      return articles.map((raw: any) => {
        const article = rec(raw);
        const title = cleanText(article.headline);
        const summary = cleanText(article.description);
        const publishedAt = toIso(article.published ?? article.lastModified);
        const link = arr(article.links).find((x) => x?.rel === "web")?.href ?? rec(article.links).web?.href ?? rec(article.links).api?.href ?? "";
        const text = `${title} ${summary}`;
        return {
          id: `espn-${str(article.id) || Buffer.from(title).toString("base64url")}`,
          section: bettingRelevant(text) ? "betting" : "news",
          sourceType: "News",
          sourceLabel: feed.label,
          author: cleanText(article.byline),
          title,
          summary,
          url: str(link),
          publishedAt,
          sport: feed.sport,
          engagementScore: 20,
          comments: 0,
          relevanceReason: bettingRelevant(text) ? "Sport-specific betting coverage" : "Recent sport news",
        };
      });
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

async function getHackerNewsItems(): Promise<AnyRecord[]> {
  const results = await Promise.allSettled(
    HACKER_NEWS_BETTING_QUERIES.map(async (query) => {
      const payload = await fetchJson(`${HACKER_NEWS_SEARCH_URL}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=30`);
      return arr(payload.hits).map((hit) => {
        const title = cleanText(hit.title);
        const publishedAt = toIso(hit.created_at);
        return {
          id: `hn-${str(hit.objectID)}`,
          section: "betting" as const,
          sourceType: "Community",
          sourceLabel: "Hacker News",
          author: str(hit.author),
          title,
          summary: "",
          url: str(hit.url) || `https://news.ycombinator.com/item?id=${str(hit.objectID)}`,
          publishedAt,
          sport: sportFromText(title),
          engagementScore: num(hit.points) + num(hit.num_comments) * 2,
          comments: num(hit.num_comments),
          relevanceReason: "Recent betting-related discussion",
        };
      });
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

async function getCoversItems(): Promise<AnyRecord[]> {
  try {
    const html = await fetchText(COVERS_ODDSSHARK_URL);
    const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    return links
      .map((m, i) => {
        const title = stripHtml(m[2]);
        const href = str(m[1]);
        const url = href.startsWith("http") ? href : href.startsWith("/") ? `https://www.covers.com${href}` : "";
        return {
          id: `covers-${i}-${Buffer.from(url || title).toString("base64url").slice(0, 18)}`,
          section: "betting" as const,
          sourceType: "Betting",
          sourceLabel: "Covers",
          author: "",
          title,
          summary: "",
          url,
          publishedAt: new Date().toISOString(),
          sport: sportFromText(title),
          engagementScore: 15,
          comments: 0,
          relevanceReason: "Sports betting coverage",
        };
      })
      .filter((x) => x.title.length > 18 && bettingRelevant(x.title) && x.url)
      .slice(0, 30);
  } catch {
    return [];
  }
}

async function getXItems(): Promise<AnyRecord[]> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return [];
  const handles = CURATED_X_BETTING_EXPERT_HANDLES.slice(0, 8);
  if (!handles.length) return [];
  const authorQuery = handles.map((h) => `from:${h}`).join(" OR ");
  const query = `(${authorQuery}) (moneyline OR spread OR total OR prop OR parlay OR odds OR pick) -is:retweet`;
  try {
    const payload = await fetchJson(
      `${X_RECENT_SEARCH_URL}?query=${encodeURIComponent(query)}&max_results=100&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username,name`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const users = new Map(arr(rec(payload.includes).users).map((u) => [str(u.id), u]));
    return arr(payload.data).map((tweet) => {
      const user = users.get(str(tweet.author_id)) ?? {};
      const text = cleanText(tweet.text);
      const metrics = rec(tweet.public_metrics);
      const username = str(user.username);
      return {
        id: `x-${str(tweet.id)}`,
        section: "betting" as const,
        sourceType: "Social",
        sourceLabel: "X",
        author: str(user.name) || username,
        title: text.slice(0, 180),
        summary: text,
        url: username ? `https://x.com/${username}/status/${str(tweet.id)}` : X_SEARCH_PAGE_URL,
        publishedAt: toIso(tweet.created_at),
        sport: sportFromText(text),
        engagementScore: num(metrics.like_count) + num(metrics.retweet_count) * 2 + num(metrics.reply_count) * 2,
        comments: num(metrics.reply_count),
        relevanceReason: "Recent post from a curated betting account",
      };
    });
  } catch {
    return [];
  }
}

router.get("/community/feed", async (req, res) => {
  const parsed = GetCommunityFeedQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters", detail: parsed.error.message });
    return;
  }
  const requested = parsed.data.section;
  const [reddit, espn, hn, covers, x] = await Promise.all([
    getRedditItems(),
    getEspnItems(),
    getHackerNewsItems(),
    getCoversItems(),
    getXItems(),
  ]);
  const items = dedupe([...reddit, ...espn, ...hn, ...covers, ...x])
    .filter((item) => recentEnough(item.publishedAt))
    .filter((item) => !legalizationOnly(`${item.title} ${item.summary}`))
    .filter((item) => (requested ? item.section === requested : true))
    .sort((a, b) => scoreItem(b) - scoreItem(a) || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, parsed.data.limit ?? 80);

  const payload = {
    items,
    generatedAt: new Date().toISOString(),
    sources: {
      reddit: reddit.length,
      espn: espn.length,
      hackerNews: hn.length,
      covers: covers.length,
      x: x.length,
    },
    warnings: [
      ...(x.length ? [] : ["X live search is unavailable unless X_BEARER_TOKEN is configured."]),
      ...(covers.length ? [] : ["Covers betting discovery did not return current parseable items."]),
    ],
  };

  const checked = GetCommunityFeedResponse.safeParse(payload);
  if (!checked.success) {
    res.status(500).json({ error: "Community feed validation failed", detail: checked.error.message });
    return;
  }
  res.json(checked.data);
});

export default router;
