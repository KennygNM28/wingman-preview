import { Layout } from '@/components/layout';
import { WingmanMark } from '@/components/wingman-mark';
import { LEAGUES, type LeagueKey } from '@/lib/sports-directory';
import { useState, type FormEvent } from 'react';
import { Search, AlertCircle, RefreshCw, Sparkles, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SUGGESTIONS: Record<LeagueKey,string[]> = {
  mlb:["What is Zack Wheeler's ERA this season?","What pitches does Bryce Harper handle best?","How often do the Phillies score in the first inning this season?"],
  nfl:["How many passing yards is Patrick Mahomes averaging in his last 10 games?","How many points per game are the Eagles scoring?","How many points per game are the Eagles allowing?"],
  nba:["How many points is Jayson Tatum averaging in his last 10 games?","How many rebounds is Nikola Jokic averaging?","How many points per game are the Celtics scoring?"],
  ncaaf:["How many points per game is Alabama scoring?","How many passing yards is the quarterback averaging in the last 5 games?"],
  ncaab:["How many points per game is Duke scoring?","How many rebounds is this player averaging in the last 10 games?"],
};

export default function Wingman(){
  const [league,setLeague]=useState<LeagueKey>('mlb');
  const [query,setQuery]=useState('');
  const [context,setContext]=useState<Record<string,any>>({});
  const [result,setResult]=useState<any|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const run=async(question:string)=>{
    const q=question.trim(); if(!q)return;
    setLoading(true);setError(null);
    try{
      const r=await fetch(league==='mlb'?'/api/mlb/wingman':'/api/sports/wingman',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(league==='mlb'?{question:q,context}:{league,question:q,context})});
      const p=await r.json(); if(!r.ok) throw new Error(p?.detail||p?.error||'Wingman search failed');
      setContext(p.context||{}); setResult(p);
    }catch(e){setResult(null);setError(e instanceof Error?e.message:'Wingman search failed');}finally{setLoading(false)}
  };
  const submit=(e:FormEvent)=>{e.preventDefault();void run(query)};
  const leagueLabel=LEAGUES.find(l=>l.key===league)?.label||league.toUpperCase();
  return <Layout hideHeader>
    <div className="min-h-full bg-black pb-4">
      <header className="wm-page-header sticky top-0 z-40">
        <button onClick={()=>history.back()} className="text-white"><ChevronLeft className="w-6 h-6"/></button>
        <div className="flex items-center justify-center gap-2"><WingmanMark compact className="w-9 h-9"/><div className="text-left"><div className="font-heading text-lg uppercase tracking-wide text-white leading-none">Ask Your Wingman</div><div className="mt-1 text-[8px] font-mono uppercase tracking-[.18em] text-primary">{leagueLabel} intelligence</div></div></div>
        <div />
      </header>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-5 gap-1 rounded-[10px] border border-white/10 bg-[#0b0b0d] p-1">
          {LEAGUES.map(l=><button key={l.key} onClick={()=>{setLeague(l.key);setContext({});setResult(null);setError(null);setQuery('')}} className={`h-9 rounded-[8px] text-[8px] font-bold uppercase ${league===l.key?'bg-primary text-white':'text-white/40'}`}>{l.label}</button>)}
        </div>

        <form onSubmit={submit} className="wm-wingman-query p-3">
          <textarea data-wingman-search value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Ask any ${leagueLabel} team or player stat...`} className="min-h-[74px] w-full resize-none bg-transparent px-1 text-[15px] leading-relaxed text-white placeholder:text-white/28 outline-none"/>
          <div className="flex items-center justify-between gap-2 border-t border-white/[.07] pt-2">
            <span className="text-[8px] font-mono uppercase tracking-wider text-white/28">Team • Player • Trend • Timeframe</span>
            <Button type="submit" disabled={!query.trim()||loading} size="icon" className="h-10 w-10 rounded-full shrink-0">{loading?<RefreshCw className="w-4 h-4 animate-spin"/>:<Search className="w-4 h-4"/>}</Button>
          </div>
        </form>

        {!result&&!error&&!loading&&<div className="flex gap-2 overflow-x-auto no-scrollbar">{SUGGESTIONS[league].map(s=><button key={s} onClick={()=>{setQuery(s);void run(s)}} className="shrink-0 max-w-[17rem] truncate rounded-full border border-white/10 bg-[#0b0b0d] px-3 py-2 text-left text-[8px] font-mono uppercase tracking-wider text-white/50"><Sparkles className="inline w-3 h-3 text-primary mr-1.5"/>{s}</button>)}</div>}

        {error&&<section className="wing-card rounded-[10px] p-4"><AlertCircle className="w-5 h-5 text-primary"/><p className="mt-2 text-sm text-red-200">{error}</p></section>}

        {result&&<section className="space-y-3">
          <div className="wm-result-tabs grid grid-cols-3 text-center text-[9px] font-bold uppercase tracking-widest"><div className="border-b-2 border-primary py-3 text-primary">Result</div><div className="py-3 text-white/32">Matches</div><div className="py-3 text-white/32">Trends</div></div>
          <article className="wm-answer-card wing-card p-4">
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-white/62"><WingmanMark compact className="w-6 h-6"/>Wingman Answer</div>
            <div className="mt-4 text-[9px] font-mono uppercase tracking-[.16em] text-primary">{result.result?.title}</div>
            <p className="mt-2 text-[18px] leading-snug text-white">{result.answer}</p>
            <div className="mt-4 grid grid-cols-3 gap-2">{(result.result?.stats||[]).slice(0,6).map((s:any)=><div key={`${s.label}-${s.value}`} className="rounded-[8px] border border-white/10 bg-[#0b0b0d] p-3 text-center"><div className="font-heading text-xl text-white">{s.value}</div><div className="mt-1 text-[8px] uppercase tracking-wider text-white/38">{s.label}</div></div>)}</div>
            <div className="mt-4 border-t border-white/[.08] pt-3 text-[9px] text-white/38"><div><span className="uppercase tracking-wider">Timeframe:</span> <span className="text-white/65">{result.result?.timeframeLabel}</span></div><div className="mt-1"><span className="uppercase tracking-wider">Source:</span> <span className="text-white/65">{result.result?.source}</span></div>{result.result?.sampleLabel&&<div className="mt-1">Sample: {result.result.sampleLabel}</div>}</div>
            {result.result?.note&&<p className="mt-3 text-[10px] leading-relaxed text-white/42">{result.result.note}</p>}
          </article>
          <Button onClick={()=>{setResult(null);setError(null);setQuery('')}} className="w-full h-12 rounded-[9px] font-heading uppercase tracking-wider">Ask Another Question</Button>
        </section>}
      </div>
    </div>
  </Layout>
}
