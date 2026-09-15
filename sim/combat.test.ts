/**
 * Being attacked is a decision now, not a line in the morning log — except when it is not:
 * territorial pressure stays automatic, and anything you ignore lands anyway at End Day.
 */
import { describe, expect, it } from 'vitest';
import { ITEM_DEFS } from '@content/items';
import { OP_DEFS } from '@content/rackets';
import { PLAYER, can, dispatch, generateWorld, select, type Faction, type World } from './index';
import { CONFRONT_AS, confrontChance, confrontOptions, resolveConfrontation } from './combat';
import { runFaction } from './factions';
import { Rng } from './rng';

const mk = (seed = 12) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });

/** A world where one faction is at war with the player, who has a racket, a place and a crew. */
function atWar(seed = 12, stance: 'beef' | 'war' = 'war') {
  const w = mk(seed);
  w.pendingEvents = [];
  const f = Object.values(w.factions)[0];
  f.stance[PLAYER] = stance; f.standing[PLAYER] = stance === 'war' ? -85 : -55;
  f.truceUntil[PLAYER] = 0;
  // a racket of the player's, on a block the faction can reach
  const biz = Object.values(w.businesses).find(b => b.ownedBy === 'npc')!;
  const r = { id: 'r_test', kind: 'numbers' as const, businessId: biz.id, owner: PLAYER, startedDay: 1, level: 1, lastIncome: 200, disrupted: 0 };
  w.rackets[r.id] = r; w.player.racketIds.push(r.id); biz.racketIds.push(r.id);
  biz.ownedBy = 'player'; w.player.businessIds.push(biz.id);
  // their turf next door, so 'near' is satisfied
  for (const b of Object.values(w.blocks)) b.influence[f.id] = 60;
  w.blocks[biz.blockId].influence = { [PLAYER]: 70 };
  // a crew to call on
  for (const n of Object.values(w.npcs).filter(x => x.role === 'patron').slice(0, 2)) {
    n.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 }; n.role = 'crew'; w.player.crewIds.push(n.id);
  }
  return { w, f, biz, racket: r };
}

/** Run faction ticks until that faction acts against the player. */
function provoke(w: World, f: Faction, tries = 40): World {
  for (let i = 0; i < tries && !select.activeConfrontation(w); i++) {
    const rng = new Rng(i * 977 + 3);
    runFaction(w, f, rng);
  }
  return w;
}

