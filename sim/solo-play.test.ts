/**
 * The solo opening: can one person, on day one, with nobody, actually play this game?
 *
 * The answer used to be "only if they punch things". Every tier-0 muscle op sat at 70–90% for a
 * muscle player, and everything done at a keyboard sat at 3–4% for *everybody* — wire fraud was
 * 3% for the tech background, which is the background whose whole pitch is the wire. Two causes,
 * both measured before anything was changed:
 *
 *  1. **`needs` written on the crew scale.** `needs` is a *sum across the hands on the job*, and
 *     one person is about a 4 in a skill and an 8 if it is their skill. Wire fraud asked for
 *     tech 14 + brains 12 on an op whose `maxCrew` is 2 and whose `minCrew` is 0. The tree said
 *     solo, the arithmetic said three people.
 *  2. **Headcount gates on solo work.** `crewCount` reads `player.crewEver`, so three ops in the
 *     lane could not be *opened* until you had hired somebody — on a lane sold as work you do
 *     alone at a keyboard.
 *
 * And the production half: an unmanned line runs at `runnerFactor`'s absentee 0.5, which is also
 * what the player got while standing in their own back room. A still and a safehouse is the one
 * opening a broke day-one player can afford, and it paid like nobody was there.
 *
 * These tests pin the numbers that make the opening playable, at the skills a real day-one
 * player has — no kit, no heat, no inside man, because that is the worst case and the one that
 * was broken.
 */
import { describe, expect, it } from 'vitest';
import { OP_DEFS, OP_FAMILIES, PRODUCTION_DEFS } from '@content/rackets';
import { BACKGROUND_DEFS } from '@content/backgrounds';
import { type OpApproach } from '@content/rackets';
import { dispatch, generateWorld, select, type OpKind, type World } from './index';
import { productionOutput } from './economy';
import { PLAYER_HANDS, playerWorked, playerWorks, productionQuality } from './production';

type Bg = World['player']['background'];
const day1 = (background: Bg, seed = 5): World =>
  generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'V', background, seed });

const BGS = BACKGROUND_DEFS.map(b => b.id);
/**
 * The approaches a day-one player can actually pick. `inside` is deliberately not here: the
 * reducer refuses it without somebody at the target on trust 35+, and on an op aimed at a person
 * rather than a place the planner does not even offer it — so counting its −22 difficulty would
 * flatter every number in this file. `undefined` is a real choice too (no approach, weight 1.0),
 * and it is the *best* choice on a charm job, because no approach weights charm.
 */
const APPROACHES: (OpApproach | undefined)[] = [undefined, 'loud', 'quiet'];
/** The best a day-one player of this background can get on this job, alone, picking well. */
const solo = (w: World, k: OpKind) => Math.max(...APPROACHES.map(a => select.opChance(w, k, [], a)));
/** …and the best any background can manage. */
const bestSolo = (k: OpKind) => Math.max(...BGS.map(b => solo(day1(b), k)));

const SOLO_OPS = (Object.keys(OP_DEFS) as OpKind[]).filter(k => OP_DEFS[k].minCrew === 0);
/** `tier` is optional in the content type; everything in the tree has one, and 0 is street work. */
const tierOf = (k: OpKind) => OP_DEFS[k].tier ?? 0;
const WIRE = (Object.keys(OP_DEFS) as OpKind[]).filter(k => OP_DEFS[k].family === 'wire');

