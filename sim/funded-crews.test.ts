/**
 * Staking a street crew: the third thing you can do with a corner.
 *
 * The other two end the crew — they come onto the payroll, or they come into your outfit. This
 * one leaves them exactly where they are and makes them a business partner you cannot supervise:
 * you pay for the shop, the racket is *theirs*, and a share of it comes back. Everything worth
 * testing here is about the half you do not control.
 */
import { describe, expect, it } from 'vitest';
import { FUNDED, RACKET_DEFS } from '@content/rackets';
import { APPROACHES } from '@content/lines';
import { PLAYER, can, dispatch, generateWorld, select, type StreetCrew, type World } from './index';
import { dissolveCrew, fundReason, fundTarget, makeCrew, parley, tickCrews } from './crews';
import { racketsAllowed } from './tiers';
import { Rng } from './rng';

const mk = (seed = 66) => { const w = generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'charm', seed }); w.pendingEvents = []; w.player.cash = 100_000; return w; };

/** A crew on a corner near you, whether or not this seed generated one. */
function crewNearby(w: World): StreetCrew {
  const near = Object.values(w.crews)[0];
  if (near) { w.player.currentBlockId = near.blockId; return near; }
  const b = Object.values(w.blocks).find(x => x.businessIds.length > 1 && x.id !== w.player.currentBlockId)!;
  const c = makeCrew(w, b, new Rng(9), (p: string) => `${p}_t${Object.keys(w.npcs).length}`);
  w.player.currentBlockId = c.blockId;
  return c;
}
/** Stake them, without rolling for it: the scene's dice are tested elsewhere. */
function stake(w: World, c: StreetCrew) {
  parley(w, c, w.npcs[c.bossId], 'fund', true, new Rng(3));
  return c.funded!;
}

describe('the offer', () => {
  it('is a fourth parley approach, not a new screen', () => {
    const ids = APPROACHES.parley.map(a => a.id);
    expect(ids).toContain('fund');
    expect(ids).toEqual(expect.arrayContaining(['tribute', 'join', 'warn']));
  });

  it('picks a real shop on their corner, priced above what it would cost you', () => {
    const w = mk(); const c = crewNearby(w);
    const t = fundTarget(w, c)!;
    expect(t, 'nothing on the corner to put money into').toBeTruthy();
    expect(t.biz.blockId).toBe(c.blockId);
    expect(racketsAllowed(t.biz), 'offered a racket that place cannot host').toContain(t.kind);
    expect(t.cost).toBeGreaterThan(RACKET_DEFS[t.kind].setupCost * 0.99);
    expect(FUNDED.setupMult).toBeGreaterThan(1);
  });

  it('is refused when you cannot pay for it, in words', () => {
    const w = mk(); const c = crewNearby(w);
    w.player.cash = 0; w.player.dirty = 0;
    expect(fundReason(w, c)).toMatch(/Needs \$/);
    expect(can(w, { type: 'parley', npcId: c.bossId, approach: 'fund' }).ok).toBe(false);
  });

  it('and when they already belong to somebody, including you', () => {
    const w = mk(); const c = crewNearby(w);
    c.tribute = PLAYER;
    expect(fundReason(w, c)).toMatch(/payroll/i);
    c.tribute = 'f_other';
    expect(fundReason(w, c)).toMatch(/somebody else/i);
  });
});

