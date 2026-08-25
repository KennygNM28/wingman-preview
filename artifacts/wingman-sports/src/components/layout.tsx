import { Link, useLocation } from 'wouter';
import { User, ChevronLeft, ChartNoAxesCombined, MessageCircleMore, UsersRound } from 'lucide-react';
import { FaRunning } from 'react-icons/fa';
import { WingmanMark } from '@/components/wingman-mark';
import { ReactNode } from 'react';
import { useHealthCheck } from '@workspace/api-client-react';
interface LayoutProps{children:ReactNode;showBack?:boolean;title?:string;hideHeader?:boolean}
export function Layout({children,showBack=false,title,hideHeader=false}:LayoutProps){
 const [location,setLocation]=useLocation(); const {data:health}=useHealthCheck(); const isHealthy=health?.status==='ok';
 const isActive=(path:string)=>location===path||(path!=='/'&&location.startsWith(path));
 return <div className="app-shell min-h-[100dvh] flex flex-col bg-black font-sans max-w-md mx-auto relative overflow-hidden">
  {!hideHeader&&<header className="sticky top-0 z-50 bg-[#030304]/95 backdrop-blur-xl border-b border-white/[.06] px-3 h-14 flex items-center justify-between shrink-0">
   <div className="flex items-center gap-2.5 min-w-0">{showBack?<button onClick={()=>history.back()} className="p-2 -ml-2 rounded-full text-white"><ChevronLeft className="w-6 h-6"/></button>:<div className="relative"><WingmanMark compact className="w-9 h-9"/><div className={`absolute -top-0.5 -right-0.5 w-2 h-2 border border-black rounded-full ${isHealthy?'bg-green-500':'bg-destructive'}`}/></div>}<h1 className="font-heading text-lg tracking-wide uppercase text-white truncate">{title||'Wingman Sports'}</h1></div>
   {!showBack&&<button onClick={()=>setLocation('/profile')} aria-label="Profile and settings" className="w-9 h-9 rounded-full border border-white/10 bg-[#0b0b0d] flex items-center justify-center text-white/70 hover:text-white"><User className="w-4 h-4"/></button>}
  </header>}
  <main className="flex-1 overflow-y-auto pb-24 no-scrollbar relative z-10">{children}</main>
  <nav className="wm-bottom-nav fixed bottom-0 w-full max-w-md z-50 pb-safe"><div className="grid grid-cols-5 items-end h-[74px] px-1.5">
   <Nav href="/" active={isActive('/')} label="The Action"><FaRunning className="w-5 h-5"/></Nav>
   <Nav href="/numbers" active={isActive('/numbers')} label="The Numbers"><ChartNoAxesCombined className="w-5 h-5"/></Nav>
   <div className="relative -top-4 flex flex-col items-center"><Link href="/wingman" aria-label="Wingman" className="wm-center-button w-[62px] h-[62px] rounded-full overflow-hidden flex items-center justify-center"><WingmanMark compact className="w-[50px] h-[50px] rounded-full"/></Link><span className={`mt-1 text-[8px] font-bold uppercase tracking-wider ${isActive('/wingman')?'text-primary':'text-white/55'}`}>Wingman</span></div>
   <Nav href="/word" active={isActive('/word')} label="The Word"><div className="relative"><User className="w-5 h-5"/><MessageCircleMore className="absolute -right-2 -top-1 w-3 h-3 text-primary"/></div></Nav>
   <Nav href="/huddle" active={isActive('/huddle')} label="The Huddle"><UsersRound className="w-5 h-5"/></Nav>
  </div></nav>
 </div>
}
function Nav({href,active,label,children}:{href:string;active:boolean;label:string;children:ReactNode}){return <Link href={href} className="flex flex-col items-center justify-center gap-1 group h-full"><div className={`p-1.5 rounded-lg ${active?'text-primary':'text-white/55 group-hover:text-white'}`}>{children}</div><span className={`text-[8px] font-bold uppercase tracking-tight text-center ${active?'text-primary':'text-white/55'}`}>{label}</span></Link>}
