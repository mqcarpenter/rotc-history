import {
  getGameCenterSeasons,
  getWeekGames,
  getHeadToHead,
} from "@/lib/records";
import { GameCenterView } from "@/components/GameCenterView";

export default async function GameCenterPage() {
  const seasons = await getGameCenterSeasons();
  if (seasons.length === 0) {
    return <p className="text-neutral-600">No games imported yet.</p>;
  }

  const latest = seasons[0];
  const week = latest.weeks[latest.weeks.length - 1];
  const games = await getWeekGames(latest.season, week);
  const headToHeads = await Promise.all(
    games.map((g) => getHeadToHead(g.team_a_id, g.team_b_id))
  );

  return (
    <GameCenterView
      seasons={seasons}
      season={latest.season}
      week={week}
      games={games}
      headToHeads={headToHeads}
    />
  );
}
