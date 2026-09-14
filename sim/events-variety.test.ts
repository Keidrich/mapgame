/**
 * The event deck, and the rule it has to obey.
 *
 * An event about a system may only come up when that system is actually in play for this player.
 * The deck already did this for money — `whale` needs a bookmaking racket, `debtor` needs a
 * float — but the police did not obey it: "a detective is asking around" weighted purely on
 * owning any racket, so a player's very first protection job on day one could summon a
 * plainclothes cop who had supposedly been watching it for two nights. Reported from real play.
 *
 * These tests draw thousands of cards from worlds that lack each system and assert the relevant
 * card never appears, then add the system and assert it does.
 */
import { describe, expect, it } from 'vitest';
import { CARD_STALE_AT, POLICE_NOTICE, RACKET_WATCHABLE_AFTER } from '@content/events';
import { PLAYER, dispatch, generateWorld, select, type Business, type World } from './index';
import { drawEvents } from './events';
import { mkRacket } from './reducer';
import { addCard, rollCard } from './cyber';
import { Rng } from './rng';

const mk = (seed = 5) => { const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed }); w.pendingEvents = []; return w; };
const own = (w: World, biz: Business) => { biz.ownedBy = 'player'; if (!w.player.businessIds.includes(biz.id)) w.player.businessIds.push(biz.id); return biz; };

/**
 * Every event kind this world can produce, over many draws. `drawEvents` only appends to
 * `pendingEvents` (and ticks `nextId`), so one clone is enough — cloning a whole city per draw
 * made this file take a minute on its own.
 */
function kindsDrawn(w: World, draws = 250): Set<string> {
  const seen = new Set<string>();
  const t = structuredClone(w);
  for (let i = 0; i < draws; i++) {
    t.pendingEvents = [];
    drawEvents(t, new Rng(i * 31 + 7));
    for (const e of t.pendingEvents) seen.add(e.kind);
  }
  return seen;
}

describe('the day-one detective', () => {
  it('does not come for a brand new player with their first racket', () => {
    const w = mk();
    const biz = Object.values(w.businesses)[0];
    mkRacket(w, 'protection', biz);
    expect(w.day).toBe(1);
    expect(w.player.heat).toBeLessThan(POLICE_NOTICE);
    expect(kindsDrawn(w)).not.toContain('cops_sniffing');
  });

  it('still does not, however many rackets you opened today', () => {
    const w = mk();
    for (const biz of Object.values(w.businesses).slice(0, 6)) mkRacket(w, 'protection', biz);
    expect(kindsDrawn(w)).not.toContain('cops_sniffing');
  });

  it('needs the racket to be old enough for somebody to have watched it two nights', () => {
    const w = mk();
    w.player.heat = 80;                       // plenty of interest
    const biz = Object.values(w.businesses)[0];
    mkRacket(w, 'protection', biz);           // …but opened this morning
    expect(kindsDrawn(w)).not.toContain('cops_sniffing');

    const older = structuredClone(w);
    older.day += RACKET_WATCHABLE_AFTER;
    expect(kindsDrawn(older)).toContain('cops_sniffing');
  });

  it('needs the police to have actually noticed you', () => {
    const w = mk();
    const biz = Object.values(w.businesses)[0];
    mkRacket(w, 'protection', biz);
    w.day += RACKET_WATCHABLE_AFTER + 2;      // old enough…
    w.player.heat = 0;                        // …and nobody is looking
    for (const a of select.authorities(w)) { a.attention = 0; a.posture = 'routine'; }
    w.cases = [];
    expect(kindsDrawn(w)).not.toContain('cops_sniffing');

    const hot = structuredClone(w);
    hot.player.heat = POLICE_NOTICE + 10;
    expect(kindsDrawn(hot)).toContain('cops_sniffing');
  });

  it('an escalated Authority is enough on its own, even at low heat', () => {
    const w = mk();
    const biz = Object.values(w.businesses)[0];
    mkRacket(w, 'protection', biz);
    w.day += RACKET_WATCHABLE_AFTER + 2;
    w.player.heat = 0;
    const a = select.authorities(w)[0];
    a.attention = 70; a.posture = 'task_force';
    expect(kindsDrawn(w)).toContain('cops_sniffing');
  });
});

