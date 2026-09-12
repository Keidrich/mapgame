import { useMemo, useState } from 'react';
import { select } from '@sim/index';
import type { Id, Op, OpKind } from '@sim/types';
import { OP_APPROACHES, OP_DEFS, type OpApproach } from '@content/rackets';
import { SKILL_KEYS, activeOps, cap, finishedOps, fmtMoney, opTargetLabel } from '@ui/derive';
import { act, check, openSheet, useWorld } from '@ui/store';
import { Act } from './Act';

const KINDS = Object.keys(OP_DEFS) as OpKind[];

export function OpsTab() {
  const w = useWorld();
  const active = activeOps(w);
  const done = finishedOps(w).slice(0, 8);
  return (
    <div className="panel-inner">
      <h2>Ops</h2>
      <div className="section-title">Active ({active.length})</div>
      <div className="list">
        {active.map(o => <OpCard key={o.id} o={o} />)}
        {active.length === 0 && <p className="small muted">Nothing in the works.</p>}
      </div>
      <div className="section-title">Plan an op</div>
      <Planner />
      {done.length > 0 && (
        <>
          <div className="section-title">Recent</div>
          <div className="list">{done.map(o => <OpCard key={o.id} o={o} />)}</div>
        </>
      )}
    </div>
  );
}

function OpCard({ o }: { o: Op }) {
  const w = useWorld();
  const d = OP_DEFS[o.kind];
  const chance = select.opChance(w, o.kind, o.crewIds);
  const tone = o.status === 'done' ? (o.result?.success ? 'var(--green)' : 'var(--red)') : o.status === 'failed' ? 'var(--red)' : o.status === 'ready' ? 'var(--gold)' : undefined;
  return (
    <div className="card" style={{ borderColor: tone }}>
      <div className="row between">
        <b>{d.icon} {d.label}</b>
        <span className="chip" style={{ color: tone }}>{o.status === 'planning' ? `${o.daysLeft}d left` : cap(o.status)}{o.launched && o.status === 'ready' ? ' · launched' : ''}</span>
      </div>
      <div className="small muted">Target: {opTargetLabel(w, o)} · crew: {o.crewIds.map(id => w.npcs[id]?.name ?? '?').join(', ') || 'none'}</div>
      {(o.status === 'planning' || o.status === 'ready') && (
        <div className="row wrap mt8">
          <span className="chip">Chance {chance}%</span>
          <Act action={{ type: 'launch_op', opId: o.id }} label="Launch" kind="primary" small />
          <Act action={{ type: 'abort_op', opId: o.id }} label="Abort" kind="danger" small confirm="Abort this op?" />
        </div>
      )}
      {o.result && (
        <div className="mt8 small">
          <p>{o.result.text}</p>
          <div className="chips">{o.result.cash !== 0 && <span className="chip green">{fmtMoney(o.result.cash)}</span>}{o.result.heat !== 0 && <span className="chip red">+{o.result.heat} heat</span>}</div>
        </div>
      )}
    </div>
  );
}

