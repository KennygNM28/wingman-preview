import { Router, type IRouter } from "express";

const router: IRouter = Router();

type AnyRecord = Record<string, any>;
type LeagueKey = "mlb" | "nfl" | "nba" | "ncaaf" | "ncaab";

const LEAGUES: Record<LeagueKey, { sport: string; slug: string; label: string }> = {
  mlb: { sport: "baseball", slug: "mlb", label: "MLB" },
  nfl: { sport: "football", slug: "nfl", label: "NFL" },
  nba: { sport: "basketball", slug: "nba", label: "NBA" },
  ncaaf: { sport: "football", slug: "college-football", label: "NCAAF" },
  ncaab: { sport: "basketball", slug: "mens-college-basketball", label: "NCAAB" },
};

function rec(v: unknown): AnyRecord { return v && typeof v === "object" ? v as AnyRecord : {}; }
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
}
function price(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const m = v.match(/[+-]?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null;
}
function bool(v: unknown): boolean | null { return typeof v === "boolean" ? v : null; }

function status(raw: AnyRecord) {
  const t = rec(raw.type);
  const state = String(t.state ?? t.name ?? "").toLowerCase();
  const detail = String(t.shortDetail ?? t.detail ?? "");
  if (state === "in" || state.includes("progress")) return { status: "live", label: detail || "LIVE" };
  if (state === "post" || state.includes("final")) return { status: "final", label: "FINAL" };
  if (state.includes("postpon")) return { status: "postponed", label: "POSTPONED" };
  if (state.includes("cancel")) return { status: "canceled", label: "CANCELED" };
  return { status: "upcoming", label: "UPCOMING" };
}

function team(comp: AnyRecord) {
  const t = rec(comp.team);
  return {
    abbreviation: String(t.abbreviation ?? t.shortDisplayName?.slice(0, 4) ?? "TBD"),
    name: String(t.displayName ?? t.name ?? "TBD"),
    shortName: String(t.shortDisplayName ?? t.name ?? "TBD"),
    score: num(comp.score),
    record: Array.isArray(comp.records) ? String(rec(comp.records[0]).summary ?? "") || null : null,
    logo: typeof t.logo === "string" ? t.logo : typeof t.logos?.[0]?.href === "string" ? t.logos[0].href : null,
  };
}

function parseOdds(comp: AnyRecord) {
  const odds = rec(comp.odds?.[0]);
  if (!Object.keys(odds).length) return null;
  const ps = rec(odds.pointSpread);
  const awayPs = rec(rec(rec(ps.away).close));
  const homePs = rec(rec(rec(ps.home).close));
  const ml = rec(odds.moneyline);
  const awayMl = rec(rec(rec(ml.away).close));
  const homeMl = rec(rec(rec(ml.home).close));
  const totalMarket = rec(odds.total);
  const over = rec(rec(rec(totalMarket.over).close));
  const under = rec(rec(rec(totalMarket.under).close));
  const spread = num(odds.spread);
  const awayFavorite = rec(odds.awayTeamOdds).favorite === true;
  const homeFavorite = rec(odds.homeTeamOdds).favorite === true;
  return {
    awaySpread: price(awayPs.line) ?? (spread === null ? null : awayFavorite ? -Math.abs(spread) : Math.abs(spread)),
    homeSpread: price(homePs.line) ?? (spread === null ? null : homeFavorite ? -Math.abs(spread) : Math.abs(spread)),
    awaySpreadPrice: price(awayPs.odds) ?? price(rec(odds.awayTeamOdds).spreadOdds),
    homeSpreadPrice: price(homePs.odds) ?? price(rec(odds.homeTeamOdds).spreadOdds),
    awayMoneyline: price(awayMl.odds) ?? price(rec(odds.awayTeamOdds).moneyLine),
    homeMoneyline: price(homeMl.odds) ?? price(rec(odds.homeTeamOdds).moneyLine),
    total: num(odds.overUnder) ?? num(totalMarket.overUnder),
    overPrice: price(over.odds) ?? price(odds.overOdds),
    underPrice: price(under.odds) ?? price(odds.underOdds),
  };
}

async function fetchJson(url: string): Promise<AnyRecord> {
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json", "User-Agent": "WingmanSports/2.0" } });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  return rec(await response.json());
}


type MarketSplit = { betPercentage:number|null; moneyPercentage:number|null; lastSeen:string|null; source:string };
const SDIO_SLUG: Record<LeagueKey,string> = { mlb:'mlb', nfl:'nfl', nba:'nba', ncaaf:'cfb', ncaab:'cbb' };
function emptySplits(){return {awaySpread:null,homeSpread:null,awayMoneyline:null,homeMoneyline:null,over:null,under:null} as Record<string,MarketSplit|null>}
function normalizeSplit(raw:AnyRecord):MarketSplit|null{const b=num(raw.BetPercentage??raw.betPercentage),m=num(raw.MoneyPercentage??raw.moneyPercentage);if(b===null||m===null)return null;return{betPercentage:b,moneyPercentage:m,lastSeen:String(raw.LastSeen??raw.lastSeen??'')||null,source:'SportsDataIO'}}
function mapSportsDataSplits(payload:any, awayAbbr:string, homeAbbr:string){
  const out=emptySplits(); const markets:Array<any>=Array.isArray(payload)?payload:(Array.isArray(payload?.BettingMarketSplits)?payload.BettingMarketSplits:Array.isArray(payload?.bettingMarketSplits)?payload.bettingMarketSplits:[]);
  for(const market of markets){const mt=String(market.BettingBetType??market.bettingBetType??market.BettingMarketType??market.bettingMarketType??'').toLowerCase();const splits=Array.isArray(market.BettingSplits)?market.BettingSplits:Array.isArray(market.bettingSplits)?market.bettingSplits:[];for(const s of splits){const split=normalizeSplit(rec(s));if(!split)continue;const outcome=String(s.BettingOutcomeType??s.bettingOutcomeType??'').toLowerCase();const teamKey=String(market.TeamKey??market.teamKey??'').toUpperCase();if(mt.includes('money')){if(outcome==='away'||teamKey===awayAbbr.toUpperCase())out.awayMoneyline=split;else if(outcome==='home'||teamKey===homeAbbr.toUpperCase())out.homeMoneyline=split}else if(mt.includes('spread')){if(outcome==='away'||teamKey===awayAbbr.toUpperCase())out.awaySpread=split;else if(outcome==='home'||teamKey===homeAbbr.toUpperCase())out.homeSpread=split}else if(mt.includes('total')){if(outcome==='over')out.over=split;else if(outcome==='under')out.under=split}}}
  return out;
}
async function fetchSportsDataSplits(league:LeagueKey, gameId:string, awayAbbr:string, homeAbbr:string){
  const key=process.env.SPORTSDATAIO_API_KEY; if(!key)return null;
  const slug=SDIO_SLUG[league];
  // SportsDataIO game IDs are not ESPN IDs. A production mapping can be supplied by the provider/account integration.
  // This optional template lets Replit use the exact licensed endpoint without hard-coding an account-specific route.
  const template=process.env.SPORTSDATAIO_SPLITS_URL_TEMPLATE; if(!template)return null;
  const url=template.replace('{league}',slug).replace('{gameId}',encodeURIComponent(gameId));
  const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/json','Ocp-Apim-Subscription-Key':key}}); if(!r.ok)return null;
  return mapSportsDataSplits(await r.json(),awayAbbr,homeAbbr);
}


const PRO_TEAM_FALLBACK: Partial<Record<LeagueKey,Array<[string,string]>>> = {
  mlb: [["ARI","Arizona Diamondbacks"],["ATH","Athletics"],["ATL","Atlanta Braves"],["BAL","Baltimore Orioles"],["BOS","Boston Red Sox"],["CHC","Chicago Cubs"],["CWS","Chicago White Sox"],["CIN","Cincinnati Reds"],["CLE","Cleveland Guardians"],["COL","Colorado Rockies"],["DET","Detroit Tigers"],["HOU","Houston Astros"],["KC","Kansas City Royals"],["LAA","Los Angeles Angels"],["LAD","Los Angeles Dodgers"],["MIA","Miami Marlins"],["MIL","Milwaukee Brewers"],["MIN","Minnesota Twins"],["NYM","New York Mets"],["NYY","New York Yankees"],["PHI","Philadelphia Phillies"],["PIT","Pittsburgh Pirates"],["SD","San Diego Padres"],["SF","San Francisco Giants"],["SEA","Seattle Mariners"],["STL","St. Louis Cardinals"],["TB","Tampa Bay Rays"],["TEX","Texas Rangers"],["TOR","Toronto Blue Jays"],["WSH","Washington Nationals"]],
  nfl: [["ARI","Arizona Cardinals"],["ATL","Atlanta Falcons"],["BAL","Baltimore Ravens"],["BUF","Buffalo Bills"],["CAR","Carolina Panthers"],["CHI","Chicago Bears"],["CIN","Cincinnati Bengals"],["CLE","Cleveland Browns"],["DAL","Dallas Cowboys"],["DEN","Denver Broncos"],["DET","Detroit Lions"],["GB","Green Bay Packers"],["HOU","Houston Texans"],["IND","Indianapolis Colts"],["JAX","Jacksonville Jaguars"],["KC","Kansas City Chiefs"],["LV","Las Vegas Raiders"],["LAC","Los Angeles Chargers"],["LAR","Los Angeles Rams"],["MIA","Miami Dolphins"],["MIN","Minnesota Vikings"],["NE","New England Patriots"],["NO","New Orleans Saints"],["NYG","New York Giants"],["NYJ","New York Jets"],["PHI","Philadelphia Eagles"],["PIT","Pittsburgh Steelers"],["SEA","Seattle Seahawks"],["SF","San Francisco 49ers"],["TB","Tampa Bay Buccaneers"],["TEN","Tennessee Titans"],["WSH","Washington Commanders"]],
  nba: [["ATL","Atlanta Hawks"],["BOS","Boston Celtics"],["BKN","Brooklyn Nets"],["CHA","Charlotte Hornets"],["CHI","Chicago Bulls"],["CLE","Cleveland Cavaliers"],["DAL","Dallas Mavericks"],["DEN","Denver Nuggets"],["DET","Detroit Pistons"],["GSW","Golden State Warriors"],["HOU","Houston Rockets"],["IND","Indiana Pacers"],["LAC","LA Clippers"],["LAL","Los Angeles Lakers"],["MEM","Memphis Grizzlies"],["MIA","Miami Heat"],["MIL","Milwaukee Bucks"],["MIN","Minnesota Timberwolves"],["NOP","New Orleans Pelicans"],["NYK","New York Knicks"],["OKC","Oklahoma City Thunder"],["ORL","Orlando Magic"],["PHI","Philadelphia 76ers"],["PHX","Phoenix Suns"],["POR","Portland Trail Blazers"],["SAC","Sacramento Kings"],["SAS","San Antonio Spurs"],["TOR","Toronto Raptors"],["UTA","Utah Jazz"],["WSH","Washington Wizards"]],
};
async function loadTeams(league:LeagueKey){
 const cfg=LEAGUES[league]; const url=`https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/teams?limit=1000`;
 try{const data=await fetchJson(url);const rows=rec(rec(data.sports?.[0]).leagues?.[0]).teams;const teams=(Array.isArray(rows)?rows:[]).map((x:AnyRecord)=>rec(x.team)).filter((x:AnyRecord)=>x.id).map((x:AnyRecord)=>({id:String(x.id),abbreviation:String(x.abbreviation??x.shortDisplayName??x.name??''),name:String(x.displayName??x.name??''),shortName:String(x.shortDisplayName??x.name??''),logo:typeof x.logos?.[0]?.href==='string'?x.logos[0].href:null})).filter((x:any)=>x.abbreviation&&x.name).sort((a:any,b:any)=>a.name.localeCompare(b.name));if(teams.length)return{teams,provider:'ESPN',warning:null};throw new Error('Empty team directory')}catch(e){const fallback=PRO_TEAM_FALLBACK[league];if(fallback?.length)return{teams:fallback.map(([abbreviation,name],i)=>({id:`fallback-${league}-${i}`,abbreviation,name,shortName:name,logo:null})),provider:'Local fallback',warning:'Live team directory unavailable; using complete pro fallback list.'};throw e}
}
router.get('/sports/teams',async(req,res):Promise<void>=>{const league=String(req.query.league??'').toLowerCase() as LeagueKey;if(!LEAGUES[league]){res.status(400).json({error:'Unsupported league'});return}try{res.set('Cache-Control','public, max-age=1800');res.json({league,...await loadTeams(league)})}catch(e){res.status(502).json({error:`${LEAGUES[league].label} team directory unavailable`,detail:e instanceof Error?e.message:'Unknown error'})}});

function parsePickcenter(pc:AnyRecord){
 if(!Object.keys(pc).length)return null; const spread=num(pc.spread), total=num(pc.overUnder);const away=rec(pc.awayTeamOdds),home=rec(pc.homeTeamOdds);const awayFav=away.favorite===true,homeFav=home.favorite===true;
 return {awaySpread:spread===null?null:(awayFav?-Math.abs(spread):homeFav?Math.abs(spread):null),homeSpread:spread===null?null:(homeFav?-Math.abs(spread):awayFav?Math.abs(spread):null),awaySpreadPrice:price(away.spreadOdds),homeSpreadPrice:price(home.spreadOdds),awayMoneyline:price(away.moneyLine),homeMoneyline:price(home.moneyLine),total,overPrice:price(pc.overOdds),underPrice:price(pc.underOdds)};
}

const historicalOddsCache=new Map<string,{expires:number,value:{odds:AnyRecord|null,source:string|null}}>();
function parseLicensedOdds(payload:AnyRecord){
 const row=Array.isArray(payload)?rec(payload[0]):rec(payload.GameOdds?.[0]??payload.gameOdds?.[0]??payload);
 if(!Object.keys(row).length)return null;
 const spread=num(row.PointSpread??row.pointSpread??row.HomePointSpread??row.homePointSpread);
 const awaySpread=num(row.AwayPointSpread??row.awayPointSpread)??(spread===null?null:Math.abs(spread));
 const homeSpread=num(row.HomePointSpread??row.homePointSpread)??(spread===null?null:-Math.abs(spread));
 const out={awaySpread,homeSpread,awaySpreadPrice:price(row.AwayPointSpreadPayout??row.awayPointSpreadPayout??row.AwaySpreadPrice),homeSpreadPrice:price(row.HomePointSpreadPayout??row.homePointSpreadPayout??row.HomeSpreadPrice),awayMoneyline:price(row.AwayMoneyLine??row.awayMoneyLine??row.AwayMoneyline),homeMoneyline:price(row.HomeMoneyLine??row.homeMoneyLine??row.HomeMoneyline),total:num(row.OverUnder??row.overUnder??row.Total),overPrice:price(row.OverPayout??row.overPayout??row.OverPrice),underPrice:price(row.UnderPayout??row.underPayout??row.UnderPrice)};
 return Object.values(out).some(v=>v!==null)?out:null;
}
async function fetchLicensedHistoricalOdds(league:LeagueKey,event:AnyRecord){
 const key=process.env.SPORTSDATAIO_API_KEY,template=process.env.SPORTSDATAIO_HISTORICAL_ODDS_URL_TEMPLATE;if(!key||!template)return null;
 const comp=rec(event.competitions?.[0]),cs=Array.isArray(comp.competitors)?comp.competitors:[],away=cs.find((x:AnyRecord)=>x.homeAway==='away'),home=cs.find((x:AnyRecord)=>x.homeAway==='home');
 const id=String(event.id??''),date=String(event.date??'').slice(0,10);if(!id)return null;const cacheKey=`${league}:${id}`,cached=historicalOddsCache.get(cacheKey);if(cached&&cached.expires>Date.now())return cached.value;
 const url=template.replaceAll('{league}',SDIO_SLUG[league]).replaceAll('{espnEventId}',encodeURIComponent(id)).replaceAll('{gameId}',encodeURIComponent(id)).replaceAll('{date}',encodeURIComponent(date)).replaceAll('{away}',encodeURIComponent(String(away?.team?.abbreviation??''))).replaceAll('{home}',encodeURIComponent(String(home?.team?.abbreviation??'')));
 try{const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/json','Ocp-Apim-Subscription-Key':key}});if(!r.ok)return null;const odds=parseLicensedOdds(rec(await r.json()));const value={odds,source:odds?'SportsDataIO / licensed historical feed':null};historicalOddsCache.set(cacheKey,{expires:Date.now()+15*60_000,value});return value}catch{return null}
}
async function eventOdds(league:LeagueKey,event:AnyRecord){
 const licensed=await fetchLicensedHistoricalOdds(league,event);if(licensed?.odds)return licensed;
 const cfg=LEAGUES[league],id=String(event.id??'');
 if(id){try{const summary=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/summary?event=${encodeURIComponent(id)}`);const pc=parsePickcenter(rec(summary.pickcenter?.[0]));if(pc&&(pc.awaySpread!==null||pc.awayMoneyline!==null||pc.total!==null))return{odds:pc,source:'ESPN summary/pickcenter'}}catch{}}
 const direct=parseOdds(rec(event.competitions?.[0]));if(direct&&(direct.awaySpread!==null||direct.awayMoneyline!==null||direct.total!==null))return{odds:direct,source:'ESPN scoreboard'};
 return{odds:null,source:null};}
async function mapLimit<T,R>(items:T[],limit:number,fn:(x:T)=>Promise<R>){const out:R[]=new Array(items.length);let idx=0;async function worker(){while(true){const i=idx++;if(i>=items.length)return;out[i]=await fn(items[i])}}await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out}

router.get("/sports/scoreboard", async (req, res): Promise<void> => {
  const league = String(req.query.league ?? "mlb").toLowerCase() as LeagueKey;
  const date = String(req.query.date ?? "");
  const cfg = LEAGUES[league];
  if (!cfg) { res.status(400).json({ error: "Unsupported league." }); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "Use date YYYY-MM-DD." }); return; }
  const compact = date.replaceAll("-", "");
  const url = `https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/scoreboard?dates=${compact}&limit=300`;
  try {
    const data = await fetchJson(url);
    const games = await Promise.all((Array.isArray(data.events) ? data.events : []).map(async (event: AnyRecord) => {
      const competition = rec(event.competitions?.[0]);
      const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
      const away = competitors.find((x: AnyRecord) => x.homeAway === "away") ?? {};
      const home = competitors.find((x: AnyRecord) => x.homeAway === "home") ?? {};
      const st = status(rec(event.status ?? competition.status));
      const stType = rec(rec(event.status ?? competition.status).type);
      const situation = rec(competition.situation);
      const period = num(rec(event.status ?? competition.status).period);
      const detail = String(stType.shortDetail ?? stType.detail ?? "");
      const game: AnyRecord = {
        id: String(event.id ?? `${league}-${date}-${event.name ?? "game"}`),
        league,
        leagueLabel: cfg.label,
        sport: cfg.sport,
        status: st.status,
        statusLabel: st.status === "live" ? detail || "LIVE" : st.label,
        startTime: String(event.date ?? competition.date ?? `${date}T00:00:00Z`),
        venue: String(rec(competition.venue).fullName ?? "Venue TBD"),
        periodLabel: st.status === "live" ? detail || (period ? `Period ${period}` : "LIVE") : null,
        inning: league === "mlb" && st.status === "live" ? detail || null : null,
        balls: league === "mlb" && st.status === "live" ? num(situation.balls) : null,
        strikes: league === "mlb" && st.status === "live" ? num(situation.strikes) : null,
        outs: league === "mlb" && st.status === "live" ? num(situation.outs) : null,
        onFirst: league === "mlb" && st.status === "live" ? bool(situation.onFirst) : null,
        onSecond: league === "mlb" && st.status === "live" ? bool(situation.onSecond) : null,
        onThird: league === "mlb" && st.status === "live" ? bool(situation.onThird) : null,
        away: team(away), home: team(home), betting: parseOdds(competition),
      };
      if (game.betting) { const splits = await fetchSportsDataSplits(league, game.id, game.away.abbreviation, game.home.abbreviation).catch(()=>null); if(splits) game.betting = { ...game.betting, splits }; }
      return game;
    }));
    res.set("Cache-Control", "no-store");
    res.json({ league, leagueLabel: cfg.label, date, provider: "ESPN", providerUrl: url, games, warning: null });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown provider error";
    req.log.error({ league, date, detail }, "Multi-sport scoreboard failed");
    res.status(502).json({ error: `${cfg.label} data is temporarily unavailable.`, detail });
  }
});

type TrendGame = {
  date: string; opponent: string; location: "home" | "away"; teamScore: number; opponentScore: number;
  spread: number | null; coverResult: "W" | "L" | "P" | null; moneyline: number | null;
  total: number | null; totalResult: "O" | "U" | "P" | null; source?: string | null;
};

function metric(label: string, results: Array<"W" | "L" | "P">) {
  const wins = results.filter(x => x === "W").length;
  const losses = results.filter(x => x === "L").length;
  const pushes = results.filter(x => x === "P").length;
  const decisions = wins + losses;
  return { label, wins, losses, pushes, sample: results.length, rate: decisions ? (wins / decisions) * 100 : null };
}

function dateDaysAgo(days: number) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10);
}



function detectTimeframe(q:string){const lower=q.toLowerCase(),m=lower.match(/last\s+(\d{1,2})/);if(/last season|previous season/.test(lower))return{kind:'last-season' as const,count:60,label:'Last season'};if(/this season|current season|season to date/.test(lower))return{kind:'season' as const,count:60,label:'This season'};const count=m?Math.max(1,Math.min(30,Number(m[1]))):10;return{kind:'recent' as const,count,label:`Last ${count} games`}}
function detectRecentCount(q:string){return detectTimeframe(q).count}
function detectGenericMetric(league:LeagueKey,q:string){const s=q.toLowerCase();if(/points? allowed|give up|allowed per game/.test(s))return'team_points_allowed';if(/points? per game|average points|score per game/.test(s))return'team_points_for';if(/win rate|record|wins/.test(s))return'team_win_rate';if(league==='nba'||league==='ncaab'){if(/rebound/.test(s))return'rebounds';if(/assist/.test(s))return'assists';if(/three|3pt|3-point/.test(s))return'threes';if(/steal/.test(s))return'steals';if(/block/.test(s))return'blocks';if(/point/.test(s))return'points'}else{if(/passing.*yard|pass yards/.test(s))return'passing_yards';if(/rushing.*yard|rush yards/.test(s))return'rushing_yards';if(/receiv.*yard/.test(s))return'receiving_yards';if(/reception/.test(s))return'receptions';if(/touchdown|\btds?\b/.test(s))return'touchdowns';if(/interception/.test(s))return'interceptions';if(/sack/.test(s))return'sacks'}return null}
async function recentTeamEvents(league:LeagueKey,abbr:string,timeframe:{kind:'recent'|'season'|'last-season';count:number}){const cfg=LEAGUES[league],events:AnyRecord[]=[];const accept=(e:AnyRecord)=>{const c=rec(e.competitions?.[0]),cs=Array.isArray(c.competitors)?c.competitors:[];return status(rec(e.status??c.status)).status==='final'&&cs.some((x:AnyRecord)=>String(x?.team?.abbreviation??'').toUpperCase()===abbr.toUpperCase())};if(timeframe.kind!=='recent'){const year=new Date().getUTCFullYear()-(timeframe.kind==='last-season'?1:0);try{const d=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/scoreboard?dates=${year}&limit=2000`);events.push(...(Array.isArray(d.events)?d.events:[]).filter(accept))}catch{}}else{for(let off=0;off<420&&events.length<timeframe.count;off+=21){const end=dateDaysAgo(off),start=dateDaysAgo(off+20),range=`${start.replaceAll('-','')}-${end.replaceAll('-','')}`;try{const d=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/scoreboard?dates=${range}&limit=1000`);events.push(...(Array.isArray(d.events)?d.events:[]).filter(accept))}catch{}}}return events.sort((a,b)=>String(b.date??'').localeCompare(String(a.date??''))).slice(0,timeframe.count)}
function properNameCandidate(q:string){const chunks=q.match(/\b[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3}\b/g)||[];return chunks.sort((a,b)=>b.length-a.length)[0]||q.replace(/\b(what|how|many|much|average|averaging|this|season|last|games?|yards?|points?|rebounds?|assists?|touchdowns?|does|is|are|did)\b/gi,' ').replace(/\s+/g,' ').trim()}
async function searchAthlete(q:string){const name=properNameCandidate(q);try{const d=await fetchJson(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=12&type=player`);const items=Array.isArray(d.items)?d.items:Array.isArray(d.results)?d.results:[];const item=items.find((x:AnyRecord)=>/athlete|player/i.test(String(x.type??x.contentType??'')))??items[0];if(!item)return null;return{id:String(item.id??item.uid??''),name:String(item.displayName??item.name??name)}}catch{return null}}
function numericStat(value:any){if(typeof value==='number')return value;if(typeof value==='string'){const n=Number(value.replace(/,/g,''));return Number.isFinite(n)?n:null}return null}
function statMatch(metric:string,label:string,group=''){const l=label.toLowerCase(),g=group.toLowerCase();const aliases:Record<string,string[]>={points:['pts','points'],rebounds:['reb','rebounds'],assists:['ast','assists'],threes:['3pt','3pm','3-pointers'],steals:['stl','steals'],blocks:['blk','blocks'],passing_yards:['yds','passing yards'],rushing_yards:['yds','rushing yards'],receiving_yards:['yds','receiving yards'],receptions:['rec','receptions'],touchdowns:['td','touchdowns'],interceptions:['int','interceptions'],sacks:['sacks','sack']};const groupNeed:Record<string,string[]>={passing_yards:['passing'],rushing_yards:['rushing'],receiving_yards:['receiving'],receptions:['receiving'],sacks:['defensive','defense']};if(groupNeed[metric]?.length&&g&&!groupNeed[metric].some(x=>g.includes(x)))return false;return (aliases[metric]||[]).some(a=>l===a||l.includes(a))}
router.post('/sports/wingman',async(req,res):Promise<void>=>{const league=String(req.body?.league??'').toLowerCase() as LeagueKey,q=String(req.body?.question??'').trim(),previous=rec(req.body?.context);if(!LEAGUES[league]||league==='mlb'||!q){res.status(400).json({error:'Choose NFL, NBA, NCAAF or NCAAB and ask a question.'});return}const detectedMetric=detectGenericMetric(league,q); const previousMetric=String(previous.metric??'').trim(); const metric=detectedMetric ?? (previousMetric || null), timeframe=detectTimeframe(q),count=timeframe.count;try{const directory=(await loadTeams(league)).teams;const lower=q.toLowerCase();const priorAbbr=String(previous.teamAbbreviation??'');const teamEntry=directory.find((x:any)=>lower.includes(x.name.toLowerCase())||lower.includes(x.abbreviation.toLowerCase()))||directory.find((x:any)=>x.abbreviation.toUpperCase()===priorAbbr.toUpperCase());if(metric?.startsWith('team_')){if(!teamEntry){res.status(422).json({error:`Which ${LEAGUES[league].label} team should I analyze?`,context:{...previous,league,metric}});return}const events=await recentTeamEvents(league,teamEntry.abbreviation,timeframe);const games=events.map(e=>{const c=rec(e.competitions?.[0]),cs=Array.isArray(c.competitors)?c.competitors:[],me=cs.find((x:AnyRecord)=>String(x?.team?.abbreviation??'').toUpperCase()===teamEntry.abbreviation.toUpperCase()),op=cs.find((x:AnyRecord)=>x!==me);return{for:num(me?.score),against:num(op?.score)}}).filter(x=>x.for!==null&&x.against!==null) as Array<{for:number;against:number}>;const avgFor=games.length?games.reduce((a,b)=>a+b.for,0)/games.length:0,avgAgainst=games.length?games.reduce((a,b)=>a+b.against,0)/games.length:0,wins=games.filter(g=>g.for>g.against).length;const primary=metric==='team_points_allowed'?['Points allowed/game',avgAgainst.toFixed(1)]:metric==='team_win_rate'?['Win rate',games.length?`${(wins/games.length*100).toFixed(1)}%`:'—']:['Points/game',avgFor.toFixed(1)];const result={title:`${teamEntry.name} recent form`,entityName:teamEntry.name,timeframeLabel:timeframe.kind==='recent'?`Last ${games.length} completed games`:timeframe.label,primaryLabel:primary[0],primaryValue:primary[1],stats:[{label:'Points/game',value:avgFor.toFixed(1)},{label:'Allowed/game',value:avgAgainst.toFixed(1)},{label:'Record',value:`${wins}-${games.length-wins}`},{label:'Games',value:String(games.length)}],sampleLabel:`${games.length} games`,source:'ESPN game results',note:'Recent-game aggregation from completed games; use The Numbers for betting-line context.'};res.json({question:q,context:{league,metric,entityType:'team',entityName:teamEntry.name,teamAbbreviation:teamEntry.abbreviation,recentCount:count},result,answer:`${teamEntry.name}: ${primary[0]} is ${primary[1]} over the last ${games.length} completed games.`});return}
 const athlete=(previous.entityType==='player'&&previous.entityName&&!detectedMetric?{id:String(previous.entityId??''),name:String(previous.entityName)}:await searchAthlete(q));if(!athlete){res.status(422).json({error:'Include the player name and stat you want Wingman to analyze.',context:{...previous,league,metric}});return}if(!metric){res.status(422).json({error:'Tell Wingman which player stat you want (for example points, rebounds, assists, passing yards, rushing yards, receiving yards, receptions or touchdowns).',context:{...previous,league,entityType:'player',entityName:athlete.name}});return}
 // Search recent summaries league-wide for the player; bounded to recent completed games on scoreboard windows.
 const cfg=LEAGUES[league],all:AnyRecord[]=[];if(timeframe.kind!=='recent'){const year=new Date().getUTCFullYear()-(timeframe.kind==='last-season'?1:0);try{const d=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/scoreboard?dates=${year}&limit=2000`);all.push(...(Array.isArray(d.events)?d.events:[]).filter((e:AnyRecord)=>status(rec(e.status??rec(e.competitions?.[0]).status)).status==='final'))}catch{}}else{for(let off=0;off<75&&all.length<40;off+=7){const end=dateDaysAgo(off),start=dateDaysAgo(off+6),range=`${start.replaceAll('-','')}-${end.replaceAll('-','')}`;try{const d=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/scoreboard?dates=${range}&limit=1000`);all.push(...(Array.isArray(d.events)?d.events:[]).filter((e:AnyRecord)=>status(rec(e.status??rec(e.competitions?.[0]).status)).status==='final'))}catch{}}}
 const values:number[]=[];await mapLimit(all.slice(0,50),5,async e=>{if(values.length>=count)return;try{const s=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/summary?event=${encodeURIComponent(String(e.id))}`),groups=Array.isArray(rec(s.boxscore).players)?rec(s.boxscore).players:[];for(const g of groups){for(const sg of (Array.isArray(g.statistics)?g.statistics:[])){const labels=Array.isArray(sg.labels)?sg.labels:Array.isArray(sg.keys)?sg.keys:[];for(const ar of (Array.isArray(sg.athletes)?sg.athletes:[])){const a=rec(ar.athlete);if(String(a.displayName??a.fullName??'').toLowerCase()!==athlete.name.toLowerCase()&&String(a.id??'')!==athlete.id)continue;const stats=Array.isArray(ar.stats)?ar.stats:[];for(let i=0;i<labels.length;i++){if(statMatch(metric,String(labels[i]),String(sg.name??sg.displayName??sg.type??''))){const n=numericStat(stats[i]);if(n!==null){values.push(n);return}}}}}}}catch{}});const sample=values.slice(0,count),avg=sample.length?sample.reduce((a,b)=>a+b,0)/sample.length:null;const label=metric.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());const result={title:`${athlete.name} ${label}`,entityName:athlete.name,timeframeLabel:timeframe.kind==='recent'?`Last ${sample.length} games with stat data`:timeframe.label,primaryLabel:`Average ${label}`,primaryValue:avg===null?'—':avg.toFixed(1),stats:[{label:'Average',value:avg===null?'—':avg.toFixed(1)},{label:'Last game',value:sample[0]==null?'—':String(sample[0])},{label:'High',value:sample.length?String(Math.max(...sample)):'—'},{label:'Games',value:String(sample.length)}],sampleLabel:`${sample.length} games`,source:'ESPN box scores',note:'Player averages use recent completed games where ESPN published the requested box-score stat.'};res.json({question:q,context:{league,metric,entityType:'player',entityName:athlete.name,entityId:athlete.id,recentCount:count},result,answer:`${athlete.name}: average ${label.toLowerCase()} is ${result.primaryValue} over ${sample.length} recent games with data.`})}catch(e){res.status(502).json({error:`Wingman could not load that ${LEAGUES[league].label} statistic right now.`,detail:e instanceof Error?e.message:'Unknown analytics error',context:{...previous,league,metric}})}});

router.get("/sports/game-detail", async (req, res): Promise<void> => {
  const league = String(req.query.league ?? "").toLowerCase() as LeagueKey;
  const id = String(req.query.id ?? "");
  const cfg = LEAGUES[league];
  if (!cfg || !id) { res.status(400).json({ error: "league and id are required." }); return; }
  const url = `https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/summary?event=${encodeURIComponent(id)}`;
  try {
    const data = await fetchJson(url);
    const headerComp = rec(rec(data.header).competitions?.[0]);
    const competitors = Array.isArray(headerComp.competitors) ? headerComp.competitors : [];
    const awayComp = competitors.find((x: AnyRecord) => x.homeAway === "away") ?? {};
    const homeComp = competitors.find((x: AnyRecord) => x.homeAway === "home") ?? {};
    const st = status(rec(headerComp.status ?? rec(data.header).status));
    const game = { id, league, leagueLabel: cfg.label, status: st.status, statusLabel: String(rec(rec(headerComp.status).type).shortDetail ?? st.label), startTime: String(headerComp.date ?? ""), venue: String(rec(headerComp.venue).fullName ?? "Venue TBD"), away: team(awayComp), home: team(homeComp), betting: parseOdds(headerComp) };
    const awayLines = Array.isArray(awayComp.linescores) ? awayComp.linescores : [], homeLines = Array.isArray(homeComp.linescores) ? homeComp.linescores : [];
    const count = Math.max(awayLines.length, homeLines.length);
    const linescores = Array.from({ length: count }, (_, i) => ({ label: league === "mlb" ? String(i + 1) : (league === "ncaab" ? `H${i+1}` : `Q${i+1}`), away: num(rec(awayLines[i]).value ?? rec(awayLines[i]).displayValue), home: num(rec(homeLines[i]).value ?? rec(homeLines[i]).displayValue) }));
    const boxscore = rec(data.boxscore), teams = Array.isArray(boxscore.teams) ? boxscore.teams : [];
    const awayStats = rec(teams.find((x:AnyRecord)=>String(rec(x.team).id)===String(rec(awayComp.team).id))), homeStats = rec(teams.find((x:AnyRecord)=>String(rec(x.team).id)===String(rec(homeComp.team).id)));
    const aStats = Array.isArray(awayStats.statistics) ? awayStats.statistics : [], hStats = Array.isArray(homeStats.statistics) ? homeStats.statistics : [];
    const labels = new Set<string>([...aStats,...hStats].map((x:AnyRecord)=>String(x.label ?? x.name ?? "")).filter(Boolean));
    const teamStats = Array.from(labels).slice(0,18).map(label => { const a=rec(aStats.find((x:AnyRecord)=>String(x.label ?? x.name)===label)), h=rec(hStats.find((x:AnyRecord)=>String(x.label ?? x.name)===label)); return { label, away:String(a.displayValue ?? a.value ?? "—"), home:String(h.displayValue ?? h.value ?? "—") }; });
    const playerGroups = Array.isArray(boxscore.players) ? boxscore.players : [];
    const players = playerGroups.map((group:AnyRecord)=>{ const statsGroups=Array.isArray(group.statistics)?group.statistics:[], athletesMap=new Map<string,AnyRecord>(); for(const sg of statsGroups){ const keys=Array.isArray(sg.keys)?sg.keys:[], labels=Array.isArray(sg.labels)?sg.labels:keys; for(const a of (Array.isArray(sg.athletes)?sg.athletes:[])){ const ar=rec(a), athlete=rec(ar.athlete), aid=String(athlete.id ?? athlete.displayName ?? Math.random()); const existing=athletesMap.get(aid) ?? {name:String(athlete.displayName ?? athlete.fullName ?? "Player"),position:String(rec(athlete.position).abbreviation ?? ""),stats:[]}; const vals=Array.isArray(ar.stats)?ar.stats:[]; vals.forEach((v:any,i:number)=>existing.stats.push({label:String(labels[i] ?? keys[i] ?? `Stat ${i+1}`),value:String(v)})); athletesMap.set(aid,existing); } } return {team:String(rec(group.team).displayName ?? rec(group.team).shortDisplayName ?? "Team"),athletes:Array.from(athletesMap.values())}; }).filter((g:any)=>g.athletes.length);
    res.set("Cache-Control","no-store"); res.json({ league, leagueLabel:cfg.label, game, linescores, teamStats, players, warning: players.length ? null : "Some providers publish player box scores only after the game begins." });
  } catch (error) { const detail = error instanceof Error ? error.message : "Unknown game detail error"; req.log.error({ league, id, detail }, "Game detail failed"); res.status(502).json({ error: `${cfg.label} game detail is temporarily unavailable.`, detail }); }
});

router.get("/sports/betting-trends", async (req, res): Promise<void> => {
  const league=String(req.query.league??'mlb').toLowerCase() as LeagueKey, teamAbbr=String(req.query.team??'').toUpperCase(), windowKey=String(req.query.window??'30'),cfg=LEAGUES[league];
  if(!cfg||!teamAbbr){res.status(400).json({error:'Choose a league and team.'});return}if(!['10','30','season'].includes(windowKey)){res.status(400).json({error:'Window must be 10, 30, or season.'});return}
  const target=windowKey==='10'?10:windowKey==='30'?30:60;try{const events:AnyRecord[]=[];for(let off=0;off<(windowKey==='season'?365:500)&&events.length<target;off+=21){const end=dateDaysAgo(off),start=dateDaysAgo(off+20),range=`${start.replaceAll('-','')}-${end.replaceAll('-','')}`;try{const d=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/scoreboard?dates=${range}&limit=1000`);events.push(...(Array.isArray(d.events)?d.events:[]).filter((e:AnyRecord)=>{const c=rec(e.competitions?.[0]),cs=Array.isArray(c.competitors)?c.competitors:[];return status(rec(e.status??c.status)).status==='final'&&cs.some((x:AnyRecord)=>String(x?.team?.abbreviation??'').toUpperCase()===teamAbbr)}))}catch{/* provider range failure: continue to next chunk */}}
  const selected=events.sort((a,b)=>String(b.date??'').localeCompare(String(a.date??''))).slice(0,target);const oddsResults=await mapLimit(selected,6,e=>eventOdds(league,e));const history:TrendGame[]=[];
  selected.forEach((event,i)=>{const comp=rec(event.competitions?.[0]),cs=Array.isArray(comp.competitors)?comp.competitors:[],me=cs.find((x:AnyRecord)=>String(x?.team?.abbreviation??'').toUpperCase()===teamAbbr),op=cs.find((x:AnyRecord)=>x!==me);if(!me||!op)return;const teamScore=num(me.score),opponentScore=num(op.score);if(teamScore===null||opponentScore===null)return;const o=oddsResults[i]?.odds??null,loc=me.homeAway==='home'?'home':'away',spread=o?(loc==='home'?o.homeSpread:o.awaySpread):null,moneyline=o?(loc==='home'?o.homeMoneyline:o.awayMoneyline):null,total=o?.total??null,adj=spread===null?null:teamScore+spread,cover=adj===null?null:adj>opponentScore?'W':adj<opponentScore?'L':'P',combined=teamScore+opponentScore,totalResult=total===null?null:combined>total?'O':combined<total?'U':'P';history.push({date:String(event.date??'').slice(0,10),opponent:String(op?.team?.abbreviation??op?.team?.shortDisplayName??'OPP'),location:loc,teamScore,opponentScore,spread,coverResult:cover,moneyline,total,totalResult,source:oddsResults[i]?.source??null})});
  const withSpread=history.filter(g=>g.coverResult!==null), overall=withSpread.map(g=>g.coverResult!) as Array<'W'|'L'|'P'>,home=withSpread.filter(g=>g.location==='home').map(g=>g.coverResult!) as Array<'W'|'L'|'P'>,away=withSpread.filter(g=>g.location==='away').map(g=>g.coverResult!) as Array<'W'|'L'|'P'>,favorites=withSpread.filter(g=>(g.spread??0)<0).map(g=>g.coverResult!) as Array<'W'|'L'|'P'>,underdogs=withSpread.filter(g=>(g.spread??0)>0).map(g=>g.coverResult!) as Array<'W'|'L'|'P'>,favoriteMl=history.filter(g=>g.moneyline!==null&&g.moneyline<0).map(g=>g.teamScore>g.opponentScore?'W' as const:'L' as const),overs=history.filter(g=>g.totalResult!==null).map(g=>g.totalResult==='O'?'W' as const:g.totalResult==='U'?'L' as const:'P' as const);const withOdds=history.filter(g=>g.spread!==null||g.moneyline!==null||g.total!==null),sources=[...new Set(withOdds.map(g=>g.source).filter(Boolean))];res.set('Cache-Control','no-store');res.json({league,leagueLabel:cfg.label,team:teamAbbr,teamName:teamAbbr,window:windowKey,windowLabel:windowKey==='10'?'Last 10 completed games':windowKey==='30'?'Last 30 completed games':'Season window',gamesReviewed:history.length,gamesWithOdds:withOdds.length,providerSummary:sources.length?sources.join(' → '):'No archived line source returned a usable market',metrics:{overallCover:metric('Overall cover',overall),homeCover:metric('At home',home),awayCover:metric('On road',away),favoriteCover:metric('As favorite',favorites),underdogCover:metric('As underdog',underdogs),favoriteMoneylineWin:metric('Favorite ML wins',favoriteMl),overRate:metric('Games over total',overs)},recent:withOdds.slice(0,8),warning:withOdds.length<Math.min(5,history.length)?'Archived lines are included only when a provider returns a legitimate market. Missing lines are excluded, never treated as losses.':null})
  }catch(e){const detail=e instanceof Error?e.message:'Unknown betting trend error';req.log.error({league,teamAbbr,detail},'Multi-sport betting trends failed');res.status(502).json({error:`${cfg.label} betting history is temporarily unavailable.`,detail})}
});
export default router;