import Link from "next/link";
import { getSeasons, Season } from "@/lib/records";

export default async function Home() {
  let seasons: Season[] = [];
  let error: string | null = null;
  try {
    seasons = await getSeasons();
  } catch (e) {
    error = (e as Error).message;
  }

  if (error || seasons.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Welcome</h1>
        <p className="text-neutral-600">
          No data has been imported yet. Run the import script to pull your league&apos;s history from
          MyFantasyLeague:
        </p>
        <pre className="rounded bg-neutral-900 text-neutral-100 p-4 text-sm overflow-x-auto">
          npm run import -- --league 67102 --start 2003 --end 2025
        </pre>
        {error && <p className="text-sm text-red-600">Error: {error}</p>}
      </div>
    );
  }

  const latest = seasons[0];

  const cards = [
    { href: "/standings", icon: "📊", label: "Standings", desc: "Season by season" },
    { href: "/records/single-game", icon: "🏈", label: "Single Game Records", desc: "Best and worst games ever" },
    { href: "/records/single-season", icon: "📈", label: "Single Season Records", desc: "Best and worst seasons" },
    { href: "/records/career", icon: "🏆", label: "Career Records", desc: "All-time franchise leaders" },
    { href: "/postseason", icon: "🥇", label: "Postseason", desc: "Champions by year" },
    { href: "/teams", icon: "👥", label: "Teams", desc: "Every franchise in league history" },
    { href: "/gamecenter", icon: "🎮", label: "Game Center", desc: "Weekly matchups and head-to-head history" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{latest.league_name ?? "League History"}</h1>
        <p className="text-neutral-500 mt-2 flex flex-wrap items-center gap-2">
          <span>
            {seasons.length} season{seasons.length === 1 ? "" : "s"} imported, {seasons[seasons.length - 1].season}
            {"–"}
            {latest.season}
          </span>
          <span className="badge-new">New: {latest.season}</span>
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-xl border border-neutral-200/70 bg-white p-4 shadow-sm shadow-neutral-200/40 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
          >
            <div className="text-xl mb-1.5">{c.icon}</div>
            <div className="font-semibold group-hover:text-indigo-700 transition-colors">{c.label}</div>
            <div className="text-sm text-neutral-500">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
