import { notFound } from "next/navigation";
import { getTeam, getTeams } from "@/lib/records";

// Static export needs to know every team ID up front so it can pre-render
// one HTML file per team at build time (there's no server to handle
// on-demand routes once this is deployed as static files).
export async function generateStaticParams() {
  const teams = await getTeams();
  if (teams.length === 0) {
    throw new Error(
      "No teams found in data/league.db — run `npm run import` before `npm run build` (see README)."
    );
  }
  return teams.map((t) => ({ id: String(t.id) }));
}

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teamId = parseInt(id, 10);
  const data = await getTeam(teamId);
  if (!data) return notFound();

  const { team, seasons, gameLog } = data;
  const wins = gameLog.filter((g) => g.outcome === "W").length;
  const losses = gameLog.filter((g) => g.outcome === "L").length;
  const ties = gameLog.filter((g) => g.outcome === "T").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{team.base_name}</h1>
        <p className="text-neutral-500 mt-1">
          {seasons.length} seasons · {wins}-{losses}
          {ties ? `-${ties}` : ""} all-time
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Seasons</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table>
            <thead>
              <tr>
                <th>Season</th>
                <th>Name Used</th>
                <th>Conference</th>
                <th>Division</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={s.season}>
                  <td>{s.season}</td>
                  <td>{s.team_name}</td>
                  <td>{s.conference ?? "—"}</td>
                  <td>{s.division ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Game Log</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white max-h-[32rem] overflow-y-auto">
          <table>
            <thead>
              <tr>
                <th>Season</th>
                <th>Wk</th>
                <th>Type</th>
                <th>Result</th>
                <th>Score</th>
                <th>Opponent</th>
              </tr>
            </thead>
            <tbody>
              {gameLog.map((g, i) => (
                <tr key={i}>
                  <td>{g.season}</td>
                  <td>{g.week}</td>
                  <td>{g.game_type}</td>
                  <td>{g.outcome}</td>
                  <td>
                    {g.score.toFixed(2)}–{g.opp_score.toFixed(2)}
                  </td>
                  <td>{g.opp_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
