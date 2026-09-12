import { useState } from 'react';
import { select } from '@sim/index';
import { PLAYER, type Faction, type Id } from '@sim/types';
import type { SitDownOffer } from '@sim/actions';
import { STANCES, cap, fmtMoney, playerBusinesses } from '@ui/derive';
import { useWorld } from '@ui/store';
import { Meter } from './Meter';
import { Act, AmountPicker, Disclosure } from './Act';
import { NpcRow } from './Rows';

export function FactionsTab() {
  const w = useWorld();
  const factions = Object.values(w.factions);
  return (
    <div className="panel-inner">
      <h2>Factions</h2>
      <div className="list">{factions.map(f => <FactionCard key={f.id} f={f} />)}</div>
      <div className="section-title">City Hall</div>
      <div className="list">
        {select.officials(w).map(o => <OfficialRow key={o.id} npcId={o.id} />)}
      </div>
    </div>
  );
}

function FactionCard({ f }: { f: Faction }) {
  const w = useWorld();
  const stance = select.stanceWithPlayer(w, f.id);
  const standing = f.standing[PLAYER] ?? 0;
  const boss = w.npcs[f.bossId];
  const blocks = select.blocksOf(w, f.id);
  const truce = f.truceUntil[PLAYER];
  const tribute = f.tributeFrom[PLAYER];
  const [tributeAmt, setTributeAmt] = useState(1000);
  const [offerKind, setOfferKind] = useState<SitDownOffer['kind']>('truce');
  const [truceDays, setTruceDays] = useState(10);
  const [perDay, setPerDay] = useState(200);
  const [blockPick, setBlockPick] = useState<Id>('');
  const [bizPick, setBizPick] = useState<Id>('');
  const mine = select.playerBlocks(w);
  const myBiz = playerBusinesses(w);
  const offer: SitDownOffer | null =
    offerKind === 'truce' ? { kind: 'truce', days: truceDays }
    : offerKind === 'tribute' ? { kind: 'tribute', amountPerDay: perDay }
    : offerKind === 'cede_block' ? (blockPick ? { kind: 'cede_block', blockId: blockPick } : null)
    : offerKind === 'joint_racket' ? (bizPick ? { kind: 'joint_racket', businessId: bizPick } : null)
    : offerKind === 'alliance' ? { kind: 'alliance' }
    : (blockPick ? { kind: 'demand_block', blockId: blockPick } : null);

  return (
    <div className="card" style={{ borderColor: f.alive ? f.color : undefined, opacity: f.alive ? 1 : 0.5 }}>
      <div className="row between">
        <b style={{ fontSize: 16 }}><span className="swatch" style={{ background: f.color, width: 14, height: 14 }} />{f.name}</b>
        <span className={`chip stance-${stance}`}>{cap(stance)}</span>
      </div>
      <div className="small muted mt8">{cap(f.temperament)} · {w.districts[f.homeDistrictId]?.name} · {f.soldiers} soldiers · {blocks.length} blocks{!f.alive && ' · wiped out'}</div>
      <div className="row wrap mt8" style={{ gap: 4 }}>
        {STANCES.map(s => <span key={s} className={`chip tiny stance-${s}`} style={{ opacity: s === stance ? 1 : 0.35, padding: '1px 7px' }}>{s}</span>)}
      </div>
      <div className="mt8"><Meter label="Standing" value={standing} bipolar color={standing >= 0 ? 'var(--green)' : 'var(--red)'} /></div>
      <div className="small muted mt8">
        {truce && truce > w.day && <span>Truce until day {truce} · </span>}
        {tribute ? <span>You pay {fmtMoney(tribute)}/day · </span> : null}
        {f.grudges.length > 0 && <span className="red">Grudges: {f.grudges.slice(-2).join('; ')}</span>}
      </div>
      {boss && <div className="mt8"><NpcRow w={w} npc={boss} sub={`Boss · ${select.relLabel(boss)} · lieutenants: ${f.lieutenantIds.map(id => w.npcs[id]?.name.split(' ')[0]).join(', ')}`} /></div>}

      {f.alive && (
        <div className="actions mt8">
          <Disclosure label="Sit-down" icon="🪑" kind="primary">
            <label className="field">Your offer</label>
            <select className="select mb8" value={offerKind} onChange={e => setOfferKind(e.target.value as SitDownOffer['kind'])}>
              <option value="truce">Truce</option><option value="tribute">Pay tribute</option><option value="cede_block">Cede a block</option>
              <option value="joint_racket">Joint racket</option><option value="alliance">Alliance</option><option value="demand_block">Demand a block</option>
            </select>
            {offerKind === 'truce' && <div className="chips mb8">{[10, 30].map(d => <button type="button" key={d} className={`chip btn${truceDays === d ? ' sel' : ''}`} onClick={() => setTruceDays(d)}>{d} days</button>)}</div>}
            {offerKind === 'tribute' && <div className="mb8"><label className="field">$ per day</label><AmountPicker presets={[100, 200, 500, 1000]} value={perDay} onChange={setPerDay} min={1} /></div>}
            {(offerKind === 'cede_block' || offerKind === 'demand_block') && (
              <select className="select mb8" value={blockPick} onChange={e => setBlockPick(e.target.value)}>
                <option value="">{offerKind === 'cede_block' ? 'Pick one of your blocks…' : 'Pick one of their blocks…'}</option>
                {(offerKind === 'cede_block' ? mine : blocks).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {offerKind === 'joint_racket' && (
              <select className="select mb8" value={bizPick} onChange={e => setBizPick(e.target.value)}>
                <option value="">Pick one of your businesses…</option>
                {myBiz.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {offer ? <Act action={{ type: 'sit_down', factionId: f.id, offer }} label="Propose" kind="primary" block /> : <p className="small muted">Pick a target for the offer.</p>}
          </Disclosure>
          <Disclosure label="Pay tribute" icon="💵">
            <AmountPicker presets={[500, 1000, 5000]} value={tributeAmt} onChange={setTributeAmt} min={1} />
            <div className="mt8"><Act action={{ type: 'pay_tribute', factionId: f.id, amount: tributeAmt }} label={`Pay ${fmtMoney(tributeAmt)}`} kind="primary" block /></div>
          </Disclosure>
          {stance !== 'peace' && stance !== 'alliance' && <Act action={{ type: 'declare', factionId: f.id, stance: 'peace' }} label="Offer peace" icon="🕊️" />}
          {stance !== 'beef' && stance !== 'war' && <Act action={{ type: 'declare', factionId: f.id, stance: 'beef' }} label="Declare beef" icon="🔥" kind="danger" confirm={`Start a beef with ${f.name}?`} />}
          {stance !== 'war' && <Act action={{ type: 'declare', factionId: f.id, stance: 'war' }} label="Declare war" icon="⚔️" kind="danger" confirm={`Go to war with ${f.name}? They will hit your crew and safehouses.`} />}
        </div>
      )}
    </div>
  );
}

function OfficialRow({ npcId }: { npcId: Id }) {
  const w = useWorld();
  const n = w.npcs[npcId];
  const [amt, setAmt] = useState(1000);
  if (!n?.official) return null;
  return (
    <div className="card" style={{ padding: 10 }}>
      <NpcRow w={w} npc={n} sub={`${cap(n.official.kind)} · corruption ${n.official.corruption} · ${select.relLabel(n)}${n.official.boughtBy ? ` · bought by ${select.factionName(w, n.official.boughtBy)}` : ''}`} />
      <div className="offer mt8">
        <div className="chips">{[1000, 2500, 5000].map(v => <button type="button" key={v} className={`chip btn${amt === v ? ' sel' : ''}`} onClick={() => setAmt(v)}>{fmtMoney(v)}</button>)}</div>
        <Act action={{ type: 'bribe_official', npcId, amount: amt }} label={`Bribe ${fmtMoney(amt)}`} kind="primary" block />
      </div>
    </div>
  );
}
