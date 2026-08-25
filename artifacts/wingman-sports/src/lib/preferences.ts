import type { LeagueKey } from './sports-directory';
const SPORTS_KEY='wingman:selected-sports', FAVORITES_KEY='wingman:favorite-teams';
const ALL:LeagueKey[]=['mlb','nfl','nba','ncaaf','ncaab'];
export function loadSelectedSports():LeagueKey[]{try{const v=JSON.parse(localStorage.getItem(SPORTS_KEY)||'[]');const good=(Array.isArray(v)?v:[]).filter(x=>ALL.includes(x));return good.length?good:ALL}catch{return ALL}}
export function saveSelectedSports(v:LeagueKey[]){localStorage.setItem(SPORTS_KEY,JSON.stringify(v.length?v:ALL));window.dispatchEvent(new Event('wingman-preferences'))}
export function loadFavorites():string[]{try{const v=JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
export function saveFavorites(v:string[]){localStorage.setItem(FAVORITES_KEY,JSON.stringify(v));window.dispatchEvent(new Event('wingman-preferences'))}
export const favoriteKey=(league:LeagueKey,abbr:string)=>`${league}:${abbr.toUpperCase()}`;
