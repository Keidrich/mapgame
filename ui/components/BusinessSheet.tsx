import { useState } from 'react';
import { select } from '@sim/index';
import { PLAYER, type Id, type ProductKind, type Racket, type World } from '@sim/types';
import { PRODUCT_INFO, RACKET_DEFS, RACKET_UPGRADE_COST, TRAIT_LABELS } from '@content/rackets';
import { PRODUCTS, bizIcon, bizTypeLabel, conditionTone, crewName, fmtMoney, ownerLabel, pct, protectionLabel } from '@ui/derive';
import { openSheet, useWorld } from '@ui/store';
import { Sheet } from './Sheet';
import { Meter, RelMeters } from './Meter';
import { Act, AmountPicker, Disclosure } from './Act';
import { NpcRow } from './Rows';

export function BusinessSheet({ businessId }: { businessId: Id }) {
  const w = useWorld();
  const biz = w.businesses[businessId];
  if (!biz) return null;
  const owner = w.npcs[biz.ownerId];
  const block = w.blocks[biz.blockId];
  const yours = biz.ownedBy === 'player';
  const patrons = select.patronsOf(w, biz);
  const rackets = select.racketsAt(w, biz);
  const available = select.availableRackets(w, biz);
  const [gift, setGift] = useState(500);
  const [rate, setRate] = useState(0.2);
  const [offer, setOffer] = useState(biz.value);
  const [dealProduct, setDealProduct] = useState<ProductKind>('green');
  const prot = protectionLabel(w, biz);

  return (
    <Sheet title={biz.name} subtitle={`${bizTypeLabel(biz)} · ${block?.name ?? ''}`} icon={bizIcon(biz)} accent={yours ? '#f2c94c' : biz.protection ? select.factionColor(w, biz.protection.factionId) : undefined}>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="chip" style={yours ? { color: 'var(--gold)' } : undefined}>{yours ? 'Yours' : `Owner: ${ownerLabel(w, biz)}`}</span>
        {prot && <span className="chip" style={{ color: select.factionColor(w, biz.protection!.factionId) }}>🛡️ {prot}</span>}
        {biz.insured && <span className="chip">Insured</span>}
        {biz.flags.map(f => <span key={f} className="chip red">{f}</span>)}
      </div>
      <dl className="kv mt8">
        <dt>Income</dt><dd className="green">{fmtMoney(biz.baseIncome)}/day</dd>
        <dt>Value</dt><dd>{fmtMoney(biz.value)}</dd>
        <dt>Block</dt><dd><button type="button" className="chip btn" onClick={() => openSheet({ kind: 'block', blockId: biz.blockId })}>{block?.name}</button></dd>
      </dl>
      <div className="mt8"><Meter label="Condition" value={biz.condition} color={conditionTone(biz.condition)} /></div>

      {owner && (
        <>
          <div className="section-title">{yours ? 'Manager' : 'Owner'}</div>
          <button type="button" className="card" style={{ width: '100%', textAlign: 'left', color: 'inherit' }} onClick={() => openSheet({ kind: 'npc', npcId: owner.id })}>
            <div className="row between"><b>{owner.name}</b><span className="chip">{select.relLabel(owner)}</span></div>
            <div className="chips mt8">{owner.traits.map(t => <span key={t} className="chip">{TRAIT_LABELS[t] ?? t}</span>)}{owner.faction && <span className="chip" style={{ color: select.factionColor(w, owner.faction) }}>{select.factionName(w, owner.faction)}</span>}</div>
            <div className="mt8"><RelMeters rel={owner.rel} /></div>
          </button>
        </>
      )}

      <div className="section-title">Actions</div>
      <div className="actions">
        {owner && <Act action={{ type: 'visit', npcId: owner.id }} label="Visit" icon="🤝" />}
        {owner && <Act action={{ type: 'threaten', npcId: owner.id }} label="Threaten" icon="😠" kind="danger" />}
        {owner && (
          <Disclosure label="Gift" icon="🎁">
            <AmountPicker presets={[100, 500, 2000]} value={gift} onChange={setGift} min={1} />
            <div className="mt8"><Act action={{ type: 'gift', npcId: owner.id, amount: gift }} label={`Give ${fmtMoney(gift)}`} kind="primary" block /></div>
          </Disclosure>
        )}
        {!yours && <Act action={{ type: 'shakedown', businessId }} label="Shakedown" icon="👊" kind="danger" />}
        {!yours && (
          <Disclosure label="Protect" icon="🛡️">
            <p className="small muted">The owner pays you a cut of income, every day.</p>
            <div className="chips mb8">{[0.1, 0.2, 0.3].map(r => <button type="button" key={r} className={`chip btn${rate === r ? ' sel' : ''}`} onClick={() => setRate(r)}>{pct(r)}</button>)}</div>
            <Act action={{ type: 'protect', businessId, rate }} label={`Protect at ${pct(rate)} (~${fmtMoney(biz.baseIncome * rate)}/day)`} kind="primary" block />
          </Disclosure>
        )}
        {!yours && (
          <Disclosure label="Buy" icon="💰">
            <label className="field">Offer (asking {fmtMoney(biz.value)})</label>
            <AmountPicker presets={[Math.round(biz.value * 0.8 / 100) * 100, biz.value, Math.round(biz.value * 1.2 / 100) * 100]} value={offer} onChange={setOffer} min={0} />
            <div className="mt8"><Act action={{ type: 'buy_business', businessId, offer }} label={`Offer ${fmtMoney(offer)}`} kind="primary" block /></div>
          </Disclosure>
        )}
        {yours && <Act action={{ type: 'sell_business', businessId }} label="Sell" icon="🏷️" confirm={`Sell ${biz.name}?`} />}
        {yours && !biz.insured && <Act action={{ type: 'insure', businessId }} label="Insure" icon="📄" />}
        {yours && biz.condition < 100 && <Act action={{ type: 'repair', businessId }} label="Repair" icon="🔨" />}
      </div>

      <div className="section-title">Rackets ({rackets.length})</div>
      <div className="list">
        {rackets.map(r => <RacketCard key={r.id} w={w} r={r} />)}
        {rackets.length === 0 && <p className="small muted">No rackets running here.</p>}
      </div>
      {available.length > 0 && (
        <Disclosure label="Start a racket" icon="➕" kind="primary">
          <div className="list">
            {available.map(k => {
              const d = RACKET_DEFS[k];
              const needsProduct = k === 'dealing';
              return (
                <div key={k} className="card" style={{ padding: 10 }}>
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <div className="grow"><b>{d.icon} {d.label}</b> <span className="muted small">{d.setupCost ? fmtMoney(d.setupCost) : 'free'}</span><div className="small muted">{d.blurb} Runner skill: {d.skill}.</div></div>
                    <Act action={{ type: 'start_racket', businessId, kind: k, product: needsProduct ? dealProduct : undefined }} label="Start" small />
                  </div>
                  {needsProduct && <div className="chips mt8">{PRODUCTS.map(p => <button type="button" key={p} className={`chip btn${dealProduct === p ? ' sel' : ''}`} onClick={() => setDealProduct(p)}>{PRODUCT_INFO[p].icon} {PRODUCT_INFO[p].label}</button>)}</div>}
                </div>
              );
            })}
          </div>
        </Disclosure>
      )}

      <div className="section-title">Patrons ({patrons.length})</div>
      <div className="list">
        {patrons.map(p => <NpcRow key={p.id} w={w} npc={p} />)}
        {patrons.length === 0 && <p className="small muted">Nobody hangs around here.</p>}
      </div>
    </Sheet>
  );
}

