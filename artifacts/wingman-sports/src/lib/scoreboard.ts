import type { LeagueKey } from './sports-directory';

const ESPN: Record<LeagueKey,{sport:string;slug:string;label:string}> = {
  mlb:{sport:'baseball',slug:'mlb',label:'MLB'},
  nfl:{sport:'football',slug:'nfl',label:'NFL'},
  nba:{sport:'basketball',slug:'nba',label:'NBA'},
  ncaaf:{sport:'football',slug:'college-football',label:'NCAAF'},
  ncaab:{sport:'basketball',slug:'mens-college-basketball',label:'NCAAB'},
};

function obj(v:any){return v&&typeof v==='object'?v:{}}
function n(v:any):number|null{const x=typeof v==='number'?v:Number(v);return Number.isFinite(x)?x:null}
function p(v:any):number|null{if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'){const m=v.match(/[+-]?\d+/);return m?Number(m[0]):null}return null}
function status(raw:any){const t=obj(raw?.type);const state=String(t.state??t.name??'').toLowerCase();const label=String(t.shortDetail??t.detail??t.description??'UPCOMING');if(state==='in'||state.includes('progress'))return{status:'live',label};if(state==='post'||state.includes('final')||t.completed===true)return{status:'final',label};if(state.includes('postpon'))return{status:'postponed',label};if(state.includes('cancel'))return{status:'canceled',label};return{status:'upcoming',label}}
function team(comp:any){const t=obj(comp?.team);return{abbreviation:String(t.abbreviation??t.shortDisplayName?.slice(0,4)??'TBD'),name:String(t.displayName??t.name??'TBD'),shortName:String(t.shortDisplayName??t.name??'TBD'),score:n(comp?.score),record:Array.isArray(comp?.records)?String(comp.records?.[0]?.summary??'')||null:null,logo:typeof t.logo==='string'?t.logo:typeof t.logos?.[0]?.href==='string'?t.logos[0].href:null}}
function odds(comp:any){const o=obj(comp?.odds?.[0]);if(!Object.keys(o).length)return null;const spread=n(o.spread),awayFav=obj(o.awayTeamOdds).favorite===true,homeFav=obj(o.homeTeamOdds).favorite===true;return{awaySpread:spread===null?null:awayFav?-Math.abs(spread):Math.abs(spread),homeSpread:spread===null?null:homeFav?-Math.abs(spread):Math.abs(spread),awaySpreadPrice:p(obj(o.awayTeamOdds).spreadOdds),homeSpreadPrice:p(obj(o.homeTeamOdds).spreadOdds),awayMoneyline:p(obj(o.awayTeamOdds).moneyLine),homeMoneyline:p(obj(o.homeTeamOdds).moneyLine),total:n(o.overUnder),overPrice:p(o.overOdds),underPrice:p(o.underOdds),splits:null}}
async function json(response:Response){const text=await response.text();if(!text.trim())throw new Error(`Empty response (${response.status||'network'})`);let payload:any;try{payload=JSON.parse(text)}catch{throw new Error(`Invalid JSON response (${response.status||'network'})`)}if(!response.ok)throw new Error(payload?.detail||payload?.error||`Request failed (${response.status})`);return payload}
function fromEspn(league:LeagueKey,date:string,payload:any){const cfg=ESPN[league];const games=(Array.isArray(payload?.events)?payload.events:[]).map((e:any)=>{const c=obj(e?.competitions?.[0]),cs=Array.isArray(c.competitors)?c.competitors:[],away=cs.find((x:any)=>x?.homeAway==='away')??cs[0]??{},home=cs.find((x:any)=>x?.homeAway==='home')??cs[1]??{},st=status(e?.status??c.status),sit=obj(c.situation);return{id:String(e.id??c.id??''),league,leagueLabel:cfg.label,sport:cfg.sport,status:st.status,statusLabel:st.label,startTime:String(e.date??c.date??''),venue:String(obj(c.venue).fullName??'Venue TBD'),periodLabel:String(obj(obj(e.status).type).shortDetail??'')||null,inning:league==='mlb'?String(sit?.inning??'')||null:null,balls:league==='mlb'?n(sit?.balls):null,strikes:league==='mlb'?n(sit?.strikes):null,outs:league==='mlb'?n(sit?.outs):null,onFirst:league==='mlb'?Boolean(sit?.onFirst):null,onSecond:league==='mlb'?Boolean(sit?.onSecond):null,onThird:league==='mlb'?Boolean(sit?.onThird):null,away:team(away),home:team(home),betting:odds(c)}}).filter((g:any)=>g.id);return{league,leagueLabel:cfg.label,date,provider:'ESPN direct',providerUrl:'https://www.espn.com/',games,warning:'Wingman API proxy was unavailable, so this preview loaded the scoreboard directly from ESPN. Betting splits require the licensed provider connection.'}}

export async function fetchScoreboard(league:LeagueKey,date:string):Promise<any>{
  let apiError:unknown=null;
  try{const r=await fetch(`/api/sports/scoreboard?league=${league}&date=${date}`,{cache:'no-store'});return await json(r)}catch(e){apiError=e}
  try{const cfg=ESPN[league],compact=date.replaceAll('-','');const r=await fetch(`/espn/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/scoreboard?dates=${compact}&limit=1000`,{cache:'no-store',headers:{Accept:'application/json'}});return fromEspn(league,date,await json(r))}catch(e){const a=apiError instanceof Error?apiError.message:'API unavailable',b=e instanceof Error?e.message:'ESPN unavailable';throw new Error(`${a}. Direct ESPN fallback also failed: ${b}`)}
}