describe('being attacked', () => {
  it('queues a confrontation instead of resolving it behind your back', () => {
    const { w, f, racket } = atWar();
    const before = { disrupted: racket.disrupted, dirty: w.player.dirty };
    provoke(w, f);
    const c = select.activeConfrontation(w);
    expect(c, 'a faction at war came for something').toBeDefined();
    expect(c!.factionId).toBe(f.id);
    expect(['racket', 'business', 'crew']).toContain(c!.kind);
    // nothing has happened yet: that is the whole point
    expect(w.rackets[racket.id].disrupted).toBe(before.disrupted);
    expect(w.player.dirty).toBe(before.dirty);
    expect(w.player.crewIds.every(id => w.npcs[id].crew?.status === 'idle')).toBe(true);
  });

  it('stops everything else until it is answered', () => {
    const { w, f, biz } = atWar();
    provoke(w, f);
    const c = select.activeConfrontation(w)!;
    const blocked = can(w, { type: 'shakedown', businessId: biz.id });
    expect(blocked.ok).toBe(false);
    expect(blocked.ok === false && blocked.reason).toMatch(/in front of you/);
    expect(can(w, { type: 'resolve_confrontation', id: c.id, approach: 'fight' }).ok).toBe(true);
    expect(can(w, { type: 'end_day' }).ok).toBe(true);            // you can always walk away from the day
  });

  it('offers three answers with the odds it actually rolls', () => {
    const { w, f } = atWar();
    provoke(w, f);
    const c = select.activeConfrontation(w)!;
    const opts = confrontOptions(w, c);
    expect(opts.map(o => o.id).sort()).toEqual(['backup', 'fight', 'flee']);
    for (const o of opts) {
      expect(o.chance).toBe(confrontChance(w, c, o.id));           // what you see is what is rolled
      expect(o.chance).toBeGreaterThanOrEqual(3);
      expect(o.chance).toBeLessThanOrEqual(97);
    }
    // calling people in needs people
    w.player.crewIds = [];
    expect(confrontOptions(w, c).find(o => o.id === 'backup')!.disabled).toBeTruthy();
  });

  it('reads the carried kit exactly the way an op does', () => {
    const { w, f } = atWar();
    provoke(w, f);
    const c = select.activeConfrontation(w)!;
    const bare = { fight: confrontChance(w, c, 'fight'), flee: confrontChance(w, c, 'flee') };
    w.player.items = ['rem870']; w.player.equipped = ['rem870'];
    expect(confrontChance(w, c, 'fight')).toBeGreaterThan(bare.fight);   // muscle +4 and a loud bias
    expect(confrontChance(w, c, 'flee')).toBeLessThan(bare.flee);        // and it is no help running
    // the mapping is the documented one, so kit tuned for an approach helps the matching answer
    expect(CONFRONT_AS).toEqual({ fight: 'loud', flee: 'quiet', backup: 'inside' });
    w.player.items = ['burner']; w.player.equipped = ['burner'];
    expect(select.kitApproachBias(w, CONFRONT_AS.backup)).toBe(ITEM_DEFS.burner.mods.approachBias!.inside);
  });

  it('lets a win cost them a soldier and a loss land the damage', () => {
    const { w, f } = atWar();
    provoke(w, f);
    const c = select.activeConfrontation(w)!;
    const soldiers = f.soldiers;
    const won = resolveConfrontation(w, c, 'fight', new Rng(1));
    expect(select.confrontations(w).some(x => x.id === c.id)).toBe(false);   // answered either way
    if (won) expect(w.factions[f.id].soldiers).toBe(Math.max(0, soldiers - 1));
    else expect(w.log.some(l => l.tone === 'bad')).toBe(true);
  });

  it('lands anyway if the day ends with nobody answering', () => {
    const { w, f, racket } = atWar();
    provoke(w, f);
    const c = select.activeConfrontation(w)!;
    const next = dispatch(w, { type: 'end_day' });
    // it is gone (the night may have brought new ones, which is its own problem tomorrow)
    expect(select.confrontations(next).some(x => x.id === c.id)).toBe(false);
    const hurt = c.kind === 'racket'
      ? (next.rackets[racket.id]?.disrupted ?? 0) > 0 || next.player.dirty < w.player.dirty
      : c.kind === 'business'
        ? next.businesses[c.businessId!].condition < w.businesses[c.businessId!].condition
        : next.npcs[c.npcId!].crew?.status !== 'idle';
    expect(hurt, `${c.kind} attack landed`).toBe(true);
  });

  it('leaves territorial pressure alone: a push on your block still resolves by itself', () => {
    const { w, f } = atWar();
    // nothing to hit but the ground: no rackets, no places, no crew
    w.player.racketIds = []; w.player.businessIds = []; w.player.crewIds = [];
    const mine = Object.values(w.blocks).find(b => select.blockController(w, b.id) === PLAYER)!;
    const before = mine.influence[PLAYER];
    for (let i = 0; i < 30 && w.blocks[mine.id].influence[PLAYER] === before; i++) runFaction(w, f, new Rng(i * 31 + 7));
    expect(select.activeConfrontation(w)).toBeUndefined();          // never queued
    expect(w.blocks[mine.id].influence[PLAYER]).toBeLessThan(before); // and it happened anyway
  });
});

