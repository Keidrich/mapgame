/**
 * Kit belongs to a person, and a job runs on the kit of the people actually on it.
 *
 * For its whole life the kit maths read `w.player.equipped` and nothing else, so the man holding
 * the shotgun and the man doing the job were the same person by construction. Now they need not be,
 * which makes two things worth pinning and easy to get wrong:
 *
 *  - a crew member's own kit has to reach a job they are **on** — through all three terms, not just
 *    the one that was easiest to wire up;
 *  - and it must not reach a job they are **not** on, which is the leak this kind of change makes:
 *    the naive version sums everybody in `w.npcs` and nobody notices until heat is triple.
 *
 * The third thing here is the pooling rule itself (`jobKit`): one item per category, dearest wins,
 * whole. That is a design decision rather than a consequence, so it is asserted rather than assumed
 * — see `sim/items.ts` and `docs/DESIGN.md` §4.7d.
 */
import { describe, expect, it } from 'vitest';
import { ITEM_DEFS } from '@content/items';
import { generateWorld, select, type Npc, type World } from './index';
import { jobKit, kitCover } from './items';

const mk = (seed = 12) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });

/** A world with three hands available and nothing in anybody's pockets. */
function ready(seed = 12): World {
  const w = mk(seed);
  w.pendingEvents = [];
  w.player.cash = 50000;
  w.player.items = []; w.player.equipped = [];
  for (const n of Object.values(w.npcs).filter(x => x.role === 'patron').slice(0, 3)) {
    n.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
    n.role = 'crew'; w.player.crewIds.push(n.id);
  }
  return w;
}
const crewOf = (w: World): Npc[] => w.player.crewIds.map(id => w.npcs[id]);
/** Put it in their hands, the way buying it for them does. */
const arm = (who: { items?: string[]; equipped?: string[] }, ...ids: string[]) => {
  who.items = [...(who.items ?? []), ...ids];
  who.equipped = [...(who.equipped ?? []), ...ids];
};

describe('a crew member on the job brings what they are carrying', () => {
  it('moves the skill total, the approach bias and the heat — all three, not just one', () => {
    const w = ready();
    const [a, b] = crewOf(w);
    const ids = [a.id, b.id];

    const bareSkill = select.jobSkillBoost(w, ids).muscle ?? 0;
    const bareBias = select.jobApproachBias(w, ids, 'loud');
    const bareHeat = select.jobHeatMult(w, ids);
    expect(bareSkill).toBe(0);
    expect(bareBias).toBe(0);
    expect(bareHeat).toBe(1);

    // Their shotgun, not yours — the player's pockets stay empty for the whole test.
    arm(a, 'sawnoff');
    expect(w.player.equipped).toEqual([]);

    const def = ITEM_DEFS.sawnoff;
    expect(select.jobSkillBoost(w, ids).muscle).toBe(def.mods.skillBoost!.muscle);
    expect(select.jobApproachBias(w, ids, 'loud')).toBeCloseTo(def.mods.approachBias!.loud!, 5);
    expect(select.jobHeatMult(w, ids)).toBeCloseTo(def.mods.heatMult!, 5);
  });

  it('shows up in the odds and in the heat the planner quotes', () => {
    const w = ready();
    const [a, b] = crewOf(w);
    const ids = [a.id, b.id];
    // An ambush wants `minCrew: 1`, so the player's own hands are deliberately out of the skill
    // total (`opChance` folds them in on solo-capable jobs only). What is left moving is the crew
    // and what the crew is carrying, which is exactly what this is about.
    const before = select.opChance(w, 'ambush_soldiers', ids, 'loud');
    const heatBefore = select.opHeat(w, 'ambush_soldiers', { approach: 'loud', crewIds: ids });
    arm(a, 'sawnoff');
    expect(select.opChance(w, 'ambush_soldiers', ids, 'loud')).toBeGreaterThan(before);
    // …and it costs what it is worth: a sawn-off is a heatMult above 1.
    expect(select.opHeat(w, 'ambush_soldiers', { approach: 'loud', crewIds: ids })).toBeGreaterThan(heatBefore);
  });
});

