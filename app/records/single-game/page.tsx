import {
  getSingleGameRecords,
  getCombinedPointsRecords,
  getMarginRecords,
  SingleGameRecordRow,
  MatchupRecordRow,
  MarginRecordRow,
} from "@/lib/records";

function GameTable({ rows, valueLabel }: { rows: SingleGameRecordRow[]; valueLabel: string }) {
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>{valueLabel}</th>
          <th>Team</th>
          <th>Season</th>
          <th>Week</th>
          <th>Opponent</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            <td className="font-medium">{r.value.toFixed(2)}</td>
            <td>{r.team_name}</td>
            <td>{r.season}</td>
            <td>{r.week}</td>
            <td>
              {r.opp_name} ({r.opp_score.toFixed(2)})
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MatchupTable({ rows }: { rows: MatchupRecordRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Combined</th>
          <th>Matchup</th>
          <th>Season</th>
          <th>Week</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            <td className="font-medium">{r.combined.toFixed(2)}</td>
            <td>
              {r.team_a} ({r.score_a.toFixed(2)}) vs {r.team_b} ({r.score_b.toFixed(2)})
            </td>
            <td>{r.season}</td>
            <td>{r.week}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MarginTable({ rows }: { rows: MarginRecordRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Margin</th>
          <th>Winner</th>
          <th>Loser</th>
          <th>Season</th>
          <th>Week</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            <td className="font-medium">{r.margin.toFixed(2)}</td>
            <td>
              {r.winner} ({r.winner_score.toFixed(2)})
            </td>
            <td>
              {r.loser} ({r.loser_score.toFixed(2)})
            </td>
            <td>{r.season}</td>
            <td>{r.week}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">{children}</div>
    </section>
  );
}

export default async function SingleGameRecordsPage() {
  const { mostPoints, fewestPoints, fewestInWin, mostInLoss } = await getSingleGameRecords(15);
  const { most: mostCombined, fewest: fewestCombined } = await getCombinedPointsRecords(15);
  const { biggest, smallest } = await getMarginRecords(15);

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Single Game Records</h1>
      <Section title="Most Points Scored">
        <GameTable rows={mostPoints} valueLabel="Score" />
      </Section>
      <Section title="Fewest Points Scored">
        <GameTable rows={fewestPoints} valueLabel="Score" />
      </Section>
      <Section title="Fewest Points Scored in a Win">
        <GameTable rows={fewestInWin} valueLabel="Score" />
      </Section>
      <Section title="Most Points Scored in a Loss">
        <GameTable rows={mostInLoss} valueLabel="Score" />
      </Section>
      <Section title="Most Combined Points">
        <MatchupTable rows={mostCombined} />
      </Section>
      <Section title="Fewest Combined Points">
        <MatchupTable rows={fewestCombined} />
      </Section>
      <Section title="Biggest Victory Margin">
        <MarginTable rows={biggest} />
      </Section>
      <Section title="Smallest Victory Margin">
        <MarginTable rows={smallest} />
      </Section>
    </div>
  );
}
