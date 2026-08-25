import { type ReactNode } from 'react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';import { Toaster } from '@/components/ui/toaster';import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';import Home from '@/pages/home';import Profile from '@/pages/profile';import Numbers from '@/pages/bets';import GameCenter from '@/pages/game-center';import Word from '@/pages/word';import Huddle from '@/pages/huddle';import Wingman from '@/pages/wingman';
import {Route,Switch,useLocation,Router as WouterRouter,Redirect} from 'wouter';
const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:0,gcTime:0,refetchOnMount:'always',refetchOnWindowFocus:true,retry:1}}});
function Router(){return <RoutedErrorBoundary><Switch><Route path="/" component={Home}/><Route path="/numbers" component={Numbers}/><Route path="/word" component={Word}/><Route path="/huddle" component={Huddle}/><Route path="/wingman" component={Wingman}/><Route path="/profile" component={Profile}/><Route path="/game/:league/:id" component={GameCenter}/><Route path="/bets"><Redirect to="/numbers"/></Route><Route path="/community"><Redirect to="/word"/></Route><Route path="/action"><Redirect to="/"/></Route><Route component={NotFound}/></Switch></RoutedErrorBoundary>}
function RoutedErrorBoundary({children}:{children:ReactNode}){const[location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>}
export default function App(){return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Router/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>}
