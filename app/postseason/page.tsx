import { getChampions } from "@/lib/records";

export default async function PostseasonPage() {
  const rows = await getChampions();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Postseason</h1>
      <p className="text-neutral-600 text-sm max-w-2xl">
        MFL doesn&apos;t flag which games are official playoff games vs. toilet bowl/consolation
        games, so champions aren&apos;t computed automatically. Fill in the <code>champions</code>{" "}
        table in <code>data/league.db</code> (or add an admin form) to populate this list season by
        season.
      </p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
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
                <td>{r.season}</td>
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