describe('an op the tree calls solo is one a solo player can actually land', () => {
  /**
   * The band widens as the tier climbs — a tier-4 job should still be a gamble alone — but the
   * floor is the point: nothing marked solo may be a coin that never lands. 25% is "worth five
   * planning days once"; 3% was the old wire fraud and is not a game.
   */
  const FLOOR: Record<number, number> = { 0: 60, 1: 55, 2: 40, 3: 35, 4: 30 };

  for (const k of SOLO_OPS) {
    it(`${k} (tier ${tierOf(k)})`, () => {
      const best = bestSolo(k);
      expect(best, `${k} is marked solo and the best day-one player gets ${best}%`).toBeGreaterThanOrEqual(FLOOR[tierOf(k)]);
    });
  }

  it('but it is still the right background that gets there, not everybody', () => {
    // If the rescale had gone too far, every op would be a shrug for every background. The
    // spread between the best and worst background is what backgrounds are *for*.
    const spread = SOLO_OPS.filter(k => Object.keys(OP_DEFS[k].needs).length > 0).map(k => {
      const cs = BGS.map(b => solo(day1(b), k));
      return Math.max(...cs) - Math.min(...cs);
    });
    const typical = spread.sort((a, b) => a - b)[Math.floor(spread.length / 2)];
    expect(typical, 'the backgrounds have stopped mattering on solo work').toBeGreaterThan(10);
  });

  it('and every one of them is still the right background\'s job', () => {
    // A rescale that went too far would make each op a shrug for everyone. On a solo op the
    // background whose skill the job names must come out on top.
    const PRIMARY: Partial<Record<OpKind, Bg>> = {
      rat: 'tech', sim_swap: 'tech', stream_piracy: 'tech', digital_strike: 'tech',
      betting_app: 'tech', synth_identity: 'tech', wire_fraud: 'tech', crypto_wash: 'tech',
      long_con: 'charm', charity_front: 'charm', buy_down: 'charm',
      shell_company: 'brains', buy_case: 'brains', scout_block: 'brains',
      intimidate: 'muscle', robbery: 'muscle', takeover: 'muscle', armed_robbery: 'muscle',
      armed_intimidation: 'muscle', mugging: 'muscle', porch_piracy: 'wheels', vape_bootleg: 'charm',
    };
    for (const [k, bg] of Object.entries(PRIMARY) as [OpKind, Bg][]) {
      const scores = BGS.map(b => [b, solo(day1(b), k)] as const).sort((a, b) => b[1] - a[1]);
      expect(scores[0][0], `${k} is a ${bg} job and the ${scores[0][0]} background is better at it`).toBe(bg);
    }
  });

  it('and bringing people is still worth doing', () => {
    // The ratio caps at 1.3 per skill, so lowering `needs` raises the floor without moving the
    // ceiling — but overshoot it and a specialist caps the job alone, which is what happened to
    // `rat` at tech 8 the first time through: two tech-8 crew added exactly nothing.
    const w = day1('tech');
    const hands = Object.values(w.npcs).filter(n => n.alive).slice(0, 2).map(n => n.id);
    for (const n of hands) { const npc = w.npcs[n]; npc.crew = { loyalty: 60, cut: 90, status: 'idle', statusDays: 0, joinedDay: 1 }; npc.skills.tech = 8; npc.skills.brains = 8; }
    for (const k of ['wire_fraud', 'rat'] as OpKind[]) {
      const alone = select.opChance(w, k, [], 'quiet');
      const crewed = select.opChance(w, k, hands.slice(0, OP_DEFS[k].maxCrew), 'quiet');
      expect(crewed, `${k}: two good people are no better than going alone`).toBeGreaterThan(alone);
    }
  });
});

describe('the wire is work for one person, all of it', () => {
  it('is the whole digital lane, not a subset of it', () => {
    // The three that were doing the same kind of work without the badge. If a new keyboard job
    // is added and left untagged it will drift back out of this pass's guarantees.
    for (const k of ['stream_piracy', 'synth_identity', 'betting_app'] as OpKind[]) {
      expect(OP_DEFS[k].family, `${k} is keyboard work and is not in the lane`).toBe('wire');
    }
    expect(WIRE.length).toBeGreaterThanOrEqual(8);
  });

  it('no job in it needs a second pair of hands, or a headcount to unlock', () => {
    for (const k of WIRE) {
      expect(OP_DEFS[k].minCrew, `${k}`).toBe(0);
      expect(OP_DEFS[k].requires?.crewCount, `${k}`).toBeUndefined();
    }
  });

  it('and the lane says so, so the promise is on the screen as well as in the numbers', () => {
    expect(OP_FAMILIES.wire.blurb.toLowerCase()).toContain('alone');
  });

  it('a tech player can land every one of them alone', () => {
    const w = day1('tech');
    for (const k of WIRE) {
      const c = solo(w, k);
      expect(c, `${k} is ${c}% for a tech player working alone`).toBeGreaterThanOrEqual(30);
    }
  });

  it('what a solo player gains is a floor, not a ceiling — the crewed job barely moved', () => {
    // Guards against "fixing" solo play by making the whole lane free. A fully-crewed wire job
    // caps on the ratio ceiling either way; only the bottom of the curve was supposed to move.
    const w = day1('tech');
    const hands = Object.values(w.npcs).filter(n => n.alive).slice(0, 2).map(n => n.id);
    for (const n of hands) { const npc = w.npcs[n]; npc.crew = { loyalty: 60, cut: 90, status: 'idle', statusDays: 0, joinedDay: 1 }; npc.skills.tech = 9; npc.skills.brains = 9; }
    expect(select.opChance(w, 'wire_fraud', hands, 'quiet')).toBeLessThan(75);
  });
});

