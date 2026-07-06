// Minimal client for MyFantasyLeague's public export API.
// Docs: https://api.myfantasyleague.com/{year}/api_info?STATE=details&CCAT=export
// api.myfantasyleague.com redirects to the specific server hosting a given
// league/year (e.g. www42.myfantasyleague.com) — fetch() follows that
// redirect automatically, so we never need to know the server name.

const UA = "mfl-history-app/1.0 (personal league history import script)";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// MFL's export API rate-limits aggressively — a full import (23 seasons ×
// up to 17 weeks each, ~400 requests) reliably triggers 429s if requests go
// out back-to-back or in parallel. Every request funnels through this queue,
// which enforces a minimum gap between requests regardless of how many
// callers are "concurrently" awaiting a fetch — that's what actually keeps
// us under MFL's limit, more than any per-request retry logic does.
const MIN_INTERVAL_MS = 800;
let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function throttledFetch(url: string): Promise<Response> {
  const scheduled = requestQueue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fetch(url, { headers: { "User-Agent": UA } });
  });
  // Chain the queue off this request regardless of outcome, so one failure
  // doesn't wedge every request behind it forever.
  requestQueue = scheduled.then(
    () => undefined,
    () => undefined
  );
  return scheduled;
}

/** A 429 here means "you're being rate-limited," not "something broke" — so
 * on 429 specifically we wait much longer (honoring a Retry-After header if
 * MFL sends one) and retry more times than we would for a generic failure. */
async function mflGet<T>(year: number, params: Record<string, string>, attempt = 1): Promise<T> {
  const qs = new URLSearchParams({ JSON: "1", ...params });
  const url = `https://api.myfantasyleague.com/${year}/export?${qs.toString()}`;
  const maxAttempts = 6;
  let res: Response;
  try {
    res = await throttledFetch(url);
  } catch (err) {
    if (attempt < maxAttempts) {
      await sleep(attempt * 1000);
      return mflGet<T>(year, params, attempt + 1);
    }
    throw new Error(`MFL request failed after ${maxAttempts} attempts: ${url} (${(err as Error).message})`);
  }
  if (res.status === 429) {
    if (attempt < maxAttempts) {
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : null;
      const backoffMs = retryAfterMs ?? Math.min(3000 * 2 ** (attempt - 1), 30000);
      console.log(`    rate-limited (429), waiting ${Math.round(backoffMs / 1000)}s (attempt ${attempt}/${maxAttempts})`);
      await sleep(backoffMs);
      return mflGet<T>(year, params, attempt + 1);
    }
    throw new Error(`MFL request rate-limited (429) after ${maxAttempts} attempts: ${url}`);
  }
  if (!res.ok) {
    if (res.status >= 500 && attempt < maxAttempts) {
      await sleep(attempt * 1000);
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
