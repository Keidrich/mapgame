import { useState } from 'react';
import { select } from '@sim/index';
import { PLAYER, type Id, type ProductKind, type Safehouse, type World } from '@sim/types';
import { PRODUCTION_DEFS, PRODUCT_INFO, SAFEHOUSE_TIERS } from '@content/rackets';
import { PRODUCTS, crewName, districtName, fmtMoney, influenceRows, safehouseAt, stashLine } from '@ui/derive';
import { useWorld } from '@ui/store';
import { Sheet } from './Sheet';
import { Meter } from './Meter';
import { Act, AmountPicker, Disclosure } from './Act';
import { BizRow } from './Rows';

export function BlockSheet({ blockId }: { blockId: Id }) {
  const w = useWorld();
  const b = w.blocks[blockId];
  if (!b) return null;
  const ctrl = select.blockController(w, blockId);
  const rows = influenceRows(w, b);
  const sh = safehouseAt(w, b);
  const [product, setProduct] = useState<ProductKind>('booze');
  const [amount, setAmount] = useState(5);
  const carried = w.player.stash;

  return (
    <Sheet title={b.name} subtitle={`${districtName(w, b)} · ${select.factionName(w, ctrl)}${ctrl ? ' turf' : ''}${b.tags.includes('home') ? ' · 🏠 Home turf' : ''}`} accent={select.factionColor(w, ctrl)}>
      {(b.tags.includes('home') || b.tags.includes('school') || b.tags.includes('police')) && (
        <div className="chips mb8">
          {b.tags.includes('home') && <span className="chip" style={{ color: 'var(--gold)' }}>Home turf: less heat, warmer people</span>}
          {b.tags.includes('school') && <span className="chip" style={{ color: 'var(--orange)' }}>School nearby: heat ×1.5</span>}
          {b.tags.includes('police') && <span className="chip" style={{ color: 'var(--red)' }}>Police station: raids come fast</span>}
        </div>
      )}
      <div className="col" style={{ gap: 4 }}>
        {rows.length === 0 && <p className="small muted">Nobody holds this block.</p>}
        {rows.map(r => <Meter key={r.faction} label={<span><span className="swatch" style={{ background: r.color }} />{r.name}</span>} value={r.value} color={r.color} />)}
      </div>
      <div className="grid2 mt12">
        <Meter label="Wealth" value={b.wealth} color="var(--green)" />
        <Meter label="Police" value={b.police} color="var(--blue)" />
        <Meter label="Heat" value={b.heat} color="var(--red)" />
        <Meter label="People" value={b.population} color="var(--purple)" />
      </div>
      {b.memory.length > 0 && (
        <>
          <div className="section-title">What people remember</div>
          <ul className="small muted" style={{ paddingLeft: 18, margin: 0 }}>{b.memory.slice(-4).reverse().map((m, i) => <li key={i}>Day {m.day}: {m.text}</li>)}</ul>
        </>
      )}
      <div className="section-title">Demand / day</div>
      <div className="chips">
        {PRODUCTS.map(p => <span key={p} className="chip">{PRODUCT_INFO[p].icon} {PRODUCT_INFO[p].label} <span className="muted">{b.demand[p]}</span></span>)}
      </div>

      <div className="section-title">Businesses ({b.businessIds.length})</div>
      <div className="list">
        {select.businessesIn(w, blockId).map(biz => <BizRow key={biz.id} w={w} biz={biz} />)}
      </div>

      {sh ? <SafehouseCard w={w} sh={sh} /> : (
        <div className="section-title">Safehouse</div>
      )}
      <div className="actions mt8">
        {!sh && <Act action={{ type: 'rent_safehouse', blockId }} label="Rent safehouse here" icon="🏠" kind="primary" />}
        <Disclosure label="Sell product here" icon="💊">
          <label className="field">Product (you carry {stashLine(carried)})</label>
          <div className="chips mb8">
            {PRODUCTS.map(p => <button type="button" key={p} className={`chip btn${product === p ? ' sel' : ''}`} onClick={() => setProduct(p)}>{PRODUCT_INFO[p].icon} {PRODUCT_INFO[p].label} <span className="muted">×{Math.round(carried[p])}</span></button>)}
          </div>
          <label className="field">Amount (demand here {b.demand[product]}/day, ~{fmtMoney(PRODUCT_INFO[product].price)} each)</label>
          <AmountPicker presets={[1, 5, 10, 25]} prefix="" value={amount} onChange={setAmount} min={1} />
          <div className="mt8"><Act action={{ type: 'sell_product', product, amount, blockId }} label={`Sell ${amount} ${PRODUCT_INFO[product].label}`} kind="primary" block /></div>
        </Disclosure>
      </div>
    </Sheet>
  );
}

