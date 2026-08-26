import { Router } from "express";
import { CURATED_X_BETTING_EXPERT_HANDLES } from "./community-experts.js";

const router = Router();
const REDDIT_BASE_URL = "https://www.reddit.com";
const X_RECENT_SEARCH_URL = "https://api.x.com/2/tweets/search/recent";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const ESPN_NEWS_FEEDS = [
  { label: "ESPN MLB", sport: "MLB", url: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news?limit=100" },
  { label: "ESPN NFL", sport: "NFL", url: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=100" },
  { label: "ESPN NBA", sport: "NBA", url: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=100" },
  { label: "ESPN NCAAF", sport: "NCAAF", url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/news?limit=100" },
  { label: "ESPN NCAAB", sport: "NCAAB", url: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/news?limit=100" },
] as const;

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

function toIso(value: unknown): string {
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function recentEnough(value: unknown): boolean {
  const time = new Date(value as any).getTime();
  return Number.isFinite(time) && time > 0 && Date.now() - time <= TWENTY_FOUR_HOURS_MS;
}

function bettingRelevant(text: string): boolean {
  return /(bet|betting|sportsbook|odds|spread|moneyline|total|over\/under|over under|prop|parlay|pick|unit|line movement|best bet|wager)/i.test(text);
}

function legalizationOnly(text: string): boolean {
  return /(legalization|legalize|legislation|bill passed|state legislature|sports betting law|gambling law|regulation)/i.test(text) &&
    !/(pick|odds|spread|moneyline|prop|parlay|best bet)/i.test(text);
}

function sportFromText(text: string): string | null {
  if (/\bmlb\b|baseball/i.test(text)) return "MLB";
  if (/\bnfl\b|football/i.test(text)) return "NFL";
  if (/\bnba\b|basketball/i.test(text)) return "NBA";
  if (/college football|\bncaaf\b/i.test(text)) return "NCAAF";
  if (/college basketball|\bncaab\b|march madness/i.test(text)) return "NCAAB";
  return null;
}

function marketFromText(text: string): string | null {
  if (/moneyline|\bml\b/i.test(text)) return "Moneyline";
  if (/spread|ats|against the spread/i.test(text)) return "Spread";
  if (/total|over\/under|over under|\bo\/u\b/i.test(text)) return "Total";
  if (/prop|player prop/i.test(text)) return "Prop";
  if (/parlay/i.test(text)) return "Parlay";
  return null;
}

async function fetchJson(url: string, init?: any): Promise<AnyRecord> {
  const response: any = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "WingmanSports/2.0",
      ...(init?.headers ?? {}),
    },
  } as any);
  if (!response?.ok) throw new Error(`Provider returned ${response?.status ?? "unknown"}`);
  return rec(await response.json());
}

async function getRedditPosts(section: CommunitySection): Promise<AnyRecord[]> {
  const subs = section === "betting"
    ? ["sportsbook", "sportsbetting"]
    : ["mlb", "nfl", "nba", "collegebasketball", "cfb"];

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      const payload = await fetchJson(`${REDDIT_BASE_URL}/r/${sub}/new.json?limit=50&raw_json=1`);
      return arr(rec(payload.data).children).map((child) => {
        const data = rec(child.data);
        const headline = cleanText(data.title);
        const excerpt = cleanText(data.selftext).slice(0, 360);
        const text = `${headline} ${excerpt}`;
        const publishedAt = new Date(num(data.created_utc) * 1000).toISOString();
        return {
          id: `reddit-${str(data.id)}`,
          source: "Reddit",
          community: `r/${sub}`,
          author: str(data.author) || null,
          headline,
          excerpt: excerpt || null,
          publishedAt,
          url: `${REDDIT_BASE_URL}${str(data.permalink)}`,
          score: data.score == null ? null : num(data.score),
          comments: data.num_comments == null ? null : num(data.num_comments),
          likes: null,
          reposts: null,
          isCuratedExpert: false,
          sport: sportFromText(text),
          market: marketFromText(text),
          bettingRelevant: bettingRelevant(text),
        };
      });
    }),
  );

  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function getEspnPosts(section: CommunitySection): Promise<AnyRecord[]> {
  const results = await Promise.allSettled(
    ESPN_NEWS_FEEDS.map(async (feed) => {
      const payload = await fetchJson(feed.url);
      return arr(payload.articles).map((article) => {
        const headline = cleanText(article.headline);
        const excerpt = cleanText(article.description);
        const text = `${headline} ${excerpt}`;
        const links = rec(article.links);
        const url = str(rec(links.web).href || rec(links.api).href);
        return {
          id: `espn-${str(article.id) || headline.slice(0, 64)}`,
          source: feed.label,
          community: "ESPN",
          author: cleanText(article.byline) || null,
          headline,
          excerpt: excerpt || null,
          publishedAt: toIso(article.published ?? article.lastModified),
          url,
          score: null,
          comments: null,
          likes: null,
          reposts: null,
          isCuratedExpert: false,
          sport: feed.sport,
          market: marketFromText(text),
          bettingRelevant: bettingRelevant(text),
          requestedSection: section,
        };
      });
    }),
  );

  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function getXPosts(): Promise<AnyRecord[]> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return [];
  const handles = CURATED_X_BETTING_EXPERT_HANDLES.slice(0, 8);
  if (!handles.length) return [];

  const authorQuery = handles.map((handle) => `from:${handle}`).join(" OR ");
  const query = `(${authorQuery}) (moneyline OR spread OR total OR prop OR parlay OR odds OR pick) -is:retweet`;

  try {
    const payload = await fetchJson(
      `${X_RECENT_SEARCH_URL}?query=${encodeURIComponent(query)}&max_results=100&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username,name`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const users = new Map(arr(rec(payload.includes).users).map((user) => [str(user.id), user]));
    return arr(payload.data).map((tweet) => {
      const user = users.get(str(tweet.author_id)) ?? {};
      const text = cleanText(tweet.text);
      const metrics = rec(tweet.public_metrics);
      const username = str(user.username);
      return {
        id: `x-${str(tweet.id)}`,
        source: "X",
        community: username ? `@${username}` : "Curated betting account",
        author: str(user.name) || username || null,
        headline: text.slice(0, 180),
        excerpt: text || null,
        publishedAt: toIso(tweet.created_at),
        url: username ? `https://x.com/${username}/status/${str(tweet.id)}` : "https://x.com/",
        score: null,
        comments: metrics.reply_count == null ? null : num(metrics.reply_count),
        likes: metrics.like_count == null ? null : num(metrics.like_count),
        reposts: metrics.retweet_count == null ? null : num(metrics.retweet_count),
        isCuratedExpert: true,
        sport: sportFromText(text),
        market: marketFromText(text),
        bettingRelevant: true,
      };
    });
  } catch {
    return [];
  }
}

function dedupe(posts: AnyRecord[]): AnyRecord[] {
  const seen = new Set<string>();
  return posts.filter((post) => {
    const key = cleanText(post.url || post.headline).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

router.get("/community/feed", async (req, res) => {
  const rawSection = String(req.query.section ?? "news").toLowerCase();
  if (rawSection !== "betting" && rawSection !== "news") {
    res.status(400).json({ error: "Invalid section. Use betting or news." });
    return;
  }

  const section = rawSection as CommunitySection;
  const [reddit, espn, x] = await Promise.all([
    getRedditPosts(section),
    getEspnPosts(section),
    section === "betting" ? getXPosts() : Promise.resolve([]),
  ]);

  const posts = dedupe([...x, ...reddit, ...espn])
    .filter((post) => recentEnough(post.publishedAt))
    .filter((post) => !legalizationOnly(`${post.headline} ${post.excerpt ?? ""}`))
    .filter((post) => (section === "betting" ? post.bettingRelevant === true : post.bettingRelevant !== true))
    .sort((a, b) => {
      const time = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (time !== 0) return time;
      return num(b.score) + num(b.comments) * 2 - (num(a.score) + num(a.comments) * 2);
    })
    .slice(0, 80)
    .map(({ bettingRelevant: _bettingRelevant, requestedSection: _requestedSection, ...post }) => post);

  const warnings: string[] = [];
  if (section === "betting" && !process.env.X_BEARER_TOKEN) {
    warnings.push("X live search is unavailable until X_BEARER_TOKEN is configured.");
  }
  if (!posts.length) warnings.push("No verified posts from the last 24 hours were available from the current sources.");

  res.json({
    section,
    source: section === "betting" ? "Wingman betting sources" : "Wingman sports sources",
    sourceUrl: section === "betting" ? "https://www.reddit.com/r/sportsbook/" : "https://www.espn.com/",
    posts,
    warning: warnings.length ? warnings.join(" ") : null,
  });
});

export default router;