describe('and nothing they are not on', () => {
  it('leaves a job they were not picked for exactly where it was', () => {
    const w = ready();
    const [onIt, offIt] = crewOf(w);

    const chance = select.opChance(w, 'mugging', [onIt.id], 'loud');
    const heat = select.opHeat(w, 'mugging', { approach: 'loud', crewIds: [onIt.id] });
    const boost = select.jobSkillBoost(w, [onIt.id]);

    // The best gun in the game, in the hands of somebody sitting this one out.
    arm(offIt, 'ar15', 'lockpicks', 'muscle_car');

    expect(select.opChance(w, 'mugging', [onIt.id], 'loud')).toBe(chance);
    expect(select.opHeat(w, 'mugging', { approach: 'loud', crewIds: [onIt.id] })).toBe(heat);
    expect(select.jobSkillBoost(w, [onIt.id])).toEqual(boost);
    expect(jobKit(w, [onIt.id])).toEqual([]);
    // …and the moment they are on it, all of it counts.
    expect(jobKit(w, [onIt.id, offIt.id]).map(i => i.id).sort()).toEqual(['ar15', 'lockpicks', 'muscle_car']);
  });

  it('does not sweep up the rest of the crew just because they are yours', () => {
    const w = ready();
    const [a, b, c] = crewOf(w);
    arm(b, 'sawnoff'); arm(c, 'sawnoff');
    expect(select.jobHeatMult(w, [a.id])).toBe(1);
  });
});

describe('the pooling rule: one of each kind, dearest wins, whole', () => {
  it('does not multiply heat by the number of people carrying the same thing', () => {
    const w = ready();
    const crew = crewOf(w);
    for (const n of crew) arm(n, 'sawnoff');
    arm(w.player, 'sawnoff');
    // Four sawn-offs. Summing would be 1.4^4 ≈ 3.8× heat on one job, which is the whole reason
    // this is not a sum.
    expect(select.jobHeatMult(w, crew.map(n => n.id))).toBeCloseTo(ITEM_DEFS.sawnoff.mods.heatMult!, 5);
  });

  it('takes the dearest weapon anybody brought, and takes its cost with its help', () => {
    const w = ready();
    const [a, b] = crewOf(w);
    // A Benelli is dearer than a sawn-off *and quieter* — the catalogue's whole point. So the
    // pooled kit must be cooler than the cheap gun, not hotter: this is the assertion that fails
    // if somebody ever "improves" the rule into best-value-per-mod.
    expect(ITEM_DEFS.benelli.cost).toBeGreaterThan(ITEM_DEFS.sawnoff.cost);
    expect(ITEM_DEFS.benelli.mods.heatMult!).toBeLessThan(ITEM_DEFS.sawnoff.mods.heatMult!);
    arm(a, 'sawnoff'); arm(b, 'benelli');
    const kit = jobKit(w, [a.id, b.id]);
    expect(kit.map(i => i.id)).toEqual(['benelli']);
    expect(select.jobHeatMult(w, [a.id, b.id])).toBeCloseTo(ITEM_DEFS.benelli.mods.heatMult!, 5);
  });

  it('carries one of each category at once — a gun and a car are not the same slot', () => {
    const w = ready();
    const [a, b] = crewOf(w);
    arm(a, 'sawnoff'); arm(b, 'muscle_car');
    expect(jobKit(w, [a.id, b.id]).map(i => i.category).sort()).toEqual(['vehicle', 'weapon']);
  });

  it('leaves armour out of it entirely, so a light vest cannot cancel somebody else’s plates', () => {
    const w = ready();
    const [a, b] = crewOf(w);
    // A plate carrier is wheels −3 *on the man wearing it*. Pooling armour would let a second man
    // in a vest take that penalty away, which is nonsense — so neither reaches the job at all.
    arm(a, 'plate_carrier'); arm(b, 'vest');
    expect(jobKit(w, [a.id, b.id])).toEqual([]);
    expect(select.jobSkillBoost(w, [a.id, b.id])).toEqual({});
    // …and it is still doing its real work, on the person wearing it.
    expect(kitCover(w, a)).toBe(ITEM_DEFS.plate_carrier.mods.cover);
  });
});

describe('whose hands are on it', () => {
  it('counts the player, because the player is on their own job', () => {
    const w = ready();
    arm(w.player, 'sawnoff');
    expect(jobKit(w, []).map(i => i.id)).toEqual(['sawnoff']);
  });

  it('runs on the crew alone on a night you are not available', () => {
    const w = ready();
    const [a] = crewOf(w);
    arm(w.player, 'ar15');      // the dearest gun, and it is in a cell with you
    arm(a, 'sawnoff');
    expect(jobKit(w, [a.id]).map(i => i.id)).toEqual(['ar15']);

    // Ops resolve at End Day whether or not you can be there (`sim/tick.ts`), so this is a real
    // night and not a hypothetical — and it is the sharpest reason to have armed anybody.
    w.player.jailedDays = 3;
    expect(jobKit(w, [a.id]).map(i => i.id)).toEqual(['sawnoff']);
    w.player.jailedDays = 0;
    w.player.layLowUntil = w.day + 2;
    expect(jobKit(w, [a.id]).map(i => i.id)).toEqual(['sawnoff']);
  });
});