function SafehouseCard({ w, sh }: { w: World; sh: Safehouse }) {
  const yours = sh.owner === PLAYER;
  const tier = SAFEHOUSE_TIERS[sh.tier - 1];
  const idle = select.idleCrew(w);
  const [restock, setRestock] = useState(7);
  if (!yours) return <div className="card mt12"><b>🏠 {sh.name}</b><div className="small muted">{select.factionName(w, sh.owner)} safehouse. {tier?.label ?? `Tier ${sh.tier}`}.</div></div>;
  const used = PRODUCTS.reduce((a, p) => a + sh.stash[p], 0);
  return (
    <div className="card gold mt12">
      <div className="row between"><b>🏠 {sh.name}</b><span className="chip">{tier?.label ?? 'Safehouse'} · T{sh.tier}</span></div>
      <dl className="kv mt8">
        <dt>Stash</dt><dd>{stashLine(sh.stash)} <span className="muted">({Math.round(used)}/{sh.capacity})</span></dd>
        <dt>Hidden cash</dt><dd className="orange">{fmtMoney(sh.cash)}</dd>
        <dt>Rent</dt><dd>{fmtMoney((tier?.rent ?? 0) / 30)}/day · beds {tier?.crewBeds ?? '?'}</dd>
      </dl>
      <div className="section-title">Productions</div>
      <div className="list">
        {sh.productionIds.map(pid => {
          const pr = w.productions[pid]; if (!pr) return null;
          const def = PRODUCTION_DEFS[pr.kind];
          return (
            <div key={pid} className="card" style={{ padding: 10 }}>
              <div className="row between">
                <b>{def.icon} {def.label} <span className="muted small">L{pr.level}</span></b>
                <span className="small muted">→ {PRODUCT_INFO[def.product].icon} {pr.lastOutput}/day</span>
              </div>
              <div className="small muted">Stock {pr.stock}d · worker {crewName(w, pr.workerId)}{pr.disrupted > 0 && <span className="red"> · disrupted {pr.disrupted}d</span>}</div>
              <div className="row wrap mt8" style={{ gap: 6 }}>
                <div className="chips">{[3, 7, 14].map(d => <button type="button" key={d} className={`chip btn${restock === d ? ' sel' : ''}`} onClick={() => setRestock(d)}>{d}d</button>)}</div>
                <Act action={{ type: 'restock_production', productionId: pid, days: restock }} label={`Restock ${restock}d`} small />
                <Act action={{ type: 'close_production', productionId: pid }} label="Close" kind="danger" small confirm="Close this production?" />
              </div>
              {!pr.workerId && idle.length > 0 && (
                <div className="mt8">
                  <label className="field">Assign worker</label>
                  <div className="chips">{idle.map(n => <Act key={n.id} action={{ type: 'assign', npcId: n.id, assignment: { kind: 'production', productionId: pid } }} label={n.name} small />)}</div>
                </div>
              )}
              {pr.workerId && <div className="mt8"><Act action={{ type: 'assign', npcId: pr.workerId }} label={`Unassign ${crewName(w, pr.workerId)}`} small kind="ghost" /></div>}
            </div>
          );
        })}
        {sh.productionIds.length === 0 && <p className="small muted">Nothing cooking yet.</p>}
      </div>
      <Disclosure label="Start a production" icon="⚗️">
        <div className="list">
          {(Object.keys(PRODUCTION_DEFS) as (keyof typeof PRODUCTION_DEFS)[]).map(k => {
            const d = PRODUCTION_DEFS[k];
            return (
              <div key={k} className="card offer" style={{ padding: 10 }}>
                <div><b>{d.icon} {d.label}</b> <span className="muted small">{fmtMoney(d.setupCost)}</span><div className="small muted">{d.blurb} Makes {PRODUCT_INFO[d.product].label}; needs {d.skill}.</div></div>
                <Act action={{ type: 'start_production', safehouseId: sh.id, kind: k }} label={`Build ${d.label}`} block />
              </div>
            );
          })}
        </div>
      </Disclosure>
      <div className="mt8"><Act action={{ type: 'upgrade_safehouse', safehouseId: sh.id }} label={sh.tier >= 3 ? 'Max tier' : `Upgrade to ${SAFEHOUSE_TIERS[sh.tier]?.label ?? 'next tier'}`} icon="⬆️" block /></div>
    </div>
  );
}
