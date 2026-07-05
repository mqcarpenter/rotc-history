import { getSeasons, getStandings } from "@/lib/records";
import { StandingsView } from "@/components/StandingsView";

/** Latest season's standings — the /standings landing page. Other seasons
 * live at /standings/[season], each pre-rendered at build time (static
 * export has no server to resolve query strings on demand). */
export default async function StandingsPage() {
  const seasons = await getSeasons();
  if (seasons.length === 0) {
    return <p className="text-neutral-600">No seasons imported yet.</p>;
  }

  const season = seasons[0].season;
  const standings = await getStandings(season);

  return <StandingsView seasons={seasons} season={season} standings={standings} />;
}
