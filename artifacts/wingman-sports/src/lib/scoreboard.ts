import type { LeagueKey } from './sports-directory';

const ESPN: Record<LeagueKey,{sport:string;slug:string;label:string}> = {
  mlb:{sport:'baseball',slug:'mlb',label:'MLB'},
  nfl:{sport:'football',slug:'nfl',label:'NFL'},
  nba:{sport:'basketball',slug:'nba',label:'NBA'},
  ncaaf:{sport:'football',slug:'college-football',label:'NCAAF'},
  ncaab:{sport:'basketball',slug:'mens-college-basketball',label:'NCAAB'},
};

type ScoreboardPayload = {
  league: LeagueKey;
  leagueLabel: string;
  date: string;
  provider: string;
  providerUrl: string;
  games: any[];
  warning: string | null;
  oddsProvider?: string | null;
};

function obj(v:any){return v&&typeof v==='object'?v:{}}
function n(v:any):number|null{const x=typeof v==='number'?v:Number(v);return Number.isFinite(x)?x:null}
function p(v:any):number|null{if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'){const m=v.match(/[+-]?\d+/);return m?Number(m[0]):null}return null}
function status(raw:any){const t=obj(raw?.type);const state=String(t.state??t.name??'').toLowerCase();const label=String(t.shortDetail??t.detail??t.description??'UPCOMING');if(state==='in'||state.includes('progress'))return{status:'live',label};if(state==='post'||state.includes('final')||t.completed===true)return{status:'final',label};if(state.includes('postpon'))return{status:'postponed',label};if(state.includes('cancel'))return{status:'canceled',label};return{status:'upcoming',label}}
function team(comp:any){const t=obj(comp?.team);return{abbreviation:String(t.abbreviation??t.shortDisplayName?.slice(0,4)??'TBD'),name:String(t.displayName??t.name??'TBD'),shortName:String(t.shortDisplayName??t.name??'TBD'),score:n(comp?.score),record:Array.isArray(comp?.records)?String(comp.records?.[0]?.summary??'')||null:null,logo:typeof t.logo==='string'?t.logo:typeof t.logos?.[0]?.href==='string'?t.logos[0].href:null}}
function odds(comp:any){const o=obj(comp?.odds?.[0]);if(!Object.keys(o).length)return null;const spread=n(o.spread),awayFav=obj(o.awayTeamOdds).favorite===true,homeFav=obj(o.homeTeamOdds).favorite===true;return{awaySpread:spread===null?null:awayFav?-Math.abs(spread):Math.abs(spread),homeSpread:spread===null?null:homeFav?-Math.abs(spread):Math.abs(spread),awaySpreadPrice:p(obj(o.awayTeamOdds).spreadOdds),homeSpreadPrice:p(obj(o.homeTeamOdds).spreadOdds),awayMoneyline:p(obj(o.awayTeamOdds).moneyLine),homeMoneyline:p(obj(o.homeTeamOdds).moneyLine),total:n(o.overUnder),overPrice:p(o.overOdds),underPrice:p(o.underOdds),splits:null,source:'ESPN',bookmaker:String(obj(o.provider).name??'ESPN')}}
async function json(response:Response){const text=await response.text();if(!text.trim())throw new Error(`Empty response (${response.status||'network'})`);let payload:any;try{payload=JSON.parse(text)}catch{throw new Error(`Invalid JSON response (${response.status||'network'})`)}if(!response.ok)throw new Error(payload?.detail||payload?.error||`Request failed (${response.status})`);return payload}

function cacheKey(league:LeagueKey,date:string){return `wingman:scoreboard:${league}:${date}`}
function readCache(league:LeagueKey,date:string):ScoreboardPayload|null{if(typeof window==='undefined')return null;try{const raw=window.localStorage.getItem(cacheKey(league,date));if(!raw)return null;const parsed=JSON.parse(raw);return parsed&&Array.isArray(parsed.games)?parsed:null}catch{return null}}
function writeCache(value:ScoreboardPayload){if(typeof window==='undefined')return;try{window.localStorage.setItem(cacheKey(value.league,value.date),JSON.stringify(value))}catch{/* storage unavailable */}}
function remember(value:ScoreboardPayload){writeCache(value);return value}

function fromEspn(league:LeagueKey,date:string,payload:any):ScoreboardPayload{const cfg=ESPN[league];const games=(Array.isArray(payload?.events)?payload.events:[]).map((e:any)=>{const c=obj(e?.competitions?.[0]),cs=Array.isArray(c.competitors)?c.competitors:[],away=cs.find((x:any)=>x?.homeAway==='away')??cs[0]??{},home=cs.find((x:any)=>x?.homeAway==='home')??cs[1]??{},st=status(e?.status??c.status),sit=obj(c.situation);return{id:String(e.id??c.id??''),league,leagueLabel:cfg.label,sport:cfg.sport,status:st.status,statusLabel:st.label,startTime:String(e.date??c.date??''),venue:String(obj(c.venue).fullName??'Venue TBD'),periodLabel:String(obj(obj(e.status).type).shortDetail??'')||null,inning:league==='mlb'?String(sit?.inning??'')||null:null,balls:league==='mlb'?n(sit?.balls):null,strikes:league==='mlb'?n(sit?.strikes):null,outs:league==='mlb'?n(sit?.outs):null,onFirst:league==='mlb'?Boolean(sit?.onFirst):null,onSecond:league==='mlb'?Boolean(sit?.onSecond):null,onThird:league==='mlb'?Boolean(sit?.onThird):null,away:team(away),home:team(home),betting:odds(c)}}).filter((g:any)=>g.id);return{league,leagueLabel:cfg.label,date,provider:'ESPN direct',providerUrl:'https://site.api.espn.com/',games,warning:'Wingman API was unavailable, so this scoreboard was loaded directly from ESPN. Betting splits still require a legitimate betting provider.'}}

function mlbState(game:any){const detailed=String(game?.status?.detailedState??'').toLowerCase(),abstract=String(game?.status?.abstractGameState??'').toLowerCase();if(detailed.includes('postpon'))return'postponed';if(detailed.includes('cancel'))return'canceled';if(abstract==='live')return'live';if(abstract==='final')return'final';return'upcoming'}
function mlbTeam(side:any){const t=obj(side?.team),id=String(t.id??'');const wins=n(side?.leagueRecord?.wins),losses=n(side?.leagueRecord?.losses);return{abbreviation:String(t.abbreviation??t.shortName??t.teamName??t.name??'TBD').slice(0,5),name:String(t.name??t.teamName??'TBD'),shortName:String(t.shortName??t.teamName??t.name??'TBD'),score:n(side?.score),record:wins!==null&&losses!==null?`${wins}-${losses}`:null,logo:id?`https://www.mlbstatic.com/team-logos/${id}.svg`:null}}
function fromMlb(date:string,payload:any):ScoreboardPayload{const rawGames=(Array.isArray(payload?.dates)?payload.dates:[]).flatMap((d:any)=>Array.isArray(d?.games)?d.games:[]);const games=rawGames.map((g:any)=>{const st=mlbState(g),line=obj(g?.linescore),off=obj(line?.offense);return{id:String(g?.gamePk??''),league:'mlb' as const,leagueLabel:'MLB',sport:'baseball',status:st,statusLabel:String(g?.status?.detailedState??g?.status?.abstractGameState??'UPCOMING'),startTime:String(g?.gameDate??''),venue:String(g?.venue?.name??'Venue TBD'),periodLabel:st==='live'?String(line?.inningHalf??line?.inningState??'LIVE'):null,inning:st==='live'&&line?.currentInning?`${line?.inningHalf??''} ${line.currentInning}`.trim():null,balls:st==='live'?n(line?.balls):null,strikes:st==='live'?n(line?.strikes):null,outs:st==='live'?n(line?.outs):null,onFirst:st==='live'?Boolean(off?.first):null,onSecond:st==='live'?Boolean(off?.second):null,onThird:st==='live'?Boolean(off?.third):null,away:mlbTeam(g?.teams?.away),home:mlbTeam(g?.teams?.home),betting:null}}).filter((g:any)=>g.id);return{league:'mlb',leagueLabel:'MLB',date,provider:'MLB Stats API',providerUrl:'https://statsapi.mlb.com/',games,warning:'Loaded from the official MLB data feed because the Wingman API was unavailable. Betting markets are filled only when a legitimate configured odds source supplies them.'}}

function localDateString(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function nbaTeam(side:any){const wins=n(side?.wins),losses=n(side?.losses);return{abbreviation:String(side?.teamTricode??'TBD'),name:String(side?.teamName??side?.teamCity??'TBD'),shortName:String(side?.teamName??side?.teamTricode??'TBD'),score:n(side?.score),record:wins!==null&&losses!==null?`${wins}-${losses}`:null,logo:null}}
function fromNba(date:string,payload:any):ScoreboardPayload{const rows=Array.isArray(payload?.scoreboard?.games)?payload.scoreboard.games:[];const games=rows.map((g:any)=>{const code=n(g?.gameStatus),st=code===2?'live':code===3?'final':'upcoming';return{id:String(g?.gameId??''),league:'nba' as const,leagueLabel:'NBA',sport:'basketball',status:st,statusLabel:String(g?.gameStatusText??(st==='live'?'LIVE':st.toUpperCase())),startTime:String(g?.gameTimeUTC??''),venue:String(g?.arenaName??'Venue TBD'),periodLabel:st==='live'&&g?.period?`Q${g.period}`:null,inning:null,balls:null,strikes:null,outs:null,onFirst:null,onSecond:null,onThird:null,away:nbaTeam(g?.awayTeam),home:nbaTeam(g?.homeTeam),betting:null}}).filter((g:any)=>g.id);return{league:'nba',leagueLabel:'NBA',date,provider:'NBA.com live data',providerUrl:'https://cdn.nba.com/',games,warning:'Loaded from NBA.com because the Wingman API was unavailable. Betting markets are filled only when a legitimate configured odds source supplies them.'}}

async function tryMlb(date:string){const url=`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}&hydrate=team,linescore`;const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});return fromMlb(date,await json(r))}
async function tryNba(date:string){if(date!==localDateString())throw new Error('NBA.com live scoreboard is available for today only');const url='https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json';const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});return fromNba(date,await json(r))}
async function tryEspn(league:LeagueKey,date:string){const cfg=ESPN[league],compact=date.replaceAll('-','');const url=`https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/scoreboard?dates=${compact}&limit=1000`;const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});return fromEspn(league,date,await json(r))}

