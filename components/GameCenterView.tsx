import Link from "next/link";
import { GameCenterGame, HeadToHead } from "@/lib/records";

function seriesLine(label: string, s: HeadToHead["overall"], teamA: string, teamB: string) {
  if (s.wins_a + s.wins_b + s.ties === 0) return null;
  const leader =
    s.wins_a === s.wins_b
      ? "Series tied"
      : s.wins_a > s.wins_b
      ? `${teamA} leads`
      : `${teamB} leads`;
  return (
    <div key={label} className="text-sm text-neutral-600">
      <span className="font-medium text-neutral-800">{label}:</span> {leader}{" "}
      {s.wins_a}-{s.wins_b}
      {s.ties ? `-${s.ties}` : ""} · {teamA} {s.points_a.toFixed(2)} – {teamB} {s.points_b.toFixed(2)} pts
    </div>
  );
}

function MatchupCard({ game, h2h }: { game: GameCenterGame; h2h: HeadToHead }) {
  const aWon = game.score_a > game.score_b;
  const bWon = game.score_b > game.score_a;
  // h2h.meetings includes every all-time meeting between these two teams,
  // including this week's game — that's fine for a full history list.
  const meetings = h2h.meetings;

  return (
    <div className="rounded-xl border border-neutral-200/70 bg-white shadow-sm shadow-neutral-200/40 p-4 space-y-3">
      {game.game_type !== "regular" && (
        <span className="badge-new" style={{ background: "linear-gradient(135deg,#f59e0b,#ea580c)" }}>
          {game.game_type === "playoff" ? "Playoff" : game.game_type}
        </span>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 items-center">
        <Link href={`/teams/${game.team_a_id}`} className={`font-medium hover:underline ${aWon ? "text-neutral-900" : "text-neutral-500"}`}>
          {game.team_a_name}
        </Link>
        <span className={`tabular-nums font-semibold ${aWon ? "text-neutral-900" : "text-neutral-500"}`}>
          {game.score_a.toFixed(2)}
        </span>
        <Link href={`/teams/${game.team_b_id}`} className={`font-medium hover:underline ${bWon ? "text-neutral-900" : "text-neutral-500"}`}>
          {game.team_b_name}
        </Link>
        <span className={`tabular-nums font-semibold ${bWon ? "text-neutral-900" : "text-neutral-500"}`}>
          {game.score_b.toFixed(2)}
        </span>
      </div>

      <div className="space-y-0.5 border-t border-neutral-100 pt-2">
        {seriesLine("All-time", h2h.overall, game.team_a_name, game.team_b_name)}
        {seriesLine("Regular season", h2h.regular, game.team_a_name, game.team_b_name)}
        {seriesLine("Postseason", h2h.postseason, game.team_a_name, game.team_b_name)}
      </div>

      {meetings.length > 1 && (
        <details className="pt-1">
          <summary className="text-sm text-indigo-600 cursor-pointer hover:underline">
            All-time matchups ({meetings.length})
          </summary>
          <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-100">
            <table>
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Week</th>
                  <th>Result</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {meetings
                  .map((m, i) => {
                    const winner = m.score_a > m.score_b ? m.team_a_name : m.team_b_name;
                    const loser = m.score_a > m.score_b ? m.team_b_name : m.team_a_name;
                    const winnerScore = Math.max(m.score_a, m.score_b);
                    const loserScore = Math.min(m.score_a, m.score_b);
                    return (
                      <tr key={i}>
                        <td>{m.season}</td>
                        <td>{m.week}</td>
                        <td>
                          {winner} def. {loser}
                        </td>
                        <td>
                          {winnerScore.toFixed(2)} – {loserScore.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

export function GameCenterView({
  seasons,
  season,
  week,
  games,
  headToHeads,
}: {
  seasons: { season: number; weeks: number[] }[];
  season: number;
  week: number;
  games: GameCenterGame[];
  headToHeads: HeadToHead[];
}) {
  const latest = seasons[0];
  const currentSeasonWeeks = seasons.find((s) => s.season === season)?.weeks ?? [];

  const seasonHref = (s: number) => (s === latest.season ? "/gamecenter" : `/gamecenter/${s}`);
  const weekHref = (s: number, w: number) =>
    s === latest.season && w === latest.weeks[latest.weeks.length - 1]
      ? "/gamecenter"
      : `/gamecenter/${s}/${w}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Game Center</h1>
        <div className="flex flex-wrap gap-1.5">
          {seasons.map((s) => (
            <Link
              key={s.season}
              href={seasonHref(s.season)}
              className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                s.season === season ? "bg-indigo-600 text-white font-medium" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {s.season}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {currentSeasonWeeks.map((w) => (
          <Link
            key={w}
            href={weekHref(season, w)}
            className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
              w === week ? "bg-neutral-900 text-white font-medium" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            Wk {w}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {games.map((g, i) => (
          <MatchupCard key={g.id} game={g} h2h={headToHeads[i]} />
        ))}
        {games.length === 0 && <p className="text-neutral-500">No games found for {season} week {week}.</p>}
      </div>
    </div>
  );
}
