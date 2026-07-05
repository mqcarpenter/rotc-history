import Link from "next/link";
import { getTeams } from "@/lib/records";

export default async function TeamsPage() {
  const teams = await getTeams();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Teams</h1>
      <p className="text-neutral-500 text-sm">
        {teams.length} franchises have played in this league&apos;s history, including ones no longer active.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {teams.map((t) => (
          <Link
            key={t.id}
            href={`/teams/${t.id}`}
            className="rounded-lg border border-neutral-200 bg-white p-3 hover:border-neutral-400"
          >
            <div className="font-medium">{t.base_name}</div>
            <div className="text-xs text-neutral-500">{t.seasons_played} seasons</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
