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
function balancedRow(marketRows: AnyRecord[], leftKey: string, rightKey: string): AnyRecord | null {
  let best: AnyRecord | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const row of marketRows) {
    const left = implied(row[leftKey]);
    const right = implied(row[rightKey]);
    if (left === null || right === null) continue;
    const score = Math.abs(left - right);
    if (score < bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best ?? marketRows[0] ?? null;
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
    const source = bookmakers[book];
    const markets = Array.isArray(source)
      ? source.map(rec)
      : source && typeof source === 'object'
        ? Object.values(source).map(rec)
        : [];
    let contributed = false;

    for (const market of markets) {
      const name = String(market.name ?? market.market ?? '').toLowerCase();
      const compactName = name.replace(/[^a-z0-9]/g, '');
      const marketRows = Array.isArray(market.odds) ? market.odds.map(rec) : [market];

      if (
        compactName === 'ml' ||
        compactName === 'moneyline' ||
        compactName === 'h2h' ||
        compactName.includes('moneyline') ||
        compactName.includes('matchwinner')
      ) {
        const row = marketRows.find((candidate) => american(candidate.home) !== null || american(candidate.away) !== null);
        if (row) {
          const home = american(row.home);
          const away = american(row.away);
          if (out.homeMoneyline === null && home !== null) {
            out.homeMoneyline = home;
            contributed = true;
          }
          if (out.awayMoneyline === null && away !== null) {
            out.awayMoneyline = away;
            contributed = true;
          }
        }
      } else if (name.includes('spread') || name.includes('handicap') || name.includes('run line')) {
        const row = balancedRow(marketRows, 'home', 'away');
        if (row && out.homeSpread === null && out.awaySpread === null) {
          const hdp = num(row.hdp ?? row.handicap ?? row.line);
          if (hdp !== null) {
            out.homeSpread = hdp;
            out.awaySpread = -hdp;
            out.homeSpreadPrice = american(row.home);
            out.awaySpreadPrice = american(row.away);
            contributed = true;
          }
        }
      } else if (name.includes('total') || name.includes('over/under') || name.includes('over under')) {
        const row = balancedRow(marketRows, 'over', 'under');
        if (row && out.total === null) {
          const total = num(row.hdp ?? row.total ?? row.line);
          if (total !== null) {
            out.total = total;
            out.overPrice = american(row.over);
            out.underPrice = american(row.under);
            contributed = true;
          }
        }
      }
    }

    if (contributed) usedBooks.push(book);
    const complete =
      out.homeMoneyline !== null &&
      out.awayMoneyline !== null &&
      out.homeSpread !== null &&
      out.awaySpread !== null &&
      out.total !== null;
    if (complete) break;
  }

  const hasAnything =
    out.awaySpread !== null ||
    out.homeSpread !== null ||
    out.awayMoneyline !== null ||
    out.homeMoneyline !== null ||
    out.total !== null;
  if (!hasAnything) return null;
  out.bookmaker = usedBooks.join(' / ') || ordered[0] || 'Odds-API.io';
  return out;
}

function historicalBetting(payload: unknown, books: string[]): Betting | null {
  const root = rec(payload);
  const candidates: AnyRecord[] = [];
  if (Array.isArray(payload)) candidates.push(...arr(payload));
  for (const key of ['snapshots', 'history', 'data', 'results', 'odds']) {
    if (Array.isArray(root[key])) candidates.push(...arr(root[key]));
  }
  if (Object.keys(root).length) candidates.push(root);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const parsed = parseMarkets(candidates[i], books);
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
      const oq = new URLSearchParams({
        apiKey,
        eventId: id,
        bookmakers: books.join(','),
      });
      const payload = await fetchJson(
        `${API_BASE}/historical/odds?${oq.toString()}`,
        `historical odds lookup ${id}`,
      );
      const betting = historicalBetting(payload, books);
      if (!betting) return null;
      return {
        id,
        home: String(event.home ?? ''),
        away: String(event.away ?? ''),
        startTime: String(event.date ?? ''),
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
        const q = new URLSearchParams({
          apiKey,
          eventIds: batch.join(','),
          bookmakers: books.join(','),
        });
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

  const value = {
    provider: 'Odds-API.io',
    bookmakers: books,
    events: parsed,
    warning,
  };
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
