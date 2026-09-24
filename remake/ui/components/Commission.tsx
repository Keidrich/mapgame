/**
 * The Commission, as the player sees it before and after a meeting. Every boss's lean comes from
 * `leanOf` — the vote is exactly its sign — so the table shows how the vote will go today and what
 * an envelope would change.
 */
import { select, PLAYER } from '@r/sim/index';
import { useWorld } from '../store';
import { Emblem } from './Faces';
import { Chip, Do, Empty, Row, Section, fmt } from './kit';

export function CommissionSection() {
  const w = useWorld();
  // the table of the city you are in: every city you have founded has its own
  const city = select.currentCity(w);
  const c = select.commissionOf(w, city);
  const live = Object.values(w.factions).filter(f => f.alive && (w.districts[f.homeDistrictId]?.cityId || 'c0') === city);
  const p = c.proposal;
  const t = p ? select.tally(w, p) : undefined;
  return (
    <Section title={Object.keys(w.cities ?? {}).length ? `The Commission of ${select.cityName(w, city)}` : 'The Commission'} right={c.seated ? <Chip tone="gold">You have a seat</Chip> : undefined}>
      {live.length < select.COMMISSION.minOutfits ? <Empty>Fewer than {select.COMMISSION.minOutfits} outfits left standing. The table does not sit.</Empty> : !p ? (
        <p className="r-note">The bosses meet every {select.COMMISSION.every} days. Next meeting: day {c.nextDay}; the agenda goes round {select.COMMISSION.announceDays} days before.</p>
      ) : <>
        <p className="r-note"><b>Day {c.nextDay}:</b> {select.describeProposal(w, p)} As things stand it {t!.passes ? 'passes' : 'fails'}, {t!.yes}–{t!.no}.</p>
        {live.map(f => {
          const lean = select.leanOf(w, f, p);
          const pulled = c.pulls[f.id];
          const owes = (w.npcs[f.bossId]?.rel.owes ?? 0) > 0;
          return (
            <div key={f.id} className="r-racket">
              <Row left={<Emblem e={f.emblem} size={28} />} title={f.name} sub={`${lean > 0 ? 'Voting yes' : 'Voting no'} (${lean > 0 ? '+' : ''}${lean})${pulled ? ' · you have had a word' : ''}`} right={<Chip tone={lean > 0 ? 'green' : 'red'}>{lean > 0 ? 'Yes' : 'No'}</Chip>} />
              {!pulled && <div className="r-inline-actions">
                {(['yes', 'no'] as const).map(side => <Do key={side} action={{ type: 'lobby', factionId: f.id, side }} label={`Lean on them: ${side}`} sub={owes ? 'Their boss owes you: this is the favour.' : `${fmt(select.lobbyCost(f))} in an envelope, ${side === 'yes' ? '+' : '−'}${select.LOBBY_PULL}.`} small />)}
              </div>}
            </div>
          );
        })}
        {c.seated && <div className="r-inline-actions">{(['yes', 'no'] as const).map(v => <Do key={v} action={{ type: 'commission_vote', vote: v }} label={`Vote ${v}`} small kind={c.vote === v ? 'primary' : 'ghost'} />)}</div>}
      </>}
      {c.history.length > 0 && <>{c.history.slice(0, 4).map(h => <p key={h.day} className="r-note">Day {h.day}: {h.text}</p>)}</>}
      {void PLAYER}
    </Section>
  );
}
