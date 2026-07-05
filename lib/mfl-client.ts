// Minimal client for MyFantasyLeague's public export API.
// Docs: https://api.myfantasyleague.com/{year}/api_info?STATE=details&CCAT=export
// api.myfantasyleague.com redirects to the specific server hosting a given
// league/year (e.g. www42.myfantasyleague.com) — fetch() follows that
// redirect automatically, so we never need to know the server name.

const UA = "mfl-history-app/1.0 (personal league history import script)";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A build fetches hundreds of these in a row (23 seasons × up to ~17 weeks
 * each) — transient network blips or momentary rate-limiting from MFL are
 * expected, not exceptional, so retry a couple of times with backoff before
 * giving up on any single request. */
async function mflGet<T>(year: number, params: Record<string, string>, attempt = 1): Promise<T> {
  const qs = new URLSearchParams({ JSON: "1", ...params });
  const url = `https://api.myfantasyleague.com/${year}/export?${qs.toString()}`;
  const maxAttempts = 3;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA } });
  } catch (err) {
    if (attempt < maxAttempts) {
      await sleep(attempt * 500);
      return mflGet<T>(year, params, attempt + 1);
    }
    throw new Error(`MFL request failed after ${maxAttempts} attempts: ${url} (${(err as Error).message})`);
  }
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
      await sleep(attempt * 500);
      return mflGet<T>(year, params, attempt + 1);
    }
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
