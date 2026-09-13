/**
 * `can()` runs during render — every button in the UI asks it whether it is enabled. So a
 * throw in `can()` is not a bad button, it is a blank screen: React unmounts the tree and
 * the player loses the game they were looking at.
 *
 * This walks a whole generated city and asks every question the UI asks, on every block,
 * business and person in it. Nothing here may throw, whoever holds the block.
 */
import { describe, expect, it } from 'vitest';
import { OP_DEFS, RACKET_DEFS } from '@content/rackets';
import { PLAYER, can, generateWorld, select, type Action, type World } from './index';

const mk = (seed: number) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
/** A seed whose city has street crews holding corners — the case that used to crash. */
const withCrews = (): World => {
  for (const seed of [12, 8, 44, 3, 23, 5]) { const w = mk(seed); if (Object.keys(w.crews).length) return w; }
  throw new Error('no seed produced a street crew');
};

/** Every action the block, business and person sheets can put on screen for this world. */
function uiActions(w: World): Action[] {
  const out: Action[] = [{ type: 'end_day' }, { type: 'hire_lawyer' }, { type: 'launder', amount: 500 }, { type: 'petition_seat' }];
  const crewIds = select.idleCrew(w).slice(0, 3).map(n => n.id);
  for (const b of Object.values(w.blocks)) {
    out.push({ type: 'move', toBlockId: b.id });
    out.push({ type: 'rent_safehouse', blockId: b.id });      // the one that threw on a crew corner
    out.push({ type: 'plan_op', kind: 'takeover', crewIds, targetBlockId: b.id });
    out.push({ type: 'plan_op', kind: 'claim_abandoned', crewIds, targetBlockId: b.id });
    out.push({ type: 'plan_op', kind: 'scout_block', crewIds, targetBlockId: b.id });
    out.push({ type: 'sell_product', product: 'booze', amount: 1, blockId: b.id });
  }
  for (const z of Object.values(w.businesses)) {
    out.push({ type: 'shakedown', businessId: z.id }, { type: 'protect', businessId: z.id, rate: 0.15 },
      { type: 'buy_business', businessId: z.id, offer: z.value }, { type: 'sell_business', businessId: z.id },
      { type: 'insure', businessId: z.id }, { type: 'repair', businessId: z.id });
    for (const kind of Object.keys(RACKET_DEFS) as (keyof typeof RACKET_DEFS)[]) out.push({ type: 'start_racket', businessId: z.id, kind });
  }
  for (const n of Object.values(w.npcs)) {
    out.push({ type: 'visit', npcId: n.id }, { type: 'threaten', npcId: n.id }, { type: 'read', npcId: n.id },
      { type: 'recruit', npcId: n.id }, { type: 'parley', npcId: n.id }, { type: 'gift', npcId: n.id, amount: 500 },
      { type: 'bribe_official', npcId: n.id, amount: 1000 }, { type: 'audit', npcId: n.id }, { type: 'fire', npcId: n.id },
      { type: 'launder_with_fixer', npcId: n.id, amount: 250 }, { type: 'resolve_hostage', npcId: n.id, mode: 'release' },
      { type: 'assign', npcId: n.id }, { type: 'plan_op', kind: 'hit', crewIds, targetNpcId: n.id });
  }
  for (const f of Object.keys(w.factions)) {
    out.push({ type: 'pay_tribute', factionId: f, amount: 500 }, { type: 'declare', factionId: f, stance: 'beef' },
      { type: 'sit_down', factionId: f, offer: { kind: 'alliance' } }, { type: 'plan_op', kind: 'raid_rival', crewIds, targetFactionId: f });
  }
  for (const kind of Object.keys(OP_DEFS) as (keyof typeof OP_DEFS)[]) out.push({ type: 'plan_op', kind, crewIds });
  return out;
}

describe('can() survives every question the UI asks', () => {
  it('answers for every block, business and person in a city with street crews', () => {
    const w = withCrews();
    expect(Object.keys(w.crews).length).toBeGreaterThan(0);
    for (const a of uiActions(w)) {
      const answer = (() => { try { return can(w, a); } catch (e) { throw new Error(`can(${a.type}) threw: ${(e as Error).message}`); } })();
      expect(typeof answer.ok, a.type).toBe('boolean');
      if (!answer.ok) expect(answer.reason.length, a.type).toBeGreaterThan(0);
    }
  });

  it('answers the same way on a block a street crew holds', () => {
    const w = withCrews();
    const crew = Object.values(w.crews)[0];
    // a street crew controls its corner: `factionOf` hands back a crew id, not a faction id
    expect(select.blockController(w, crew.blockId)).toBe(crew.id);
    expect(w.factions[crew.id]).toBeUndefined();
    const rent = can(w, { type: 'rent_safehouse', blockId: crew.blockId });
    expect(typeof rent.ok).toBe('boolean');
    // a crew that has no quarrel with you does not stop you renting; a hostile one does
    w.crews[crew.id].mood = -40;
    const hostile = can(w, { type: 'rent_safehouse', blockId: crew.blockId });
    expect(hostile.ok).toBe(false);
    expect(hostile.ok === false && hostile.reason).toContain(crew.name);
    w.crews[crew.id].tribute = PLAYER;   // on your payroll: no objection from them
    expect(can(w, { type: 'rent_safehouse', blockId: crew.blockId }).ok).toBe(true);
  });

  it('still lets a faction at war stop you', () => {
    const w = withCrews();
    const f = Object.values(w.factions)[0];
    const block = Object.values(w.blocks).find(b => select.blockController(w, b.id) === f.id);
    if (!block) return;                  // no faction holds a block outright in this city
    f.stance[PLAYER] = 'war';
    const r = can(w, { type: 'rent_safehouse', blockId: block.id });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain(f.name);
  });
});
