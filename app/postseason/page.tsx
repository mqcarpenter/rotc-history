import { getChampions } from "@/lib/records";

export default async function PostseasonPage() {
  const rows = await getChampions();
  const latestSeason = rows[0]?.season;
  const hasAnyChampionData = rows.some(
    (r) => r.champ_name || r.runner_up_name || r.toilet_champ_name
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Postseason</h1>
      {!hasAnyChampionData && (
        <p className="text-neutral-600 text-sm max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          No champions recorded yet. Fill in <code>data/champions.json</code> in the repo with each
          season&apos;s league champion, runner-up, and toilet bowl champion (team names must match
          the <code>Teams</code> page), then redeploy — the build automatically loads it into this
          table.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-neutral-200/70 bg-white shadow-sm shadow-neutral-200/40">
        <table>
          <thead>
            <tr>
              <th>Season</th>
              <th>League Champion</th>
              <th>Runner-up</th>
              <th>Toilet Bowl</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.season}>
                <td>
                  {r.season}
                  {r.season === latestSeason && <span className="ml-2 badge-new">New</span>}
                </td>
                <td>{r.champ_name ?? "—"}</td>
                <td>{r.runner_up_name ?? "—"}</td>
                <td>{r.toilet_champ_name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
