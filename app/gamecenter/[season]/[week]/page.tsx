import { notFound } from "next/navigation";
import {
  getGameCenterWeeks,
  getGameCenterSeasons,
  getWeekGames,
  getHeadToHead,
} from "@/lib/records";
import { GameCenterView } from "@/components/GameCenterView";

export async function generateStaticParams() {
  const weeks = await getGameCenterWeeks();
  if (weeks.length === 0) {
    throw new Error(
      "No games found in data/league.db — run `npm run import` before `npm run build` (see README)."
    );
  }
  // Every (season, week) gets a page here, including the latest (also served
  // at the bare /gamecenter URL) — same pattern as /standings/[season].
  return weeks.map((w) => ({ season: String(w.season), week: String(w.week) }));
}

export default async function GameCenterWeekPage({
  params,
}: {
  params: Promise<{ season: string; week: string }>;
}) {
  const { season: seasonParam, week: weekParam } = await params;
  const season = parseInt(seasonParam, 10);
  const week = parseInt(weekParam, 10);

  const seasons = await getGameCenterSeasons();
  const seasonEntry = seasons.find((s) => s.season === season);
  if (!seasonEntry || !seasonEntry.weeks.includes(week)) return notFound();

  const games = await getWeekGames(season, week);
  const headToHeads = await Promise.all(
    games.map((g) => getHeadToHead(g.team_a_id, g.team_b_id))
  );

  return (
    <GameCenterView
      seasons={seasons}
      season={season}
      week={week}
      games={games}
      headToHeads={headToHeads}
    />
  );
}
