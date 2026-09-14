import { useState } from 'react';
import { select } from '@sim/index';
import { PRODUCT_INFO, RECIPES } from '@content/rackets';
import type { Id, ProductKind } from '@sim/types';
import { PRODUCTS, fmtMoney, playerSafehouses } from '@ui/derive';
import { act, useWorld } from '@ui/store';
import { Info, Term, TermChip } from './Info';
import { Icon, IconTile } from '@ui/icons';

/**
 * What you are holding, where it is, and what it is worth.
 *
 * The old version was a one-line summary — a bare icon and a "1" — over a list that named every
 * safehouse whether or not anything was in it, with moving hidden behind a five-tab form whose
 * 5/10/25 presets were useless to somebody holding two units. A quantity was never next to the
 * thing it was a quantity of.
 *
 * The rule here, taken from City of Gangsters' warehouse view rather than its layout: **identity,
 * quantity, value and flow always travel together, at every level of zoom.** Every number on
 * this screen sits beside the product it counts, what that product is currently worth on the
 * street, and where it can go next. Empty locations are not listed; automation is stated inline
 * rather than being invisible; and the move controls are sized to what is actually there.
 */
export function Inventory() {
  const w = useWorld();
  const [showEmpty, setShowEmpty] = useState(false);
  const totals = select.stashTotals(w);
  const carried = PRODUCTS.filter(p => (w.player.stash[p] ?? 0) > 0);
  const houses = playerSafehouses(w);
  const stocked = houses.filter(s => PRODUCTS.some(p => (s.stash[p] ?? 0) > 0));
  const empty = houses.filter(s => !stocked.includes(s));
  const anything = PRODUCTS.some(p => totals[p] > 0);
  const worth = select.stashValue(w);

  return (
    <>
      <div className="section-title">
        <Term id="stash">Stash</Term>
        {anything && <span className="muted"> · {fmtMoney(worth)} on the street</span>}
        <Info id="stash" />
      </div>

      {!anything && (
        <div className="card"><p className="small muted" style={{ margin: 0 }}>
          Nothing anywhere. Product comes from a production in a safehouse, a smuggling run, or a job that pays in goods.
        </p></div>
      )}

      {anything && (
        <>
          {/* every kind you hold, with what it is, how much, what it is worth, and where */}
          <div className="col" style={{ gap: 6 }}>
            {PRODUCTS.filter(p => totals[p] > 0).map(p => <ProductRow key={p} product={p} />)}
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>Where it is</div>
          <div className="col" style={{ gap: 6 }}>
            {carried.length > 0 && <PlaceRow id="player" name="On you" icon="legwork" />}
            {stocked.map(s => <PlaceRow key={s.id} id={s.id} name={s.name} icon="safehouse" />)}
            {carried.length === 0 && stocked.length === 0 && <p className="small muted">All of it is somewhere you have not listed.</p>}
            {empty.length > 0 && (
              <>
                <button type="button" className="chip btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowEmpty(v => !v)}>
                  {showEmpty ? 'Hide' : `${empty.length} empty safehouse${empty.length === 1 ? '' : 's'}`}
                </button>
                {showEmpty && empty.map(s => (
                  <div key={s.id} className="shelfitem" style={{ opacity: 0.55 }}>
                    <span className="ico"><Icon name="safehouse" size={18} /></span>
                    <div className="shelf-body"><div className="shelf-head"><b className="shelf-name">{s.name}</b><span className="shelf-price muted">empty</span></div></div>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

/** One product kind: what it is, how much, what it fetches, and the one move worth offering. */
function ProductRow({ product }: { product: ProductKind }) {
  const w = useWorld();
  const info = PRODUCT_INFO[product];
  const totals = select.stashTotals(w);
  const total = Math.round(totals[product]);
  const onYou = Math.round(w.player.stash[product] ?? 0);
  const quality = select.qualityOf(w.player, product);
  const style = select.styleOf(w, product);
  const unit = select.unitPrice(w, product);
  const [open, setOpen] = useState(false);
  const houses = playerSafehouses(w).filter(s => (s.stash[product] ?? 0) > 0);

  return (
    <div className="shelfitem">
      <IconTile of="product" id={product} size={32} tone={onYou > 0 ? 'gold' : 'muted'} />
      <div className="shelf-body">
        <div className="shelf-head">
          <b className="shelf-name">{style ? RECIPES[style].label : info.label}</b>
          <span className="shelf-price">{total} × {fmtMoney(unit)}</span>
        </div>
        <div className="shelf-meta">
          {style && <span className="tinychip">{info.label}</span>}
          {product !== 'hot_goods' && <TermChip id="quality">q{quality}</TermChip>}
          <span className="tinychip own">{fmtMoney(total * unit)} total</span>
          {onYou > 0 && <span className="tinychip">{onYou} on you</span>}
          {houses.map(s => <span key={s.id} className="tinychip">{Math.round(s.stash[product])} at {s.name}</span>)}
        </div>
        {open && <MoveRow product={product} onDone={() => setOpen(false)} />}
      </div>
      {(houses.length > 0 || onYou > 0) && playerSafehouses(w).length > 0 && (
        <button type="button" className="chip btn" onClick={() => setOpen(v => !v)}>{open ? 'Close' : 'Move'}</button>
      )}
    </div>
  );
}

/**
 * Moving, sized to what is actually there. Somebody holding two units gets "move both", not a
 * form with 5/10/25 presets that cannot be satisfied.
 */
function MoveRow({ product, onDone }: { product: ProductKind; onDone: () => void }) {
  const w = useWorld();
  const places: { id: string; label: string; have: number }[] = [
    { id: 'player', label: 'On you', have: Math.round(w.player.stash[product] ?? 0) },
    ...playerSafehouses(w).map(s => ({ id: s.id, label: s.name, have: Math.round(s.stash[product] ?? 0) })),
  ];
  const sources = places.filter(p => p.have > 0);
  const [from, setFrom] = useState(sources[0]?.id ?? 'player');
  const src = places.find(p => p.id === from) ?? places[0];
  const targets = places.filter(p => p.id !== from);
  const [to, setTo] = useState(targets[0]?.id ?? 'player');
  if (!src || !targets.length) return null;
  const have = src.have;
  // offer amounts that exist. Below ten units, "one" and "all" is the whole useful range.
  const steps = [...new Set([1, 5, 10, 25, 50].filter(n => n < have))].concat(have).filter(n => n > 0);
  const move = (n: number) => { if (act({ type: 'move_stash', from, to, product, amount: n })) onDone(); };

  return (
    <div className="movebox">
      <div className="shelf-meta">
        {sources.length > 1 && sources.map(p => (
          <button type="button" key={p.id} className={`tinychip${from === p.id ? ' own' : ''}`} onClick={() => setFrom(p.id)}>from {p.label} ({p.have})</button>
        ))}
      </div>
      <div className="shelf-meta">
        {targets.map(p => (
          <button type="button" key={p.id} className={`tinychip${to === p.id ? ' own' : ''}`} onClick={() => setTo(p.id)}>to {p.label}</button>
        ))}
      </div>
      <div className="shelf-meta">
        {steps.map(n => (
          <button type="button" key={n} className="chip btn" onClick={() => move(n)}>
            {n === have ? `Move all ${have}` : `Move ${n}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One location: what is in it, and what it is doing on its own. */
function PlaceRow({ id, name, icon }: { id: Id | 'player'; name: string; icon: string }) {
  const w = useWorld();
  const stash = id === 'player' ? w.player.stash : w.safehouses[id]?.stash;
  if (!stash) return null;
  const held = PRODUCTS.filter(p => (stash[p] ?? 0) > 0);
  const house = id === 'player' ? undefined : w.safehouses[id];
  const used = PRODUCTS.reduce((n, p) => n + (stash[p] ?? 0), 0);
  const automation = house ? house.productionIds.map(pid => ({ pr: w.productions[pid], boss: select.foremanOf(w, pid) })).filter(x => x.pr) : [];
  return (
    <div className="shelfitem">
      <IconTile name={icon} size={30} />
      <div className="shelf-body">
        <div className="shelf-head">
          <b className="shelf-name">{name}</b>
          {house && <span className="shelf-price muted">{Math.round(used)}/{house.capacity}</span>}
        </div>
        <div className="shelf-meta">
          {held.map(p => <span key={p} className="tinychip"><Icon of="product" id={p} size={11} /> {Math.round(stash[p])} {PRODUCT_INFO[p].label}</span>)}
          {!held.length && <span className="tinychip">empty</span>}
        </div>
        {automation.map(({ pr, boss }) => (
          <p key={pr!.id} className="shelf-detail">
            {boss
              ? <><span className="gold"><Icon name="foreman" size={12} /> {boss.name} is running it</span> — {pr!.recipe ? RECIPES[pr!.recipe].label : 'house standard'}, {pr!.lastOutput}/day, restocks and switches recipes on its own.</>
              : <>Making {pr!.recipe ? RECIPES[pr!.recipe].label : 'the house standard'}, {pr!.lastOutput}/day. No foreman — you are picking the recipe by hand.</>}
          </p>
        ))}
      </div>
    </div>
  );
}
