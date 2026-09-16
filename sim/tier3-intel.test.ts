/**
 * The three institutions the tier pass closed, and the only door it left open.
 *
 * A gallery, an accountant's office and an importer cannot be shaken down, protected or hosted
 * on — `TIER_EXCLUDES[3]` is 'all' and that is deliberate. What they are worth instead is what a
 * bank and an armoured depot have been worth since the intel pass: somebody inside. These check
 * that the door is the *same* door — one `IntelKind` table, one `openIntel`, one lifetime — and
 * not three new systems wearing its name.
 */
import { describe, expect, it } from 'vitest';
import { CONSIGN, INTEL, OFFSHORE, TRADE, type IntelKind } from '@content/intel';
import { BUSINESS_DEFS } from '@content/businesses';
import { OP_DEFS } from '@content/rackets';
import { generateWorld, type Npc, type World } from './index';
import { Rng } from './rng';
import { consignTake, consigners, intelSourceFor, laneDiscount, laneHolders, offshoreCapacity, offshoreHolders, offshorePaper, openIntel, tickOffshore } from './intel';
import { openCases } from './cases';
import { racketsAllowed } from './tiers';
import { typed } from './test-util';

const NEW: IntelKind[] = ['consign', 'offshore', 'trade'];
const mk = (seed = 44) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'brains', seed });

/** Somebody who works at one of these places, got at. Returns undefined if the seed has none. */
function insider(w: World, kind: IntelKind): Npc | undefined {
  const biz = typed(w, INTEL[kind].from);
  const n = w.npcs[biz.ownerId];
  n.ratted = w.day; n.known = true;
  if (!n.favouriteBusinessIds.includes(biz.id)) n.favouriteBusinessIds.push(biz.id);
  return openIntel(w, n, new Rng(1)) ? n : undefined;
}

describe('the table, not three new systems', () => {
  it('each new kind is an entry in the same INTEL record, with the same fields', () => {
    for (const k of NEW) {
      const d = INTEL[k];
      expect(d, k).toBeTruthy();
      expect(d.lifetime, `${k} never goes stale`).toBeGreaterThan(0);
      expect(d.from, `${k} comes from nowhere`).toBeTruthy();
      expect(BUSINESS_DEFS[d.from].tier, `${k} comes out of a place that is not an institution`).toBe(3);
      expect(d.blurb.length).toBeGreaterThan(20);
    }
  });

  it('the mapping is data: the source business type decides the kind', () => {
    const w = mk();
    for (const k of NEW) {
      const biz = typed(w, INTEL[k].from);
      const n = w.npcs[biz.ownerId];
      if (!n.favouriteBusinessIds.includes(biz.id)) n.favouriteBusinessIds.push(biz.id);
      expect(intelSourceFor(w, n)?.kind, INTEL[k].from).toBe(k);
    }
  });

  it('and none of those places will ever host a racket, whatever else changes', () => {
    const w = mk();
    for (const k of NEW) {
      expect(racketsAllowed(typed(w, INTEL[k].from)), INTEL[k].from).toEqual([]);
    }
  });
});

describe('what each one actually pays', () => {
  it('a consignment window pays in goods, not cash', () => {
    const w = mk(); const n = insider(w, 'consign')!;
    expect(consigners(w).map(x => x.id)).toContain(n.id);
    expect(consignTake(w, n)).toBeGreaterThan(0);
    expect(CONSIGN.base).toBeGreaterThan(0);
  });

  it('moves nothing at all until the player switches it on', () => {
    /**
     * Reported by a player: *"my cash is getting auto washed in entirety at the end of each day
     * even without a laundering racket."* They were right. An arrangement a `rat` happened to open
     * converted their dirty money every day at 72%, for ever, with no way to stop it and a line in
     * the log one day in seven — and there was no UI for an arrangement at all, so it was invisible
     * as well as unstoppable. An arrangement is a thing you *have*; laundering is a thing you *do*.
     */
    const w = mk(); const n = insider(w, 'offshore')!;
    const cap = offshoreCapacity(w, n);
    w.player.dirty = cap * 2; w.player.cash = 0; w.player.launderedToday = 0;
    expect(n.intel!.on, 'it arrived already running').toBeFalsy();
    tickOffshore(w, n, new Rng(2));
    expect(w.player.dirty, 'it laundered without being asked').toBe(cap * 2);
    expect(w.player.cash).toBe(0);
  });

  it('and then washes more than anything you could build', () => {
    const w = mk(); const n = insider(w, 'offshore')!;
    expect(offshoreHolders(w).map(x => x.id)).toContain(n.id);
    const cap = offshoreCapacity(w, n);
    expect(cap).toBeGreaterThan(OFFSHORE.capacity - 1);
    w.player.dirty = cap * 2; w.player.cash = 0; w.player.launderedToday = 0;
    n.intel!.on = true;
    tickOffshore(w, n, new Rng(2));
    expect(w.player.dirty, 'nothing went through').toBe(cap * 2 - cap);
    expect(w.player.cash, 'nothing came back').toBeGreaterThan(0);
    expect(w.player.cash, 'it came back at par, which would make it free money').toBeLessThan(cap);
  });

  it('says so every day it runs, not one day in seven', () => {
    // Six days out of seven the money moved and nothing said why, which is most of how it read as
    // the game helping itself to the player's cash.
    const w = mk(); const n = insider(w, 'offshore')!;
    w.player.dirty = 50_000; w.player.launderedToday = 0; n.intel!.on = true;
    const before = w.log.length;
    tickOffshore(w, n, new Rng(2));
    expect(w.log.slice(before).map(e => e.text).join(' ')).toMatch(/came back clean/);
  });

  it('...and the paper is the price: enough of it and there is a file with your money on it', () => {
    const w = mk(); const n = insider(w, 'offshore'); if (!n) return;
    expect(offshorePaper(n)).toBe(0);
    n.intel!.paper = OFFSHORE.filesAt;
    w.player.dirty = 5000;
    // surfaceChance is small per day on purpose, so roll it until it lands rather than once
    let filed = false;
    for (let i = 0; i < 200 && !filed; i++) {
      const t = structuredClone(w); t.rng = i * 977 + 13;
      tickOffshore(t, t.npcs[n.id], new Rng(i));
      if (openCases(t).some(c => c.kind === 'fraud')) { filed = true; expect(t.npcs[n.id].intel).toBeUndefined(); }
    }
    expect(filed, 'a trail that long never surfaced once in two hundred days').toBe(true);
  });

  it('a trade lane pays nothing today and a great deal on the day, like the depot route', () => {
    const w = mk(); const n = insider(w, 'trade')!;
    expect(laneHolders(w).map(x => x.id)).toContain(n.id);
    for (const kind of TRADE.helps) {
      expect(OP_DEFS[kind as keyof typeof OP_DEFS], `${kind} is not an op`).toBeTruthy();
      expect(laneDiscount(w, kind), kind).toBeGreaterThan(0);
    }
    expect(laneDiscount(w, 'mugging'), 'a lane helped a mugging').toBe(0);
  });
});

describe('nothing here explains how anything works', () => {
  it('the blurbs describe an arrangement and a person, never a method', () => {
    const banned = /\b(how to|step \d|account number|routing|swift|shell layering|invoice template|smurf)\b/i;
    for (const k of NEW) expect(INTEL[k].blurb, k).not.toMatch(banned);
  });
});
