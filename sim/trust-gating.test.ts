/**
 * Being liked is not leverage.
 *
 * The rule under test: ordinary dealing takes somebody to friendly and stops, and a major
 * concession — protection, a place in the crew, a friendly price — needs a reason on top of
 * that. Leverage or reciprocity, checked separately from the trust number itself.
 */
import { describe, expect, it } from 'vitest';
import { CONCESSION, FAMILIARITY } from '@content/standing';
import { PLAYER, can, dispatch, generateWorld, select } from './index';
import { concessionReason, doFavour, leverageOver, trustCeiling } from './standing';
import { protectRoute } from './economy';
import { known, owes } from './test-util';
import type { Npc, World } from './types';

const mk = (seed = 6) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'muscle', seed });
/**
 * A place where the ordinary doors are open, which is what these tests are about.
 *
 * The tier matters and used not to be checked: at tier 3 nobody is frightened of you and nobody
 * behind the counter can say yes, so `protectReason` refuses for a reason that has nothing to do
 * with trust or favours. The helper picked the first unprotected place on the block, and the day
 * a new business type shifted the generator that happened to be an importer — the test then
 * failed reporting a refusal that was entirely correct. Naming the tier is what the helper always
 * meant.
 */
const softTarget = (w: World) => select.businessesIn(w, select.startBlock(w).id).find(b => b.ownedBy === 'npc' && !b.protection && select.tierOf(b) === 1)!;
/** Somebody with nothing over them: no ground held, no books read, nobody of theirs in a cellar. */
function clean(w: World, n: Npc): Npc {
  const b = w.blocks[n.homeBlockId];
  delete b.influence[PLAYER];
  n.tap = undefined; n.ratted = undefined;
  for (const c of select.connectionsOf(w, n)) c.npc.hostage = undefined;
  return n;
}

describe('ordinary trust plateaus', () => {
  it('a hundred pleasant visits cannot take anybody past the ordinary ceiling', () => {
    let w = mk();
    const t = softTarget(w); const owner = w.npcs[t.ownerId];
    w.player.currentBlockId = t.blockId; w.player.skills.charm = 10;
    for (let i = 0; i < 120; i++) { w.player.ap = 4; w.player.cash = 5000; w = dispatch(w, { type: 'visit', npcId: owner.id, approach: 'listen' }); }
    expect(w.npcs[owner.id].rel.trust).toBeLessThanOrEqual(CONCESSION.ordinary);
  });

  it('and only a settled favour lifts that ceiling, a step at a time, never to 100', () => {
    const w = mk(); const n = known(w, w.npcs[softTarget(w).ownerId]);
    expect(trustCeiling(n)).toBe(CONCESSION.ordinary);
    doFavour(w, n);
    expect(trustCeiling(n)).toBe(CONCESSION.ordinary + CONCESSION.perFavour);
    for (let i = 0; i < 20; i++) doFavour(w, n);
    expect(trustCeiling(n)).toBe(CONCESSION.favourCeiling);
    expect(trustCeiling(n)).toBeLessThan(100);
  });
});