describe('war work', () => {
  const warOps = ['ambush_soldiers', 'defend_racket', 'war_strike'] as const;

  it('is invisible while everybody is at peace', () => {
    const w = mk();
    for (const f of Object.values(w.factions)) { f.stance[PLAYER] = 'peace'; f.standing[PLAYER] = 0; }
    w.player.crewEver = 4;   // so the only thing standing in the way is the peace
    const open = select.opsAvailable(w);
    for (const kind of warOps) {
      expect(open, kind).not.toContain(kind);
      expect(select.opLocked(w, kind), kind).toMatch(/beef|war/);
    }
  });

  it('appears once somebody has a beef, and a war strike waits for a war', () => {
    const { w } = atWar(12, 'beef');
    w.player.crewEver = 3;
    expect(select.opLocked(w, 'ambush_soldiers')).toBeUndefined();
    expect(select.opLocked(w, 'defend_racket')).toBeUndefined();
    expect(select.opLocked(w, 'war_strike')).toMatch(/war/);       // beef is not enough for that one
    const { w: w2 } = atWar(12, 'war');
    w2.player.crewEver = 3;
    expect(select.opLocked(w2, 'war_strike')).toBeUndefined();
  });

  it('has to be aimed at the faction that is actually at war with you', () => {
    const { w, f } = atWar();
    const crewIds = w.player.crewIds;
    const peaceful = Object.values(w.factions).find(x => x.id !== f.id);
    expect(can(w, { type: 'plan_op', kind: 'ambush_soldiers', crewIds, targetFactionId: f.id }).ok).toBe(true);
    if (peaceful) {
      peaceful.stance[PLAYER] = 'peace';
      const wrong = can(w, { type: 'plan_op', kind: 'ambush_soldiers', crewIds, targetFactionId: peaceful.id });
      expect(wrong.ok).toBe(false);
      expect(wrong.ok === false && wrong.reason).toMatch(/not at/);
    }
  });

  it('digs in only where something of yours is actually marked', () => {
    const { w, biz, racket } = atWar();
    const crewIds = w.player.crewIds;
    expect(can(w, { type: 'plan_op', kind: 'defend_racket', crewIds, targetBusinessId: biz.id }).ok).toBe(false);
    w.rackets[racket.id].threatened = w.day + 3;
    expect(can(w, { type: 'plan_op', kind: 'defend_racket', crewIds, targetBusinessId: biz.id }).ok).toBe(true);
    expect(select.threatenedRackets(w).map(r => r.id)).toContain(racket.id);
  });
});

describe('armed work', () => {
  it('is locked until you are carrying a weapon', () => {
    const w = mk();
    w.player.items = []; w.player.equipped = [];
    expect(select.opLocked(w, 'armed_robbery')).toMatch(/weapon/i);
    w.player.items = ['lockpicks']; w.player.equipped = ['lockpicks'];
    expect(select.opLocked(w, 'armed_robbery'), 'a lockpick set is not a weapon').toMatch(/weapon/i);
    w.player.items = ['glock19']; w.player.equipped = ['glock19'];
    expect(select.opLocked(w, 'armed_robbery')).toBeUndefined();
    expect(select.opLocked(w, 'armed_intimidation')).toBeUndefined();
  });

  it('pays and burns more than the version you do empty-handed', () => {
    expect(OP_DEFS.armed_robbery.payout[0]).toBeGreaterThan(OP_DEFS.robbery.payout[0]);
    expect(OP_DEFS.armed_robbery.payout[1]).toBeGreaterThan(OP_DEFS.robbery.payout[1]);
    expect(OP_DEFS.armed_robbery.heat).toBeGreaterThan(OP_DEFS.robbery.heat);
    expect(OP_DEFS.armed_intimidation.heat).toBeGreaterThan(OP_DEFS.intimidate.heat);
  });
});

describe('a confrontation and an event card at the same time', () => {
  /**
   * Both are modal and both arrive from the same End Day. The confrontation modal renders on
   * top of the event card, so if a pending event blocked answering it the player would click a
   * button they could see and get a refusal about a card they could not. The soak bot found
   * this by spinning against it 140 times in a thirty-day war.
   */
  it('the door can still be answered while an event card is waiting', () => {
    const { w, f } = atWar(12);
    provoke(w, f);
    const c = select.activeConfrontation(w);
    if (!c) return;                      // this seed did not provoke one; other tests cover that
    w.pendingEvents = [{ id: 'e1', day: w.day, kind: 'test', refs: {}, title: 'Something else', text: 'Also happening.', options: [{ id: 'ok', label: 'Fine' }] }];

    const gate = can(w, { type: 'resolve_confrontation', id: c.id, approach: 'fight' });
    expect(gate.ok, gate.ok ? '' : gate.reason).toBe(true);
    const next = dispatch(w, { type: 'resolve_confrontation', id: c.id, approach: 'fight' });
    expect(select.confrontations(next).map(x => x.id)).not.toContain(c.id);
    expect(next.pendingEvents).toHaveLength(1);   // the card is still there, waiting its turn
  });

  it('but an event card still blocks ordinary moves', () => {
    const { w } = atWar(12);
    w.confrontations = [];
    w.pendingEvents = [{ id: 'e1', day: w.day, kind: 'test', refs: {}, title: 'Something', text: 'Happening.', options: [{ id: 'ok', label: 'Fine' }] }];
    expect(can(w, { type: 'move', toBlockId: Object.keys(w.blocks)[1] }).ok).toBe(false);
  });
});