describe('what the arrangement is', () => {
  it('costs you the money and opens a racket that is theirs, not yours', () => {
    const w = mk(); const c = crewNearby(w);
    const t = fundTarget(w, c)!;
    const before = w.player.cash + w.player.dirty;
    const f = stake(w, c);
    expect(w.player.cash + w.player.dirty).toBe(before - t.cost);
    const r = select.fundedRacket(w, c)!;
    expect(r, 'nothing was opened').toBeTruthy();
    expect(r.owner, 'you took the racket instead of staking it').toBe(c.id);
    expect(w.player.racketIds, 'it landed on your books').not.toContain(r.id);
    expect(f.kick).toBe(FUNDED.kick);
    expect(f.paid).toBe(0);
  });

  it('is a real favour, so the relationship is allowed to go deeper afterwards', () => {
    const w = mk(); const c = crewNearby(w);
    const boss = w.npcs[c.bossId];
    const owed = boss.rel.favours ?? 0;
    stake(w, c);
    expect(boss.rel.favours ?? 0, 'fronting somebody their shop counted for nothing').toBeGreaterThan(owed);
    expect((boss.ledger ?? []).some(e => e.kind === 'favour')).toBe(true);
  });

  it('pays a share every day without you doing anything', () => {
    const w = mk(); const c = crewNearby(w);
    stake(w, c);
    w.player.dirty = 0;
    for (let d = 0; d < 10; d++) tickCrews(w, new Rng(d + 1));
    expect(w.player.dirty, 'ten days of somebody else running your money paid nothing').toBeGreaterThan(0);
    expect(c.funded!.paid).toBe(w.player.dirty);
  });

  it('and never the whole of it — that is the trade against a racket of your own', () => {
    const w = mk(); const c = crewNearby(w);
    stake(w, c);
    w.player.dirty = 0;
    tickCrews(w, new Rng(5));
    const r = select.fundedRacket(w, c)!;
    if (r.lastIncome > 0) expect(w.player.dirty).toBeLessThan(r.lastIncome);
  });
});

describe('the half you do not control', () => {
  it('they skim, and past a point somebody tells you', () => {
    const w = mk(); const c = crewNearby(w);
    const f = stake(w, c);
    // roll many days: the skim is a chance per day, so this asserts it happens at all rather
    // than that it happens on a particular morning
    for (let d = 0; d < 200; d++) tickCrews(w, new Rng(d * 31 + 7));
    expect(f.skimmed, 'two hundred days and nothing ever went missing').toBeGreaterThan(0);
    if (f.skimmed >= FUNDED.noticeAt) expect(f.noticed, 'they took a fortune and nobody ever noticed').toBeTruthy();
  });

  it('a crew that gets strong enough, and does not like you, simply keeps it', () => {
    const w = mk(); const c = crewNearby(w);
    stake(w, c);
    const racketId = c.funded!.racketId;
    c.strength = FUNDED.outgrowAt; c.mood = FUNDED.outgrowMood - 1;
    tickCrews(w, new Rng(11));
    expect(c.funded, 'they outgrew you and kept paying anyway').toBeUndefined();
    expect(w.rackets[racketId].owner, 'the racket came back to you for free').toBe(c.id);
    expect(w.player.racketIds).not.toContain(racketId);
  });

  it('...but one that likes you keeps sending it', () => {
    const w = mk(); const c = crewNearby(w);
    stake(w, c);
    c.strength = FUNDED.outgrowAt; c.mood = FUNDED.outgrowMood + 10;
    tickCrews(w, new Rng(11));
    expect(c.funded, 'a crew that likes you walked anyway').toBeTruthy();
  });

  it('taking the corner hands the racket to you: you did pay for it', () => {
    const w = mk(); const c = crewNearby(w);
    stake(w, c);
    const racketId = c.funded!.racketId;
    dissolveCrew(w, c, 'taken');
    expect(w.rackets[racketId].owner).toBe(PLAYER);
    expect(w.player.racketIds).toContain(racketId);
  });

  it('being swallowed by a faction hands it to them', () => {
    const w = mk(); const c = crewNearby(w);
    stake(w, c);
    const racketId = c.funded!.racketId;
    const f = Object.values(w.factions)[0];
    dissolveCrew(w, c, 'absorbed', f.id);
    expect(w.rackets[racketId].owner).toBe(f.id);
    expect(w.player.racketIds).not.toContain(racketId);
  });
});

describe('it is the racket system, not a second economy', () => {
  it('a staked racket is an ordinary racket on an ordinary business', () => {
    const w = mk(); const c = crewNearby(w);
    stake(w, c);
    const r = select.fundedRacket(w, c)!;
    const biz = w.businesses[r.businessId];
    expect(biz.racketIds).toContain(r.id);
    expect(RACKET_DEFS[r.kind]).toBeTruthy();
    expect(r.level).toBe(1);
  });

  it('and the whole thing survives a save: it is plain data on the crew', () => {
    const w = mk(); const c = crewNearby(w);
    stake(w, c);
    const round = JSON.parse(JSON.stringify(w)) as World;
    expect(round.crews[c.id].funded).toEqual(c.funded);
    const t = dispatch(round, { type: 'end_day' });
    expect(t.crews[c.id]).toBeTruthy();
  });
});
