import { useState } from 'react';
import { select } from '@sim/index';
import type { Id, Npc } from '@sim/types';
import { CATEGORY_LABELS, FAMILY_LABELS, ITEM_DEFS, type ItemDef } from '@content/items';
import { fmtMoney } from '@ui/derive';
import { useWorld } from '@ui/store';
import { Act } from './Act';
import { Info, Term, TermChip } from './Info';
import { IconTile } from '@ui/icons';

/**
 * Kit: what you own and what you are carrying. Equipment, not stock — the Stash is bulk
 * goods you sell by the unit, this is the three things you take on a job.
 */
export function KitSection() {
  const w = useWorld();
  const owned = select.ownedItems(w);
  const carried = select.equippedItems(w);
  const slots = select.equipSlotsLeft(w);
  // one row per kind of thing, however many of it you have
  const kinds = [...new Set(owned.map(i => i.id))].map(id => ITEM_DEFS[id]);
  return (
    <>
      <div className="section-title">Kit ({carried.length}/{select.EQUIP_MAX} carried)<Info id="kit" /></div>
      {!owned.length && <p className="small muted">Nothing but what you stand up in. Pawn shops and back-room markets sell the tools of the trade.</p>}
      {owned.length > 0 && (
        <div className="col" style={{ gap: 6 }}>
          {kinds.map(item => <KitRow key={item.id} item={item} />)}
        </div>
      )}
      {owned.length > 0 && slots === 0 && <p className="small muted mt8">Hands full. Put something down to pick something else up.</p>}
    </>
  );
}

function KitRow({ item }: { item: ItemDef }) {
  const w = useWorld();
  const have = select.ownedCount(w, item.id);
  const on = select.equippedCount(w, item.id);
  return (
    <div className={`shelfitem${on ? ' sel' : ''}`}>
      <IconTile of="item" id={item.id} size={32} tone={on ? 'gold' : undefined} />
      <div className="shelf-body">
        <div className="shelf-head">
          <b className="shelf-name">{item.label}{have > 1 && <span className="muted"> ×{have}</span>}</b>
          {on > 0 && <span className="shelf-price gold">carried{on > 1 ? ` ×${on}` : ''}</span>}
        </div>
        <p className="shelf-detail">{item.detail}</p>
      </div>
      <div className="col" style={{ gap: 4, flex: 'none' }}>
        <TermChip id={`itemCat:${item.category}`} title={item.family ? FAMILY_LABELS[item.family] : CATEGORY_LABELS[item.category]} body={item.blurb}>{item.family ? FAMILY_LABELS[item.family] : CATEGORY_LABELS[item.category]}</TermChip>
        {on < have && <Act action={{ type: 'equip', itemId: item.id, on: true }} label="Carry" small />}
        {on > 0 && <Act action={{ type: 'equip', itemId: item.id, on: false }} label="Leave" kind="ghost" small />}
      </div>
    </div>
  );
}

/**
 * A pawn shop's shelf, or a back room's. Buying takes clean cash; selling pays dirty, like anything
 * else.
 *
 * **Who it is for** is picked once, at the top, and every row obeys it — rather than a second Buy
 * button on each of five rows, which is the same choice asked five times and a shelf you cannot
 * read on a phone. The picker is the only door kit has into a crew member's hands, so it is absent
 * only when you genuinely have nobody to buy for.
 */
export function MarketSection({ businessId }: { businessId: Id }) {
  const w = useWorld();
  const biz = w.businesses[businessId];
  // Somebody you could actually hand a thing to. The reducer's rule, mirrored: yours, alive, and
  // not in a cell. A narrower list here than the one `can()` allows is how the last three
  // door-missing bugs happened, so this is the same three conditions and nothing else.
  const crew = w.player.crewIds.map(id => w.npcs[id]).filter((n): n is Npc => !!n?.crew && n.alive && n.crew.status !== 'dead' && n.crew.status !== 'jailed');
  const [forId, setForId] = useState<Id | ''>('');
  if (!biz || !select.isMarket(biz)) return null;
  const buyer = forId ? w.npcs[forId] : undefined;
  const stock = select.marketStock(biz);
  // Whoever is selling is whoever is buying: the "they will take these off you" list is theirs when
  // the picker is on them, or there is no way to get a thing back out of a crew member's bag.
  const seller = buyer ?? w.player;
  const mine = [...new Set((seller.items ?? []))].map(id => ITEM_DEFS[id]).filter(Boolean);
  return (
    <>
      <div className="section-title">On the shelf<Info id="kit" /></div>
      {crew.length > 0 && (
        <div className="row mt8">
          <label className="field" htmlFor="market-for">Buying for</label>
          <select id="market-for" className="select grow" value={forId} onChange={e => setForId(e.target.value as Id | '')}>
            <option value="">Yourself</option>
            {crew.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
      )}
      {buyer && <p className="small muted mt8">It goes straight into {buyer.name}&rsquo;s hands, and they will remember it. Equip it from their character sheet.</p>}
      <div className="col mt8" style={{ gap: 6 }}>
        {stock.map(item => (
          <div key={item.id} className="shelfitem">
            <IconTile of="item" id={item.id} size={32} />
            <div className="shelf-body">
              <div className="shelf-head">
                <b className="shelf-name">{item.label}</b>
                <span className="shelf-price">{fmtMoney(select.buyPrice(item))}</span>
              </div>
              <div className="shelf-meta">
                <span className="tinychip">{item.family ? FAMILY_LABELS[item.family] : CATEGORY_LABELS[item.category]}</span>
                {item.underCounter && <span className="tinychip warn">under the counter</span>}
                {(seller.items ?? []).includes(item.id) && <span className="tinychip own">{buyer ? 'they own one' : 'you own one'}</span>}
              </div>
              <p className="shelf-detail">{item.detail}</p>
            </div>
            <Act action={{ type: 'buy_item', businessId, itemId: item.id, forNpcId: forId || undefined }} label={buyer ? `Buy for ${buyer.name.split(' ')[0]}` : 'Buy'} kind="primary" small />
          </div>
        ))}
      </div>
      {mine.length > 0 && (
        <>
          <div className="section-title">They will take these off {buyer ? buyer.name : 'you'}</div>
          <div className="col" style={{ gap: 6 }}>
            {mine.map(item => (
              <div key={item.id} className="shelfitem">
                <IconTile of="item" id={item.id} size={32} />
                <div className="shelf-body">
                  <div className="shelf-head">
                    <b className="shelf-name">{item.label}</b>
                    <span className="shelf-price">{fmtMoney(select.sellPrice(w, item))}</span>
                  </div>
                  <div className="shelf-meta"><span className="tinychip"><Term id="dirty">dirty cash</Term></span></div>
                </div>
                <Act action={{ type: 'sell_item', businessId, itemId: item.id, forNpcId: forId || undefined }} label="Sell" kind="ghost" small />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
