/**
 * Fear is a consequence, not a formula.
 *
 * The thing under test is the gap: the same "success", against the same person, buys wildly
 * different fear depending on what the player actually had to do to produce it.
 */
import { describe, expect, it } from 'vitest';
import { STAKES, FAMILIARITY, type Stake } from '@content/standing';
import { dispatch, generateWorld, select } from './index';
import { fearCeiling, fearGain } from './standing';
import { known } from './test-util';
import type { Npc, World } from './types';

const mk = (seed = 4) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'muscle', seed });
const anyOwner = (w: World): Npc => Object.values(w.npcs).find(n => n.role === 'owner' && n.alive)!;

describe('fear scales with what the act cost, not with a flat formula', () => {
  it('a cheap scene and a demonstrated act buy very different amounts of fear', () => {
    const w = mk(); const n = known(w, anyOwner(w));
    n.rel.fear = 0;
    const talk = fearGain(w, n, 20, 'words');
    const hurt = fearGain(w, n, 20, 'violence');
    expect(hurt).toBeGreaterThan(talk * 2);
  });

  it('talk plateaus: repeating it forever cannot take anybody past the words ceiling', () => {
    const w = mk(); const n = known(w, anyOwner(w));
    n.rel.fear = 0;
    for (let i = 0; i < 50; i++) n.rel.fear += fearGain(w, n, 20, 'words');
    expect(n.rel.fear).toBeCloseTo(STAKES.words.ceiling, 5);
    // and one more stare after that is worth literally nothing
    expect(fearGain(w, n, 20, 'words')).toBe(0);
  });

  it('each stake has its own plateau, and they go up in order', () => {
    const order: Stake[] = ['words', 'backed', 'property', 'violence', 'grave'];
    for (let i = 1; i < order.length; i++) {
      expect(STAKES[order[i]].ceiling).toBeGreaterThan(STAKES[order[i - 1]].ceiling);
      expect(STAKES[order[i]].mult).toBeGreaterThan(STAKES[order[i - 1]].mult);
    }
    const w = mk();
    for (const s of order) {
      const n = known(w, anyOwner(w)); n.rel.fear = 0;
      for (let i = 0; i < 60; i++) n.rel.fear += fearGain(w, n, 20, s);
      expect(n.rel.fear).toBeCloseTo(STAKES[s].ceiling, 5);
    }
  });

  it('a hard stare is worth nothing to somebody who has already watched you hurt a man', () => {
    const w = mk(); const n = known(w, anyOwner(w));
    n.rel.fear = 70;                       // they saw something
    expect(fearGain(w, n, 25, 'words')).toBe(0);
    expect(fearGain(w, n, 25, 'violence')).toBeGreaterThan(0);
  });

  it('the threaten scene charges the stake its approach actually put on the table', () => {
    // stare is words; bringing people, or naming their family, is backed and reaches further
    const run = (approach: 'stare' | 'crew') => {
      let w = mk(9);
      const start = select.startBlock(w);
      const t = select.businessesIn(w, start.id).find(b => b.ownedBy === 'npc')!;
      const owner = known(w, w.npcs[t.ownerId]);
      owner.rel.fear = 0; owner.nerve = 5; owner.traits = ['coward'];
      w.player.currentBlockId = t.blockId; w.player.skills.muscle = 10; w.player.fear = 90;
      // give them somebody to bring
      const mate = Object.values(w.npcs).find(x => x.alive && !x.crew && x.id !== owner.id)!;
      mate.crew = { loyalty: 60, cut: 0, status: 'idle', statusDays: 0, joinedDay: 1 }; mate.role = 'crew'; w.player.crewIds.push(mate.id);
      // no end_day in here on purpose: the claim is about what the scene itself charges, and a
      // night in between brings events, faction pressure and gossip that move fear for their own
      // reasons. AP is topped up directly so the only thing under test is the threaten.
      for (let i = 0; i < 40; i++) { w.player.ap = 4; w = dispatch(w, { type: 'threaten', npcId: owner.id, approach }); }
      return w.npcs[owner.id].rel.fear;
    };
    const stare = run('stare'), crew = run('crew');
    expect(stare).toBeLessThanOrEqual(STAKES.words.ceiling);
    expect(crew).toBeGreaterThan(STAKES.words.ceiling);
    expect(crew).toBeLessThanOrEqual(STAKES.backed.ceiling);
  });

  it('a stranger can only be made so nervous by talk — but a demonstrated act needs no introduction', () => {
    const w = mk(); const n = anyOwner(w);
    n.rel.metDay = undefined; n.rel.contacts = undefined;
    expect(fearCeiling(w, n, 'words')).toBe(FAMILIARITY.shallowFear);
    expect(fearCeiling(w, n, 'backed')).toBe(FAMILIARITY.shallowFear);
    expect(fearCeiling(w, n, 'violence')).toBe(STAKES.violence.ceiling);
  });
});
