import { select } from '@sim/index';
import type { Id } from '@sim/types';
import { CATEGORY_LABELS, FAMILY_LABELS, ITEM_DEFS, type ItemDef } from '@content/items';
import { TRAIT_LABELS } from '@content/rackets';
import { useWorld } from '@ui/store';
import { Act, Section } from './Act';
import { Info, Term, TermChip } from './Info';
import { Meter, SkillBars } from './Meter';
import { IconTile } from '@ui/icons';

/**
 * One of your people, as a sheet: what they can do, what it takes to shake them, and what they
 * are carrying.
 *
 * The loadout is the part that did not exist. Kit was the player's alone for its whole life, so
 * "give the good gun to the man who is actually doing the job" had no door anywhere in the app —
 * the third time this year a rule existed with no way to reach it. `EQUIP_MAX` is **per person**,
 * so the three slots here are theirs and nothing to do with yours.
 *
 * What is *not* here on purpose: a way to move a thing from your pockets into theirs. Kit reaches a
 * crew member by being bought for them at a shop (`buy_item` with `forNpcId`), which is one act in
 * one place rather than a second inventory-to-inventory transfer with its own rules about who has
 * to be standing where.
 */
export function CharacterSheet({ npcId }: { npcId: Id }) {
  const w = useWorld();
  const n = w.npcs[npcId];
  const c = n?.crew;
  if (!n || !c) return null;
  const carried = select.equippedItems(w, n);
  const owned = select.ownedItems(w, n);
  const kinds = [...new Set(owned.map(i => i.id))].map(id => ITEM_DEFS[id]);
  const first = n.name.split(' ')[0];
  return (
    <Section id={`sheet:${npcId}`} title="Character sheet" defaultOpen={false} info={<Info id="kit" />}>
      <div className="chips">
        <TermChip id="crewStatus" className={`s-${c.status}`}>{c.status}{c.statusDays > 0 && ` (${c.statusDays}d)`}</TermChip>
        {select.isKnown(n)
          ? n.traits.map(t => <TermChip key={t} id={`trait:${t}`}>{TRAIT_LABELS[t] ?? t}</TermChip>)
          : <TermChip id="known"><span className="muted">Traits unknown</span></TermChip>}
        <TermChip id="nerve" title="Nerve" body="What it takes to move them off a position. 0–100.">Nerve {select.isKnown(n) ? n.nerve : '?'}</TermChip>
      </div>
      <div className="mt12"><Meter label={<Term id="loyalty">Loyalty</Term>} value={c.loyalty} color="var(--gold)" /></div>
      <div className="mt12"><SkillBars skills={n.skills} /></div>

      {/* Named, because this panel is mounted inside somebody else's sheet and the one mistake
          worth designing against is equipping the wrong person. */}
      <div className="section-title">{first}&rsquo;s loadout ({carried.length}/{select.EQUIP_MAX} carried)</div>
      {!owned.length && (
        <p className="small muted">
          {first} carries nothing but what they stand up in. Buy something for them at a pawn shop, a
          computer store or a back room — pick their name from &ldquo;Buying for&rdquo; at the top of the shelf.
        </p>
      )}
      {owned.length > 0 && <div className="col" style={{ gap: 6 }}>{kinds.map(item => <LoadoutRow key={item.id} npcId={npcId} item={item} />)}</div>}
      {owned.length > 0 && select.equipSlotsLeft(w, n) === 0 && (
        <p className="small muted mt8">Hands full. Take something off them before they pick anything else up.</p>
      )}
      {carried.length > 0 && (
        // The one thing a player will get wrong otherwise: kitting out five people does not stack.
        <p className="small muted mt8">
          <Term id="jobKit">On a job</Term>, one item of each kind counts across everybody on it — whichever is the
          dearest of its kind. Arming the whole crew with the same thing buys you nothing; arming them with{' '}
          <i>different</i> things does.
        </p>
      )}
    </Section>
  );
}

function LoadoutRow({ npcId, item }: { npcId: Id; item: ItemDef }) {
  const w = useWorld();
  const n = w.npcs[npcId];
  const have = select.ownedCount(w, item.id, n);
  const on = select.equippedCount(w, item.id, n);
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
        {on < have && <Act action={{ type: 'equip', itemId: item.id, on: true, npcId }} label="Carry" small />}
        {on > 0 && <Act action={{ type: 'equip', itemId: item.id, on: false, npcId }} label="Leave" kind="ghost" small />}
      </div>
    </div>
  );
}
