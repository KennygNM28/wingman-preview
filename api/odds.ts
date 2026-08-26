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
function rows(v: unknown): AnyRecord[] {
  if (Array.isArray(v)) return arr(v);
  const o = rec(v);
  for (const key of ['events', 'data', 'results', 'items']) {
    if (Array.isArray(o[key])) return arr(o[key]);
  }
  return Object.keys(o).length ? [o] : [];
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
function implied(v: unknown): number | null {
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  if (Math.abs(x) >= 100) return x > 0 ? 100 / (x + 100) : -x / (-x + 100);
  if (x > 1) return 1 / x;
  return null;
}
function timestampMs(v: unknown): number | null {
  const n = Number(v);
  if (Number.isFinite(n)) return n < 10_000_000_000 ? n * 1000 : n;
  const parsed = Date.parse(String(v ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
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

function marketRows(market: AnyRecord): AnyRecord[] {
  if (Array.isArray(market.odds)) return market.odds.map(rec);
  if (market.odds && typeof market.odds === 'object') {
    const oddsObject = rec(market.odds);
    if (
      'home' in oddsObject || 'away' in oddsObject || 'over' in oddsObject ||
      'under' in oddsObject || 'hdp' in oddsObject || 'line' in oddsObject
    ) return [oddsObject];
    return Object.values(oddsObject)
      .flatMap((value) => Array.isArray(value) ? value.map(rec) : [rec(value)])
      .filter((row) => Object.keys(row).length > 0);
  }
  return [market];
}
function marketsFromBook(source: unknown): AnyRecord[] {
  if (Array.isArray(source)) return source.map(rec);
  const object = rec(source);
  return Object.entries(object).map(([key, value]) => {
    const market = rec(value);
    return { ...market, name: market.name ?? market.market ?? key };
  });
}
function compactMarketName(market: AnyRecord): string {
  return String(market.name ?? market.market ?? market.type ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
function isAlternateOrDerivative(name: string): boolean {
  return /alternative|alternate|altline|teamtotal|player|prop|inning|period|quarter|half|1st|first|2nd|second/.test(name);
}
function marketPriority(market: AnyRecord, kind: 'ml' | 'spread' | 'total'): number {
  const name = compactMarketName(market);
  if (!name || isAlternateOrDerivative(name)) return Number.POSITIVE_INFINITY;
  if (kind === 'ml') {
    if (name === 'ml' || name === 'moneyline') return 0;
    if (name === 'h2h' || name === 'matchresult' || name === 'matchwinner') return 1;
    if (name.includes('moneyline')) return 2;
    return Number.POSITIVE_INFINITY;
  }
  if (kind === 'spread') {
    if (name === 'spread' || name === 'runline' || name === 'asianhandicap' || name === 'handicap') return 0;
    if (name.includes('runline') || name.includes('spread')) return 2;
    return Number.POSITIVE_INFINITY;
  }
  if (name === 'totals' || name === 'total' || name === 'overunder' || name === 'gametotal') return 0;
  if (name.includes('overunder') || name.includes('totals')) return 2;
  return Number.POSITIVE_INFINITY;
}
function canonicalMarket(markets: AnyRecord[], kind: 'ml' | 'spread' | 'total'): AnyRecord | null {
  return markets
    .map((market) => ({ market, priority: marketPriority(market, kind) }))
    .filter((item) => Number.isFinite(item.priority))
    .sort((a, b) => a.priority - b.priority)[0]?.market ?? null;
}
function balancedRow(
  marketRowsList: AnyRecord[],
  leftKey: string,
  rightKey: string,
  options?: { minLine?: number; maxLine?: number; preferAbsLine?: number },
): AnyRecord | null {
  let best: AnyRecord | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const row of marketRowsList) {
    const left = implied(row[leftKey]);
    const right = implied(row[rightKey]);
    if (left === null || right === null) continue;
    if (left < 0.12 || left > 0.88 || right < 0.12 || right > 0.88) continue;
    const line = num(row.hdp ?? row.total ?? row.handicap ?? row.line);
    if (options?.minLine != null && (line === null || line < options.minLine)) continue;
    if (options?.maxLine != null && (line === null || line > options.maxLine)) continue;
    let score = Math.abs(left - right) + Math.abs(left + right - 1.05) * 0.35;
    if (options?.preferAbsLine != null && line !== null) {
      score += Math.abs(Math.abs(line) - options.preferAbsLine) * 0.2;
    }
    if (score < bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}
function historicalMarketLooksPregame(market: AnyRecord, startTime?: string): boolean {
  if (!startTime) return true;
  const eventStart = Date.parse(startTime);
  if (!Number.isFinite(eventStart)) return true;
  const updated = timestampMs(market.updatedAt ?? market.updated ?? market.timestamp);
  if (updated === null) return true;
  return updated <= eventStart + 5 * 60 * 1000;
}
function totalRange(league?: LeagueKey): { minLine?: number; maxLine?: number } {
  if (league === 'mlb') return { minLine: 5.5, maxLine: 15.5 };
  if (league === 'nfl') return { minLine: 20, maxLine: 80 };
  if (league === 'nba') return { minLine: 150, maxLine: 300 };
  if (league === 'ncaaf') return { minLine: 20, maxLine: 100 };
  if (league === 'ncaab') return { minLine: 80, maxLine: 200 };
  return {};
}

function parseMarkets(
  raw: AnyRecord,
  wantedBooks: string[],
  options?: { league?: LeagueKey; historical?: boolean; startTime?: string },
): Betting | null {
  const bookmakers = rec(raw.bookmakers);
  const ordered = [
    ...wantedBooks.filter((name) => bookmakers[name] != null),
    ...Object.keys(bookmakers).filter((name) => !wantedBooks.includes(name)),
  ];

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
    bookmaker: '',
  };
  const usedBooks: string[] = [];

  for (const book of ordered) {
    let markets = marketsFromBook(bookmakers[book]);
    if (options?.historical) {
      markets = markets.filter((market) => historicalMarketLooksPregame(market, options.startTime));
    }
    let contributed = false;

    if (out.homeMoneyline === null || out.awayMoneyline === null) {
      const market = canonicalMarket(markets, 'ml');
      if (market) {
        const row = marketRows(market).find((candidate) => {
          const home = implied(candidate.home);
          const away = implied(candidate.away);
          return home !== null && away !== null && home > 0.04 && home < 0.96 && away > 0.04 && away < 0.96;
        });
        if (row) {
          const home = american(row.home);
          const away = american(row.away);
          if (out.homeMoneyline === null && home !== null) { out.homeMoneyline = home; contributed = true; }
          if (out.awayMoneyline === null && away !== null) { out.awayMoneyline = away; contributed = true; }
        }
      }
    }

    if (out.homeSpread === null || out.awaySpread === null) {
      const market = canonicalMarket(markets, 'spread');
      if (market) {
        const spreadOptions = options?.historical && options.league === 'mlb' ? { preferAbsLine: 1.5 } : undefined;
        const row = balancedRow(marketRows(market), 'home', 'away', spreadOptions);
        const hdp = row ? num(row.hdp ?? row.handicap ?? row.line) : null;
        if (row && hdp !== null) {
          out.homeSpread = hdp;
          out.awaySpread = -hdp;
          out.homeSpreadPrice = american(row.home);
          out.awaySpreadPrice = american(row.away);
          contributed = true;
        }
      }
    }

    if (out.total === null) {
      const market = canonicalMarket(markets, 'total');
      if (market) {
        const range = options?.historical ? totalRange(options.league) : {};
        const row = balancedRow(marketRows(market), 'over', 'under', range);
        const total = row ? num(row.hdp ?? row.total ?? row.line) : null;
        if (row && total !== null) {
          out.total = total;
          out.overPrice = american(row.over);
          out.underPrice = american(row.under);
          contributed = true;
        }
      }
    }

    if (contributed) usedBooks.push(book);
    const complete =
      out.homeMoneyline !== null && out.awayMoneyline !== null &&
      out.homeSpread !== null && out.awaySpread !== null && out.total !== null;
    if (complete) break;
  }

  const hasAnything =
    out.awaySpread !== null || out.homeSpread !== null ||
    out.awayMoneyline !== null || out.homeMoneyline !== null || out.total !== null;
  if (!hasAnything) return null;
  out.bookmaker = usedBooks.join(' / ') || ordered[0] || 'Odds-API.io';
  return out;
}

function movementRowBeforeStart(payload: unknown, startTime: string): AnyRecord | null {
  const root = rec(payload);
  const cutoff = Date.parse(startTime);
  const candidates = [rec(root.opening), ...arr(root.movements)];
  if (!Number.isFinite(cutoff)) return candidates.filter((row) => Object.keys(row).length > 0).at(-1) ?? null;
  const eligible = candidates
    .map((row) => ({ row, ts: timestampMs(row.timestamp ?? row.updatedAt ?? row.updated) }))
    .filter((item) => Object.keys(item.row).length > 0 && (item.ts === null || item.ts <= cutoff + 60_000))
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  return eligible.at(-1)?.row ?? null;
}
async function historicalMoneyline(
  eventId: string,
  startTime: string,
  apiKey: string,
  books: string[],
): Promise<Pick<Betting, 'homeMoneyline' | 'awayMoneyline' | 'bookmaker'> | null> {
  for (const book of books) {
    try {
      const q = new URLSearchParams({ apiKey, eventId, bookmaker: book, market: 'ML' });
      const payload = await fetchJson(`${API_BASE}/odds/movements?${q.toString()}`, `moneyline movements ${eventId}`);
      const row = movementRowBeforeStart(payload, startTime);
      const home = row ? american(row.home) : null;
      const away = row ? american(row.away) : null;
      if (home !== null && away !== null) return { homeMoneyline: home, awayMoneyline: away, bookmaker: book };
    } catch {
      // Try the next configured bookmaker.
    }
  }
  return null;
}

function historicalBetting(payload: unknown, books: string[], league: LeagueKey, startTime: string): Betting | null {
  const root = rec(payload);
  const candidates: AnyRecord[] = [];
  if (Array.isArray(payload)) candidates.push(...arr(payload));
  for (const key of ['snapshots', 'history', 'data', 'results', 'odds']) {
    if (Array.isArray(root[key])) candidates.push(...arr(root[key]));
  }
  if (Object.keys(root).length) candidates.push(root);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const parsed = parseMarkets(candidates[i], books, { league, historical: true, startTime });
    if (parsed) return { ...parsed, source: 'Odds-API.io historical' };
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
function isPastDate(date: string) {
  const today = new Date().toISOString().slice(0, 10);
  return date < today;
}

async function historicalRows(
  league: LeagueKey,
  date: string,
  apiKey: string,
  books: string[],
  skipIds: Set<string>,
) {
  const cfg = PROVIDER[league];
  const { from, to } = dateWindow(date);
  const q = new URLSearchParams({ apiKey, sport: cfg.sport, league: cfg.league, from, to });
  const historicalEvents = rows(
    await fetchJson(`${API_BASE}/historical/events?${q.toString()}`, 'historical event lookup'),
  ).slice(0, 20);

  const wanted = historicalEvents.filter((event) => {
    const id = String(event.id ?? '');
    return id && !skipIds.has(id);
  });

  const settled = await Promise.allSettled(
    wanted.map(async (event) => {
      const id = String(event.id ?? '');
      const startTime = String(event.date ?? '');
      const oq = new URLSearchParams({ apiKey, eventId: id, bookmakers: books.join(',') });
      const payload = await fetchJson(
        `${API_BASE}/historical/odds?${oq.toString()}`,
        `historical odds lookup ${id}`,
      );
      let betting = historicalBetting(payload, books, league, startTime);
      if (!betting) return null;

      if (betting.homeMoneyline === null || betting.awayMoneyline === null) {
        const ml = await historicalMoneyline(id, startTime, apiKey, books);
        if (ml) {
          betting = {
            ...betting,
            homeMoneyline: betting.homeMoneyline ?? ml.homeMoneyline,
            awayMoneyline: betting.awayMoneyline ?? ml.awayMoneyline,
            bookmaker: [betting.bookmaker, ml.bookmaker].filter(Boolean).join(' / '),
          };
        }
      }

      return {
        id,
        home: String(event.home ?? ''),
        away: String(event.away ?? ''),
        startTime,
        status: 'settled',
        betting,
      };
    }),
  );

  return settled
    .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter(Boolean);
}

async function loadOdds(league: LeagueKey, date: string, apiKey: string, books: string[]) {
  const cacheKey = `v3:${league}:${date}:${books.join(',')}`;
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

  let warning: string | null = null;
  let events: AnyRecord[] = [];
  try {
    events = rows(await fetchJson(`${API_BASE}/events?${params.toString()}`, 'event lookup'));
  } catch (error) {
    warning = error instanceof Error ? error.message : 'Current event lookup unavailable';
  }

  const ids = events.map((e) => String(e.id ?? '')).filter(Boolean);
  let oddsRows: AnyRecord[] = [];
  if (ids.length) {
    const results = await Promise.allSettled(
      chunk(ids, 10).map(async (batch) => {
        const q = new URLSearchParams({ apiKey, eventIds: batch.join(','), bookmakers: books.join(',') });
        return rows(await fetchJson(`${API_BASE}/odds/multi?${q.toString()}`, 'odds lookup'));
      }),
    );
    oddsRows = results
      .filter((result): result is PromiseFulfilledResult<AnyRecord[]> => result.status === 'fulfilled')
      .flatMap((result) => result.value);
  }

  const eventById = new Map(events.map((event) => [String(event.id ?? ''), event]));
  const parsed = oddsRows
    .map((row) => {
      const event = eventById.get(String(row.id ?? '')) ?? row;
      const betting = parseMarkets(row, books, { league });
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
    .filter(Boolean) as AnyRecord[];

  if (isPastDate(date) || events.some((event) => String(event.status ?? '').toLowerCase() === 'settled')) {
    try {
      const historical = await historicalRows(
        league,
        date,
        apiKey,
        books,
        new Set(parsed.map((event) => String(event.id ?? ''))),
      );
      parsed.push(...historical);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Historical odds unavailable';
      warning = [warning, detail].filter(Boolean).join(' • ');
    }
  }

  const value = { provider: 'Odds-API.io', bookmakers: books, events: parsed, warning };
  memory.set(cacheKey, {
    expires: Date.now() + (isPastDate(date) ? 6 * 60 * 60 * 1000 : 15 * 60 * 1000),
    value,
  });
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
    const past = isPastDate(date);
    res.setHeader(
      'Cache-Control',
      past ? 'public, s-maxage=21600, stale-while-revalidate=3600' : 'public, s-maxage=900, stale-while-revalidate=300',
    );
    res.status(200).json(payload);
  } catch (error) {
    res.status(502).json({
      error: 'Odds-API.io backup unavailable',
      detail: error instanceof Error ? error.message : 'Unknown provider error',
    });
  }
}
