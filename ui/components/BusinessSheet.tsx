import { useState } from 'react';
import { select } from '@sim/index';
import { PLAYER, type Id, type ProductKind, type Racket, type World } from '@sim/types';
import { PRODUCT_INFO, RACKET_DEFS, RACKET_UPGRADE_COST, TRAIT_LABELS } from '@content/rackets';
import { PRODUCTS, bizIcon, bizTypeLabel, conditionTone, crewName, fmtMoney, ownerLabel, pct, protectionLabel } from '@ui/derive';
import { act, openSheet, useWorld } from '@ui/store';
import { Sheet } from './Sheet';
import { Meter, RelMeters } from './Meter';
import { Act, AmountPicker, Disclosure, SceneAct } from './Act';
import { NpcRow } from './Rows';
import { Info, Term, TermChip } from './Info';
import { MarketSection } from './Kit';
import { AwayNotice } from './Walk';
import { Icon } from '@ui/icons';

export function BusinessSheet({ businessId }: { businessId: Id }) {
  const w = useWorld();
  const biz = w.businesses[businessId];
  if (!biz) return null;
  const owner = w.npcs[biz.ownerId];
  const block = w.blocks[biz.blockId];
  const yours = biz.ownedBy === 'player';
  // The sim's own rule, not the type list on its own: `extortReason` is the *intersection* of what
  // the type does and what the tier will carry, and reading only half of it is how a button ends up
  // offering something the reducer refuses.
  const extortable = !select.extortReason(biz);
  const patrons = select.patronsOf(w, biz);
  const rackets = select.racketsAt(w, biz);
  const available = select.availableRackets(w, biz);
  const outlook = select.racketsByOutlook(w, biz);
  const [gift, setGift] = useState(500);
  const [rate, setRate] = useState(0.2);
  // read once: `protectRoute` walks the owner's connections looking for somebody you are holding
  const route = owner ? select.protectRoute(w, owner, rate) : undefined;
  const [offer, setOffer] = useState(biz.value);
  const [dealProduct, setDealProduct] = useState<ProductKind>('green');
  const prot = protectionLabel(w, biz);
  const tier = select.tierOf(biz);

  return (
    <Sheet title={biz.name} subtitle={`${bizTypeLabel(biz)} · ${block?.name ?? ''}`} icon={bizIcon(biz)} accent={yours ? '#f2c94c' : biz.protection ? select.factionColor(w, biz.protection.factionId) : undefined}>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="chip" style={yours ? { color: 'var(--gold)' } : undefined}>{yours ? 'Yours' : `Owner: ${ownerLabel(w, biz)}`}</span>
        <TermChip id="bizTier" tone={tier === 3 ? 'var(--purple)' : tier === 2 ? 'var(--blue)' : undefined}>{select.tierInfo(biz).label}</TermChip>
        {prot && <TermChip id={biz.protection!.partner ? 'partner' : 'protection'} tone={select.factionColor(w, biz.protection!.factionId)}><Icon name={biz.protection!.partner ? 'crew' : 'protection'} size={11} /> {prot}</TermChip>}
        {biz.insured && <TermChip id="insured">Insured</TermChip>}
        {biz.flags.map(f => <span key={f} className="chip red">{f}</span>)}
      </div>
      <dl className="kv mt8">
        <dt><Term id="bizIncome">Income</Term></dt><dd className="green">{fmtMoney(biz.baseIncome)}/day</dd>
        <dt><Term id="bizValue">Value</Term></dt><dd>{fmtMoney(biz.value)}</dd>
        <dt>Block</dt><dd><button type="button" className="chip btn" onClick={() => openSheet({ kind: 'block', blockId: biz.blockId })}>{block?.name}</button></dd>
      </dl>
      <div className="mt8"><Meter label={<Term id="condition">Condition</Term>} value={biz.condition} color={conditionTone(biz.condition)} /></div>

      {owner && (
        <>
          <div className="section-title">{yours ? 'Manager' : 'Owner'}</div>
          <div className="card">
            <div className="row between">
              <button type="button" className="chip btn" onClick={() => openSheet({ kind: 'npc', npcId: owner.id })}>{owner.name} ›</button>
              <span className="chip">{select.relLabel(owner)}</span>
            </div>
            <div className="chips mt8">
              {select.isKnown(owner)
                ? owner.traits.map(t => <TermChip key={t} id={`trait:${t}`}>{TRAIT_LABELS[t] ?? t}</TermChip>)
                : <TermChip id="known"><span className="muted">Traits unknown</span></TermChip>}
              {owner.grudge && <TermChip id="grudge" tone="var(--red)">Grudge</TermChip>}
              {select.agendaLabel(owner) && <TermChip id="agenda" tone="var(--blue)">{select.agendaLabel(owner)}</TermChip>}
              {owner.faction && <TermChip id="stance" tone={select.factionColor(w, owner.faction)}>{select.factionName(w, owner.faction)}</TermChip>}
            </div>
            <div className="mt8"><RelMeters rel={owner.rel} /></div>
          </div>
        </>
      )}

      <InstitutionHint businessId={businessId} />
      <AwayNotice blockId={biz.blockId} what={biz.name} />
      <MarketSection businessId={businessId} />
      <div className="section-title">Actions<Info id="odds" /></div>
      <div className="actions">
        <Act action={{ type: 'case_joint', businessId }} label={(w.businesses[businessId].casedUntil ?? 0) >= w.day ? 'Cased' : 'Case the joint'} icon="watching" />
        {owner && <SceneAct scene={{ kind: 'visit', npcId: owner.id, businessId }} label="Visit" icon="crew" />}
        {owner && <SceneAct scene={{ kind: 'threaten', npcId: owner.id, businessId }} label="Threaten" icon="intimidate" kind="danger" />}
        {owner && (
          <Disclosure label="Gift" icon="gift">
            <AmountPicker presets={[100, 500, 2000]} value={gift} onChange={setGift} min={1} />
            <div className="mt8"><Act action={{ type: 'gift', npcId: owner.id, amount: gift }} label={`Give ${fmtMoney(gift)}`} kind="primary" block /></div>
          </Disclosure>
        )}
        {!yours && extortable && <SceneAct scene={{ kind: 'shakedown', npcId: biz.ownerId, businessId }} label="Shakedown" icon="fist" kind="danger" />}
        {!yours && extortable && (
          <Disclosure label="Protect" icon="protection">
            <p className="small muted">The owner pays you a cut of income, every day. They agree when they are afraid of you — or when they trust you <i>and</i> you have a reason beyond that: a turn you did them, their street, or something out of their books.</p>
            <div className="chips mb8">{[0.1, 0.2, 0.3].map(r => <button type="button" key={r} className={`chip btn${rate === r ? ' sel' : ''}`} onClick={() => setRate(r)}>{pct(r)}</button>)}</div>
            <p className="small muted">About {fmtMoney(biz.baseIncome * rate * 3)}/day. Fair rates build trust; greedy ones breed snitches.</p>
            {owner && (route === 'friend'
              ? <p className="small mt8" style={{ color: 'var(--green)' }}><Icon name="crew" size={12} /> {owner.name} trusts you and has a reason to say yes. No threats needed.</p>
              : route === 'fear'
                ? <p className="small muted mt8"><Icon name="intimidate" size={12} /> {owner.name} is frightened enough of you to agree.</p>
                : <p className="small orange mt8">{select.protectReason(w, owner, rate)}</p>)}
            <Act action={{ type: 'protect', businessId, rate }} label={`Protect at ${pct(rate)}`} kind="primary" block />
          </Disclosure>
        )}
        {!yours && (
          <Disclosure label="Buy" icon="dirty">
            <label className="field">Offer (asking {fmtMoney(biz.value)})</label>
            <AmountPicker presets={[Math.round(biz.value * 0.8 / 100) * 100, biz.value, Math.round(biz.value * 1.2 / 100) * 100]} value={offer} onChange={setOffer} min={0} />
            <div className="mt8"><Act action={{ type: 'buy_business', businessId, offer }} label={`Offer ${fmtMoney(offer)}`} kind="primary" block /></div>
          </Disclosure>
        )}
        {yours && <Act action={{ type: 'sell_business', businessId }} label="Sell" icon="pawn" confirm={`Sell ${biz.name}?`} />}
        {yours && !biz.insured && <Act action={{ type: 'insure', businessId }} label="Insure" icon="note" />}
        {yours && biz.condition < 100 && <Act action={{ type: 'repair', businessId }} label="Repair" icon="intimidate" />}
      </div>

      <div className="section-title">Rackets ({rackets.length})<Info id="dirtyRacket" /></div>
      <div className="list">
        {rackets.map(r => <RacketCard key={r.id} w={w} r={r} />)}
        {rackets.length === 0 && <p className="small muted">No rackets running here.</p>}
      </div>
      {available.length > 0 && (
        <Disclosure label="Start a racket" icon="plus" kind="primary">
          <div className="list">
            {outlook.map(({ kind: k, income, saturation, synergy }) => {
              const d = RACKET_DEFS[k];
              const needsProduct = k === 'dealing';
              return (
                <div key={k} className="card offer" style={{ padding: 10 }}>
                  <div><b><Icon of="racket" id={k} size={14} /> {d.label}</b> <span className="muted small">{d.setupCost ? fmtMoney(d.setupCost) : 'free'}</span><div className="small muted">{d.blurb} Runner skill: {d.skill}.</div></div>
                  {/* what it would actually pay here, with the district's saturation and any
                      synergy folded in — otherwise both mechanics are invisible to the player */}
                  <div className="row wrap mt8" style={{ gap: 4 }}>
                    {income > 0 && <span className="chip">≈{fmtMoney(income)}/day here</span>}
                    {saturation < 1 && <TermChip id="racketSaturation" tone="var(--orange)">Flooded ·{'\u00A0'}{Math.round(saturation * 100)}%</TermChip>}
                    {synergy && <TermChip id="synergy" tone="var(--green)">+{Math.round(synergy.bonus * 100)}% with your {RACKET_DEFS[synergy.needs].label.toLowerCase()}</TermChip>}
                  </div>
                  {synergy && <p className="tiny muted" style={{ margin: '4px 0 0' }}>{synergy.why}.</p>}
                  {saturation < 1 && <p className="tiny muted" style={{ margin: '4px 0 0' }}>You already run {RACKET_DEFS[k].label.toLowerCase()} elsewhere in this district. Another one here is worth less than the first was — spread out, or run something different.</p>}
                  {needsProduct && <div className="chips">{PRODUCTS.map(p => <button type="button" key={p} className={`chip btn${dealProduct === p ? ' sel' : ''}`} onClick={() => setDealProduct(p)}><Icon of="product" id={p} size={12} /> {PRODUCT_INFO[p].label}</button>)}</div>}
                  <Act action={{ type: 'start_racket', businessId, kind: k, product: needsProduct ? dealProduct : undefined }} label={`Start ${d.label}`} block />
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

/** Why a running racket earns what it earns: the district either dilutes it or feeds it. */
export function RacketYield({ w, r }: { w: World; r: Racket }) {
  const { saturation, rank, synergy } = select.racketReading(w, r);
  if (saturation >= 1 && !synergy) return null;
  return (
    <div className="row wrap mt8" style={{ gap: 4 }}>
      {saturation < 1 && <TermChip id="racketSaturation" tone="var(--orange)">#{rank + 1} of this kind in the district · {Math.round(saturation * 100)}%</TermChip>}
      {synergy && <TermChip id="synergy" tone="var(--green)">+{Math.round(synergy.bonus * 100)}% · {synergy.why}</TermChip>}
    </div>
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
        <b><Icon of="racket" id={r.kind} size={14} /> {d.label} <Term id="racketLevel" className="muted small">L{r.level}</Term>{r.product && <span className="small"> · <Icon of="product" id={r.product} size={12} /></span>}</b>
        <Term id="dirtyRacket" className={`small ${d.dirty ? 'orange' : 'green'}`}>{fmtMoney(r.lastIncome)}/day</Term>
      </div>
      <div className="small muted">
        {yours ? <><Term id="runner">Runner</Term>{`: ${crewName(w, r.runnerId)}`}</> : `Run by ${select.factionName(w, r.owner)}`}
        {showBiz && ` · ${w.businesses[r.businessId]?.name ?? '?'}`}
        {r.float !== undefined && <> · <Term id="float">float</Term> {fmtMoney(r.float)}</>}
        {r.disrupted > 0 && <span className="red"> · <Term id="disrupted">disrupted</Term> {r.disrupted}d</span>}
      </div>
      {yours && <RacketStock w={w} r={r} />}
      {yours && <RacketYield w={w} r={r} />}
      {yours && (
        <div className="row wrap mt8" style={{ gap: 6 }}>
          <Act action={{ type: 'upgrade_racket', racketId: r.id }} label={r.level >= 3 ? 'Max level' : `Upgrade (${fmtMoney(upgradeCost)})`} small />
          <Act action={{ type: 'close_racket', racketId: r.id }} label="Close" small kind="danger" confirm={`Close the ${d.label} racket?`} />
          {r.runnerId && <Act action={{ type: 'assign', npcId: r.runnerId }} label="Unassign" small kind="ghost" />}
        </div>
      )}
      {yours && r.kind === 'loansharking' && (
        <div className="mt8">
          <label className="field"><Term id="float">Fund the float</Term></label>
          <div className="row"><div className="grow"><AmountPicker presets={[500, 1000, 5000]} value={fund} onChange={setFund} min={1} /></div></div>
          <div className="mt8"><Act action={{ type: 'fund_racket', racketId: r.id, amount: fund }} label={`Fund ${fmtMoney(fund)}`} small /></div>
        </div>
      )}
      {yours && !r.runnerId && (
        <div className="mt8">
          <label className="field"><Term id="runner">Assign a runner</Term> (<Term id={d.skill}>{d.skill}</Term>)</label>
          {idle.length === 0 && <span className="small muted">No idle crew.</span>}
          <div className="chips">{idle.map(n => <Act key={n.id} action={{ type: 'assign', npcId: n.id, assignment: { kind: 'racket', racketId: r.id } }} label={`${n.name} (${d.skill} ${n.skills[d.skill]})`} small />)}</div>
        </div>
      )}
    </div>
  );
}

/**
 * What a product racket has to sell. These sell out of *your* stash, not a stock of their own —
 * which is fine until you notice production puts everything in safehouses, at which point a
 * dealing racket reads "$0/day" forever and nothing on screen says why. Now it says why.
 */
export function RacketStock({ w, r }: { w: World; r: Racket }) {
  const def = RACKET_DEFS[r.kind];
  if (def.scale !== 'stash') return null;
  const product: ProductKind = r.kind === 'dealing' ? (r.product ?? 'green')
    : r.kind === 'fencing' ? 'hot_goods' : r.kind === 'counterfeiting' ? 'counterfeit' : r.kind === 'knockoffs' ? 'streetwear' : 'hot_goods';
  if (r.kind === 'carding') {
    const cards = select.liveCards(w).length;
    return <p className="small mt8" style={{ margin: '8px 0 0', color: cards ? 'var(--green)' : 'var(--orange)' }}><Icon name="carding" size={12} /> {cards ? `${cards} live card${cards === 1 ? '' : 's'} to move.` : 'No cards to move. This one buys the pile you are carrying; go and get some.'}</p>;
  }
  const carrying = Math.round(w.player.stash[product] ?? 0);
  const here = w.player.safehouseIds.map(id => w.safehouses[id]).find(s => s && s.blockId === w.businesses[r.businessId]?.blockId && (s.stash[product] ?? 0) > 0);
  const elsewhere = w.player.safehouseIds.map(id => w.safehouses[id]).filter(s => s && (s.stash[product] ?? 0) > 0);
  const rule = select.supplyRule(r);
  const supply = select.supplyReading(w, r, product);
  return (
    <div className="mt8">
      <p className="small" style={{ margin: 0, color: carrying > 0 ? 'var(--green)' : 'var(--orange)' }}>
        <Icon of="product" id={product} size={12} /> {carrying > 0
          ? `${carrying} ${PRODUCT_INFO[product].label.toLowerCase()} on you to sell.`
          : `Nothing to sell. This moves ${PRODUCT_INFO[product].label.toLowerCase()} out of your own stash.`}
      </p>
      {carrying === 0 && (
        <p className="tiny muted" style={{ margin: '4px 0 0' }}>
          {supply.available > 0
            ? `${supply.where} has ${supply.available} — your standing order brings it in from tomorrow.`
            : here
              ? `${here.name} is on this block and has some.`
              : elsewhere.length
                ? `${elsewhere[0].name} has ${Math.round(elsewhere[0].stash[product])}, but this racket only draws from ${select.SUPPLY_LABELS[rule].label.toLowerCase()}. Widen the standing order, or carry it over yourself.`
                : 'Make it, buy it or steal it first — a production in a safehouse is the usual way.'}
        </p>
      )}
      <div className="mt8">
        <p className="tiny muted" style={{ margin: '0 0 4px' }}>Standing order — where it draws stock from:</p>
        <div className="chips">
          {(['block', 'empire', 'manual'] as const).map(k => (
            <button type="button" key={k} className={`chip btn${rule === k ? ' sel' : ''}`} onClick={() => act({ type: 'set_supply', racketId: r.id, rule: k })} title={select.SUPPLY_LABELS[k].blurb}>
              {select.SUPPLY_LABELS[k].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * What to do with a place no threat opens.
 *
 * A tier-3 business has no patrons to work through and no shakedown button, so the sheet used to
 * be a dead end: a bank with one name on it and nothing to press. The way in has always existed —
 * get inside their books, or do the owner a real turn — and nothing on screen said so. This says
 * it, and says it differently once the player actually has the hold, so the hint stops being
 * advice and starts being a prompt.
 */
function InstitutionHint({ businessId }: { businessId: Id }) {
  const w = useWorld();
  const biz = w.businesses[businessId]; if (!biz) return null;
  if (select.tierInfo(biz).extort || biz.ownedBy === 'player') return null;
  const owner = w.npcs[biz.ownerId];
  const thin = biz.patronIds.length <= 1;
  const got = select.hasWayIn(w, owner);
  return (
    <div className="card mt8" style={{ borderColor: got ? 'var(--green)' : 'var(--line)' }}>
      <b className="small"><Icon name={got ? 'lockpicks' : 'lock'} size={13} /> {got ? 'You have a way in' : 'Nobody here is frightened of you'}</b>
      <p className="small muted" style={{ margin: '4px 0 0' }}>
        {select.tierInfo(biz).blurb}{' '}
        {thin && owner
          ? <>There is barely anybody in here to work through, so it is {owner.name} or nothing.</>
          : <>Work through the people in here, or go at the owner directly.</>}
        {' '}{select.wayIn()}
      </p>
      {owner && (
        <div className="actions mt8">
          <button type="button" className="btn" onClick={() => openSheet({ kind: 'npc', npcId: owner.id })}><Icon name="person" size={14} /> {owner.name}</button>
        </div>
      )}
    </div>
  );
}