describe('every new event weights on the state it is about', () => {
  const cases: { kind: string; setUp: (w: World) => void; hint: string }[] = [
    {
      kind: 'kin_turns_up', hint: 'somebody you have wronged who has people',
      setUp: w => { const n = Object.values(w.npcs).find(x => x.alive && !x.crew && (x.connections ?? []).length > 0)!; n.rel.trust = -60; },
    },
    {
      kind: 'quiet_asking', hint: 'an official in a building, and some heat',
      setUp: w => { w.player.heat = POLICE_NOTICE; },
    },
    {
      kind: 'tap_feed', hint: 'a tap actually running',
      setUp: w => { const n = Object.values(w.npcs).find(x => x.alive && !x.crew)!; n.tap = { since: w.day - 2 }; },
    },
    {
      kind: 'card_expiring', hint: 'a card going stale',
      setUp: w => { const c = rollCard(w, new Rng(2)); c.freshness = CARD_STALE_AT - 5; addCard(w, c); },
    },
    {
      kind: 'kit_offer', hint: 'a market and money to spend',
      setUp: w => { w.player.cash = 5000; },
    },
    {
      kind: 'kit_noticed', hint: 'kit carried and somebody hostile',
      setUp: w => { w.player.items = ['pistol']; w.player.equipped = ['pistol']; const f = Object.values(w.factions)[0]; f.stance[PLAYER] = 'beef'; f.standing[PLAYER] = -60; },
    },
    {
      kind: 'claim_questions', hint: 'a derelict block you have claimed',
      setUp: w => { const b = Object.values(w.blocks).find(x => x.abandoned) ?? Object.values(w.blocks)[0]; b.abandoned = { known: true, claimedBy: PLAYER }; },
    },
  ];

  for (const c of cases) {
    it(`${c.kind} never fires without ${c.hint}`, () => {
      const bare = mk();
      // strip everything the new cards key on, so only the one under test is in question
      for (const n of Object.values(bare.npcs)) { n.connections = []; n.tap = undefined; n.rel.trust = 0; }
      bare.player.items = []; bare.player.equipped = []; bare.player.cards = []; bare.player.cash = 0;
      bare.player.heat = 0; bare.cases = [];
      for (const a of select.authorities(bare)) { a.attention = 0; a.posture = 'routine'; }
      for (const b of Object.values(bare.blocks)) b.abandoned = undefined;
      for (const f of Object.values(bare.factions)) { f.stance[PLAYER] = 'peace'; f.standing[PLAYER] = 10; }
      expect(kindsDrawn(bare), `${c.kind} fired with nothing to hang it on`).not.toContain(c.kind);
    });

    it(`${c.kind} can fire once there is ${c.hint}`, () => {
      const w = mk();
      c.setUp(w);
      expect(kindsDrawn(w, 400), `${c.kind} never fired even with its state present`).toContain(c.kind);
    });
  }
});

describe('the deck as a whole', () => {
  it('offers opportunities as well as problems', () => {
    const w = mk();
    w.player.cash = 20000; w.player.items = []; w.player.equipped = [];
    const drawn = kindsDrawn(w, 400);
    const opportunities = ['kit_offer', 'opportunity', 'patron_tip', 'offer_sale'];
    expect(opportunities.some(k => drawn.has(k)), 'a quiet player should be offered something good').toBe(true);
  });

  it('every card it produces has options and a resolvable id', () => {
    const w = mk();
    w.player.cash = 20000; w.player.heat = 50;
    for (let i = 0; i < 120; i++) {
      const t = structuredClone(w); t.pendingEvents = [];
      drawEvents(t, new Rng(i * 13 + 1));
      for (const e of t.pendingEvents) {
        expect(e.options.length, e.kind).toBeGreaterThan(0);
        expect(e.id, e.kind).toBeTruthy();
        expect(e.title.length, e.kind).toBeGreaterThan(3);
        for (const o of e.options) expect(o.label.length, `${e.kind}:${o.id}`).toBeGreaterThan(1);
      }
    }
  });

  it('never hands a card the reducer cannot resolve', () => {
    const w = mk();
    w.player.cash = 50000; w.player.heat = 60; w.player.items = ['pistol']; w.player.equipped = ['pistol'];
    const n = Object.values(w.npcs).find(x => x.alive && !x.crew && (x.connections ?? []).length > 0);
    if (n) { n.rel.trust = -60; n.tap = { since: w.day - 3 }; }
    const c = rollCard(w, new Rng(3)); c.freshness = 20; addCard(w, c);
    own(w, Object.values(w.businesses)[0]);

    for (let i = 0; i < 60; i++) {
      let t = structuredClone(w); t.pendingEvents = [];
      drawEvents(t, new Rng(i * 17 + 5));
      for (const e of t.pendingEvents) {
        for (const o of e.options) {
          const fresh = structuredClone(t);
          const ev = fresh.pendingEvents.find(x => x.id === e.id)!;
          expect(() => dispatch(fresh, { type: 'resolve_event', eventId: ev.id, optionId: o.id }), `${e.kind}:${o.id}`).not.toThrow();
        }
      }
    }
  });
});
