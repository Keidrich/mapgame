/**
 * Why you would ever run anything but protection.
 *
 * Protection costs nothing to set up and works on any business, so once it worked there was no
 * reason to pay for anything else — every other kind was flavour nobody had a reason to touch.
 * Two forces now make the choice real: flooding one kind into one district decays what each
 * additional one is worth, and kinds that feed each other pay a bonus for running together.
 */
import { describe, expect, it } from 'vitest';
import { SATURATION, SYNERGIES } from '@content/territory';
import { RACKET_DEFS } from '@content/rackets';
import { generateWorld, select, type Business, type Racket, type RacketKind, type World } from './index';
import { racketIncome, launderCapacity } from './economy';
import { mkRacket } from './reducer';
import { sameKindInDistrict, saturationMult, synergyFor, yieldMult } from './territory';
import { BUSINESS_DEFS } from '@content/businesses';

const mk = (seed = 5) => { const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed }); w.pendingEvents = []; w.player.cash = 500000; return w; };

/** Businesses in one district, so "same district" is not an accident of the seed. */
function inOneDistrict(w: World, n: number): Business[] {
  const byDistrict = new Map<string, Business[]>();
  // tier 1 and 2 only: an institution hosts no rackets at all, so a saturation test that lands on
  // one is measuring nothing. Saturation is about crowding a district with your own kind.
  for (const b of Object.values(w.businesses)) {
    if (BUSINESS_DEFS[b.type].tier === 3) continue;
    const d = w.blocks[b.blockId]?.districtId; if (!d) continue;
    (byDistrict.get(d) ?? byDistrict.set(d, []).get(d)!).push(b);
  }
  const best = [...byDistrict.values()].sort((a, b) => b.length - a.length)[0];
  expect(best.length).toBeGreaterThanOrEqual(n);
  return best.slice(0, n);
}
/** Install a racket of a kind on a business regardless of what that type normally allows. */
function install(w: World, biz: Business, kind: RacketKind, day = w.day): Racket {
  biz.ownedBy = 'player';
  if (!w.player.businessIds.includes(biz.id)) w.player.businessIds.push(biz.id);
  const r = mkRacket(w, kind, biz);
  r.startedDay = day;
  return r;
}

describe('saturation', () => {
  it('leaves the first ones of a kind alone — the early game cannot afford to diversify', () => {
    const w = mk();
    const places = inOneDistrict(w, 5);
    const rackets = places.slice(0, SATURATION.free).map((b, i) => install(w, b, 'numbers', 10 + i));
    for (const r of rackets) expect(saturationMult(w, r)).toBe(1);
  });

  it('decays every one past the grace, compounding', () => {
    const w = mk();
    const places = inOneDistrict(w, 5);
    const rackets = places.map((b, i) => install(w, b, 'numbers', 10 + i));
    const mults = rackets.map(r => saturationMult(w, r));
    expect(mults.slice(0, SATURATION.free)).toEqual(Array(SATURATION.free).fill(1));
    for (let i = SATURATION.free; i < mults.length; i++) {
      expect(mults[i], `rank ${i}`).toBeLessThan(mults[i - 1]);
      expect(mults[i]).toBeCloseTo(Math.pow(SATURATION.decay, i - SATURATION.free + 1), 6);
    }
  });

  it('measurably: each additional one of a kind yields less than the first did', () => {
    const w = mk();
    const places = inOneDistrict(w, 5);
    const takes: number[] = [];
    for (const [i, b] of places.entries()) {
      const r = install(w, b, 'numbers', 10 + i);
      takes.push(racketIncome(w, r));
    }
    // the last is worth clearly less than the first, on comparable businesses
    const first = takes[0]; const last = takes[takes.length - 1];
    expect(last).toBeLessThan(first);
    expect(saturationMult(w, w.player.racketIds.map(id => w.rackets[id]).find(r => r.startedDay === 14)!)).toBeLessThan(1);
  });

  it('is per district: the same kind in another district is untouched', () => {
    const w = mk();
    const here = inOneDistrict(w, 3);
    for (const [i, b] of here.entries()) install(w, b, 'numbers', 10 + i);
    const otherDistrict = Object.values(w.businesses).find(b => w.blocks[b.blockId]?.districtId !== w.blocks[here[0].blockId]?.districtId)!;
    const far = install(w, otherDistrict, 'numbers', 20);
    expect(saturationMult(w, far)).toBe(1);
  });

  it('is per kind: a different kind alongside is untouched', () => {
    const w = mk();
    const places = inOneDistrict(w, 5);
    for (const [i, b] of places.slice(0, 4).entries()) install(w, b, 'numbers', 10 + i);
    const other = install(w, places[4], 'bookmaking', 20);
    expect(saturationMult(w, other)).toBe(1);
  });

  it('never floors at zero — a saturated racket still ticks over', () => {
    const w = mk();
    const places = inOneDistrict(w, 8);
    const rackets = places.map((b, i) => install(w, b, 'numbers', 10 + i));
    for (const r of rackets) expect(saturationMult(w, r)).toBeGreaterThanOrEqual(SATURATION.floor);
  });

  it('dilutes the newest rather than retroactively punishing what was already running', () => {
    const w = mk();
    const places = inOneDistrict(w, 4);
    const old = install(w, places[0], 'numbers', 5);
    expect(saturationMult(w, old)).toBe(1);
    for (const [i, b] of places.slice(1).entries()) install(w, b, 'numbers', 30 + i);
    expect(saturationMult(w, old), 'the one you have run for a month should not get worse').toBe(1);
  });

  it('saturates laundering capacity too, not only income', () => {
    const w = mk();
    const places = inOneDistrict(w, 5);
    // measured on one racket as the district fills around it, not by comparing different
    // businesses: since the tier pass those differ in base income, which swamps the effect
    // Started last, so it is the one saturation dilutes — the grace protects what you have run
    // longest, which is the whole shape of `saturationMult`.
    const mine = install(w, places[places.length - 1], 'laundering', 30);
    const alone = launderCapacity(w, mine);
    for (const [i, b] of places.slice(0, -1).entries()) install(w, b, 'laundering', 10 + i);
    expect(launderCapacity(w, mine)).toBeLessThan(alone);
  });
});

