/**
 * The family (`sim/family.ts`, `content/family.ts`): making members, the two posts and what they
 * do, rats and coups, and the underboss as heir.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CONSIGLIERE, MAKING, RAT } from '@r/content/family';
import { can, dispatch, newWorld, select, PLAYER, type World } from '@r/sim/index';
import { hire } from '@r/sim/people';
import { tickFamily } from '@r/sim/family';
import { heirOf } from '@r/sim/legacy';
import { openCase } from '@r/sim/law';
import { lobbyCost } from '@r/sim/commission';
import { runnerFactor } from '@r/sim/economy';
import { Rng } from '@r/sim/rng';
import { missing, run, FAMILY_SYSTEMS, SYSTEMS } from '@r/scripts/bot';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

function mk(): World {
  const w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' });
  const pool = Object.values(w.npcs).filter(n => n.alive && !n.faction && !n.official && n.role !== 'fixer').slice(0, 4);
  for (const n of pool) { hire(w, n, 80); n.crew!.level = 2; n.crew!.loyalty = 60; }
  w.player.cash = 50000;
  return w;
}
const night = (w: World) => dispatch(w, { type: 'nightfall' });
const clear = (w: World) => { while (w.events.length) w = dispatch(w, { type: 'resolve_event', eventId: w.events[0].id, optionId: w.events[0].options[w.events[0].options.length - 1].id }); return w; };

describe('making members', () => {
  it('needs the night, level 2 and loyalty 50, and money; it raises loyalty and the cut', () => {
    let w = mk();
    const n = w.npcs[w.player.crewIds[0]];
    expect(can(w, { type: 'make_member', npcId: n.id }).why).toMatch(/daylight/);
    w = clear(night(w));
    w.npcs[n.id].crew!.loyalty = 40;
    expect(can(w, { type: 'make_member', npcId: n.id }).why).toMatch(/Loyalty 50/);
    w.npcs[n.id].crew!.loyalty = 60;
    const cut = w.npcs[n.id].crew!.cut;
    const cash = w.player.cash + w.player.dirty;
    w = dispatch(w, { type: 'make_member', npcId: n.id });
    const m = w.npcs[n.id].crew!;
    expect(m.made).toBe(true);
    expect(m.loyalty).toBe(60 + MAKING.loyaltyGain);
    expect(m.cut).toBe(Math.round(cut * MAKING.cutRise));
    expect(w.player.cash + w.player.dirty).toBe(cash - MAKING.cost);
    expect(select.familyRank(w, w.npcs[n.id])).toBe('soldier');
  });

  it('a made man never walks out, however unhappy', () => {
    const w = mk();
    const n = w.npcs[w.player.crewIds[0]];
    n.crew!.made = true; n.crew!.loyalty = 5;
    tickFamily(w, new Rng(1));
    expect(n.crew!.loyalty).toBeGreaterThanOrEqual(30);
  });
});

describe('the posts', () => {
  it('only a made man sits at the top; one person, one post', () => {
    let w = mk();
    const [a] = w.player.crewIds;
    expect(can(w, { type: 'appoint', post: 'consigliere', npcId: a }).why).toMatch(/made/);
    w.npcs[a].crew!.made = true;
    w = dispatch(w, { type: 'appoint', post: 'consigliere', npcId: a });
    expect(select.consigliere(w)?.id).toBe(a);
    w = dispatch(w, { type: 'appoint', post: 'underboss', npcId: a });
    expect(select.underboss(w)?.id).toBe(a);
    expect(select.consigliere(w)).toBeUndefined();
  });

  it('the consigliere is worth what the content says at the table and at the Commission', () => {
    let w = mk();
    const f = Object.values(w.factions)[0];
    const [a] = w.player.crewIds;
    const before = { sit: select.sitDownOdds(w, f, 'split').chance, lobby: lobbyCost(f, w), tribute: select.tributeEffect(f, 3000, w) };
    w.npcs[a].crew!.made = true;
    w = dispatch(w, { type: 'appoint', post: 'consigliere', npcId: a });
    const f2 = w.factions[f.id];
    expect(select.sitDownOdds(w, f2, 'split').chance).toBe(Math.min(95, before.sit + CONSIGLIERE.sitDown + w.npcs[a].skills.charm));
    expect(lobbyCost(f2, w)).toBeLessThan(before.lobby);
    expect(select.tributeEffect(f2, 3000, w)).toBeGreaterThanOrEqual(before.tribute);
  });

  it('the underboss keeps rackets nobody minds earning, and is the heir first', () => {
    let w = mk();
    const b = Object.values(w.businesses).find(x => x.tier < 3)!;
    b.protection = { by: PLAYER, rate: 0.12, since: 1 };
    w.rackets.rz = { id: 'rz', kind: 'numbers', businessId: b.id, owner: PLAYER, level: 1, started: 1, lastIncome: 0, down: 0 }; b.racketIds.push('rz'); w.player.racketIds.push('rz');
    expect(runnerFactor(w, w.rackets.rz)).toBe(0.6);
    const [a] = w.player.crewIds;
    w.npcs[a].crew!.made = true; w.npcs[a].crew!.level = 1; w.npcs[a].crew!.loyalty = 30;
    w = dispatch(w, { type: 'appoint', post: 'underboss', npcId: a });
    expect(runnerFactor(w, w.rackets.rz)).toBeGreaterThan(0.6);
    expect(heirOf(w)?.id).toBe(a);
  });
});

describe('betrayal', () => {
  it('a rat thickens the worst file every night, and is found sooner with a consigliere', () => {
    const w = mk();
    const [ratId, cgId] = w.player.crewIds;
    const file = openCase(w, 'robbery', PLAYER, undefined, 'A test file.', 30);
    w.npcs[ratId].crew!.rat = { since: w.day };
    tickFamily(w, new Rng(2));
    expect(w.cases[file.id].evidence).toBe(30 + RAT.evidence);
    w.npcs[cgId].crew!.made = true; w.player.family = { consigliere: cgId };
    let found = 0;
    for (let i = 0; i < 40 && !found; i++) { tickFamily(w, new Rng(100 + i)); found = w.scheduled.filter(s => s.template === 'rat_found').length; }
    expect(found).toBe(1);
  });

  it('an unhappy associate with a file open can turn', () => {
    const w = mk();
    openCase(w, 'robbery', PLAYER, undefined, 'A test file.', 30);
    for (const id of w.player.crewIds) w.npcs[id].crew!.loyalty = 16;
    let turned = false;
    for (let i = 0; i < 200 && !turned; i++) { tickFamily(w, new Rng(i)); turned = w.player.crewIds.some(id => w.npcs[id].crew?.rat); }
    expect(turned).toBe(true);
  });

  it('feeding a rat lies cuts the file, and it goes on shrinking', () => {
    let w = mk();
    const [ratId] = w.player.crewIds;
    const file = openCase(w, 'robbery', PLAYER, undefined, 'A test file.', 50);
    w.npcs[ratId].crew!.rat = { since: 1, found: true };
    w.scheduled.push({ day: w.day, template: 'rat_found', npcId: ratId });
    w = dispatch(w, { type: 'end_day' });
    const card = w.events.find(e => e.template === 'rat_found')!;
    expect(card.options.map(o => o.id)).toEqual(['whack', 'exile', 'feed']);
    const before = w.cases[file.id].evidence;
    w = dispatch(w, { type: 'resolve_event', eventId: card.id, optionId: 'feed' });
    expect(w.cases[file.id].evidence).toBe(Math.max(0, before - RAT.fedCut));
    tickFamily(w, new Rng(3));
    expect(w.cases[file.id].evidence).toBe(Math.max(0, before - RAT.fedCut - 1));
  });

  it('a capo who walks takes his district dark', () => {
    let w = mk();
    const [cap] = w.player.crewIds;
    const d = Object.values(w.districts)[0];
    const b = w.businesses[w.blocks[d.blockIds[0]].businessIds[0]] ?? Object.values(w.businesses).find(x => w.blocks[x.blockId].districtId === d.id)!;
    b.protection = { by: PLAYER, rate: 0.12, since: 1 };
    w.rackets.rq = { id: 'rq', kind: 'numbers', businessId: b.id, owner: PLAYER, level: 1, started: 1, lastIncome: 0, down: 0 }; b.racketIds.push('rq'); w.player.racketIds.push('rq');
    w.npcs[cap].crew!.assignment = { kind: 'district', districtId: d.id }; w.npcs[cap].crew!.made = true;
    w.scheduled.push({ day: w.day, template: 'coup', npcId: cap });
    w = dispatch(w, { type: 'end_day' });
    const card = w.events.find(e => e.template === 'coup')!;
    expect(card.options.map(o => o.id)).toEqual(['pay', 'face', 'go']);
    w = dispatch(w, { type: 'resolve_event', eventId: card.id, optionId: 'go' });
    expect(w.player.crewIds).not.toContain(cap);
    expect(w.rackets.rq.down).toBeGreaterThanOrEqual(9);
  });
});

describe('the family scenario', () => {
  it('reaches rats and coups, which a well-run outfit never meets in sixty days', () => {
    const r = run({ days: 60, seed: 7, size: 'medium', scenario: 'family' });
    const rows = SYSTEMS.filter(s => FAMILY_SYSTEMS.includes(s.label)).map(s => s.label);
    expect(rows.filter(l => missing(r.counts).includes(l))).toEqual([]);
  }, 60000);
});