function Planner() {
  const w = useWorld();
  const [kind, setKind] = useState<OpKind | null>(null);
  const [target, setTarget] = useState<{ businessId?: Id; npcId?: Id; factionId?: Id; blockId?: Id }>({});
  const [crewIds, setCrewIds] = useState<Id[]>([]);
  const [approach, setApproach] = useState<OpApproach | undefined>(undefined);
  const [filter, setFilter] = useState('');
  const idle = select.idleCrew(w);
  const def = kind ? OP_DEFS[kind] : null;
  const needsTarget = def ? def.target !== 'none' : false;
  const hasTarget = !!(target.businessId || target.npcId || target.factionId || target.blockId);
  const step = !kind ? 0 : needsTarget && !hasTarget ? 1 : 2;
  const chance = kind ? select.opChance(w, kind, crewIds, approach) : 0;
  const insiders = select.insidersFor(w, target.businessId);
  const sums = select.crewSkillSum(w, crewIds);
  const targets = useMemo(() => kind ? select.opTargets(w, kind) : [], [w, kind]);
  const npcs = useMemo(() => Object.values(w.npcs).filter(n => n.alive && !n.crew && (n.role === 'boss' || n.role === 'lieutenant' || n.role === 'owner' || n.role === 'official' || n.role === 'soldier')).filter(n => !filter || n.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 40), [w, filter]);
  const action = kind ? { type: 'plan_op' as const, kind, crewIds, approach, targetBusinessId: target.businessId, targetNpcId: target.npcId, targetFactionId: target.factionId, targetBlockId: target.blockId } : null;
  const reset = () => { setKind(null); setTarget({}); setCrewIds([]); setApproach(undefined); setFilter(''); };
  const toggle = (id: Id) => setCrewIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : def && ids.length >= def.maxCrew ? ids : [...ids, id]);

  return (
    <div className="card">
      <div className="steps"><div className={step >= 0 ? 'on' : ''} /><div className={step >= 1 ? 'on' : ''} /><div className={step >= 2 ? 'on' : ''} /></div>
      {!kind && (
        <div className="grid2">
          {KINDS.map(k => { const d = OP_DEFS[k]; return (
            <button type="button" key={k} className="opcard" onClick={() => setKind(k)}>
              <span className="ico">{d.icon}</span><b>{d.label}</b><span>{d.blurb}</span>
              <span>{d.planDays}d plan · {d.minCrew}–{d.maxCrew} crew{d.cost ? ` · ${fmtMoney(d.cost)}` : ''}</span>
            </button>
          ); })}
        </div>
      )}
      {kind && def && (
        <>
          <div className="row between">
            <b>{def.icon} {def.label}</b>
            <button type="button" className="chip btn" onClick={reset}>Change</button>
          </div>
          <p className="small muted mt8">{def.blurb} Needs: {Object.entries(def.needs).map(([k, v]) => `${k} ${v}`).join(', ')}. Difficulty {def.difficulty}, heat +{def.heat}.</p>
          {needsTarget && (
            <>
              <div className="section-title">Target</div>
              {hasTarget ? (
                <div className="row between"><span className="chip sel">{target.businessId ? w.businesses[target.businessId]?.name : target.npcId ? w.npcs[target.npcId]?.name : target.factionId ? w.factions[target.factionId]?.name : target.blockId ? w.blocks[target.blockId]?.name : ''}</span><button type="button" className="chip btn" onClick={() => setTarget({})}>Change</button></div>
              ) : def.target === 'business' ? (
                <div className="list" style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {targets.map(b => (
                    <button type="button" key={b.id} className="listitem" onClick={() => setTarget({ businessId: b.id })}>
                      <div className="grow"><div className="title">{b.name}</div><div className="sub">{w.blocks[b.blockId]?.name} · {b.ownedBy === 'player' ? 'yours' : b.protection ? `protected by ${select.factionName(w, b.protection.factionId)}` : 'independent'}</div></div>
                      <button type="button" className="chip btn" onClick={e => { e.stopPropagation(); openSheet({ kind: 'business', businessId: b.id }); }}>ℹ️</button>
                    </button>
                  ))}
                  {targets.length === 0 && <p className="small muted">No valid targets.</p>}
                </div>
              ) : def.target === 'npc' ? (
                <>
                  <input className="input mb8" placeholder="Filter by name…" value={filter} onChange={e => setFilter(e.target.value)} />
                  <div className="list" style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {npcs.map(n => <button type="button" key={n.id} className="listitem" onClick={() => setTarget({ npcId: n.id })}><div className="grow"><div className="title">{n.name}</div><div className="sub">{cap(n.role)}{n.faction ? ` · ${select.factionName(w, n.faction)}` : ''} · {w.blocks[n.homeBlockId]?.name}</div></div></button>)}
                  </div>
                </>
              ) : def.target === 'faction' ? (
                <div className="list">{Object.values(w.factions).filter(f => f.alive).map(f => <button type="button" key={f.id} className="listitem" onClick={() => setTarget({ factionId: f.id })}><span className="swatch" style={{ background: f.color }} /><div className="grow"><div className="title">{f.name}</div></div></button>)}</div>
              ) : (
                <select className="select" value="" onChange={e => setTarget({ blockId: e.target.value })}><option value="">Pick a block…</option>{Object.values(w.blocks).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <div className="section-title">Approach</div>
              <div className="col">
                {(Object.keys(OP_APPROACHES) as OpApproach[]).map(k => { const a = OP_APPROACHES[k]; const on = approach === k; const insideOff = k === 'inside' && (def.target !== 'business' || !insiders.length);
                  return (
                    <button type="button" key={k} className={`opt${on ? ' sel' : ''}`} disabled={insideOff} onClick={() => setApproach(on ? undefined : k)}>
                      <span className="lbl">{a.icon} {a.label} <span className="odds" style={{ float: 'right' }}>{select.opChance(w, kind!, crewIds, k)}%</span></span>
                      <span className="det">{a.blurb}{k === 'inside' && insiders.length ? ` ${insiders[0].name} would do it.` : ''}</span>
                      <span className="stakes"><b className="green">✓ {a.good}</b> <b className="red">✗ {a.bad}</b></span>
                      {insideOff && <span className="cst">{def.target !== 'business' ? 'Needs a place as the target.' : 'Nobody there trusts you enough yet (trust 35+).'}</span>}
                    </button>
                  ); })}
              </div>
              <div className="section-title">Crew ({crewIds.length}/{def.maxCrew}, min {def.minCrew})</div>
              <div className="list">
                {idle.map(n => { const on = crewIds.includes(n.id); return (
                  <button type="button" key={n.id} className={`check${on ? ' on' : ''}`} onClick={() => toggle(n.id)}>
                    <span className="box">{on ? '✓' : ''}</span>
                    <div className="grow"><div className="bold">{n.name}</div><div className="small muted">{SKILL_KEYS.filter(k => def.needs[k]).map(k => `${k} ${n.skills[k]}`).join(' · ')}</div></div>
                  </button>
                ); })}
                {idle.length === 0 && <p className="small muted">No idle crew. Recruit patrons first.</p>}
              </div>
              <div className="row mt12" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="chips">{Object.entries(def.needs).map(([k, need]) => <span key={k} className="chip" style={{ color: sums[k] >= (need ?? 0) ? 'var(--green)' : 'var(--orange)' }}>{k} {sums[k]}/{need}</span>)}</div>
                </div>
                <div style={{ textAlign: 'right' }}><div className="chance">{chance}%</div><div className="tiny muted">chance</div></div>
              </div>
              {action && (
                <div className="mt12">
                  <button type="button" className="btn btn-primary btn-block" disabled={!check(action).ok || crewIds.length < def.minCrew} onClick={() => { if (act(action)) reset(); }}>Plan {def.label}{def.planDays ? ` (${def.planDays} days)` : ''}</button>
                  {crewIds.length < def.minCrew ? <div className="btn-caption mt8">Pick at least {def.minCrew} crew.</div> : !check(action).ok && <div className="btn-caption mt8">{(check(action) as { reason: string }).reason}</div>}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