describe('a major concession needs leverage or reciprocity, not a bigger number', () => {
  it('trust at the ceiling, with nothing behind it, is refused', () => {
    const w = mk(); const t = softTarget(w);
    const owner = clean(w, known(w, w.npcs[t.ownerId], { trust: CONCESSION.ordinary }));
    owner.rel.fear = 0; owner.rel.respect = 0; owner.nerve = 90;  // the fear door is shut
    expect(protectRoute(w, owner, 0.15)).toBeUndefined();
    const r = can(w, { type: 'protect', businessId: t.id, rate: 0.15 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/not a reason to hand you/i);
  });

  it('the same trust plus one settled favour is a yes', () => {
    const w = mk(); const t = softTarget(w);
    const owner = clean(w, owes(w, w.npcs[t.ownerId], CONCESSION.ordinary));
    owner.rel.fear = 0; owner.rel.respect = 0; owner.nerve = 90;
    expect(protectRoute(w, owner, 0.15)).toBe('friend');
    expect(can(w, { type: 'protect', businessId: t.id, rate: 0.15 }).ok).toBe(true);
  });

  it('the same trust plus leverage is also a yes — holding the street counts, so do their books', () => {
    for (const give of [
      (w: World, n: Npc) => { w.blocks[n.homeBlockId].influence[PLAYER] = CONCESSION.groundInfluence; },
      (w: World, n: Npc) => { n.ratted = w.day; },
      (w: World, n: Npc) => { n.tap = { since: w.day }; },
    ]) {
      const w = mk(); const t = softTarget(w);
      const owner = clean(w, known(w, w.npcs[t.ownerId], { trust: CONCESSION.ordinary }));
      owner.rel.fear = 0; owner.rel.respect = 0; owner.nerve = 90;
      expect(protectRoute(w, owner, 0.15)).toBeUndefined();
      give(w, owner);
      expect(leverageOver(w, owner)).toBeDefined();
      expect(protectRoute(w, owner, 0.15)).toBe('friend');
    }
  });

  it('leverage on its own is not a door: it layers on trust, it does not replace it', () => {
    const w = mk(); const t = softTarget(w);
    const owner = clean(w, known(w, w.npcs[t.ownerId], { trust: 0 }));
    owner.rel.fear = 0; owner.rel.respect = 0; owner.nerve = 90;
    w.blocks[owner.homeBlockId].influence[PLAYER] = 100;
    expect(leverageOver(w, owner)).toBeDefined();
    expect(protectRoute(w, owner, 0.15)).toBeUndefined();
  });

  it('old dirt goes stale: what you found in their books stops being leverage', () => {
    const w = mk(); const n = clean(w, known(w, w.npcs[softTarget(w).ownerId]));
    n.ratted = w.day - CONCESSION.dirtDays;
    expect(leverageOver(w, n)?.kind).toBe('dirt');
    n.ratted = w.day - CONCESSION.dirtDays - 1;
    expect(leverageOver(w, n)).toBeUndefined();
  });

  it('a place in the crew wants the same thing a straight pitch cannot buy on its own', () => {
    const w = mk();
    const n = clean(w, known(w, Object.values(w.npcs).find(x => x.role === 'patron' && x.alive)!, { trust: CONCESSION.ordinary }));
    w.player.currentBlockId = n.homeBlockId;
    expect(concessionReason(w, n, 'a place in your crew')).toBeDefined();
    const pitch = can(w, { type: 'recruit', npcId: n.id, approach: 'promise' });
    expect(pitch.ok).toBe(false);
    doFavour(w, n);
    expect(can(w, { type: 'recruit', npcId: n.id, approach: 'promise' }).ok).toBe(true);
    // and a wage is a transaction, so it never wanted a favour in the first place
    const w2 = mk(); const n2 = clean(w2, known(w2, Object.values(w2.npcs).find(x => x.role === 'patron' && x.alive)!, { trust: 10 }));
    w2.player.currentBlockId = n2.homeBlockId; w2.player.cash = 5000;
    expect(can(w2, { type: 'recruit', npcId: n2.id, approach: 'cut' }).ok).toBe(true);
  });

  it('a friendly price on a business is a concession too', () => {
    const w = mk(); const t = softTarget(w);
    const owner = clean(w, known(w, w.npcs[t.ownerId], { trust: 40 }));
    owner.rel.fear = 0; owner.traits = [];
    w.player.cash = 10_000_000;
    const offer = Math.round(t.value * 0.95);
    expect(can(w, { type: 'buy_business', businessId: t.id, offer }).ok).toBe(false);
    doFavour(w, owner);
    expect(can(w, { type: 'buy_business', businessId: t.id, offer }).ok).toBe(true);
  });

  it('and the familiarity floor sits under all of it', () => {
    const w = mk(); const t = softTarget(w);
    const owner = clean(w, w.npcs[t.ownerId]);
    owner.rel.metDay = undefined; owner.rel.contacts = undefined; owner.rel.favours = 1; owner.rel.trust = 90;
    expect(concessionReason(w, owner, 'protection')).toMatch(/never actually dealt/i);
    owner.rel.metDay = w.day - FAMILIARITY.minDays; owner.rel.contacts = FAMILIARITY.minContacts;
    expect(concessionReason(w, owner, 'protection')).toBeUndefined();
  });
});
