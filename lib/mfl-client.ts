// Minimal client for MyFantasyLeague's public export API.
// Docs: https://api.myfantasyleague.com/{year}/api_info?STATE=details&CCAT=export
// api.myfantasyleague.com redirects to the specific server hosting a given
// league/year (e.g. www42.myfantasyleague.com) — fetch() follows that
// redirect automatically, so we never need to know the server name.

const UA = "mfl-history-app/1.0 (personal league history import script)";

async function mflGet<T>(year: number, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ JSON: "1", ...params });
  const url = `https://api.myfantasyleague.com/${year}/export?${qs.toString()}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`MFL request failed (${res.status}): ${url}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`MFL response wasn't JSON for ${url}. First 200 chars: ${text.slice(0, 200)}`);
  }
}

export interface MflFranchise {
  id: string;
  name: string;
  division?: string;
  abbrev?: string;
}

export interface MflLeagueInfo {
  league: {
    name: string;
    startWeek?: string;
    endWeek?: string;
    lastRegularSeasonWeek?: string;
    conferences?: { conference: { id: string; name: string } | { id: string; name: string }[] };
    divisions?: { division: { id: string; name: string; conference: string } | { id: string; name: string; conference: string }[] };
    franchises: { franchise: MflFranchise[]; count: string };
    history?: { league: { year: string; url: string }[] };
  };
}

export async function fetchLeagueInfo(year: number, leagueId: string) {
  return mflGet<MflLeagueInfo>(year, { TYPE: "league", L: leagueId });
}

/** Franchise league IDs used in past seasons, keyed by year, from the "history" block. */
export async function fetchLeagueHistory(currentYear: number, leagueId: string) {
  const info = await fetchLeagueInfo(currentYear, leagueId);
  const rows = info.league.history?.league ?? [];
  const byYear: Record<number, string> = {};
  for (const row of rows) {
    const year = parseInt(row.year, 10);
    const match = row.url.match(/\/home\/(\d+)/);
    if (match) byYear[year] = match[1];
  }
  // Current year might not appear in history if the season just started; make sure it's included.
  byYear[currentYear] = leagueId;
  return byYear;
}

export interface MflWeeklyFranchiseResult {
  id: string;
  score: string;
  isHome: string;
  result?: "W" | "L" | "T";
}

export interface MflWeeklyMatchup {
  regularSeason?: string;
  franchise: MflWeeklyFranchiseResult[];
}

export interface MflWeeklyResults {
  weeklyResults: {
    week: string;
    matchup?: MflWeeklyMatchup | MflWeeklyMatchup[];
  };
}

export async function fetchWeeklyResults(year: number, leagueId: string, week: number) {
  return mflGet<MflWeeklyResults>(year, {
    TYPE: "weeklyResults",
    L: leagueId,
    W: String(week),
  });
}

/** Normalizes MFL's XML-ish JSON quirk where a single-item list isn't wrapped in an array. */
export function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
