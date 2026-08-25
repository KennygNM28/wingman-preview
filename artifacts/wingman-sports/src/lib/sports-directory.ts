export type LeagueKey = 'mlb' | 'nfl' | 'nba' | 'ncaaf' | 'ncaab';
export type DirectoryTeam = { id:string; abbreviation:string; name:string; shortName:string; logo:string|null };
export const LEAGUES:Array<{key:LeagueKey;label:string}>=[
 {key:'mlb',label:'MLB'},{key:'nfl',label:'NFL'},{key:'nba',label:'NBA'},{key:'ncaaf',label:'NCAAF'},{key:'ncaab',label:'NCAAB'}
];

const ESPN: Record<LeagueKey,{sport:string;slug:string}> = {
  mlb:{sport:'baseball',slug:'mlb'},
  nfl:{sport:'football',slug:'nfl'},
  nba:{sport:'basketball',slug:'nba'},
  ncaaf:{sport:'football',slug:'college-football'},
  ncaab:{sport:'basketball',slug:'mens-college-basketball'},
};

const PRO_TEAMS: Partial<Record<LeagueKey,Array<[string,string]>>> = {
  mlb: [['ARI','Arizona Diamondbacks'],['ATH','Athletics'],['ATL','Atlanta Braves'],['BAL','Baltimore Orioles'],['BOS','Boston Red Sox'],['CHC','Chicago Cubs'],['CWS','Chicago White Sox'],['CIN','Cincinnati Reds'],['CLE','Cleveland Guardians'],['COL','Colorado Rockies'],['DET','Detroit Tigers'],['HOU','Houston Astros'],['KC','Kansas City Royals'],['LAA','Los Angeles Angels'],['LAD','Los Angeles Dodgers'],['MIA','Miami Marlins'],['MIL','Milwaukee Brewers'],['MIN','Minnesota Twins'],['NYM','New York Mets'],['NYY','New York Yankees'],['PHI','Philadelphia Phillies'],['PIT','Pittsburgh Pirates'],['SD','San Diego Padres'],['SF','San Francisco Giants'],['SEA','Seattle Mariners'],['STL','St. Louis Cardinals'],['TB','Tampa Bay Rays'],['TEX','Texas Rangers'],['TOR','Toronto Blue Jays'],['WSH','Washington Nationals']],
  nfl: [['ARI','Arizona Cardinals'],['ATL','Atlanta Falcons'],['BAL','Baltimore Ravens'],['BUF','Buffalo Bills'],['CAR','Carolina Panthers'],['CHI','Chicago Bears'],['CIN','Cincinnati Bengals'],['CLE','Cleveland Browns'],['DAL','Dallas Cowboys'],['DEN','Denver Broncos'],['DET','Detroit Lions'],['GB','Green Bay Packers'],['HOU','Houston Texans'],['IND','Indianapolis Colts'],['JAX','Jacksonville Jaguars'],['KC','Kansas City Chiefs'],['LV','Las Vegas Raiders'],['LAC','Los Angeles Chargers'],['LAR','Los Angeles Rams'],['MIA','Miami Dolphins'],['MIN','Minnesota Vikings'],['NE','New England Patriots'],['NO','New Orleans Saints'],['NYG','New York Giants'],['NYJ','New York Jets'],['PHI','Philadelphia Eagles'],['PIT','Pittsburgh Steelers'],['SEA','Seattle Seahawks'],['SF','San Francisco 49ers'],['TB','Tampa Bay Buccaneers'],['TEN','Tennessee Titans'],['WSH','Washington Commanders']],
  nba: [['ATL','Atlanta Hawks'],['BOS','Boston Celtics'],['BKN','Brooklyn Nets'],['CHA','Charlotte Hornets'],['CHI','Chicago Bulls'],['CLE','Cleveland Cavaliers'],['DAL','Dallas Mavericks'],['DEN','Denver Nuggets'],['DET','Detroit Pistons'],['GSW','Golden State Warriors'],['HOU','Houston Rockets'],['IND','Indiana Pacers'],['LAC','LA Clippers'],['LAL','Los Angeles Lakers'],['MEM','Memphis Grizzlies'],['MIA','Miami Heat'],['MIL','Milwaukee Bucks'],['MIN','Minnesota Timberwolves'],['NOP','New Orleans Pelicans'],['NYK','New York Knicks'],['OKC','Oklahoma City Thunder'],['ORL','Orlando Magic'],['PHI','Philadelphia 76ers'],['PHX','Phoenix Suns'],['POR','Portland Trail Blazers'],['SAC','Sacramento Kings'],['SAS','San Antonio Spurs'],['TOR','Toronto Raptors'],['UTA','Utah Jazz'],['WSH','Washington Wizards']],
};

