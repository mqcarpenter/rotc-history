import Link from "next/link";
import { getSeasons, Season } from "@/lib/records";

export default async function Home() {
  let seasons: Season[] = [];
  let error: string | null = null;
  try {
    seasons = await getSeasons();
  } catch (e) {
    error = (e as Error).message;
  }

  if (error || seasons.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Welcome</h1>
        <p className="text-neutral-600">
          No data has been imported yet. Run the import script to pull your league&apos;s history from
          MyFantasyLeague:
        </p>
        <pre className="rounded bg-neutral-900 text-neutral-100 p-4 text-sm overflow-x-auto">
          npm run import -- --league 67102 --start 2003 --end 2025
        </pre>
        {error && <p className="text-sm text-red-600">Error: {error}</p>}
      </div>
    );
  }

  const latest = seasons[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{latest.league_name ?? "League History"}</h1>
        <p className="text-neutral-500 mt-1">
          {seasons.length} season{seasons.length === 1 ? "" : "s"} imported, {seasons[seasons.length - 1].season}
          {"–"}
          {latest.season}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Link href="/standings" className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400">
          <div className="font-semibold">Standings</div>
          <div className="text-sm text-neutral-500">Season by season</div>
        </Link>
        <Link href="/records/single-game" className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400">
          <div className="font-semibold">Single Game Records</div>
          <div className="text-sm text-neutral-500">Best and worst games ever</div>
        </Link>
        <Link href="/records/single-season" className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400">
          <div className="font-semibold">Single Season Records</div>
          <div className="text-sm text-neutral-500">Best and worst seasons</div>
        </Link>
        <Link href="/records/career" className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400">
          <div className="font-semibold">Career Records</div>
          <div className="text-sm text-neutral-500">All-time franchise leaders</div>
        </Link>
        <Link href="/postseason" className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400">
          <div className="font-semibold">Postseason</div>
          <div className="text-sm text-neutral-500">Champions by year</div>
        </Link>
        <Link href="/teams" className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400">
          <div className="font-semibold">Teams</div>
          <div className="text-sm text-neutral-500">Every franchise in league history</div>
        </Link>
      </div>
    </div>
  );
}
