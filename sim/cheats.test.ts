/**
 * The admin panel.
 *
 * Every entry is an ordinary `cheat` action through the ordinary reducer — there is no test-only
 * path into the sim, and the soak bot drives these same entries. What is pinned here is that
 * each one actually sets its system up (a cheat that silently does nothing is worse than no
 * cheat, because the bot will then report coverage it does not have) and that every one of them
 * stamps the save.
 */
import { describe, expect, it } from 'vitest';
import { POSTURE_ORDER } from '@content/authority';
import { PLAYER, dispatch, generateWorld, select, type CheatKind, type World } from './index';

const mk = (seed = 5) => { const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed }); w.pendingEvents = []; return w; };
const cheat = (w: World, what: CheatKind, amount?: number) => dispatch(w, { type: 'cheat', what, amount });

const ALL: CheatKind[] = [
  'cash', 'dirty', 'ap', 'legwork', 'heat', 'skills', 'crew', 'unlock', 'safehouse',
  'own_block', 'turf', 'reveal', 'stash', 'kit', 'rackets', 'war', 'attention',
  'jail_crew', 'open_case', 'cards', 'ratted',
];

describe('the panel as a whole', () => {
  it('every entry runs without throwing and stamps the save', () => {
    for (const what of ALL) {
      const w = cheat(mk(), what);
      expect(w.cheated, what).toBe(true);
    }
  });

  it('they compose: applying all of them in order leaves a coherent world', () => {
    let w = mk();
    for (const what of ALL) w = cheat(w, what);
    expect(Number.isFinite(w.player.cash)).toBe(true);
    expect(Number.isFinite(w.player.heat)).toBe(true);
    expect(w.player.crewIds.length).toBeGreaterThan(0);
    for (const a of select.authorities(w)) expect(Number.isFinite(a.attention)).toBe(true);
    // and the day still ends
    expect(() => dispatch(w, { type: 'end_day' })).not.toThrow();
  });
});

describe('each one sets up the thing it claims to', () => {
  it('cash and dirty take an amount', () => {
    const w = mk();
    expect(cheat(w, 'cash', 777).player.cash - w.player.cash).toBe(777);
    expect(cheat(w, 'dirty', 555).player.dirty - w.player.dirty).toBe(555);
    expect(cheat(w, 'cash').player.cash - w.player.cash).toBe(10000);   // default
  });

  it('skills takes a level and refills the legwork that depends on it', () => {
    const w = cheat(mk(), 'skills', 7);
    for (const v of Object.values(w.player.skills)) expect(v).toBe(7);
    expect(w.player.legwork).toBe(w.player.legworkMax);
  });

  it('crew takes a headcount, and they are real crew', () => {
    const w = cheat(mk(), 'crew', 4);
    expect(w.player.crewIds.length).toBe(4);
    for (const id of w.player.crewIds) { expect(w.npcs[id].crew).toBeTruthy(); expect(w.npcs[id].role).toBe('crew'); }
    expect(w.player.crewEver).toBeGreaterThanOrEqual(4);
  });

  it('kit means you are actually carrying something, not just owning it', () => {
    const w = cheat(mk(), 'kit');
    expect(select.equippedItems(w).length).toBeGreaterThan(0);
    expect(select.kitSkillBoost(w)).toBeTruthy();
  });

  it('rackets gives you one that can move cards, which nothing else sets up', () => {
    const w = cheat(cheat(mk(), 'own_block'), 'rackets');
    expect(w.player.racketIds.length).toBeGreaterThan(0);
    expect(select.playerRacketsOfKind(w, 'carding').length).toBeGreaterThan(0);
  });

  it('war puts the named number of factions at war, which is what the war ops need', () => {
    const w = cheat(mk(), 'war', 2);
    expect(select.factionsAt(w, ['war']).length).toBeGreaterThanOrEqual(2);
    expect(select.opLocked(w, 'ambush_soldiers')).toBeUndefined();
  });

  it('attention moves the Authorities, which no ordinary action could', () => {
    const w = cheat(mk(), 'attention', 90);
    for (const a of select.authorities(w)) {
      expect(a.attention).toBe(90);
      expect(POSTURE_ORDER.indexOf(a.posture)).toBeGreaterThan(0);
    }
    expect(select.topPosture(w)).not.toBe('routine');
  });

  it('jail_crew puts one of yours inside, which is what springing somebody needs', () => {
    const w = cheat(cheat(mk(), 'crew', 3), 'jail_crew', 30);
    const inside = select.jailedCrew(w);
    expect(inside.length).toBe(1);
    expect(inside[0].crew!.statusDays).toBe(30);
    expect(select.opLocked(w, 'spring_crew', { npcId: inside[0].id })).toBeUndefined();
  });

  it('jail_crew says so rather than silently doing nothing with no crew', () => {
    const w = cheat(mk(), 'jail_crew');
    expect(select.jailedCrew(w)).toEqual([]);
    expect(w.log.some(l => /nobody in your crew/i.test(l.text))).toBe(true);
  });

  it('open_case opens a file at the evidence you ask for', () => {
    const w = cheat(mk(), 'open_case', 40);
    const open = select.openCases(w);
    expect(open.length).toBe(1);
    expect(open[0].evidence).toBe(40);
    expect(select.opLocked(w, 'buy_case', { caseId: open[0].id })).toBeTruthy();  // still needs the crew gate
  });

  it('cards fills your pocket, hands you something to sell and leaves wire heat', () => {
    const w = cheat(mk(), 'cards', 6);
    expect(select.liveCards(w).length).toBe(6);
    expect(w.player.cyberHeat ?? 0).toBeGreaterThan(0);
    expect(select.secrets(w).length).toBeGreaterThan(0);
  });

  it('ratted is what unlocks wire fraud, per target', () => {
    const w = cheat(mk(), 'ratted');
    const marks = select.rattedNpcs(w);
    expect(marks.length).toBeGreaterThan(0);
    expect(select.opLocked(w, 'wire_fraud', { npcId: marks[0].id })).toBeUndefined();
  });

  it('unlock puts a prior job behind every op that wants one', () => {
    const w = cheat(cheat(cheat(mk(), 'crew', 5), 'safehouse'), 'unlock');
    expect(select.opLocked(w, 'heist_bank')).toBeUndefined();
  });

  it('safehouse, own_block and turf change the ground under you', () => {
    let w = mk();
    const here = w.player.currentBlockId;
    w = cheat(w, 'safehouse');
    expect(w.player.safehouseIds.length).toBe(1);
    w = cheat(w, 'own_block');
    expect(w.player.businessIds.length).toBeGreaterThan(0);
    w = cheat(w, 'turf');
    expect(select.blockController(w, here)).toBe(PLAYER);
  });
});

describe('what it does not do', () => {
  it('an honest world is never stamped', () => {
    const w = mk();
    expect(w.cheated).toBeUndefined();
    expect(dispatch(w, { type: 'end_day' }).cheated).toBeUndefined();
  });
});
