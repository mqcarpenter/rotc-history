import { notFound } from "next/navigation";
import { getSeasons, getStandings } from "@/lib/records";
import { StandingsView } from "@/components/StandingsView";

export async function generateStaticParams() {
  const seasons = await getSeasons();
  if (seasons.length === 0) {
    throw new Error(
      "No seasons found in data/league.db — run `npm run import` before `npm run build` (see README)."
    );
  }
  // Every season gets a page here, including the latest (which is also
  // served at the bare /standings URL) — static export requires at least
  // one param, so we don't bother excluding it to save one duplicate page.
  return seasons.map((s) => ({ season: String(s.season) }));
}

export default async function StandingsForSeasonPage({
  params,
}: {
  params: Promise<{ season: string }>;
}) {
  const { season: seasonParam } = await params;
  const season = parseInt(seasonParam, 10);
  const seasons = await getSeasons();
  if (!seasons.some((s) => s.season === season)) return notFound();

  const standings = await getStandings(season);
  return <StandingsView seasons={seasons} season={season} standings={standings} />;
}
