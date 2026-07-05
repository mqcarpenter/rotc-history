import Link from "next/link";
import { getCareerRecords } from "@/lib/records";

export default async function CareerRecordsPage() {
  const rows = await getCareerRecords();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Career Records</h1>
      <div className="overflow-x-auto rounded-xl border border-neutral-200/70 bg-white shadow-sm shadow-neutral-200/40">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>Seasons</th>
              <th>W</th>
              <th>L</th>
              <th>T</th>
              <th>Pct</th>
              <th>PF</th>
              <th>PA</th>
              <th>Titles</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.team_id}>
                <td>{i + 1}</td>
                <td>
                  <Link href={`/teams/${r.team_id}`} className="hover:underline">
                    {r.team_name}
                  </Link>
                </td>
                <td>{r.seasons_played}</td>
                <td>{r.wins}</td>
                <td>{r.losses}</td>
                <td>{r.ties}</td>
                <td>{r.win_pct.toFixed(3)}</td>
                <td>{r.points_for.toFixed(2)}</td>
                <td>{r.points_against.toFixed(2)}</td>
                <td>{r.championships || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
