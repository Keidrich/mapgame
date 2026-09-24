/**
 * The two people whose story is you: the detective (Empire → the law) and the heir (Rivals). Each
 * panel shows where the arc stands and what you can do about it; the turning points arrive as cards.
 */
import { select } from '@r/sim/index';
import { openSheet, useWorld } from '../store';
import { NpcFace, Emblem } from './Faces';
import { Chip, Do, Meter, Row, Section, fmt } from './kit';
import { Icon } from '@ui/icons';

const STATUS: Record<string, string> = { active: 'on you', bought: 'bought', gone: 'transferred', dead: 'dead', partner: 'partner', broken: 'finished' };

export function DetectivePanel() {
  const w = useWorld();
  const d = select.detective(w); if (!d) return null;
  const n = w.npcs[d.npcId];
  const live = d.status === 'active';
  return (
    <Section title="The detective" right={<Chip tone={live ? 'red' : d.status === 'bought' ? 'gold' : 'muted'}>{STATUS[d.status]}</Chip>}>
      <Row onClick={() => openSheet({ kind: 'person', id: n.id })} left={<NpcFace n={n} size={40} />} title={`Detective ${select.fullName(n)}`} sub={`Organised Crime, ${select.cityName(w, d.cityId)} · on you since day ${d.since}${d.dirt ? ' · you have something on him' : ''}`} right={<Icon name="caret" size={16} />} />
      {live && <>
        <Meter value={d.file} tone="red" label="His file on you" right={`${Math.round(d.file)}/100`} />
        <p className="r-note">It grows every day, faster when you are hot and for every open case. At {select.DETECTIVE.watch} he watches you; at {select.DETECTIVE.witness} he finds a witness; at {select.DETECTIVE.raid} he comes with a warrant.</p>
        <div className="r-inline-actions">
          {!d.dirt && <Do action={{ type: 'detective', move: 'dig' }} label={`Dig into him · ${select.digOdds(w)}%`} small />}
          {d.dirt && <Do action={{ type: 'detective', move: 'blackmail' }} label="Show him the photographs" small kind="primary" />}
          <Do action={{ type: 'detective', move: 'bribe' }} label={`Bribe · ${fmt(select.bribePrice(d))} clean`} small />
          <Do action={{ type: 'detective', move: 'lean' }} label={`Lean on him · ${select.leanOdds(w, d)}%`} small kind="ghost" />
          <Do action={{ type: 'detective', move: 'transfer' }} label={`Have him moved · ${fmt(select.DETECTIVE.transfer.cost)}`} small kind="ghost" />
          <Do action={{ type: 'detective', move: 'disappear' }} label="Make him disappear" small kind="danger" confirm="Tap again: a dead detective brings every cop in the city" />
        </div>
      </>}
      {d.status === 'bought' && <p className="r-note">{d.boughtUntil ? `Bought until day ${d.boughtUntil}; then he will want paying again.` : 'He will not trouble you while you have the photographs.'}</p>}
    </Section>
  );
}

export function HeirPanel() {
  const w = useWorld();
  const h = select.heir(w); if (!h) return null;
  const n = w.npcs[h.npcId]; const f = w.factions[h.factionId];
  const live = h.status === 'active';
  return (
    <Section title="The heir" right={<Chip tone={live ? 'red' : h.status === 'partner' ? 'gold' : 'muted'}>{STATUS[h.status]}</Chip>}>
      <Row onClick={() => openSheet({ kind: 'person', id: n.id })} left={<NpcFace n={n} size={40} />} title={select.fullName(n)} sub={<>{f && <Emblem e={f.emblem} size={12} />} {f ? `${f.name}` : 'Nobody’s now'} · swore against you on day {h.since}</>} right={<Icon name="caret" size={16} />} />
      {live && <>
        <Meter value={h.grudge} tone="red" label="The grudge" right={`${Math.round(h.grudge)}/100`} />
        <p className="r-note">It grows every day, faster while their outfit hates you. Every week they send something; at {select.HEIR.boil} they come for you in person.</p>
        <div className="r-inline-actions">
          <Do action={{ type: 'heir', move: 'gift' }} label={`Send a gift · ${fmt(select.HEIR.gift.cost)}`} small />
          <Do action={{ type: 'heir', move: 'meet' }} label={`Sit down with them · ${select.meetOdds(w)}%`} small kind="ghost" />
        </div>
      </>}
    </Section>
  );
}
