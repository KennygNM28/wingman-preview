import { Layout } from '@/components/layout';
import { 
  Search, AlertCircle, 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, 
  AlertTriangle, RefreshCw, X, Zap, SlidersHorizontal, Bell, UserRound, BarChart3, MessageCircleMore
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, addDays, subDays } from 'date-fns';
import { WingmanHeroArt, WingmanMark } from '@/components/wingman-mark';
import { FaRunning } from 'react-icons/fa';
import { loadFavorites, loadSelectedSports, saveSelectedSports, favoriteKey } from '@/lib/preferences';
import { LEAGUES, type LeagueKey } from '@/lib/sports-directory';
import { fetchScoreboard } from '@/lib/scoreboard';
import { Flame } from 'lucide-react';

type SportTeam = { abbreviation: string; name: string; shortName: string; score: number | null; record: string | null; logo: string | null };
type SportGame = {
  id: string;
  league: LeagueKey;
  leagueLabel: string;
  sport: string;
  status: 'upcoming' | 'live' | 'final' | 'postponed' | 'canceled';
  statusLabel: string;
  startTime: string;
  venue: string;
  periodLabel: string | null;
  inning: string | null;
  balls: number | null;
  strikes: number | null;
  outs: number | null;
  onFirst: boolean | null;
  onSecond: boolean | null;
  onThird: boolean | null;
  away: SportTeam;
  home: SportTeam;
  betting: null | {
    awaySpread: number | null;
    homeSpread: number | null;
    awaySpreadPrice: number | null;
    homeSpreadPrice: number | null;
    awayMoneyline: number | null;
    homeMoneyline: number | null;
    total: number | null;
    overPrice: number | null;
    underPrice: number | null;
    splits?: {
      awaySpread?: MarketSplit | null; homeSpread?: MarketSplit | null;
      awayMoneyline?: MarketSplit | null; homeMoneyline?: MarketSplit | null;
      over?: MarketSplit | null; under?: MarketSplit | null;
    } | null;
  };
};
type MarketSplit = { betPercentage: number | null; moneyPercentage: number | null; lastSeen?: string | null; source?: string | null };
type SportScoreboard = {
  league: LeagueKey;
  leagueLabel: string;
  date: string;
  provider: string;
  providerUrl: string;
  games: SportGame[];
  warning: string | null;
};



async function fetchSportScoreboard(league: LeagueKey, date: string): Promise<SportScoreboard> {
  return await fetchScoreboard(league, date) as SportScoreboard;
}

const SUGGESTIONS: Record<LeagueKey,string[]> = {
  mlb:["What is Zack Wheeler's ERA this season?","What pitches does Bryce Harper handle best this season?","What is the Phillies batting average this season?"],
  nfl:["How many passing yards is Patrick Mahomes averaging in his last 10 games?","How many points per game are the Eagles scoring?","How many points per game are the Eagles allowing?"],
  nba:["How many points is Jayson Tatum averaging in his last 10 games?","How many rebounds is Nikola Jokic averaging?","How many points per game are the Celtics scoring?"],
  ncaaf:["How many points per game is Alabama scoring?","How many passing yards is the quarterback averaging in the last 5 games?"],
  ncaab:["How many points per game is Duke scoring?","How many rebounds is this player averaging in the last 10 games?"],
};

