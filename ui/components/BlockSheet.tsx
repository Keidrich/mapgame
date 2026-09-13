import { useState } from 'react';
import { select } from '@sim/index';
import { PLAYER, type Id, type ProductKind, type Safehouse, type World } from '@sim/types';
import { PRODUCTION_DEFS, PRODUCTION_UPGRADE_MULT, PRODUCT_INFO, RECIPES, SAFEHOUSE_TIERS } from '@content/rackets';
import { PRODUCTS, crewName, districtName, fmtMoney, influenceRows, safehouseAt, stashLine } from '@ui/derive';
import { openSheet, useWorld } from '@ui/store';
import { Sheet } from './Sheet';
import { Meter } from './Meter';
import { Act, AmountPicker, Disclosure, SceneAct } from './Act';
import { BizRow } from './Rows';
import { Info, Term, TermChip } from './Info';
import { WalkHere } from './Walk';

export function BlockSheet({ blockId }: { blockId: Id }) {
  const w = useWorld();
  const b = w.blocks[blockId];
  if (!b) return null;
  const ctrl = select.blockController(w, blockId);
  const rows = influenceRows(w, b);
  const sh = safehouseAt(w, b);
  const crew = select.crewAt(w, b.id);
  const [product, setProduct] = useState<ProductKind>('booze');
  const [amount, setAmount] = useState(5);
  const carried = w.player.stash;

  return (
    <Sheet title={b.name} subtitle={`${districtName(w, b)} · ${select.factionName(w, ctrl)}${ctrl ? ' turf' : ''}${b.tags.includes('home') ? ' · 🏠 Home turf' : ''}`} accent={select.factionColor(w, ctrl)}>
      {(b.tags.includes('home') || b.tags.includes('school') || b.tags.includes('police') || select.nearPolice(w, b.id)) && (
        <div className="chips mb8">
          {b.tags.includes('home') && <TermChip id="homeTurf" tone="var(--gold)">Home turf</TermChip>}
          {b.tags.includes('school') && <TermChip id="schoolTag" tone="var(--orange)">School nearby: heat ×1.5</TermChip>}
          {b.tags.includes('police') && <TermChip id="policeTag" tone="var(--red)">Police station: raids come fast</TermChip>}
          {!b.tags.includes('police') && select.nearPolice(w, b.id) && <TermChip id="policeTag" tone="var(--orange)">Station next door: raids hit here first</TermChip>}
        </div>
      )}
      <div className="row between mb8"><span className="small muted"><Term id="influence">Influence</Term></span></div>
      {select.isHere(w, b.id)
        ? <div className="chips mb8">
            <span className="chip" style={{ color: 'var(--gold)' }}>🚶 You are here</span>
            {ctrl === PLAYER && <TermChip id="turf" tone="var(--green)">Your turf: free to move through</TermChip>}
          </div>
        : <div className="mb8">
            {ctrl === PLAYER && <div className="chips mb8"><TermChip id="turf" tone="var(--green)">Your turf</TermChip></div>}
            <WalkHere blockId={b.id} />
          </div>}
      <div className="col" style={{ gap: 4 }}>
        {rows.length === 0 && <p className="small muted">Nobody holds this block.</p>}
        {rows.map(r => <Meter key={r.faction} label={<span><span className="swatch" style={{ background: r.color }} />{r.name}</span>} value={r.value} color={r.color} />)}
      </div>
      <div className="grid2 mt12">
        <Meter label={<Term id="wealth">Wealth</Term>} value={b.wealth} color="var(--green)" />
        <Meter label={<Term id="police">Police</Term>} value={b.police} color="var(--blue)" />
        <Meter label={<Term id="blockHeat">Heat</Term>} value={b.heat} color="var(--red)" />
        <Meter label={<Term id="population">People</Term>} value={b.population} color="var(--purple)" />
      </div>
      {b.memory.length > 0 && (
        <>
          <div className="section-title">What people remember<Info id="memory" /></div>
          <ul className="small muted" style={{ paddingLeft: 18, margin: 0 }}>{b.memory.slice(-4).reverse().map((m, i) => <li key={i}>Day {m.day}: {m.text}</li>)}</ul>
        </>
      )}
      {crew && (
        <div className="card mt12" style={{ borderColor: '#9a7b4f' }}>
          <div className="row between"><b>🏴 The {crew.name}<Info id="streetCrew" /></b><span className="chip">{crew.tribute === PLAYER ? 'On your payroll' : crew.tribute ? `Under ${select.factionName(w, crew.tribute)}` : `Strength ${Math.round(crew.strength)}`}</span></div>
          <p className="small muted" style={{ margin: '6px 0' }}>{w.npcs[crew.bossId]?.name} and {crew.soldierIds.length} soldiers hold this corner.{!crew.tribute ? ' Your rackets here pay them a street tax until you deal with them. Left alone, they grow.' : ''}</p>
          <button type="button" className="chip btn mb8" onClick={() => openSheet({ kind: 'npc', npcId: crew.bossId })}>{w.npcs[crew.bossId]?.name}</button>
          {!crew.tribute && (
            <div className="actions">
              <SceneAct scene={{ kind: 'parley', npcId: crew.bossId }} label="Parley" icon="🗣️" kind="primary" />
              <Act action={{ type: 'plan_op', kind: 'takeover', crewIds: select.idleCrew(w).slice(0, 3).map(n => n.id), targetBlockId: b.id }} label="Take the corner" icon="🏴" kind="danger" />
            </div>
          )}
        </div>
      )}
      <div className="section-title">Demand / day<Info id="demand" /></div>
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
        <dt><Term id="stash">Stash</Term></dt><dd>{stashLine(sh.stash)} <span className="muted">({Math.round(used)}/{sh.capacity})</span>{PRODUCTS.filter(p => sh.stash[p] > 0 && p !== 'hot_goods').map(p => <TermChip key={p} id="quality" style={{ marginLeft: 4 }}>{PRODUCT_INFO[p].icon} q{select.qualityOf(sh, p)}</TermChip>)}</dd>
        <dt><Term id="hiddenCash">Hidden cash</Term></dt><dd className="orange">{fmtMoney(sh.cash)}</dd>
        <dt>Rent</dt><dd>{fmtMoney((tier?.rent ?? 0) / 30)}/day · <Term id="beds">beds</Term> {tier?.crewBeds ?? '?'}</dd>
      </dl>
      <div className="section-title">Productions</div>
      <div className="list">
        {sh.productionIds.map(pid => {
          const pr = w.productions[pid]; if (!pr) return null;
          const def = PRODUCTION_DEFS[pr.kind];
          return (
            <div key={pid} className="card" style={{ padding: 10 }}>
              <div className="row between">
                <b>{def.icon} {def.label} <Term id="prodLevel" className="muted small">L{pr.level}</Term></b>
                <span className="small muted">→ {PRODUCT_INFO[def.product].icon} {pr.lastOutput}/day</span>
              </div>
              <div className="small muted"><Term id="stock">Stock</Term> {pr.stock}d · worker {crewName(w, pr.workerId)}{pr.disrupted > 0 && <span className="red"> · <Term id="disrupted">disrupted</Term> {pr.disrupted}d</span>}</div>
              <div className="chips mt8">
                <TermChip id="quality">Quality {select.productionQuality(w, pr)}</TermChip>
                {pr.recipe && RECIPES[pr.recipe] && <TermChip id="recipe" className="gold" note={`${RECIPES[pr.recipe].label}: ${RECIPES[pr.recipe].blurb}`}>{RECIPES[pr.recipe].label}</TermChip>}
                {select.shortageActive(w, pr.kind) && <TermChip id="shortage" className="red">Shortage: restock ×2</TermChip>}
                {select.saturationActive(w, def.product) && <TermChip id="saturation" className="red">Street flooded: −30%</TermChip>}
              </div>
              <div className="row wrap mt8" style={{ gap: 6 }}>
                <div className="chips">{[3, 7, 14].map(d => <button type="button" key={d} className={`chip btn${restock === d ? ' sel' : ''}`} onClick={() => setRestock(d)}>{d}d</button>)}</div>
                <Act action={{ type: 'restock_production', productionId: pid, days: restock }} label={`Restock ${restock}d (${fmtMoney(select.restockCost(w, pr, restock))})`} small />
                <Act action={{ type: 'close_production', productionId: pid }} label="Close" kind="danger" small confirm="Close this production?" />
              </div>
              <div className="row wrap mt8" style={{ gap: 6 }}>
                <Act action={{ type: 'upgrade_production', productionId: pid }} label={pr.level >= 3 ? 'Max level' : `Upgrade to L${pr.level + 1} (${fmtMoney(Math.round(def.setupCost * PRODUCTION_UPGRADE_MULT[pr.level]))})`} icon="⬆️" small />
                {select.recipesForKind(w, pr.kind).map(id => <Act key={id} action={{ type: 'set_recipe', productionId: pid, recipe: pr.recipe === id ? undefined : id }} label={pr.recipe === id ? `Drop ${RECIPES[id].label}` : `Use ${RECIPES[id].label}`} small kind={pr.recipe === id ? 'ghost' : undefined} />)}
              </div>
              {select.recipesForKind(w, pr.kind).length === 0 && <p className="small muted mt8">No recipes known for this. Steal a formula (Ops) or recruit someone who knows one.</p>}
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
