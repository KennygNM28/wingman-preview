type LeagueKey = 'mlb' | 'nfl' | 'nba' | 'ncaaf' | 'ncaab';
type AnyRecord = Record<string, any>;

type Betting = {
  awaySpread: number | null;
  homeSpread: number | null;
  awaySpreadPrice: number | null;
  homeSpreadPrice: number | null;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  total: number | null;
  overPrice: number | null;
  underPrice: number | null;
  splits: null;
  source: string;
  bookmaker: string;
};

const API_BASE = 'https://api.odds-api.io/v3';

// Odds-API.io uses generic sport slugs plus league slugs for US competitions.
const PROVIDER: Record<LeagueKey, { sport: string; league: string }> = {
  mlb: { sport: 'baseball', league: 'usa-mlb' },
  nfl: { sport: 'american-football', league: 'usa-nfl' },
  nba: { sport: 'basketball', league: 'usa-nba' },
  ncaaf: { sport: 'american-football', league: 'usa-ncaaf' },
  ncaab: { sport: 'basketball', league: 'usa-ncaa' },
};

const memory = new Map<string, { expires: number; value: any }>();

function rec(v: unknown): AnyRecord {
  return v && typeof v === 'object' ? (v as AnyRecord) : {};
}
function arr(v: unknown): AnyRecord[] {
  return Array.isArray(v) ? v.map(rec) : [];
}
function num(v: unknown): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function american(v: unknown): number | null {
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  if (Math.abs(x) >= 100) return Math.round(x);
  if (x <= 1) return null;
  return x >= 2 ? Math.round((x - 1) * 100) : Math.round(-100 / (x - 1));
}
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
async function fetchJson(url: string, stage: string): Promise<any> {
  const r = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  const text = await r.text();
  if (!r.ok) {
    let detail = text.trim();
    try {
      const parsed = JSON.parse(text);
      detail = String(parsed?.detail ?? parsed?.error ?? parsed?.message ?? detail);
    } catch {
      // Keep provider text as-is.
    }
    throw new Error(`${stage}: Odds-API.io returned ${r.status}${detail ? ` — ${detail}` : ''}`);
  }
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function parseMarkets(raw: AnyRecord, wantedBooks: string[]): Betting | null {
  const bookmakers = rec(raw.bookmakers);
  const ordered = [
    ...wantedBooks.filter((name) => bookmakers[name] != null),
    ...Object.keys(bookmakers).filter((name) => !wantedBooks.includes(name)),
  ];

  for (const book of ordered) {
    const source = bookmakers[book];
    const markets = Array.isArray(source)
      ? source.map(rec)
      : source && typeof source === 'object'
        ? Object.values(source).map(rec)
        : [];

    const out: Betting = {
      awaySpread: null,
      homeSpread: null,
      awaySpreadPrice: null,
      homeSpreadPrice: null,
      awayMoneyline: null,
      homeMoneyline: null,
      total: null,
      overPrice: null,
      underPrice: null,
      splits: null,
      source: 'Odds-API.io',
      bookmaker: book,
    };

    for (const market of markets) {
      const name = String(market.name ?? market.market ?? '').toLowerCase();
      const rows = Array.isArray(market.odds) ? market.odds.map(rec) : [market];
      for (const row of rows) {
        if (/^(ml|moneyline|money line|h2h)$/.test(name) || name.includes('moneyline')) {
          out.homeMoneyline ??= american(row.home);
          out.awayMoneyline ??= american(row.away);
        } else if (name.includes('spread') || name.includes('handicap') || name.includes('run line')) {
          const hdp = num(row.hdp ?? row.handicap ?? row.line);
          if (hdp !== null) {
            out.homeSpread ??= hdp;
            out.awaySpread ??= -hdp;
          }
          out.homeSpreadPrice ??= american(row.home);
          out.awaySpreadPrice ??= american(row.away);
        } else if (name.includes('total') || name.includes('over/under') || name.includes('over under')) {
          out.total ??= num(row.hdp ?? row.total ?? row.line);
          out.overPrice ??= american(row.over);
          out.underPrice ??= american(row.under);
        }
      }
    }

    if (
      out.awaySpread !== null ||
      out.homeSpread !== null ||
      out.awayMoneyline !== null ||
      out.homeMoneyline !== null ||
      out.total !== null
    ) return out;
  }
  return null;
}

function dateWindow(date: string) {
  const start = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) throw new Error('Invalid date');
  return {
    from: new Date(start.getTime() - 12 * 60 * 60 * 1000).toISOString(),
    to: new Date(start.getTime() + 36 * 60 * 60 * 1000).toISOString(),
  };
}

async function loadOdds(league: LeagueKey, date: string, apiKey: string, books: string[]) {
  const cacheKey = `${league}:${date}:${books.join(',')}`;
  const cached = memory.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const cfg = PROVIDER[league];
  const { from, to } = dateWindow(date);
  const params = new URLSearchParams({
    apiKey,
    sport: cfg.sport,
    league: cfg.league,
    status: 'pending,live,settled',
    from,
    to,
  });

  const events = arr(await fetchJson(`${API_BASE}/events?${params.toString()}`, 'event lookup'));
  const ids = events.map((e) => String(e.id ?? '')).filter(Boolean);

  if (!ids.length) {
    const empty = { provider: 'Odds-API.io', bookmakers: books, events: [] };
    memory.set(cacheKey, { expires: Date.now() + 15 * 60 * 1000, value: empty });
    return empty;
  }

  const oddsRows = (
    await Promise.all(
      chunk(ids, 10).map((batch) => {
        const q = new URLSearchParams({
          apiKey,
          eventIds: batch.join(','),
          bookmakers: books.join(','),
        });
        return fetchJson(`${API_BASE}/odds/multi?${q.toString()}`, 'odds lookup');
      }),
    )
  ).flatMap((payload) => arr(payload));

  const eventById = new Map(events.map((event) => [String(event.id ?? ''), event]));
  const parsed = oddsRows
    .map((row) => {
      const event = eventById.get(String(row.id ?? '')) ?? row;
      const betting = parseMarkets(row, books);
      if (!betting) return null;
      return {
        id: String(row.id ?? event.id ?? ''),
        home: String(row.home ?? event.home ?? ''),
        away: String(row.away ?? event.away ?? ''),
        startTime: String(row.date ?? event.date ?? ''),
        status: String(event.status ?? ''),
        betting,
      };
    })
    .filter(Boolean);

  const value = { provider: 'Odds-API.io', bookmakers: books, events: parsed };
  memory.set(cacheKey, { expires: Date.now() + 15 * 60 * 1000, value });
  return value;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Odds-API.io backup is not configured' });
    return;
  }

  const league = String(req.query?.league ?? '').toLowerCase() as LeagueKey;
  const date = String(req.query?.date ?? '');
  if (!Object.prototype.hasOwnProperty.call(PROVIDER, league)) {
    res.status(400).json({ error: 'Unsupported league' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Invalid date' });
    return;
  }

  const books = String(process.env.ODDS_API_BOOKMAKERS || 'DraftKings,FanDuel')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 2);

  try {
    const payload = await loadOdds(league, date, apiKey, books);
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=300');
    res.status(200).json(payload);
  } catch (error) {
    res.status(502).json({
      error: 'Odds-API.io backup unavailable',
      detail: error instanceof Error ? error.message : 'Unknown provider error',
    });
  }
}