export default function Home() {
  const [, navigate] = useLocation();
  // Ask Wingman State
  const [query, setQuery] = useState('');
  const [hasResult, setHasResult] = useState(false);
  const [wingmanContext, setWingmanContext] = useState<Record<string, any>>({});
  const [wingmanResult, setWingmanResult] = useState<any | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  // Action/Scoreboard State
  const [league, setLeague] = useState<LeagueKey>('mlb');
  const [date, setDate] = useState(new Date());
  const [showBetting, setShowBetting] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSports, setSelectedSports] = useState<LeagueKey[]>(() => loadSelectedSports());
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  useEffect(() => { const sync=()=>{setSelectedSports(loadSelectedSports());setFavorites(loadFavorites())}; window.addEventListener('wingman-preferences',sync); return()=>window.removeEventListener('wingman-preferences',sync); },[]);
  const dateStr = format(date, 'yyyy-MM-dd');
  
  const { data: scoreboard, isLoading: isLoadingBoard, error, refetch } = useQuery({
    queryKey: ['sports-scoreboard', league, dateStr],
    queryFn: () => fetchSportScoreboard(league, dateStr),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const errorDetail = error instanceof Error 
    ? error.message 
    : `${LEAGUES.find((item) => item.key === league)?.label} data may be temporarily unavailable.`;

  const runWingmanSearch = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    setHasResult(false);
    setSearchError(null);
    setIsSearching(true);
    try {
      const response = await fetch(league === 'mlb' ? '/api/mlb/wingman' : '/api/sports/wingman', {
        method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store',
        body: JSON.stringify(league === 'mlb' ? {question:trimmed,context:wingmanContext??{}} : {league,question:trimmed,context:wingmanContext??{}}),
      });
      const payload = await response.json();
      if(!response.ok) throw new Error(payload?.detail || payload?.error || 'Wingman search failed.');
      setWingmanContext(payload.context || {}); setWingmanResult(payload); setHasResult(true);
    } catch (error) {
      setWingmanResult(null); setSearchError(error instanceof Error ? error.message : 'Wingman search failed.'); setHasResult(true);
    } finally { setIsSearching(false); }
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    void runWingmanSearch(query);
  };

  const clearSearch = () => {
    setQuery('');
    setHasResult(false);
    setWingmanContext({});
    setWingmanResult(null);
    setSearchError(null);
  };

  return (
    <Layout hideHeader>
      {/* Mobile brand header — mirrors the approved Wingman mockup. */}
      <header className="wm-mobile-header relative z-30 flex items-center justify-between px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <WingmanMark className="w-12 h-12" label="Wingman Sports"/>
          <div className="min-w-0">
            <div className="font-heading text-xl tracking-wide text-white uppercase leading-none">Wingman Sports</div>
            <div className="mt-1.5 text-[10px] text-white/50"><span className="font-bold text-primary">{LEAGUES.find((item)=>item.key===league)?.label}</span><span className="mx-1.5 text-primary">•</span>Your Home Field</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button aria-label="Alerts" className="relative w-9 h-9 rounded-xl border border-white/10 bg-[#0d0d0f] flex items-center justify-center text-white/70"><Bell className="w-4 h-4"/><span className="absolute -right-1 -top-1 min-w-4 h-4 px-1 rounded-full bg-primary text-[8px] font-bold flex items-center justify-center text-white">3</span></button>
          <button onClick={()=>navigate('/profile')} aria-label="Profile and settings" className="w-9 h-9 rounded-xl border border-white/10 bg-[#0d0d0f] flex items-center justify-center text-white/70 hover:text-white"><UserRound className="w-4 h-4"/></button>
        </div>
      </header>

      {/* Ask Wingman hero */}
      <section className="relative mx-3 wing-hero-card overflow-hidden rounded-[13px] z-20 min-h-[250px]">
        <div className="absolute right-0 top-0 bottom-0 w-[64%] opacity-100 pointer-events-none">
          <WingmanHeroArt />
          <div className="absolute inset-0 bg-gradient-to-r from-[#09090b] via-[#09090b]/68 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-transparent to-transparent" />
        </div>
        <div className="relative p-4 pt-4 pb-[62px]">
          <h1 className="font-heading text-[2rem] leading-[1.02] tracking-tight mb-2.5 drop-shadow-md max-w-[60%]">
            <span className="block text-white">Your games.</span>
            <span className="block text-white">Your teams.</span>
            <span className="block text-primary drop-shadow-[0_0_15px_rgba(220,38,38,0.45)]">Your edge in the data.</span>
          </h1>
          <p className="text-[11px] text-white/80 mb-3 max-w-[190px] leading-relaxed">Ask anything about {LEAGUES.find((item)=>item.key===league)?.label}. Wingman has the answer.</p>

          <form onSubmit={handleSearch} className="wm-hero-search absolute left-2 right-2 bottom-2 z-10">
            <div className="flex bg-white p-1 rounded-[10px]">
              <Input data-wingman-search value={query} onChange={(e)=>setQuery(e.target.value)} className="border-0 bg-transparent text-black focus-visible:ring-0 rounded-none h-11 flex-1 shadow-none text-sm placeholder:text-black/40" placeholder="Ask Your Wingman anything..."/>
              <Button type="submit" disabled={!query.trim()||isSearching} className="h-11 px-4 bg-primary text-white font-heading text-sm uppercase tracking-wider rounded-lg hover:bg-primary/90 disabled:opacity-50"><span className="hidden min-[360px]:inline mr-2">Ask Wingman</span><Search className="w-4 h-4"/></Button>
            </div>
          </form>

          {/* Search State / Suggestions */}
           {!hasResult && !isSearching && !query && (
            <div className="mt-6 flex gap-2 overflow-x-auto no-scrollbar pb-2 relative z-10">
              {SUGGESTIONS[league].map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(s);
                    void runWingmanSearch(s);
                  }}
                  className="whitespace-nowrap shrink-0 px-4 py-2 border border-white/10 bg-black/40 backdrop-blur-md rounded-xl hover:bg-white/10 transition-colors text-[10px] font-mono uppercase tracking-widest text-white/70 hover:text-white flex items-center gap-2"
                >
                  <Zap className="w-3.5 h-3.5 text-primary" /> {s}
                </button>
              ))}
            </div>
          )}

          {isSearching && (
            <div className="mt-8 flex flex-col items-center justify-center py-6 relative z-10 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10">
              <div className="w-10 h-10 border-4 border-white/10 border-t-primary rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(220,38,38,0.3)]" />
              <div className="font-mono text-[10px] font-bold uppercase text-white/70 animate-pulse tracking-widest">
                Analyzing data points...
              </div>
            </div>
          )}

          {hasResult && (
            <div className="mt-6 p-5 bg-card/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 relative z-10">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-heading text-lg text-white flex items-center gap-2 tracking-wide uppercase">
                  <AlertCircle className="w-5 h-5 text-primary" />
                  The Verdict
                </h3>
                <Button onClick={clearSearch} variant="ghost" size="icon" className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10 rounded-full -mt-1 -mr-1">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              {searchError ? (
                <p className="text-sm text-red-300 leading-relaxed font-sans">{searchError}</p>
              ) : wingmanResult ? (
                <>
                  <div className="mb-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-primary">{wingmanResult.result.title}</div>
                    <p className="mt-2 text-sm text-white/80 leading-relaxed font-sans">{wingmanResult.answer}</p>
                  </div>
                  <div className="mb-4 grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                    <div>
                      <div className="text-[9px] font-mono uppercase tracking-wider text-white/40">{wingmanResult.result.primaryLabel}</div>
                      <div className="mt-0.5 font-heading text-2xl text-white">{wingmanResult.result.primaryValue}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-mono uppercase tracking-wider text-white/35">Timeframe</div>
                      <div className="text-[10px] font-bold text-primary">{wingmanResult.result.timeframeLabel}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono sm:grid-cols-4">
                    {wingmanResult.result.stats.map((stat) => (
                      <div key={`${stat.label}-${stat.value}`} className="bg-[#111] rounded-xl p-2 text-center border border-white/5 shadow-inner">
                        <div className="text-[8px] uppercase tracking-wider text-white/40 mb-1">{stat.label}</div>
                        <div className="font-bold text-sm text-white">{stat.value}</div>
                        {stat.detail ? <div className="mt-1 text-[8px] leading-tight text-white/30">{stat.detail}</div> : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-mono text-white/35">
                    <span>Source: {wingmanResult.result.source}</span>
                    {wingmanResult.result.sampleLabel ? <span>Sample: {wingmanResult.result.sampleLabel}</span> : null}
                  </div>
                  {wingmanResult.result.note ? (
                    <p className="mt-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-[10px] leading-relaxed text-white/45">{wingmanResult.result.note}</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      ['This season', 'this season'],
                      ['Last 10', 'last 10 games'],
                      ['Last 5', 'last 5 games'],
                    ].map(([label, followUp]) => (
                      <button key={followUp} type="button" onClick={() => { setQuery(followUp); void runWingmanSearch(followUp); }} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-white/60 hover:border-primary/50 hover:text-white">
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <div className="wm-tool-strip px-3 pt-3 grid grid-cols-5 gap-1.5">
        <QuickTool icon={<Flame className="w-4 h-4"/>} label="Trending" onClick={()=>navigate('/word')}/>
        <QuickTool icon={<BarChart3 className="w-4 h-4"/>} label="Player Props" onClick={()=>navigate('/numbers')}/>
        <QuickTool icon={<FaRunning className="w-4 h-4"/>} label="Matchups" onClick={()=>document.getElementById('action')?.scrollIntoView({behavior:'smooth'})}/>
        <QuickTool icon={<MessageCircleMore className="w-4 h-4"/>} label="The Word" onClick={()=>navigate('/word')}/>
        <QuickTool icon={<WingmanMark compact className="w-4 h-4"/>} label="Wingman" onClick={()=>navigate('/wingman')}/>
      </div>

      {/* Action Command Center */}
       <div id="action" className="px-3 pt-5 pb-4 space-y-3 bg-black">
        <div className="flex items-center justify-between">
          <div><div className="wm-section-label font-heading text-2xl uppercase text-white flex items-center gap-2"><FaRunning className="text-primary text-lg"/>The Action</div><div className="text-[8px] font-mono uppercase tracking-widest text-white/35 mt-0.5">Favorites first • filter sports when needed</div></div>
          <button type="button" onClick={()=>setShowFilters(v=>!v)} className="h-10 px-3 wing-card rounded-xl text-[10px] font-bold uppercase tracking-wider text-white/70 flex items-center gap-2"><SlidersHorizontal className="w-4 h-4 text-primary"/>Filter</button>
        </div>
        {showFilters&&<div className="wing-card rounded-2xl p-3"><div className="text-[9px] uppercase tracking-widest text-white/40 mb-2">Show sports</div><div className="grid grid-cols-5 gap-1.5">{LEAGUES.map(item=><button key={item.key} onClick={()=>{const next=selectedSports.includes(item.key)?selectedSports.filter(x=>x!==item.key):[...selectedSports,item.key];const safe=next.length?next:LEAGUES.map(x=>x.key);setSelectedSports(safe);saveSelectedSports(safe);if(!safe.includes(league))setLeague(safe[0]);}} className={`h-8 rounded-lg text-[8px] font-bold ${selectedSports.includes(item.key)?'bg-primary text-white':'bg-black/30 border border-white/10 text-white/35'}`}>{item.label}</button>)}</div><div className="mt-2 text-[9px] text-white/35">Favorite teams are managed in Profile and appear first in Action.</div></div>}

        <div className="wm-league-tabs grid grid-cols-5 gap-1 p-1">
          {LEAGUES.filter((item)=>selectedSports.includes(item.key)).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setLeague(item.key);
                setDate(new Date());
              }}
              className={`h-9 rounded-xl text-[9px] font-bold uppercase tracking-wider transition ${league === item.key ? 'bg-primary text-white shadow-[0_0_12px_rgba(220,38,38,.25)]' : 'text-white/45 hover:bg-white/5 hover:text-white'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between mb-2">
           <h2 className="font-heading text-2xl tracking-wide text-white uppercase flex items-center gap-2">
             <FaRunning className="text-primary text-lg" aria-hidden="true" />
             Live Action
           </h2>
          
          <button type="button" onClick={()=>setShowBetting(v=>!v)} className="wing-card rounded-xl px-3 h-10 flex items-center gap-2" aria-pressed={showBetting}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/60">Betting info</span>
            <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${showBetting?'bg-primary':'bg-white/15'}`}><span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${showBetting?'translate-x-4':'translate-x-0.5'}`}/></span>
          </button>
        </div>

        <div className="wm-date-tabs grid grid-cols-[1fr_1fr_1fr_auto] gap-1 p-1">
          <button onClick={()=>setDate(subDays(new Date(),1))} className={`h-9 rounded-xl text-[9px] font-bold uppercase ${format(date,'yyyy-MM-dd')===format(subDays(new Date(),1),'yyyy-MM-dd')?'bg-primary text-white':'text-white/45'}`}>Yesterday</button>
          <button onClick={()=>setDate(new Date())} className={`h-9 rounded-xl text-[9px] font-bold uppercase ${format(date,'yyyy-MM-dd')===format(new Date(),'yyyy-MM-dd')?'bg-primary text-white':'text-white/45'}`}>Today</button>
          <button onClick={()=>setDate(addDays(new Date(),1))} className={`h-9 rounded-xl text-[9px] font-bold uppercase ${format(date,'yyyy-MM-dd')===format(addDays(new Date(),1),'yyyy-MM-dd')?'bg-primary text-white':'text-white/45'}`}>Tomorrow</button>
          <div className="h-9 w-9 rounded-xl border border-white/10 bg-black/20 flex items-center justify-center text-white/55"><CalendarIcon className="w-4 h-4"/></div>
        </div>

        <div className="hidden">
          <Button 
            variant="ghost" 
            size="icon" 
            className="hover:bg-white/5 text-white/70 hover:text-white h-8 w-8 rounded-full"
            onClick={() => setDate(d => subDays(d, 1))}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          
          <div className="flex flex-col items-center">
            <span className="font-heading text-lg tracking-wider text-white flex items-center gap-2 uppercase">
              <CalendarIcon className="w-4 h-4 text-primary" />
              {format(date, 'MMM d, yyyy')}
            </span>
            <span className="text-[10px] font-mono text-primary uppercase tracking-widest -mt-1 font-bold">
              {format(date, 'EEEE')}
            </span>
          </div>

          <Button 
            variant="ghost" 
            size="icon" 
            className="hover:bg-white/5 text-white/70 hover:text-white h-8 w-8 rounded-full"
            onClick={() => setDate(d => addDays(d, 1))}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <div className="hidden">
          <Button
            variant="ghost"
            className="h-9 wing-card rounded-xl text-[10px] font-bold uppercase tracking-widest text-white/60 hover:bg-white/5 hover:text-white"
            onClick={() => setDate(new Date())}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            className="h-9 wing-card rounded-xl text-[10px] font-bold uppercase tracking-widest text-white/60 hover:bg-white/5 hover:text-white"
            onClick={() => setDate(subDays(new Date(), 1))}
          >
            Yesterday
          </Button>
        </div>

        <div className="space-y-4 min-h-[400px]">
          {isLoadingBoard ? (
            <div className="space-y-4">
              {Array(3).fill(0).map((_, i) => (
                <div key={i} className="h-40 bg-card/50 rounded-2xl animate-pulse border border-white/5" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 border border-primary/30 rounded-2xl bg-primary/5 text-center flex flex-col items-center shadow-lg">
              <AlertTriangle className="w-10 h-10 text-primary mb-4" />
              <p className="font-heading text-xl uppercase text-white tracking-wide mb-2">Feed Unavailable</p>
              <p className="text-[10px] font-mono text-white/60 max-w-[250px] leading-relaxed mb-6">{errorDetail}</p>
              <Button
                className="border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-wider rounded-xl text-white"
                onClick={() => void refetch()}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Feed
              </Button>
            </div>
          ) : scoreboard?.games.length === 0 ? (
            <div className="p-10 border border-white/10 rounded-2xl text-center bg-card shadow-sm">
              <p className="font-heading text-lg text-white/50 uppercase tracking-wider">No games scheduled</p>
              <p className="text-[10px] text-white/40 mt-2 uppercase font-mono font-bold tracking-widest">Select a different date.</p>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-500">
              <div className="flex items-center justify-between bg-[#09090a] rounded-[8px] border border-white/5 px-3 py-2 text-[8px] font-mono uppercase tracking-widest">
                <span className="text-white/50">Provider: {scoreboard?.provider}</span>
                <a href={scoreboard?.providerUrl} target="_blank" rel="noreferrer" className="text-primary font-bold hover:text-primary/80 transition-colors flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)]" /> Live Feed
                </a>
              </div>

              {scoreboard?.warning && (
                <div className="p-3 rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-400 text-[10px] font-mono font-bold flex items-center gap-2 uppercase tracking-wide">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {scoreboard.warning}
                </div>
              )}
              
              {[...(scoreboard?.games ?? [])].sort((a,b)=>{const af=Number(favorites.includes(favoriteKey(a.league,a.away.abbreviation))||favorites.includes(favoriteKey(a.league,a.home.abbreviation)));const bf=Number(favorites.includes(favoriteKey(b.league,b.away.abbreviation))||favorites.includes(favoriteKey(b.league,b.home.abbreviation)));return bf-af;}).map(game => (
                <GameCard key={game.id} game={game} showBetting={showBetting} />
              ))}
              
              <div className="text-center pb-4 pt-2">
                <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
                  Data provided by {scoreboard?.provider}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function GameCard({ game, showBetting }: { game: SportGame; showBetting: boolean }) {
  const [, setLocation] = useLocation();
  const isLive = game.status === 'live';
  const isFinal = game.status === 'final';
  const hasMarket = showBetting && !!game.betting;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => setLocation(`/game/${game.league}/${game.id}`)}
      onKeyDown={(e)=>{if(e.key==='Enter')setLocation(`/game/${game.league}/${game.id}`)}}
      className="wm-game-card wing-card wing-card-interactive overflow-hidden cursor-pointer"
    >
      <div className="wm-game-head px-3 py-2 flex justify-between items-center border-b border-white/[.08]">
        <div className="flex items-center gap-2 min-w-0">
          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_7px_rgba(230,0,45,.7)]" />}
          <span className={`text-[9px] font-bold uppercase tracking-wider truncate ${isLive ? 'text-primary' : 'text-white/65'}`}>
            {game.periodLabel || game.inning || game.statusLabel}
          </span>
        </div>
        <span className="text-[9px] font-mono text-white/42">
          {isLive || isFinal ? game.statusLabel : format(new Date(game.startTime), 'h:mm a')}
        </span>
      </div>

      {isLive && game.league === 'mlb' && (
        <div className="px-3 pt-2">
          <LiveGameState
            inning={game.inning}
            balls={game.balls}
            strikes={game.strikes}
            outs={game.outs}
            onFirst={game.onFirst}
            onSecond={game.onSecond}
            onThird={game.onThird}
          />
        </div>
      )}

      {hasMarket ? (
        <div className="font-mono">
          <div className="wm-team-market-grid px-3 py-1.5 border-b border-white/[.06] text-white/35">
            <span className="wm-market-head">TEAM</span>
            <span className="wm-market-head text-center">SPREAD</span>
            <span className="wm-market-head text-center">MONEYLINE</span>
            <span className="wm-market-head text-center">TOTAL</span>
          </div>
          <TeamMarketRow
            team={game.away}
            spread={game.betting!.awaySpread}
            spreadPrice={game.betting!.awaySpreadPrice}
            moneyline={game.betting!.awayMoneyline}
            totalLabel="O"
            total={game.betting!.total}
            totalPrice={game.betting!.overPrice}
            spreadSplit={game.betting!.splits?.awaySpread}
            moneylineSplit={game.betting!.splits?.awayMoneyline}
            totalSplit={game.betting!.splits?.over}
          />
          <TeamMarketRow
            team={game.home}
            spread={game.betting!.homeSpread}
            spreadPrice={game.betting!.homeSpreadPrice}
            moneyline={game.betting!.homeMoneyline}
            totalLabel="U"
            total={game.betting!.total}
            totalPrice={game.betting!.underPrice}
            spreadSplit={game.betting!.splits?.homeSpread}
            moneylineSplit={game.betting!.splits?.homeMoneyline}
            totalSplit={game.betting!.splits?.under}
          />
        </div>
      ) : (
        <div>
          <div className="px-3 py-2 space-y-1">
            <CompactTeamRow team={game.away}/>
            <CompactTeamRow team={game.home}/>
          </div>
          {showBetting && <div className="border-t border-white/[.06] px-3 py-2 text-center text-[8px] font-mono uppercase tracking-wider text-white/30">Betting markets unavailable</div>}
        </div>
      )}

      <div className="border-t border-white/[.07] px-3 py-2 text-center font-heading text-[11px] uppercase tracking-wider text-primary">
        Game Center
      </div>
    </article>
  );
}

function TeamMarketRow({
  team, spread, spreadPrice, moneyline, totalLabel, total, totalPrice,
  spreadSplit, moneylineSplit, totalSplit,
}: {
  team: SportTeam; spread: number | null; spreadPrice: number | null; moneyline: number | null;
  totalLabel: 'O' | 'U'; total: number | null; totalPrice: number | null;
  spreadSplit?: MarketSplit | null; moneylineSplit?: MarketSplit | null; totalSplit?: MarketSplit | null;
}) {
  const signed=(value:number|null)=>value===null?'—':`${value>0?'+':''}${value}`;
  const price=(value:number|null)=>value===null?'':`${value>0?'+':''}${value}`;
  return <div className="wm-team-market-grid wm-team-row px-3 border-b border-white/[.055] last:border-0">
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-8 h-8 flex items-center justify-center shrink-0">
        {team.logo?<img src={team.logo} alt="" className="w-8 h-8 object-contain"/>:<span className="font-heading text-xs text-white">{team.abbreviation.slice(0,2)}</span>}
      </div>
      <div className="min-w-0 flex items-center gap-2">
        <div className="font-heading text-sm text-white truncate">{team.shortName || team.abbreviation}</div>
        {team.score!==null&&<div className="font-heading text-xl text-white tabular-nums">{team.score}</div>}
      </div>
    </div>
    <div className="wm-market-cell"><MarketCell value={signed(spread)} price={price(spreadPrice)} split={spreadSplit}/></div>
    <div className="wm-market-cell"><MarketCell value={signed(moneyline)} split={moneylineSplit}/></div>
    <div className="wm-market-cell"><MarketCell value={`${totalLabel} ${total ?? '—'}`} price={price(totalPrice)} split={totalSplit}/></div>
  </div>;
}

function CompactTeamRow({team}:{team:SportTeam}) {
  return <div className="flex items-center justify-between min-h-11">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 flex items-center justify-center">{team.logo?<img src={team.logo} alt="" className="w-8 h-8 object-contain"/>:<span className="font-heading text-xs">{team.abbreviation}</span>}</div>
      <div><div className="font-heading text-base text-white">{team.shortName || team.abbreviation}</div><div className="text-[8px] text-white/35">{team.record || ''}</div></div>
    </div>
    <div className="font-heading text-2xl text-white tabular-nums">{team.score ?? '—'}</div>
  </div>;
}

function LiveGameState({
  inning,
  balls,
  strikes,
  outs,
  onFirst,
  onSecond,
  onThird,
}: {
  inning: string | null;
  balls: number | null;
  strikes: number | null;
  outs: number | null;
  onFirst: boolean | null;
  onSecond: boolean | null;
  onThird: boolean | null;
}) {
  const display = (value: number | null) => value ?? '—';
  const baseState = { onFirst, onSecond, onThird };

  return (
    <div className="border-y border-primary/20 bg-primary/10 px-4 py-2.5 font-mono">
      <div className="grid grid-cols-[1.45fr_0.85fr_0.95fr_0.75fr] gap-px">
        <div className="min-w-0">
          <div className="text-[8px] font-bold uppercase tracking-widest text-primary/70">Inning</div>
          <div className="mt-1 truncate text-[11px] font-bold uppercase tracking-wide text-white">{inning ?? '—'}</div>
        </div>
        <LiveCount label="Balls" value={display(balls)} />
        <LiveCount label="Strikes" value={display(strikes)} />
        <LiveCount label="Outs" value={display(outs)} />
      </div>
      <BaseDiamond {...baseState} />
    </div>
  );
}

function LiveCount({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border-l border-white/10 pl-2">
      <div className="text-[8px] font-bold uppercase tracking-widest text-white/40">{label}</div>
      <div className="mt-1 text-base font-bold tabular-nums text-white">{value}</div>
    </div>
  );
}

function BaseDiamond({
  onFirst,
  onSecond,
  onThird,
}: {
  onFirst: boolean | null;
  onSecond: boolean | null;
  onThird: boolean | null;
}) {
  const bases = [
    { label: '3rd', occupied: onThird, position: 'left-1 top-1' },
    { label: '2nd', occupied: onSecond, position: 'left-1/2 top-0 -translate-x-1/2' },
    { label: '1st', occupied: onFirst, position: 'right-1 top-1' },
  ];
  const known = bases.some((base) => base.occupied !== null);
  const occupiedLabels = bases
    .filter((base) => base.occupied)
    .map((base) => base.label);
  const summary = !known
    ? 'Base runners unavailable'
    : occupiedLabels.length > 0
      ? `Runner on ${occupiedLabels.join(', ')}`
      : 'No runners on base';

  return (
    <div
      className="mt-2 flex items-center justify-between border-t border-white/10 pt-2"
      aria-label={summary}
    >
      <div className="text-[8px] font-bold uppercase tracking-widest text-white/40">Bases</div>
      <div className="flex items-center gap-2">
        <div className="relative h-8 w-12" aria-hidden="true">
          {bases.map((base) => (
            <span
              key={base.label}
              className={`absolute h-3 w-3 rotate-45 border ${
                base.occupied === true
                  ? 'border-primary bg-primary shadow-[0_0_10px_rgba(220,38,38,0.85)]'
                  : base.occupied === false
                    ? 'border-white/35 bg-white/10'
                    : 'border-dashed border-white/25 bg-white/5'
              } ${base.position}`}
            />
          ))}
          <span
            className={`absolute bottom-0 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border ${
              known ? 'border-white/25 bg-white/5' : 'border-dashed border-white/20 bg-white/5'
            }`}
          />
        </div>
        <span className="min-w-[7rem] text-right text-[9px] font-bold uppercase tracking-wider text-white/60">
          {summary}
        </span>
      </div>
    </div>
  );
}

function MarketRow({
  abbreviation, spread, spreadPrice, moneyline, totalLabel, total, totalPrice,
  spreadSplit, moneylineSplit, totalSplit,
}: {
  abbreviation: string; spread: number | null; spreadPrice: number | null; moneyline: number | null;
  totalLabel: 'O' | 'U'; total: number | null; totalPrice: number | null;
  spreadSplit?: MarketSplit | null; moneylineSplit?: MarketSplit | null; totalSplit?: MarketSplit | null;
}) {
  const signed = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value}`;
  const price = (value: number | null) => value === null ? '' : `${value > 0 ? '+' : ''}${value}`;
  return (
    <div className="grid grid-cols-[.75fr_1fr_.9fr_1fr] px-3 py-3 border-b border-white/5 last:border-b-0 items-start">
      <span className="font-heading text-sm text-white tracking-wider pt-1">{abbreviation}</span>
      <MarketCell value={signed(spread)} price={price(spreadPrice)} split={spreadSplit} />
      <MarketCell value={signed(moneyline)} split={moneylineSplit} />
      <MarketCell value={`${totalLabel} ${total ?? '—'}`} price={price(totalPrice)} split={totalSplit} />
    </div>
  );
}
function MarketCell({value,price,split}:{value:string;price?:string;split?:MarketSplit|null}){
  const valid=split?.betPercentage!=null&&split?.moneyPercentage!=null;
  const diff=valid?(split!.moneyPercentage!-split!.betPercentage!):0,abs=Math.abs(diff);
  const heat=abs>=30?'VERY HOT':abs>=20?'HOT':abs>=10?'WATCH':null;
  return <div className="min-w-0 px-1 border-l border-white/5 first:border-0">
    <div className="text-[10px] font-bold text-white whitespace-nowrap">{value}{price?<span className="block text-[8px] font-medium text-white/45">{price}</span>:null}</div>
    {valid&&<div className="mt-1 leading-tight">
      <div className="text-[7px] text-white/45 whitespace-nowrap"><b className="text-white/75">{split!.betPercentage}%</b> bets · <b className="text-white/75">{split!.moneyPercentage}%</b> money</div>
      {heat&&<div className={`mt-0.5 flex items-center gap-0.5 text-[6.5px] font-bold uppercase ${abs>=20?'text-orange-400':'text-yellow-300'}`}><Flame className="w-2.5 h-2.5"/>{heat} <span className="text-white/35">{diff>0?'+':''}{diff}pt</span></div>}
    </div>}
  </div>
}

function QuickTool({icon,label,onClick}:{icon:ReactNode;label:string;onClick:()=>void}){return <button type="button" onClick={onClick} className="flex items-center justify-center gap-1 text-white/62 hover:text-white"><span className="text-primary">{icon}</span><span className="leading-tight font-medium text-center truncate">{label}</span></button>}

function TeamRow({ team }: { team: SportTeam }) {
  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden shrink-0 border border-white/10 shadow-inner">
          {team.logo ? (
            <img src={team.logo} alt={team.abbreviation} className="w-full h-full object-cover bg-white p-1" />
          ) : (
            <span className="text-white text-xs font-heading tracking-wider">{team.abbreviation.slice(0, 2)}</span>
          )}
        </div>
        <div>
          <div className="font-heading text-xl uppercase leading-none tracking-wide text-white">{team.abbreviation}</div>
          <div className="text-[10px] font-mono text-white/50 mt-1.5 tracking-widest font-bold">{team.record || '0-0'}</div>
        </div>
      </div>
      {team.score !== null && (
        <div className="text-right">
          <div className="text-[8px] font-mono font-bold uppercase tracking-widest text-white/40">Score</div>
          <div className="font-heading text-3xl leading-none text-white tabular-nums tracking-tighter">{team.score}</div>
        </div>
      )}
    </div>
  );
}