describe('synergy', () => {
  it('every declared pair names a real kind, in both directions', () => {
    for (const [kind, s] of Object.entries(SYNERGIES)) {
      expect(RACKET_DEFS[kind as RacketKind], kind).toBeTruthy();
      expect(RACKET_DEFS[s!.needs], s!.needs).toBeTruthy();
      expect(s!.bonus).toBeGreaterThan(0);
      expect(s!.why.length).toBeGreaterThan(8);
    }
  });

  it('pays only when the feeder is actually running in the same district', () => {
    const w = mk();
    const places = inOneDistrict(w, 3);
    const fence = install(w, places[0], 'fencing', 10);
    expect(synergyFor(w, fence)).toBeUndefined();
    expect(yieldMult(w, fence)).toBe(1);

    install(w, places[1], 'dealing', 11);
    expect(synergyFor(w, fence)?.needs).toBe('dealing');
    expect(yieldMult(w, fence)).toBeCloseTo(1 + SYNERGIES.fencing!.bonus, 6);
  });

  it('does not pay when the feeder is in a different district', () => {
    const w = mk();
    const here = inOneDistrict(w, 2);
    const fence = install(w, here[0], 'fencing', 10);
    const elsewhere = Object.values(w.businesses).find(b => w.blocks[b.blockId]?.districtId !== w.blocks[here[0].blockId]?.districtId)!;
    install(w, elsewhere, 'dealing', 11);
    expect(synergyFor(w, fence)).toBeUndefined();
  });

  it('does not pay while the feeder is shut down', () => {
    const w = mk();
    const places = inOneDistrict(w, 2);
    const fence = install(w, places[0], 'fencing', 10);
    const dealer = install(w, places[1], 'dealing', 11);
    expect(synergyFor(w, fence)).toBeTruthy();
    dealer.disrupted = 3;
    expect(synergyFor(w, fence)).toBeUndefined();
  });

  it('makes a diversified pair beat two of the same kind, which is the whole point', () => {
    const flooded = mk();
    const a = inOneDistrict(flooded, 4);
    const sameKind = a.map((b, i) => install(flooded, b, 'numbers', 10 + i));
    const floodedTotal = sameKind.reduce((n, r) => n + yieldMult(flooded, r), 0);

    const mixed = mk();
    const b2 = inOneDistrict(mixed, 4);
    const kinds: RacketKind[] = ['numbers', 'bookmaking', 'dealing', 'fencing'];
    const mixedRackets = b2.map((b, i) => install(mixed, b, kinds[i], 10 + i));
    const mixedTotal = mixedRackets.reduce((n, r) => n + yieldMult(mixed, r), 0);

    expect(mixedTotal).toBeGreaterThan(floodedTotal);
  });
});

describe('the outlook a player actually sees', () => {
  it('ranks kinds by what they would really pay here, saturation and synergy included', () => {
    const w = mk();
    const places = inOneDistrict(w, 4);
    for (const [i, b] of places.slice(0, 3).entries()) install(w, b, 'numbers', 10 + i);
    const target = places[3];
    target.ownedBy = 'player'; w.player.businessIds.push(target.id);
    const ranked = select.racketsByOutlook(w, target);
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i].income).toBeLessThanOrEqual(ranked[i - 1].income);
    const numbers = ranked.find(x => x.kind === 'numbers');
    if (numbers) expect(numbers.saturation).toBeLessThan(1);
  });

  it('lists the same kinds `availableRackets` does, and no others', () => {
    const w = mk();
    const biz = Object.values(w.businesses)[0];
    biz.ownedBy = 'player'; w.player.businessIds.push(biz.id);
    expect(select.racketsByOutlook(w, biz).map(x => x.kind).sort()).toEqual(select.availableRackets(w, biz).slice().sort());
  });
});

describe('the new kinds', () => {
  it('each has a real definition and somewhere to live', () => {
    const w = mk();
    for (const kind of ['union_dues', 'counterfeiting', 'after_hours', 'policy_bank'] as RacketKind[]) {
      const def = RACKET_DEFS[kind];
      expect(def, kind).toBeTruthy();
      expect(def.setupCost, kind).toBeGreaterThan(0);
      const homes = Object.values(w.businesses).filter(b => select.availableRackets(w, { ...b, ownedBy: 'player', racketIds: [] }).includes(kind));
      expect(homes.length, `${kind} has nowhere to live`).toBeGreaterThan(0);
    }
  });

  it('none of them is free, so protection stays the only no-cost way in', () => {
    const free = (Object.keys(RACKET_DEFS) as RacketKind[]).filter(k => RACKET_DEFS[k].setupCost === 0);
    expect(free).toEqual(['protection']);
  });

  it('sameKindInDistrict groups by owner, so a rival\'s rackets do not dilute yours', () => {
    const w = mk();
    const places = inOneDistrict(w, 3);
    const mine = install(w, places[0], 'numbers', 10);
    const theirs = mkRacket(w, 'numbers', places[1]);
    theirs.owner = Object.values(w.factions)[0].id;
    w.player.racketIds = w.player.racketIds.filter(id => id !== theirs.id);
    expect(sameKindInDistrict(w, mine).map(r => r.id)).toEqual([mine.id]);
    expect(saturationMult(w, mine)).toBe(1);
  });
});
