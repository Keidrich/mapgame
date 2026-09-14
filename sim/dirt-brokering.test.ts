/**
 * Selling what you learned. A secret is a one-off good: somebody pays for it, their opinion of
 * you improves, and roughly one time in three the people it is about work out whose mouth it
 * came from. The price is about who the secret is *about* and how badly the buyer already wants
 * that person hurt — which is why it is worth ratting a boss rather than a doorman.
 */
import { describe, expect, it } from 'vitest';
import { DIRT } from '@content/cyber';
import { PLAYER, can, dispatch, generateWorld, type Npc, type Secret, type World } from './index';
import { dirtPrice, learnSecret, secrets, sellDirt, unsoldSecrets } from './cyber';
import { Rng } from './rng';

const mk = (seed = 11) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'tech', seed });

/** Put a secret about `n` in the player's pocket without caring how it got there. */
function know(w: World, n: Npc): Secret {
  const s: Secret = { id: `sc_${(w.player.secrets ?? []).length}`, npcId: n.id, kind: 'agenda', text: `${n.name} owes somebody.`, day: w.day };
  w.player.secrets = [...secrets(w), s];
  return s;
}

/** A boss and a rival faction that is not theirs. */
function bossAndRival(w: World) {
  const f = Object.values(w.factions).find(x => x.alive && x.bossId)!;
  const boss = w.npcs[f.bossId!];
  const rival = Object.values(w.factions).find(x => x.alive && x.id !== f.id)!;
  rival.stance[PLAYER] = 'peace';
  return { f, boss, rival };
}

describe('learning one', () => {
  it('a look through somebody with something going on hands back a secret filed against them', () => {
    const w = mk();
    const n = Object.values(w.npcs).find(x => x.alive && !x.crew && x.agenda && !x.agenda.done)!;
    const s = learnSecret(w, n, new Rng(3));
    expect(s).toBeDefined();
    expect(s!.npcId).toBe(n.id);
    expect(unsoldSecrets(w).map(x => x.id)).toContain(s!.id);
    expect(n.ratted).toBe(w.day);
  });
});

describe('what it is worth', () => {
  it('dirt on a boss beats dirt on a nobody', () => {
    const w = mk();
    const { f, boss, rival } = bossAndRival(w);
    const nobody = Object.values(w.npcs).find(x => x.alive && !x.crew && x.faction === f.id && x.id !== boss.id)!;
    const a = know(w, boss); const b = know(w, nobody);
    expect(dirtPrice(w, a, rival.id)).toBeGreaterThan(dirtPrice(w, b, rival.id));
    expect(DIRT.bossMult).toBeGreaterThan(DIRT.lieutenantMult);
  });

  it('a buyer already at war with the subject\'s people pays more than a buyer at peace', () => {
    const w = mk();
    const { f, boss, rival } = bossAndRival(w);
    const s = know(w, boss);
    rival.stance[f.id] = 'peace';
    const calm = dirtPrice(w, s, rival.id);
    rival.stance[f.id] = 'war';
    expect(dirtPrice(w, s, rival.id)).toBeGreaterThan(calm);
  });

  it('never comes back as nothing', () => {
    const w = mk();
    const { boss, rival } = bossAndRival(w);
    w.player.skills.charm = 0;
    expect(dirtPrice(w, know(w, boss), rival.id)).toBeGreaterThanOrEqual(200);
  });
});

describe('selling it', () => {
  it('pays dirty cash and buys standing with the people who bought it', () => {
    const w = mk(); w.pendingEvents = [];
    const { boss, rival } = bossAndRival(w);
    const s = know(w, boss);
    const price = dirtPrice(w, s, rival.id);
    const before = { dirty: w.player.dirty, cash: w.player.cash, standing: rival.standing[PLAYER] };

    expect(can(w, { type: 'sell_dirt', secretId: s.id, factionId: rival.id }).ok).toBe(true);
    const t = dispatch(w, { type: 'sell_dirt', secretId: s.id, factionId: rival.id });

    expect(t.player.dirty - before.dirty).toBe(price);
    expect(t.player.cash).toBe(before.cash);                                  // never clean
    expect(t.factions[rival.id].standing[PLAYER]).toBeGreaterThan(before.standing);
    expect(secrets(t).find(x => x.id === s.id)!.soldTo).toBe(rival.id);
  });

  it('is worth nothing twice', () => {
    const w = mk(); w.pendingEvents = [];
    const { boss, rival } = bossAndRival(w);
    const s = know(w, boss);
    const t = dispatch(w, { type: 'sell_dirt', secretId: s.id, factionId: rival.id });
    expect(can(t, { type: 'sell_dirt', secretId: s.id, factionId: rival.id }).ok).toBe(false);
    expect(unsoldSecrets(t).length).toBe(0);
  });

  it('cannot be sold to the subject\'s own people, or to anybody at war with you', () => {
    const w = mk(); w.pendingEvents = [];
    const { f, boss, rival } = bossAndRival(w);
    const s = know(w, boss);
    expect(can(w, { type: 'sell_dirt', secretId: s.id, factionId: f.id }).ok).toBe(false);
    rival.stance[PLAYER] = 'war';
    expect(can(w, { type: 'sell_dirt', secretId: s.id, factionId: rival.id }).ok).toBe(false);
  });

  it('sometimes gets back to the subject\'s people, and costs standing there when it does', () => {
    let blowback = false;
    for (let i = 0; i < 30 && !blowback; i++) {
      const w = mk(); w.pendingEvents = [];
      const { f, boss, rival } = bossAndRival(w);
      const before = f.standing[PLAYER];
      sellDirt(w, know(w, boss), rival.id, new Rng(i * 19 + 1));
      if (f.standing[PLAYER] < before) {
        blowback = true;
        expect(f.grudges.some(g => g.startsWith('sold_dirt:'))).toBe(true);
      }
    }
    expect(blowback).toBe(true);
    expect(DIRT.blowback).toBeGreaterThan(0);
    expect(DIRT.blowback).toBeLessThan(1);   // and it is not a certainty, or nobody would ever sell
  });
});
