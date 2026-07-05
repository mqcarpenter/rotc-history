import { getSingleSeasonRecords, SeasonRecordRow } from "@/lib/records";

function SeasonTable({ rows }: { rows: SeasonRecordRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Points</th>
          <th>Team</th>
          <th>Season</th>
          <th>Record</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            <td className="font-medium">{r.total_points.toFixed(2)}</td>
            <td>{r.team_name}</td>
            <td>{r.season}</td>
            <td>
              {r.wins}-{r.losses}
              {r.ties ? `-${r.ties}` : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function SingleSeasonRecordsPage() {
  const { mostPoints, fewestPoints } = await getSingleSeasonRecords(15);
  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Single Season Records</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Most Points in a Season</h2>
        <div className="overflow-x-auto rounded-xl border border-neutral-200/70 bg-white shadow-sm shadow-neutral-200/40">
          <SeasonTable rows={mostPoints} />
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Fewest Points in a Season</h2>
        <div className="overflow-x-auto rounded-xl border border-neutral-200/70 bg-white shadow-sm shadow-neutral-200/40">
          <SeasonTable rows={fewestPoints} />
        </div>
      </section>
    </div>
  );
}
