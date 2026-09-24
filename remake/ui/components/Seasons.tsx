/**
 * The city this week (Rivals): the season on it and how long it has left, what the papers say is
 * coming, the election's backing and its aftermath. The ledger bar carries a short chip as well.
 */
import { select } from '@r/sim/index';
import { useWorld } from '../store';
import { Chip, Do, Meter, Section } from './kit';

export function SeasonPanel() {
  const w = useWorld();
  const now = select.seasonNow(w);
  const next = w.nextSeason;
  const after = w.aftermath && w.day < w.aftermath.until ? w.aftermath : undefined;
  if (!now && !after && !(next && next.day - w.day <= select.SEASON.notice)) return null;
  return (
    <Section title="This week in the city" right={now ? <Chip tone="gold">{now.label} · {w.season!.to - w.day}d left</Chip> : undefined}>
      {now && <p className="r-note"><b>{now.label}.</b> {now.blurb}{w.season?.soft ? ' Your captain has the overtime cut in half.' : ''}</p>}
      {now?.kind === 'election' && <>
        <Meter value={Math.round(select.machineOdds(w) * 100)} tone="gold" label="The machine's chances" right={`${Math.round(select.machineOdds(w) * 100)}%`} />
        <div className="r-inline-actions">
          <Do action={{ type: 'back_candidate', side: 'machine' }} label={`Back the machine · $${select.ELECTION.back.toLocaleString()}`} small />
          <Do action={{ type: 'back_candidate', side: 'reform' }} label={`Back the reformers · $${select.ELECTION.back.toLocaleString()}`} small kind="ghost" />
        </div>
        <p className="r-note">If the machine wins, officials cost {Math.round((1 - select.ELECTION.machineBribe) * 100)}% less for {select.ELECTION.after} days. If reform wins, every precinct looks {select.ELECTION.reformAttention} harder.</p>
      </>}
      {!now && next && next.day - w.day <= select.SEASON.notice && <p className="r-note"><b>The papers:</b> {select.SEASONS[next.kind].label.toLowerCase()} in {next.day - w.day} day{next.day - w.day === 1 ? '' : 's'}. {select.SEASONS[next.kind].blurb}</p>}
      {after && <p className="r-note"><b>{after.kind === 'machine' ? 'The machine holds City Hall' : 'The reformers run City Hall'}</b> until day {after.until}: {after.kind === 'machine' ? 'officials come cheaper.' : 'the precincts are looking harder.'}</p>}
    </Section>
  );
}

/** A few words for the ledger bar. */
export function seasonChip(w: ReturnType<typeof useWorld>): string | undefined {
  const s = select.seasonNow(w);
  return s ? `${s.label} ${w.season!.to - w.day}d` : undefined;
}
