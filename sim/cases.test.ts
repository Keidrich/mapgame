import { describe, expect, it } from 'vitest';
import { PLAYER, can, dispatch, generateWorld, select } from './index';
import { openCase, tickCases } from './cases';
import { tickCommission, resolveMeeting, MEETING_EVERY } from './commission';
import { Rng } from './rng';
import { known } from './test-util';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });

describe('cold cases', () => {
  it('a file builds evidence, a scared witness slows it, and 100 means charges', () => {
    const w = mk(); w.player.heat = 50; w.player.cash = 20000;
    const start = select.startBlock(w);
    const me = Object.values(w.npcs).find(n => n.role === 'patron' && n.alive && n.homeBlockId !== start.id)!;
    me.crew = { loyalty: 60, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 }; me.role = 'crew'; w.player.crewIds.push(me.id);
    openCase(w, 'hit', 'test killing', { blockId: start.id }, [me.id], new Rng(1), 20);
    const c = select.openCases(w)[0]; expect(c).toBeDefined(); expect(c.witnessId).toBeDefined();
    const wit = w.npcs[c.witnessId!];
    const rng = new Rng(2);
    tickCases(w, rng); const fast = c.evidence - 20; expect(fast).toBeGreaterThan(3);
    // the witness gets scared
    wit.rel.fear = 80;
    const e0 = c.evidence; tickCases(w, rng); expect(c.evidence - e0).toBeLessThan(fast);
    // A threat that lands on the witness clears them from the file — but a stare cannot do it
    // any more. Silence needs fear 40 and `STAKES.words` tops out at 35, so the player has to
    // bring people to the door: `threaten:crew` is a `backed` act and reaches 50.
    wit.rel.fear = 0; w.player.skills.muscle = 10; w.player.fear = 90; wit.nerve = 5; wit.traits = ['coward'];
    known(w, wit);
    const muscle = Object.values(w.npcs).find(n => n.id !== me.id && n.alive && !n.crew)!;
    muscle.crew = { loyalty: 60, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 }; muscle.role = 'crew'; w.player.crewIds.push(muscle.id);
    let w2 = w; let tries = 0;
    while (w2.cases![0].witnessId && tries++ < 6) { w2 = dispatch(w2, { type: 'threaten', npcId: wit.id, approach: 'crew' }); w2.player.ap = 8; }
    expect(w2.cases![0].witnessId).toBeUndefined();
    // run it to charges
    const t = structuredClone(w2); t.player.heat = 90; t.player.lawyer = false;
    for (let i = 0; i < 60 && t.cases![0].status === 'open'; i++) tickCases(t, rng);
    expect(t.cases![0].status).toBe('charged');
    const fell = t.npcs[me.id].crew?.status === 'jailed';
    if (!fell) expect(t.player.busts).toBe(1);
  });
  it('goes cold when nothing sticks', () => {
    const w = mk(); w.player.heat = 0; w.player.lawyer = true;
    openCase(w, 'heist', 'quiet job', {}, [], new Rng(1), 5);
    const c = w.cases![0]; c.witnessId = undefined;
    const captain = Object.values(w.npcs).find(n => n.official?.kind === 'captain')!; captain.rel.trust = 60;
    for (let i = 0; i < 30; i++) { w.day++; tickCases(w, new Rng(i)); }
    expect(c.status).toBe('cold');
  });
});

describe('the Commission', () => {
  it('forms with three factions, meets, and can seat the player', () => {
    let w = mk(); w.day = 20; w.player.cash = 30000;
    // three living factions
    const fs = Object.values(w.factions); if (fs.length < 3) { const f = structuredClone(fs[0]); f.id = 'f_extra'; f.name = 'Extra Crew'; f.short = 'Extra'; f.crisis = undefined; w.factions[f.id] = f; }
    expect(Object.values(w.factions).filter(f => f.alive).length).toBeGreaterThanOrEqual(3);
    tickCommission(w, new Rng(1));
    expect(w.commission).toBeDefined(); expect(w.commission!.seat).toBe(false);
    expect(can(w, { type: 'petition_seat' }).ok).toBe(false); // no blocks, no respect, no ally
    w.player.respect = 60;
    expect(can(w, { type: 'petition_seat' }).ok).toBe(true);
    let tries = 0;
    while (!w.commission!.seat && tries++ < 8) { w = dispatch(w, { type: 'petition_seat' }); w.player.ap = 8; }
    expect(w.commission!.seat).toBe(true);
    // a meeting comes up and the vote lands
    w.day = w.commission!.nextMeeting;
    tickCommission(w, new Rng(3));
    const ev = w.pendingEvents.find(e => e.kind === 'commission')!; expect(ev).toBeDefined();
    expect(ev.options.map(o => o.id)).toContain('yes');
    resolveMeeting(w, 'yes', new Rng(4));
    expect(w.commission!.rulings.length).toBe(1);
    expect(w.commission!.pending).toBeUndefined();
    expect(w.commission!.nextMeeting).toBe(w.day + MEETING_EVERY);
    void PLAYER;
  });
});
