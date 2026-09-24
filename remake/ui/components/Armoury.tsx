/**
 * Kit on screen: what a shop sells, what the armoury holds, and what each person carries. Every
 * number here comes from the item's own entry in `content/kit.ts` — the bonus shown is the bonus
 * `skillOf` adds, on that person, on every job and scene that reads the skill.
 */
import { ITEMS, SLOTS_ORDER, SLOT_LABEL, type ItemId } from '@r/content/kit';
import { select, PLAYER } from '@r/sim/index';
import type { Id } from '@r/sim/types';
import { Icon } from '@ui/icons';
import { useWorld } from '../store';
import { Chip, Do, Empty, Row, Section, fmt } from './kit';

export const itemLine = (id: ItemId) => { const d = ITEMS[id]; return [d.skill && d.bonus ? `+${d.bonus} ${d.skill}` : '', d.armour ? `stops ${Math.round(d.armour * 100)}%` : ''].filter(Boolean).join(' · '); };

/** What a shop, or the fixer, will sell you. */
export function ShopSection({ at, title }: { at: Id | 'fixer'; title: string }) {
  const w = useWorld();
  const items = select.shopItems(w, at);
  if (!items.length) return null;
  return (
    <Section title={title}>
      {items.sort((a, b) => ITEMS[a].price - ITEMS[b].price).map(id => {
        const d = ITEMS[id];
        return <Row key={id} left={<Icon name={d.icon} />} title={`${d.label} · ${SLOT_LABEL[d.slot].toLowerCase()}`} sub={`${itemLine(id)} — ${d.blurb}`} right={<Do action={{ type: 'buy_item', item: id, at }} label={fmt(d.price)} small />} />;
      })}
      <p className="r-note">It goes on you if you have nothing in that slot; otherwise into the armoury, to hand out.</p>
    </Section>
  );
}

/** One person's kit, slot by slot, with a way to take each thing back. */
export function KitList({ who }: { who: typeof PLAYER | Id }) {
  const w = useWorld();
  const kit = select.kitOf(w, who);
  const worn = SLOTS_ORDER.filter(s => kit[s]);
  if (!worn.length) return <Empty>{who === PLAYER ? 'You carry nothing worth mentioning.' : 'Nothing but what they walked in with.'}</Empty>;
  return <>{worn.map(s => { const id = kit[s]!; const d = ITEMS[id]; return <Row key={s} left={<Icon name={d.icon} />} title={d.label} sub={`${SLOT_LABEL[s]} · ${itemLine(id)}`} right={<Do action={{ type: 'unequip', from: who, slot: s }} label="Take back" small kind="ghost" />} />; })}
    {select.armourOf(kit) > 0 && <p className="r-note">Armour turns aside {Math.round(select.armourOf(kit) * 100)}% of the injuries a bad night brings, and the shot that would have killed.</p>}</>;
}

/** The armoury: what nobody is carrying, and who could carry it. */
export function ArmourySection() {
  const w = useWorld();
  const p = w.player;
  const crew = select.crew(w).filter(n => n.crew!.status !== 'jailed' && n.crew!.status !== 'held');
  const fx = w.fixerId ? w.npcs[w.fixerId] : undefined;
  return (
    <>
      <Section title="On you"><KitList who={PLAYER} /></Section>
      <Section title={`The armoury (${p.armoury.length})`}>
        {p.armoury.length ? p.armoury.map((id, i) => {
          const d = ITEMS[id];
          // the likeliest takers first: whoever is best at what the thing helps with
          const takers = crew.slice().sort((a, b) => (d.skill ? b.skills[d.skill] - a.skills[d.skill] : b.skills.muscle - a.skills.muscle)).slice(0, 3);
          return (
            <div key={`${id}${i}`} className="r-racket">
              <Row left={<Icon name={d.icon} />} title={d.label} sub={`${SLOT_LABEL[d.slot]} · ${itemLine(id)}`} />
              <div className="r-inline-actions">
                <Do action={{ type: 'equip', item: id, to: PLAYER }} label="Carry it" small />
                {takers.map(n => <Do key={n.id} action={{ type: 'equip', item: id, to: n.id }} label={`Give ${n.first}`} small kind="ghost" />)}
              </div>
            </div>
          );
        }) : <Empty>Empty. What you buy goes on you first; anything you replace comes back here.</Empty>}
      </Section>
      <Section title="Where to buy">
        <p className="r-note">Pawnshops, gyms, garages, scrapyards, boutiques and electronics shops sell what they sell — you have to be standing on the block. {fx ? (fx.rel.met ? `The fixer, ${select.fullName(fx)}, sells the serious things from anywhere.` : `The fixer, ${select.fullName(fx)}, sells the serious things once you have met.`) : ''}</p>
        {crew.length > 0 && <div className="r-chips">{crew.map(n => { const k = select.kitOf(w, n.id); const c = SLOTS_ORDER.filter(s => k[s]).length; return <Chip key={n.id} tone={c ? 'gold' : 'muted'}>{n.first}: {c ? SLOTS_ORDER.filter(s => k[s]).map(s => ITEMS[k[s]!].label.toLowerCase()).join(', ') : 'nothing'}</Chip>; })}</div>}
      </Section>
    </>
  );
}
