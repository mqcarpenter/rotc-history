import Link from "next/link";
import { Season, StandingsRow } from "@/lib/records";

export function StandingsView({
  seasons,
  season,
  standings,
}: {
  seasons: Season[];
  season: number;
  standings: StandingsRow[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Standings</h1>
        <div className="flex flex-wrap gap-1.5">
          {seasons.map((s) => {
            const isLatest = s.season === seasons[0].season;
            return (
              <Link
                key={s.season}
                href={isLatest ? "/standings" : `/standings/${s.season}`}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm transition-colors ${
                  s.season === season
                    ? "bg-indigo-600 text-white font-medium"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                }`}
              >
                {s.season}
                {isLatest && <span className="badge-new">New</span>}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200/70 bg-white shadow-sm shadow-neutral-200/40">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>W</th>
              <th>L</th>
              <th>T</th>
              <th>Pct</th>
              <th>PF</th>
              <th>PA</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, i) => (
              <tr key={row.team_id}>
                <td>{i + 1}</td>
                <td>
                  <Link href={`/teams/${row.team_id}`} className="hover:underline">
                    {row.team_name}
                  </Link>
                </td>
                <td>{row.wins}</td>
                <td>{row.losses}</td>
                <td>{row.ties}</td>
                <td>{row.win_pct.toFixed(3)}</td>
                <td>{row.points_for.toFixed(2)}</td>
                <td>{row.points_against.toFixed(2)}</td>
              </tr>
            ))}
            {standings.length === 0 && (
              <tr>
                <td colSpan={8} className="text-neutral-500">
                  No regular-season games recorded for {season}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