// Emergency seeds are used only if both the Wingman API and ESPN's current directory are unreachable.
// Normal NCAAF/NCAAB behavior still loads the comprehensive current ESPN directory dynamically.
const COLLEGE_PREVIEW_SEEDS: Partial<Record<LeagueKey,Array<[string,string]>>> = {
  ncaaf: [['ALA','Alabama Crimson Tide'],['ARK','Arkansas Razorbacks'],['AUB','Auburn Tigers'],['CLEM','Clemson Tigers'],['FLA','Florida Gators'],['FSU','Florida State Seminoles'],['UGA','Georgia Bulldogs'],['IOWA','Iowa Hawkeyes'],['LSU','LSU Tigers'],['MICH','Michigan Wolverines'],['MSU','Michigan State Spartans'],['ND','Notre Dame Fighting Irish'],['OSU','Ohio State Buckeyes'],['OKLA','Oklahoma Sooners'],['ORE','Oregon Ducks'],['PSU','Penn State Nittany Lions'],['TENN','Tennessee Volunteers'],['TEX','Texas Longhorns'],['TA&M','Texas A&M Aggies'],['USC','USC Trojans']],
  ncaab: [['ARIZ','Arizona Wildcats'],['ARK','Arkansas Razorbacks'],['BAY','Baylor Bears'],['DUKE','Duke Blue Devils'],['GONZ','Gonzaga Bulldogs'],['HOU','Houston Cougars'],['ILL','Illinois Fighting Illini'],['IU','Indiana Hoosiers'],['ISU','Iowa State Cyclones'],['KU','Kansas Jayhawks'],['UK','Kentucky Wildcats'],['MSU','Michigan State Spartans'],['UNC','North Carolina Tar Heels'],['PUR','Purdue Boilermakers'],['TENN','Tennessee Volunteers'],['UCLA','UCLA Bruins'],['UCONN','UConn Huskies'],['VILL','Villanova Wildcats'],['WIS','Wisconsin Badgers'],['XAV','Xavier Musketeers']],
};

function rowsToTeams(league:LeagueKey, rows:Array<[string,string]>):DirectoryTeam[]{
  return rows.map(([abbreviation,name],i)=>({id:`local-${league}-${i}`,abbreviation,name,shortName:name,logo:null}));
}

function parseEspnTeams(payload:any):DirectoryTeam[]{
  const rows = payload?.sports?.[0]?.leagues?.[0]?.teams;
  if(!Array.isArray(rows)) return [];
  return rows.map((x:any)=>x?.team ?? x).filter((x:any)=>x?.id).map((x:any)=>({
    id:String(x.id),
    abbreviation:String(x.abbreviation ?? x.shortDisplayName ?? x.name ?? ''),
    name:String(x.displayName ?? x.name ?? ''),
    shortName:String(x.shortDisplayName ?? x.name ?? ''),
    logo:typeof x?.logos?.[0]?.href==='string'?x.logos[0].href:null,
  })).filter((x:DirectoryTeam)=>x.abbreviation&&x.name).sort((a:DirectoryTeam,b:DirectoryTeam)=>a.name.localeCompare(b.name));
}

function readCache(league:LeagueKey):DirectoryTeam[]{
  if(typeof window==='undefined') return [];
  try{
    const raw=window.localStorage.getItem(`wingman:teams:${league}`);
    const parsed=raw?JSON.parse(raw):[];
    return Array.isArray(parsed)?parsed.filter((x:any)=>x?.abbreviation&&x?.name):[];
  }catch{return []}
}
function writeCache(league:LeagueKey,teams:DirectoryTeam[]){
  if(typeof window==='undefined'||!teams.length) return;
  try{window.localStorage.setItem(`wingman:teams:${league}`,JSON.stringify(teams));}catch{/* storage unavailable */}
}

async function jsonOrThrow(response:Response):Promise<any>{
  const text=await response.text();
  if(!text.trim()) throw new Error(`Empty response (${response.status || 'network'})`);
  let payload:any;
  try{payload=JSON.parse(text)}catch{throw new Error(`Invalid JSON response (${response.status || 'network'})`)}
  if(!response.ok) throw new Error(payload?.detail||payload?.error||`Request failed (${response.status})`);
  return payload;
}

export function getTeamFallback(league:LeagueKey):DirectoryTeam[]{
  const cached=readCache(league);
  if(cached.length) return cached;
  const pro=PRO_TEAMS[league];
  if(pro?.length) return rowsToTeams(league,pro);
  const college=COLLEGE_PREVIEW_SEEDS[league];
  return college?.length?rowsToTeams(league,college):[];
}

export async function fetchTeams(league:LeagueKey):Promise<DirectoryTeam[]>{
  // 1) Wingman API (production path).
  try{
    const r=await fetch(`/api/sports/teams?league=${league}`,{cache:'no-store'});
    const p=await jsonOrThrow(r);
    const teams=(p?.teams||[]) as DirectoryTeam[];
    if(teams.length){writeCache(league,teams);return teams;}
  }catch{/* StackBlitz/API may be temporarily unavailable; continue. */}

  // 2) Direct ESPN directory. This keeps StackBlitz previews functional if the local API proxy drops.
  try{
    const cfg=ESPN[league];
    const r=await fetch(`/espn/apis/site/v2/sports/${cfg.sport}/${cfg.slug}/teams?limit=1000`,{cache:'no-store',headers:{Accept:'application/json'}});
    const p=await jsonOrThrow(r);
    const teams=parseEspnTeams(p);
    if(teams.length){writeCache(league,teams);return teams;}
  }catch{/* browser/network/provider unavailable; use cache/static fallback below. */}

  // 3) Last successful directory or complete local pro fallback / college preview seed.
  const fallback=getTeamFallback(league);
  if(fallback.length) return fallback;
  throw new Error('Team directory unavailable');
}
