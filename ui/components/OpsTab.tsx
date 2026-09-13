import { useMemo, useState } from 'react';
import { select } from '@sim/index';
import type { Id, Op, OpKind } from '@sim/types';
import { OP_APPROACHES, OP_DEFS, type OpApproach } from '@content/rackets';
import { SKILL_KEYS, activeOps, cap, finishedOps, fmtMoney, opTargetLabel, playerSafehouses } from '@ui/derive';
import { act, check, openSheet, useWorld } from '@ui/store';
import { Act } from './Act';
import { Info, Term, TermChip } from './Info';
import { OpTree } from './OpTree';


/** What the kit you are carrying is doing to the approach on the table. */
function KitOnApproach({ approach }: { approach?: OpApproach }) {
  const w = useWorld();
  const carried = select.equippedItems(w);
  if (!carried.length) return <p className="small muted mt8">You are carrying nothing. A weapon, a lockpick set or a car changes these odds — kit is on the Crew tab, and markets sell it.</p>;
  const heat = select.kitHeatMult(w);
  return (
    <div className="card mt8">
      <div className="row between">
        <b className="small">🧰 What you are carrying<Info id="kit" /></b>
        {heat !== 1 && <span className={`chip ${heat > 1 ? 'red' : 'green'}`}>Heat ×{heat.toFixed(2)}</span>}
      </div>
      <div className="col mt8" style={{ gap: 4 }}>
        {carried.map(item => {
          const bias = approach ? item.mods.approachBias?.[approach] ?? 0 : 0;
          const boost = Object.entries(item.mods.skillBoost ?? {}).map(([k, v]) => `${k} +${v}`).join(', ');
          return (
            <div key={item.id} className="row between small">
              <span>{item.icon} {item.label}{boost && <span className="muted"> · {boost}</span>}</span>
              {approach
                ? <span className={bias > 0 ? 'green' : bias < 0 ? 'red' : 'muted'}>{bias === 0 ? 'no help here' : `${bias > 0 ? '+' : ''}${Math.round(bias * 100)}% on ${OP_APPROACHES[approach].label.toLowerCase()}`}</span>
                : <span className="muted">pick an approach</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
      <div className="section-title">Plan an op<Info id="opChance" /></div>
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
          <TermChip id="opChance">Chance {chance}%</TermChip>
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
  const [target, setTarget] = useState<{ businessId?: Id; npcId?: Id; factionId?: Id; blockId?: Id; districtId?: Id }>({});
  const [safehouseId, setSafehouseId] = useState<Id | undefined>(undefined);
  const [crewIds, setCrewIds] = useState<Id[]>([]);
  const [approach, setApproach] = useState<OpApproach | undefined>(undefined);
  const [filter, setFilter] = useState('');
  const idle = select.idleCrew(w);
  const def = kind ? OP_DEFS[kind] : null;
  const needsTarget = def ? def.target !== 'none' : false;
  const hasTarget = !!(target.businessId || target.npcId || target.factionId || target.blockId || target.districtId);
  const step = !kind ? 0 : needsTarget && !hasTarget ? 1 : 2;
  const chance = kind ? select.opChance(w, kind, crewIds, approach, target.businessId) : 0;
  const insiders = select.insidersFor(w, target.businessId);
  const sums = select.crewSkillSum(w, crewIds);
  const targets = useMemo(() => kind ? select.opTargets(w, kind) : [], [w, kind]);
  const npcs = useMemo(() => Object.values(w.npcs).filter(n => n.alive && !n.crew && (n.role === 'boss' || n.role === 'lieutenant' || n.role === 'owner' || n.role === 'official' || n.role === 'soldier')).filter(n => !filter || n.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 40), [w, filter]);
  const action = kind ? { type: 'plan_op' as const, kind, crewIds, approach, targetBusinessId: target.businessId, targetNpcId: target.npcId, targetFactionId: target.factionId, targetBlockId: target.blockId, targetDistrictId: target.districtId, safehouseId } : null;
  const reset = () => { setKind(null); setTarget({}); setCrewIds([]); setApproach(undefined); setFilter(''); setSafehouseId(undefined); };
  const toggle = (id: Id) => setCrewIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : def && ids.length >= def.maxCrew ? ids : [...ids, id]);

  return (
    <div className="card">
      <div className="steps"><div className={step >= 0 ? 'on' : ''} /><div className={step >= 1 ? 'on' : ''} /><div className={step >= 2 ? 'on' : ''} /></div>
      {!kind && <OpTree onPick={k => setKind(k)} />}
      {kind && def && (
        <>
          <div className="row between">
            <b>{def.icon} {def.label}</b>
            <button type="button" className="chip btn" onClick={reset}>Change</button>
          </div>
          <p className="small muted mt8">{def.blurb} Needs: {Object.entries(def.needs).map(([k, v]) => `${k} ${v}`).join(', ')}. Difficulty {def.difficulty}, heat +{def.heat}. {def.planDays > 0 && <><Term id="planDays">{def.planDays} days to plan</Term>.</>}</p>
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
              ) : def.target === 'district' ? (
                <div className="list">{Object.values(w.districts).map(d => { const n = select.abandonedBlocks(w, { known: false }).filter(b => b.districtId === d.id).length; return (
                  <button type="button" key={d.id} className="listitem" onClick={() => setTarget({ districtId: d.id })}>
                    <div className="grow"><div className="title">{d.name}</div><div className="sub">{cap(d.kind.replace('_', ' '))} · {d.blockIds.length} blocks{n ? '' : ' · you have walked all of it'}</div></div>
                  </button>); })}</div>
              ) : def.target === 'block' && kind === 'claim_abandoned' ? (
                <div className="list">
                  {select.abandonedBlocks(w, { known: true, unclaimed: true }).map(b => (
                    <button type="button" key={b.id} className="listitem" onClick={() => setTarget({ blockId: b.id })}>
                      <div className="grow"><div className="title">{b.name}</div><div className="sub">{w.districts[b.districtId]?.name} · police {Math.round(b.police)} · nobody living there</div></div>
                    </button>
                  ))}
                  {select.abandonedBlocks(w, { known: true, unclaimed: true }).length === 0 && <p className="small muted">No derelict blocks found yet. Run Scout the Edges on a quiet district.</p>}
                </div>
              ) : def.target === 'faction' ? (
                <div className="list">{Object.values(w.factions).filter(f => f.alive).map(f => <button type="button" key={f.id} className="listitem" onClick={() => setTarget({ factionId: f.id })}><span className="swatch" style={{ background: f.color }} /><div className="grow"><div className="title">{f.name}</div></div></button>)}</div>
              ) : (
                <select className="select" value="" onChange={e => setTarget({ blockId: e.target.value })}><option value="">Pick a block…</option>{Object.values(w.blocks).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <div className="section-title">Approach<Info id="opApproach" /></div>
              <div className="col">
                {(Object.keys(OP_APPROACHES) as OpApproach[]).map(k => { const a = OP_APPROACHES[k]; const on = approach === k; const insideOff = k === 'inside' && (def.target !== 'business' || !insiders.length);
                  return (
                    <button type="button" key={k} className={`opt${on ? ' sel' : ''}`} disabled={insideOff} onClick={() => setApproach(on ? undefined : k)}>
                      <span className="lbl">{a.icon} {a.label} <span className="odds" style={{ float: 'right' }}>{select.opChance(w, kind!, crewIds, k, target.businessId)}%</span></span>
                      <span className="det">{a.blurb}{k === 'inside' && insiders.length ? ` ${insiders[0].name} would do it.` : ''}</span>
                      <span className="stakes"><b className="green">✓ {a.good}</b> <b className="red">✗ {a.bad}</b></span>
                      {insideOff && <span className="cst">{def.target !== 'business' ? 'Needs a place as the target.' : 'Nobody there trusts you enough yet (trust 35+).'}</span>}
                    </button>
                  ); })}
              </div>
              <KitOnApproach approach={approach} />
              {kind === 'kidnap' && (
                <>
                  <div className="section-title">Where do they go?</div>
                  <div className="chips mb8">
                    {playerSafehouses(w).map(s => <button type="button" key={s.id} className={`chip btn${(safehouseId ?? playerSafehouses(w)[0]?.id) === s.id ? ' sel' : ''}`} onClick={() => setSafehouseId(s.id)}>{s.name}</button>)}
                    {playerSafehouses(w).length === 0 && <span className="small muted">You need a safehouse first.</span>}
                  </div>
                </>
              )}
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
                <div style={{ textAlign: 'right' }}><div className="chance">{chance}%</div><div className="tiny muted"><Term id="opChance">chance</Term></div></div>
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
