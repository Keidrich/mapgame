/**
 * Somebody in a back room — yours, or one of yours in somebody else's. Every choice on the card
 * comes from `hostageChoices`, with the price and the consequence written on it.
 */
import { select, PLAYER } from '@r/sim/index';
import type { Hostage } from '@r/sim/types';
import { openSheet, useWorld } from '../store';
import { NpcFace } from './Faces';
import { Chip, Do, Row, fmt } from './kit';

export function HostageCard({ h }: { h: Hostage }) {
  const w = useWorld();
  const n = w.npcs[h.npcId]; if (!n) return null;
  const days = w.day - h.since;
  const mine = h.holder === PLAYER;
  const f = !mine ? w.factions[h.holder] : undefined;
  const file = h.caseId ? w.cases[h.caseId] : undefined;
  const where = mine ? (h.safehouseId ? w.safehouses[h.safehouseId]?.name : 'somewhere') : `held by the ${f?.short ?? 'others'}`;
  return (
    <div className="r-case">
      <Row onClick={() => openSheet({ kind: 'person', id: n.id })} left={<NpcFace n={n} size={36} />} title={select.fullName(n)}
        sub={mine ? `${where} · day ${days + 1} · the family offers ${fmt(h.ransom)}${file ? ` · kidnap file ${Math.round(file.evidence)}` : ''}` : `${where} · day ${days + 1} of 5 · they want ${fmt(h.ransom)}`}
        right={<Chip tone={mine ? 'gold' : 'red'}>{mine ? 'Yours' : 'Taken'}</Chip>} />
      <p className="r-note">{mine ? `Every day the offer climbs (to ${Math.round(select.HOSTAGE.ceiling * 100)}% of the first) and the file thickens. With nobody of yours guarding the block, they might get out.` : 'The price climbs a tenth a day. On the fifth day, if nobody has paid, they stop asking.'}</p>
      <div className="r-inline-actions">
        {select.hostageChoices(w, h).map(c => <Do key={c.choice} action={{ type: 'hostage', id: h.id, choice: c.choice }} label={c.label} sub={c.hint} small kind={c.choice === 'kill' ? 'danger' : c.choice === 'ransom' || c.choice === 'pay' ? 'primary' : 'plain'} confirm={c.choice === 'kill' ? 'Tap again. There is no taking this back.' : undefined} />)}
      </div>
    </div>
  );
}

export function HostageList({ filter }: { filter?: (h: Hostage) => boolean }) {
  const w = useWorld();
  const hs = Object.values(w.hostages).filter(h => !filter || filter(h));
  return <>{hs.map(h => <HostageCard key={h.id} h={h} />)}</>;
}