export function RacketCard({ w, r, showBiz }: { w: World; r: Racket; showBiz?: boolean }) {
  const d = RACKET_DEFS[r.kind];
  const yours = r.owner === PLAYER;
  const idle = select.idleCrew(w);
  const [fund, setFund] = useState(1000);
  const upgradeCost = RACKET_UPGRADE_COST[r.level] ?? 0;
  return (
    <div className="card" style={{ padding: 10, borderColor: yours ? 'rgba(242,201,76,0.4)' : undefined }}>
      <div className="row between">
        <b>{d.icon} {d.label} <span className="muted small">L{r.level}</span>{r.product && <span className="small"> · {PRODUCT_INFO[r.product].icon}</span>}</b>
        <span className={`small ${d.dirty ? 'orange' : 'green'}`}>{fmtMoney(r.lastIncome)}/day</span>
      </div>
      <div className="small muted">
        {yours ? `Runner: ${crewName(w, r.runnerId)}` : `Run by ${select.factionName(w, r.owner)}`}
        {showBiz && ` · ${w.businesses[r.businessId]?.name ?? '?'}`}
        {r.float !== undefined && ` · float ${fmtMoney(r.float)}`}
        {r.disrupted > 0 && <span className="red"> · disrupted {r.disrupted}d</span>}
      </div>
      {yours && (
        <div className="row wrap mt8" style={{ gap: 6 }}>
          <Act action={{ type: 'upgrade_racket', racketId: r.id }} label={r.level >= 3 ? 'Max level' : `Upgrade (${fmtMoney(upgradeCost)})`} small />
          <Act action={{ type: 'close_racket', racketId: r.id }} label="Close" small kind="danger" confirm={`Close the ${d.label} racket?`} />
          {r.runnerId && <Act action={{ type: 'assign', npcId: r.runnerId }} label="Unassign" small kind="ghost" />}
        </div>
      )}
      {yours && r.kind === 'loansharking' && (
        <div className="mt8">
          <label className="field">Fund the float</label>
          <div className="row"><div className="grow"><AmountPicker presets={[500, 1000, 5000]} value={fund} onChange={setFund} min={1} /></div></div>
          <div className="mt8"><Act action={{ type: 'fund_racket', racketId: r.id, amount: fund }} label={`Fund ${fmtMoney(fund)}`} small /></div>
        </div>
      )}
      {yours && !r.runnerId && (
        <div className="mt8">
          <label className="field">Assign a runner ({d.skill})</label>
          {idle.length === 0 && <span className="small muted">No idle crew.</span>}
          <div className="chips">{idle.map(n => <Act key={n.id} action={{ type: 'assign', npcId: n.id, assignment: { kind: 'racket', racketId: r.id } }} label={`${n.name} (${d.skill} ${n.skills[d.skill]})`} small />)}</div>
        </div>
      )}
    </div>
  );
}
