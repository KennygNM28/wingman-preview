type MarketGrade = 'hit' | 'miss' | 'push' | null;

type FinalGame = {
  id?: string;
  status?: string;
  away?: { name?: string; shortName?: string; abbreviation?: string; score?: number | null };
  home?: { name?: string; shortName?: string; abbreviation?: string; score?: number | null };
  betting?: {
    awaySpread?: number | null;
    homeSpread?: number | null;
    awayMoneyline?: number | null;
    homeMoneyline?: number | null;
    total?: number | null;
  } | null;
};

function normalize(value: unknown) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function teamMatchesText(team: FinalGame['away'], text: string) {
  const haystack = normalize(text);
  if (!haystack) return false;
  return [team?.name, team?.shortName, team?.abbreviation]
    .map(normalize)
    .filter((alias) => alias.length >= 2)
    .some((alias) => haystack.includes(alias) || alias.includes(haystack));
}

function scoreFromTeamCell(cell: Element | undefined): number | null {
  const match = String(cell?.textContent ?? '').match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function readFinalGames(): FinalGame[] {
  const games: FinalGame[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith('wingman:scoreboard:')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.games)) continue;
      for (const game of parsed.games) {
        if (game?.status === 'final' && game?.betting) games.push(game);
      }
    }
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
  return games;
}

function gradeSpread(teamScore: number | null, opponentScore: number | null, spread: number | null | undefined): MarketGrade {
  if (teamScore == null || opponentScore == null || spread == null) return null;
  const result = teamScore + spread - opponentScore;
  if (Math.abs(result) < 0.0001) return 'push';
  return result > 0 ? 'hit' : 'miss';
}

function gradeMoneyline(teamScore: number | null, opponentScore: number | null, moneyline: number | null | undefined): MarketGrade {
  if (teamScore == null || opponentScore == null || moneyline == null) return null;
  if (teamScore === opponentScore) return 'push';
  return teamScore > opponentScore ? 'hit' : 'miss';
}

function gradeTotal(awayScore: number | null, homeScore: number | null, total: number | null | undefined, side: 'over' | 'under'): MarketGrade {
  if (awayScore == null || homeScore == null || total == null) return null;
  const result = awayScore + homeScore - total;
  if (Math.abs(result) < 0.0001) return 'push';
  if (side === 'over') return result > 0 ? 'hit' : 'miss';
  return result < 0 ? 'hit' : 'miss';
}

function addGrade(cell: HTMLElement | undefined, grade: MarketGrade) {
  if (!cell || !grade) return;
  const badge = document.createElement('span');
  badge.dataset.wmGrade = grade;
  badge.className = `wm-grade wm-grade--${grade}`;
  badge.textContent = grade === 'hit' ? '✓ HIT' : grade === 'miss' ? '✕ MISS' : 'PUSH';
  cell.appendChild(badge);
}

function findGame(card: HTMLElement, games: FinalGame[]) {
  const rows = Array.from(card.querySelectorAll<HTMLElement>('.wm-team-row'));
  if (rows.length < 2) return null;
  const awayCell = rows[0].children[0];
  const homeCell = rows[1].children[0];
  const awayText = String(awayCell?.textContent ?? '');
  const homeText = String(homeCell?.textContent ?? '');
  const awayScore = scoreFromTeamCell(awayCell);
  const homeScore = scoreFromTeamCell(homeCell);

  const game = games.find((candidate) => {
    if (!teamMatchesText(candidate.away, awayText) || !teamMatchesText(candidate.home, homeText)) return false;
    if (awayScore != null && candidate.away?.score != null && awayScore !== Number(candidate.away.score)) return false;
    if (homeScore != null && candidate.home?.score != null && homeScore !== Number(candidate.home.score)) return false;
    return true;
  });

  return game ? { game, rows, awayScore, homeScore } : null;
}

function applyFinalMarketGrades() {
  const games = readFinalGames();
  if (!games.length) return;

  for (const card of document.querySelectorAll<HTMLElement>('.wm-game-card')) {
    const header = String(card.querySelector('.wm-game-head')?.textContent ?? '').toLowerCase();
    if (!header.includes('final')) continue;

    const matched = findGame(card, games);
    if (!matched) continue;

    const { game, rows, awayScore, homeScore } = matched;
    const betting = game.betting;
    if (!betting) continue;

    const grades: MarketGrade[] = [
      gradeSpread(awayScore, homeScore, betting.awaySpread),
      gradeMoneyline(awayScore, homeScore, betting.awayMoneyline),
      gradeTotal(awayScore, homeScore, betting.total, 'over'),
      gradeSpread(homeScore, awayScore, betting.homeSpread),
      gradeMoneyline(homeScore, awayScore, betting.homeMoneyline),
      gradeTotal(awayScore, homeScore, betting.total, 'under'),
    ];
    const expectedBadges = grades.filter(Boolean).length;
    const fingerprint = [
      game.id,
      awayScore,
      homeScore,
      betting.awaySpread,
      betting.homeSpread,
      betting.awayMoneyline,
      betting.homeMoneyline,
      betting.total,
    ].join(':');

    if (
      card.dataset.wmFinalGrade === fingerprint &&
      card.querySelectorAll('[data-wm-grade]').length === expectedBadges &&
      card.querySelector('[data-wm-final-note]')
    ) {
      continue;
    }

    card.querySelectorAll('[data-wm-grade], [data-wm-final-note]').forEach((node) => node.remove());

    const marketHeader = card.querySelector<HTMLElement>('.wm-team-market-grid');
    if (marketHeader?.parentElement) {
      const note = document.createElement('div');
      note.dataset.wmFinalNote = 'true';
      note.className = 'wm-final-market-note';
      note.textContent = 'PREGAME LINES • GRADED FINAL';
      marketHeader.parentElement.insertBefore(note, marketHeader);
    }

    const awayCells = Array.from(rows[0].querySelectorAll<HTMLElement>('.wm-market-cell'));
    const homeCells = Array.from(rows[1].querySelectorAll<HTMLElement>('.wm-market-cell'));
    addGrade(awayCells[0], grades[0]);
    addGrade(awayCells[1], grades[1]);
    addGrade(awayCells[2], grades[2]);
    addGrade(homeCells[0], grades[3]);
    addGrade(homeCells[1], grades[4]);
    addGrade(homeCells[2], grades[5]);
    card.dataset.wmFinalGrade = fingerprint;
  }
}

let scheduled = false;
function scheduleFinalMarketGrades() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    applyFinalMarketGrades();
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const start = () => {
    scheduleFinalMarketGrades();
    const observer = new MutationObserver(scheduleFinalMarketGrades);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('storage', scheduleFinalMarketGrades);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