describe('the first still is worked by the person standing in the room', () => {
  /** The one opening a broke day-one player can afford: a back room and a still. */
  function opened(background: Bg) {
    let w = day1(background);
    const home = select.startBlock(w);
    w = dispatch(w, { type: 'rent_safehouse', blockId: home.id });
    w = dispatch(w, { type: 'start_production', safehouseId: w.player.safehouseIds[0], kind: 'still' });
    return { w, pr: Object.values(w.productions)[0] };
  }

  it('is affordable on day one at all, which is the premise', () => {
    const { w, pr } = opened('tech');
    expect(pr, 'a day-one player cannot afford a safehouse and a still').toBeTruthy();
    expect(w.player.cash).toBeGreaterThanOrEqual(0);
  });

  it('and runs on your own skill rather than at the absentee half-rate', () => {
    const { w, pr } = opened('tech');
    expect(playerWorks(w, pr)).toBe(true);
    const absentee = PRODUCTION_DEFS.still.outputBase * 0.5;
    expect(productionOutput(w, pr), 'the player is still being treated as not there').toBeGreaterThan(absentee * 1.5);
    expect(productionQuality(w, pr), 'and making unsellable rubbish while they are at it').toBeGreaterThan(40);
  });

  it('a tech player makes better booze than a muscle player, because it is their trade', () => {
    expect(productionOutput(opened('tech').w, opened('tech').pr)).toBeGreaterThan(productionOutput(opened('muscle').w, opened('muscle').pr));
  });

  it('but never better than somebody who does nothing else — that gap is the reason to hire', () => {
    const { w, pr } = opened('tech');
    const mine = productionOutput(w, pr);
    const hired = Object.values(w.npcs).find(n => n.alive)!;
    hired.crew = { loyalty: 60, cut: 90, status: 'assigned', statusDays: 0, joinedDay: 1, assignment: { kind: 'production', productionId: pr.id } };
    hired.skills.tech = w.player.skills.tech;
    pr.workerId = hired.id;
    expect(productionOutput(w, pr), 'a runner of equal skill is no better than you').toBeGreaterThan(mine);
  });

  it('you are one person, so it is one line', () => {
    // The second still is what sends you out to meet somebody, which is the arc the whole pass
    // is for. If the player covered every line there would be no reason to ever hire a worker.
    let { w } = opened('tech');
    w.player.cash += 10000;
    w = dispatch(w, { type: 'upgrade_safehouse', safehouseId: w.player.safehouseIds[0] });
    w = dispatch(w, { type: 'start_production', safehouseId: w.player.safehouseIds[0], kind: 'lab' });
    const prods = Object.values(w.productions);
    expect(prods.length).toBe(2);
    expect(prods.filter(p => playerWorks(w, p)).length, 'the player is in two rooms at once').toBe(1);
  });

  it('and the pick is deterministic: the line your own skill does the most good on', () => {
    let { w } = opened('charm');   // still is tech (2), cut house is charm (8)
    w.player.cash += 10000;
    w = dispatch(w, { type: 'upgrade_safehouse', safehouseId: w.player.safehouseIds[0] });
    w = dispatch(w, { type: 'start_production', safehouseId: w.player.safehouseIds[0], kind: 'cut_house' });
    const cut = Object.values(w.productions).find(p => p.kind === 'cut_house')!;
    expect(playerWorked(w), 'a charm player is minding the still instead of the cut house').toBe(cut.id);
    // and re-reading it never moves, because the tick and the ledger's estimate both call it
    expect(playerWorked(w)).toBe(playerWorked(w));
  });

  it('putting somebody on it frees you up for the next one', () => {
    let { w } = opened('tech');
    w.player.cash += 10000;
    w = dispatch(w, { type: 'upgrade_safehouse', safehouseId: w.player.safehouseIds[0] });
    w = dispatch(w, { type: 'start_production', safehouseId: w.player.safehouseIds[0], kind: 'lab' });
    const [a, b] = Object.values(w.productions);
    const mine = playerWorked(w);
    const other = mine === a.id ? b : a;
    const hired = Object.values(w.npcs).find(n => n.alive)!;
    hired.crew = { loyalty: 60, cut: 90, status: 'assigned', statusDays: 0, joinedDay: 1, assignment: { kind: 'production', productionId: mine! } };
    w.productions[mine!].workerId = hired.id;
    expect(playerWorked(w), 'you are still hovering over the line somebody else now runs').toBe(other.id);
  });

  it('the ledger says which one you are standing in', () => {
    const { w } = opened('tech');
    const row = select.holdings(w).find(r => r.kind === 'production')!;
    expect(row.auto.label).toMatch(/you/i);
    expect(row.auto.good, 'a line you work yourself reads as a problem').toBe(true);
    expect(row.flags).not.toContain('nobody working it');
  });

  it('the boost is a documented number, not a magic constant in the formula', () => {
    expect(PLAYER_HANDS.floor).toBeGreaterThan(0.5);   // better than nobody
    expect(PLAYER_HANDS.floor + 10 / PLAYER_HANDS.per).toBeLessThan(0.6 + 10 / 10); // worse than a runner
  });
});