function missingCoreMarkets(betting:any){const b=obj(betting);return b.awayMoneyline==null||b.homeMoneyline==null||b.awaySpread==null||b.homeSpread==null||b.total==null}
function normalizeName(v:any){return String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function teamAliases(t:any){return [t?.name,t?.shortName,t?.abbreviation].map(normalizeName).filter((x)=>x.length>=2)}
function sameTeam(providerName:any,t:any){const x=normalizeName(providerName);if(!x)return false;return teamAliases(t).some((a)=>x===a||(a.length>=5&&(x.includes(a)||a.includes(x))))}
function sameGame(a:any,b:any){const aid=String(a?.id??''),bid=String(b?.id??'');if(aid&&bid&&aid===bid)return true;return sameTeam(a?.home?.name??a?.home?.shortName??a?.home?.abbreviation,b?.home)&&sameTeam(a?.away?.name??a?.away?.shortName??a?.away?.abbreviation,b?.away)}
function mergeBetting(current:any,backup:any){const a=obj(current),b=obj(backup);return{awaySpread:a.awaySpread??b.awaySpread??null,homeSpread:a.homeSpread??b.homeSpread??null,awaySpreadPrice:a.awaySpreadPrice??b.awaySpreadPrice??null,homeSpreadPrice:a.homeSpreadPrice??b.homeSpreadPrice??null,awayMoneyline:a.awayMoneyline??b.awayMoneyline??null,homeMoneyline:a.homeMoneyline??b.homeMoneyline??null,total:a.total??b.total??null,overPrice:a.overPrice??b.overPrice??null,underPrice:a.underPrice??b.underPrice??null,splits:a.splits??b.splits??null,source:a.source??b.source??null,bookmaker:a.bookmaker??b.bookmaker??null}}
function hideUnplayedScores(payload:ScoreboardPayload):ScoreboardPayload{
  return{...payload,games:payload.games.map((g:any)=>{
    if(g?.status==='live'||g?.status==='final')return g;
    return{...g,away:{...obj(g?.away),score:null},home:{...obj(g?.home),score:null}};
  })};
}
function restoreCachedMarkets(payload:ScoreboardPayload):ScoreboardPayload{
  const cached=readCache(payload.league,payload.date);
  if(!cached?.games?.length)return payload;
  const games=payload.games.map((g:any)=>{
    const old=cached.games.find((x:any)=>sameGame(g,x));
    if(!old?.betting)return g;
    return{...g,betting:mergeBetting(g?.betting,old.betting)};
  });
  return{...payload,games};
}
async function enrichFinalWithEspnMarkets(payload:ScoreboardPayload):Promise<ScoreboardPayload>{
  const needs=payload.games.some((g:any)=>g?.status==='final'&&missingCoreMarkets(g?.betting));
  if(!needs)return payload;
  try{
    const espn=await tryEspn(payload.league,payload.date);
    let used=0;
    const games=payload.games.map((g:any)=>{
      if(g?.status!=='final'||!missingCoreMarkets(g?.betting))return g;
      const match=espn.games.find((x:any)=>sameGame(g,x));
      if(!match?.betting)return g;
      used+=1;
      return{...g,betting:mergeBetting(g?.betting,match.betting)};
    });
    if(!used)return payload;
    return{...payload,games,oddsProvider:payload.oddsProvider??'ESPN'};
  }catch{return payload}
}
async function enrichWithOddsBackup(payload:ScoreboardPayload):Promise<ScoreboardPayload>{
  const needs=payload.games.some((g:any)=>(g?.status==='upcoming'||g?.status==='live')&&missingCoreMarkets(g?.betting));
  if(!needs)return payload;
  try{
    const r=await fetch(`/api/odds?league=${encodeURIComponent(payload.league)}&date=${encodeURIComponent(payload.date)}`,{cache:'no-store'});
    const backup=await json(r);
    const events=Array.isArray(backup?.events)?backup.events:[];
    if(!events.length)return payload;
    let used=0;
    const games=payload.games.map((g:any)=>{
      if((g?.status!=='upcoming'&&g?.status!=='live')||!missingCoreMarkets(g?.betting))return g;
      const match=events.find((e:any)=>(sameTeam(e?.home,g?.home)&&sameTeam(e?.away,g?.away))||(sameTeam(e?.home,g?.away)&&sameTeam(e?.away,g?.home)));
      if(!match?.betting)return g;
      used+=1;
      return{...g,betting:mergeBetting(g?.betting,match.betting)};
    });
    if(!used)return payload;
    const books=Array.isArray(backup?.bookmakers)?backup.bookmakers.join(', '):'';
    return{...payload,games,oddsProvider:'Odds-API.io',warning:[payload.warning,`Missing betting markets were filled from Odds-API.io${books?` (${books})`:''}.`].filter(Boolean).join(' ')};
  }catch{return payload}
}
async function finish(value:ScoreboardPayload){
  let prepared=restoreCachedMarkets(hideUnplayedScores(value));
  prepared=await enrichFinalWithEspnMarkets(prepared);
  prepared=await enrichWithOddsBackup(prepared);
  return remember(prepared);
}

export async function fetchScoreboard(league:LeagueKey,date:string):Promise<ScoreboardPayload>{
  const failures:string[]=[];
  try{const r=await fetch(`/api/sports/scoreboard?league=${league}&date=${date}`,{cache:'no-store'});return await finish(await json(r) as ScoreboardPayload)}catch(e){failures.push(`Wingman API: ${e instanceof Error?e.message:'unavailable'}`)}

  if(league==='mlb'){
    try{return await finish(await tryMlb(date))}catch(e){failures.push(`MLB: ${e instanceof Error?e.message:'unavailable'}`)}
  }
  if(league==='nba'){
    try{return await finish(await tryNba(date))}catch(e){failures.push(`NBA.com: ${e instanceof Error?e.message:'unavailable'}`)}
  }

  try{return await finish(await tryEspn(league,date))}catch(e){failures.push(`ESPN: ${e instanceof Error?e.message:'unavailable'}`)}

  const cached=readCache(league,date);
  if(cached){const safe=hideUnplayedScores(cached);return{...safe,provider:`${safe.provider} (cached)`,warning:`Live providers are temporarily unavailable. Showing the last successfully loaded ${ESPN[league].label} data for ${date}.`}}
  throw new Error(failures.join(' • '));
}
