import { select } from '@sim/index';
import type { Id } from '@sim/types';
import { CATEGORY_LABELS, FAMILY_LABELS, ITEM_DEFS, type ItemDef } from '@content/items';
import { fmtMoney } from '@ui/derive';
import { useWorld } from '@ui/store';
import { Act } from './Act';
import { Info, Term, TermChip } from './Info';

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
      <span className="ico">{item.icon}</span>
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

/** A pawn shop's shelf, or a back room's. Buying takes clean cash; selling pays dirty, like anything else. */
export function MarketSection({ businessId }: { businessId: Id }) {
  const w = useWorld();
  const biz = w.businesses[businessId];
  if (!biz || !select.isMarket(biz)) return null;
  const stock = select.marketStock(biz);
  const mine = [...new Set((w.player.items ?? []))].map(id => ITEM_DEFS[id]).filter(Boolean);
  return (
    <>
      <div className="section-title">On the shelf<Info id="kit" /></div>
      <div className="col" style={{ gap: 6 }}>
        {stock.map(item => (
          <div key={item.id} className="shelfitem">
            <span className="ico">{item.icon}</span>
            <div className="shelf-body">
              <div className="shelf-head">
                <b className="shelf-name">{item.label}</b>
                <span className="shelf-price">{fmtMoney(select.buyPrice(item))}</span>
              </div>
              <div className="shelf-meta">
                <span className="tinychip">{item.family ? FAMILY_LABELS[item.family] : CATEGORY_LABELS[item.category]}</span>
                {item.underCounter && <span className="tinychip warn">under the counter</span>}
                {(w.player.items ?? []).includes(item.id) && <span className="tinychip own">you own one</span>}
              </div>
              <p className="shelf-detail">{item.detail}</p>
            </div>
            <Act action={{ type: 'buy_item', businessId, itemId: item.id }} label="Buy" kind="primary" small />
          </div>
        ))}
      </div>
      {mine.length > 0 && (
        <>
          <div className="section-title">They will take these off you</div>
          <div className="col" style={{ gap: 6 }}>
            {mine.map(item => (
              <div key={item.id} className="shelfitem">
                <span className="ico">{item.icon}</span>
                <div className="shelf-body">
                  <div className="shelf-head">
                    <b className="shelf-name">{item.label}</b>
                    <span className="shelf-price">{fmtMoney(select.sellPrice(w, item))}</span>
                  </div>
                  <div className="shelf-meta"><span className="tinychip"><Term id="dirty">dirty cash</Term></span></div>
                </div>
                <Act action={{ type: 'sell_item', businessId, itemId: item.id }} label="Sell" kind="ghost" small />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
