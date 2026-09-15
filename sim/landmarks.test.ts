/**
 * The handful of places there is only one of.
 *
 * Two claims. **Each landmark's job exists at exactly one address** — there is nowhere to
 * practise, which is what makes it a set-piece rather than a bigger warehouse. And **a landmark
 * is an ordinary business**: it is generated as one, owned as one, cased as one, and every system
 * in the game reads it without knowing it is special. The only thing that marks one is
 * `Business.landmark`, and the only thing that field does is unlock one op.
 */
import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '@content/landmarks';
import { OP_DEFS } from '@content/rackets';
import { dispatch, generateWorld, select, type World } from './index';

const mk = (seed = 300) => {
  let w = generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'brains', seed });
  w.pendingEvents = [];
  w = dispatch(w, { type: 'cheat', what: 'unlock' });
  return w;
};
const at = (w: World, id: string) => Object.values(w.businesses).filter(b => b.landmark === id);

describe('each one is placed, once, in every city', () => {
  it('all of them exist', () => {
    const w = mk();
    for (const lm of LANDMARKS) expect(at(w, lm.id).length, lm.name).toBe(1);
  });

  it('several seeds, so it is not one lucky world', () => {
    for (const seed of [4, 19, 77, 140]) {
      const w = mk(seed);
      for (const lm of LANDMARKS) expect(at(w, lm.id).length, `${lm.name} on seed ${seed}`).toBe(1);
    }
  });

  it('they are named, and they are the building the table says', () => {
    const w = mk();
    for (const lm of LANDMARKS) {
      const b = at(w, lm.id)[0];
      expect(b.name).toBe(lm.name);
      expect(b.type).toBe(lm.type);
    }
  });

  it('and nothing is a landmark twice', () => {
    const w = mk();
    const marks = Object.values(w.businesses).map(b => b.landmark).filter(Boolean);
    expect(new Set(marks).size).toBe(marks.length);
  });
});

describe('a landmark is an ordinary business', () => {
  it('it has an owner, income, a value and a block, like anything else', () => {
    const w = mk();
    for (const lm of LANDMARKS) {
      const b = at(w, lm.id)[0];
      expect(w.npcs[b.ownerId]?.alive, lm.name).toBe(true);
      expect(b.baseIncome, lm.name).toBeGreaterThan(0);
      expect(b.value, lm.name).toBeGreaterThan(0);
      expect(w.blocks[b.blockId], lm.name).toBeTruthy();
      expect(w.blocks[b.blockId].businessIds).toContain(b.id);
    }
  });

  it('and it is not standing on derelict ground', () => {
    const w = mk();
    for (const lm of LANDMARKS) expect(w.blocks[at(w, lm.id)[0].blockId].abandoned, lm.name).toBeFalsy();
  });
});

describe('each job exists at exactly one address', () => {
  it('the planner offers one target and it is the right building', () => {
    const w = mk();
    for (const lm of LANDMARKS) {
      const targets = select.opTargets(w, lm.op);
      expect(targets.length, `${OP_DEFS[lm.op].label} offered ${targets.length} places`).toBe(1);
      expect(targets[0].landmark).toBe(lm.id);
    }
  });

  it('and aiming it anywhere else is refused', () => {
    // the easiest one, with every *other* requirement already satisfied, so the only thing left
    // to refuse is the address
    let w = mk();
    w = dispatch(w, { type: 'cheat', what: 'safehouse' });
    w.player.respect = 80; w.player.cash = 500_000;
    const lm = LANDMARKS.find(l => !select.opLocked(w, l.op))!;
    expect(lm, 'nothing was open, so the address could not be the thing refusing').toBeTruthy();
    const elsewhere = Object.values(w.businesses).find(b => !b.landmark)!;
    const why = select.opLocked(w, lm.op, { businessId: elsewhere.id });
    expect(why, 'a landmark job worked on an ordinary building').toBeTruthy();
    expect(why).toMatch(/Only at/);
  });

  it('every landmark job is a distinct kind, with its own payoff', () => {
    const kinds = LANDMARKS.map(l => l.op);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const lm of LANDMARKS) {
      const d = OP_DEFS[lm.op];
      expect(d, lm.op).toBeTruthy();
      expect(d.requires?.landmarkTarget, lm.op).toBe(lm.id);
      expect(d.target).toBe('business');
    }
  });

  it('they are not all the same job wearing five names', () => {
    // the point of a set-piece is that it is its own thing: different needs, different tiers,
    // and at least one that pays in something other than cash
    const defs = LANDMARKS.map(l => OP_DEFS[l.op]);
    expect(new Set(defs.map(d => d.tier)).size).toBeGreaterThan(1);
    expect(new Set(defs.map(d => Object.keys(d.needs).sort().join(','))).size).toBeGreaterThan(1);
    expect(defs.some(d => d.payout[1] === 0 || d.lootKind), 'every one of them just pays cash').toBe(true);
  });
});

describe('and the jobs are reachable, which is the point of putting them there', () => {
  it('the easiest of them opens for a player who has got somewhere', () => {
    let w = mk();
    w = dispatch(w, { type: 'cheat', what: 'safehouse' });
    w.player.respect = 60; w.player.cash = 500_000;
    const reachable = LANDMARKS.filter(lm => !select.opLocked(w, lm.op));
    expect(reachable.length, 'not one landmark job is reachable at all').toBeGreaterThan(0);
  });

  it('and the hardest is gated behind real work rather than being free', () => {
    const hardest = LANDMARKS.map(l => OP_DEFS[l.op]).sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0))[0];
    expect(Object.keys(hardest.requires ?? {}).length).toBeGreaterThan(1);
  });
});
