/**
 * The stories running in your city (`sim/stories.ts`): whoever has made you their business, how far
 * along they are, and what you can do about each. None of them is written in: which ones a game
 * gets depends on its seed and on what you did. The panel lists the live ones and a line for each
 * that ended.
 */
import { select } from '@r/sim/index';
import type { Arc } from '@r/sim/stories';
import { openSheet, useWorld } from '../store';
import { NpcFace } from './Faces';
import { Chip, Do, Empty, Meter, Row, Section, fmt } from './kit';
import { Icon } from '@ui/icons';

const ENDED: Record<string, string> = {
  gone: 'transferred', dead: 'dead', partner: 'a partner now', broken: 'finished', published: 'said what they had to say',
  forgiven: 'forgave you', cowed: 'left town', told: 'told everything', paid: 'paid off', spent: 'gave up', conned: 'took your money',
  walked: 'you walked away', bought: 'bought',
};
const WHEN: Record<Arc['kind'], string> = {
  detective: 'At 30 the watching starts; at 60 a witness; at 90 a warrant.',
  reporter: 'At 35 the questions start; at 65 there is a draft; at 100 it runs. Two pieces and they are done.',
  heir: 'Every week they send something; at 90 they come for you in person.',
  avenger: 'At 60 they hire somebody; at 100 the somebody comes.',
  turncoat: 'At 35 a rival buys it; at 70 the police do; at 100 it is on the record.',
  friend: 'It grows only with what you put in. At 100 the score comes off — if it was ever real.',
};

function title(w: ReturnType<typeof useWorld>, a: Arc): string {
  const n = w.npcs[a.npcId]; const f = a.factionId ? w.factions[a.factionId] : undefined;
  if (!n) return 'Somebody';
  switch (a.kind) {
    case 'detective': return `Detective ${select.fullName(n)}`;
    case 'reporter': return `${select.fullName(n)}, the Courier`;
    case 'heir': return `${select.fullName(n)}${f ? `, heir to ${f.name}` : ''}`;
    case 'avenger': return `${select.fullName(n)}, who lost somebody`;
    case 'turncoat': return `${select.fullName(n)}, who used to work for you`;
    case 'friend': return `${select.fullName(n)}, an old friend`;
  }
}

function ArcCard({ a }: { a: Arc }) {
  const w = useWorld();
  const n = w.npcs[a.npcId];
  const moves = select.movesFor(w, a);
  const hostile = a.kind !== 'friend';
  return (
    <div className="r-arc">
      <Row onClick={() => n && openSheet({ kind: 'person', id: n.id })} left={n ? <NpcFace n={n} size={40} /> : undefined} title={title(w, a)} sub={`${select.ARCS[a.kind].blurb} Since day ${a.since}.${a.dirt ? ' You have something on them.' : ''}`} right={<Icon name="caret" size={16} />} />
      {a.status === 'active' && <>
        <Meter value={a.meter} tone={hostile ? 'red' : 'gold'} label={select.ARCS[a.kind].meter} right={`${Math.round(a.meter)}/100`} />
        <p className="r-note">{WHEN[a.kind]}</p>
      </>}
      {a.status === 'bought' && <p className="r-note">{a.boughtUntil ? `Bought until day ${a.boughtUntil}; then they will want paying again.` : 'Bought, for as long as you have the photographs.'}</p>}
      {moves.length > 0 && <div className="r-inline-actions">
        {moves.map(m => <Do key={m.move} action={{ type: 'story', arcId: a.id, move: m.move }} small kind={m.grave ? 'danger' : 'plain'}
          label={`${m.label}${m.odds !== undefined ? ` · ${m.odds}%` : ''}${m.cost ? ` · ${fmt(m.cost)}` : ''}`}
          confirm={m.grave ? 'Tap again: a killing like this brings the whole city down on you' : undefined} />)}
      </div>}
    </div>
  );
}

export function StoriesPanel() {
  const w = useWorld();
  const live = select.activeArcs(w);
  const done = select.allArcs(w).filter(a => a.status !== 'active' && a.status !== 'bought' || (a.status === 'bought' && a.kind !== 'detective')).slice(-4).reverse();
  return (
    <Section title="People with your name in their mouth" right={live.length ? <Chip tone="red">{live.length} live</Chip> : undefined}>
      {!live.length && <Empty>Nobody has made you their business yet. What you do decides who does: heat brings a detective, fame a reporter, a hated outfit an heir, a killing somebody's family.</Empty>}
      {live.map(a => <ArcCard key={a.id} a={a} />)}
      {done.length > 0 && <p className="r-over">Over</p>}
      {done.map(a => <p key={a.id} className="r-note">{title(w, a)}: {ENDED[a.status] ?? a.status}{a.ended ? `, day ${a.ended}` : ''}.</p>)}
    </Section>
  );
}
