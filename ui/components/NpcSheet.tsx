import { useState } from 'react';
import { select } from '@sim/index';
import type { Assignment, Id } from '@sim/types';
import { PRODUCTION_DEFS, RACKET_DEFS, TRAIT_LABELS } from '@content/rackets';
import { assignmentLabel, cap, fmtMoney, initials, playerRackets, playerSafehouses, roleLabel } from '@ui/derive';
import { openSheet, useWorld } from '@ui/store';
import { Sheet } from './Sheet';
import { Meter, RelMeters, SkillBars } from './Meter';
import { Act, AmountPicker, Disclosure, SceneAct } from './Act';

export function NpcSheet({ npcId }: { npcId: Id }) {
  const w = useWorld();
  const n = w.npcs[npcId];
  if (!n) return null;
  const where = select.npcLocation(w, n);
  const home = w.blocks[n.homeBlockId];
  const faction = n.faction ? w.factions[n.faction] : undefined;
  const [gift, setGift] = useState(500);
  const [bribe, setBribe] = useState(1000);
  const canRecruit = (n.role === 'patron' || n.role === 'owner') && !n.crew;

  return (
    <Sheet title={n.name} subtitle={`${roleLabel(n)}${faction ? ` · ${faction.name}` : ''}${!n.alive ? ' · deceased' : ''}`} icon={<span className="avatar" style={{ color: faction?.color }}>{initials(n.name)}</span>} accent={faction?.color}>
      <div className="chips">
        {n.traits.map(t => <span key={t} className="chip">{TRAIT_LABELS[t] ?? t}</span>)}
        <span className="chip">{select.relLabel(n)}</span>
        {n.official && <span className="chip">Corruption {n.official.corruption}</span>}
        {n.official?.boughtBy && <span className="chip" style={{ color: select.factionColor(w, n.official.boughtBy) }}>Bought by {select.factionName(w, n.official.boughtBy)}</span>}
      </div>
      <div className="mt12"><SkillBars skills={n.skills} /></div>
      <div className="mt12"><RelMeters rel={n.rel} /></div>
      <dl className="kv mt12">
        <dt>Find at</dt>
        <dd>{where ? <button type="button" className="chip btn" onClick={() => openSheet({ kind: 'business', businessId: where.id })}>{where.name}</button> : home ? <button type="button" className="chip btn" onClick={() => openSheet({ kind: 'block', blockId: home.id })}>{home.name}</button> : '—'}</dd>
        {faction && <><dt>Faction</dt><dd style={{ color: faction.color }}>{faction.name} ({cap(select.stanceWithPlayer(w, faction.id))})</dd></>}
        <dt>Nerve</dt><dd>{n.nerve}</dd>
      </dl>
      {n.notes.length > 0 && <ul className="small muted mt8" style={{ paddingLeft: 18, margin: 0 }}>{n.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>}

      {n.crew && <CrewSection npcId={npcId} />}

      <div className="section-title">Actions</div>
      <div className="actions">
        <SceneAct scene={{ kind: 'visit', npcId }} label="Visit" icon="🤝" />
        <SceneAct scene={{ kind: 'threaten', npcId }} label="Threaten" icon="😠" kind="danger" />
        <Disclosure label="Gift" icon="🎁">
          <AmountPicker presets={[100, 500, 2000]} value={gift} onChange={setGift} min={1} />
          <div className="mt8"><Act action={{ type: 'gift', npcId, amount: gift }} label={`Give ${fmtMoney(gift)}`} kind="primary" block /></div>
        </Disclosure>
        {canRecruit && <SceneAct scene={{ kind: 'recruit', npcId }} label="Recruit" icon="🧢" kind="primary" />}
        {n.official && (
          <Disclosure label={`Bribe the ${n.official.kind}`} icon="💼" kind="primary">
            <p className="small muted">{OFFICIAL_BLURB[n.official.kind]}</p>
            <AmountPicker presets={[1000, 2500, 5000, 10000]} value={bribe} onChange={setBribe} min={1} />
            <div className="mt8"><Act action={{ type: 'bribe_official', npcId, amount: bribe }} label={`Pay ${fmtMoney(bribe)}`} kind="primary" block /></div>
          </Disclosure>
        )}
      </div>
    </Sheet>
  );
}

const OFFICIAL_BLURB: Record<string, string> = {
  captain: 'Heat cools faster and you hear about raids before they land.',
  councillor: 'Permits: cheaper purchases and rivals get blocked.',
  judge: 'Your people walk out of the cells sooner.',
};

function CrewSection({ npcId }: { npcId: Id }) {
  const w = useWorld();
  const n = w.npcs[npcId];
  const c = n?.crew;
  if (!n || !c) return null;
  const options: { label: string; a: Assignment }[] = [];
  for (const r of playerRackets(w)) if (!r.runnerId || r.runnerId === npcId) options.push({ label: `${RACKET_DEFS[r.kind].icon} ${RACKET_DEFS[r.kind].label} at ${w.businesses[r.businessId]?.name ?? '?'}`, a: { kind: 'racket', racketId: r.id } });
  for (const sh of playerSafehouses(w)) for (const pid of sh.productionIds) { const p = w.productions[pid]; if (p && (!p.workerId || p.workerId === npcId)) options.push({ label: `${PRODUCTION_DEFS[p.kind].icon} ${PRODUCTION_DEFS[p.kind].label} at ${sh.name}`, a: { kind: 'production', productionId: pid } }); }
  for (const b of select.playerBlocks(w)) options.push({ label: `🛡️ Guard ${b.name}`, a: { kind: 'guard', blockId: b.id } });
  options.push({ label: '💰 Collect', a: { kind: 'collect' } });
  const [pick, setPick] = useState(0);
  return (
    <>
      <div className="section-title">Crew</div>
      <div className="card gold">
        <div className="row between">
          <span className={`chip s-${c.status}`}>{c.status}{c.statusDays > 0 && ` (${c.statusDays}d)`}</span>
          <span className="small muted">Cut {fmtMoney(c.cut)}/day · since day {c.joinedDay}</span>
        </div>
        <div className="mt8"><Meter label="Loyalty" value={c.loyalty} color="var(--gold)" /></div>
        <p className="small mt8">{assignmentLabel(w, c.assignment)}</p>
        {c.status !== 'dead' && (
          <div className="mt8">
            <label className="field">Assignment</label>
            <select className="select" value={pick} onChange={e => setPick(Number(e.target.value))}>
              {options.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
            </select>
            <div className="row mt8">
              <div className="grow"><Act action={{ type: 'assign', npcId, assignment: options[pick]?.a }} label="Assign" kind="primary" block /></div>
              {c.assignment && <Act action={{ type: 'assign', npcId }} label="Unassign" kind="ghost" />}
            </div>
          </div>
        )}
        <div className="mt8"><Act action={{ type: 'fire', npcId }} label="Fire" icon="🚪" kind="danger" confirm={`Fire ${n.name}?`} /></div>
      </div>
    </>
  );
}
