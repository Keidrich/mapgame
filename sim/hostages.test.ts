import { describe, expect, it } from 'vitest';
import { PLAYER, can, dispatch, generateWorld, select, type Npc, type Safehouse, type World } from './index';
import { SAFEHOUSE_TIERS } from '@content/rackets';
import { allHostages, daysHeld, holdRisk, ransomValue, release, resolveHostage, roomFor, take, tickHostages } from './hostages';
import { resolveOp } from './ops';
import { Rng } from './rng';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });

function safehouse(w: World, opts: { police?: number; population?: number; tier?: number } = {}): Safehouse {
  const b = select.startBlock(w);
  if (opts.police !== undefined) b.police = opts.police;
  if (opts.population !== undefined) b.population = opts.population;
  const s: Safehouse = { id: `sh${Object.keys(w.safehouses).length}`, blockId: b.id, name: 'Back room', tier: opts.tier ?? 1, owner: PLAYER, stash: { booze: 0, green: 0, pills: 0, hot_goods: 0, counterfeit: 0 }, cash: 0, productionIds: [], capacity: 60, hostageIds: [] };
  w.safehouses[s.id] = s; b.safehouseId = s.id; w.player.safehouseIds.push(s.id);
  return s;
}
/** Somebody worth taking, plus a crew member to do it. */
function setup(seed = 5) {
  const w = mk(seed);
  const s = safehouse(w);
  const mark = Object.values(w.npcs).find(n => n.alive && n.role === 'owner' && !n.official)!;
  const muscle = Object.values(w.npcs).find(n => n.alive && n.role === 'patron' && n.id !== mark.id)!;
  muscle.crew = { loyalty: 70, cut: 60, status: 'idle', statusDays: 0, joinedDay: 1 }; muscle.role = 'crew';
  muscle.skills.muscle = 10; muscle.skills.wheels = 10;
  w.player.crewIds.push(muscle.id); w.player.crewEver++;
  return { w, s, mark, muscle };
}

describe('taking someone', () => {
  it('needs a safehouse with room, and refuses officials and people you already hold', () => {
    const { w, s, mark, muscle } = setup();
    expect(can(w, { type: 'plan_op', kind: 'kidnap', crewIds: [muscle.id], targetNpcId: mark.id }).ok).toBe(true);
    const official = Object.values(w.npcs).find(n => n.official)!;
    const off = can(w, { type: 'plan_op', kind: 'kidnap', crewIds: [muscle.id], targetNpcId: official.id });
    expect(off.ok).toBe(false);
    expect(off.ok === false && off.reason).toMatch(/official/i);
    // fill the beds with bodies
    const beds = SAFEHOUSE_TIERS[s.tier - 1].crewBeds;
    for (let i = 0; i < beds; i++) s.hostageIds.push(`filler${i}`);
    expect(roomFor(s, beds)).toBe(0);
    const full = can(w, { type: 'plan_op', kind: 'kidnap', crewIds: [muscle.id], targetNpcId: mark.id });
    expect(full.ok).toBe(false);
    expect(full.ok === false && full.reason).toMatch(/nowhere to put/i);
    s.hostageIds = [];
    take(w, mark, s);
    const again = can(w, { type: 'plan_op', kind: 'kidnap', crewIds: [muscle.id], targetNpcId: mark.id });
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.reason).toMatch(/already have them/i);
  });

  it('a successful op puts them in the safehouse, on both sides of the link', () => {
    const { w, s, mark, muscle } = setup();
    const w2 = dispatch(w, { type: 'plan_op', kind: 'kidnap', crewIds: [muscle.id], targetNpcId: mark.id, safehouseId: s.id });
    const op = Object.values(w2.ops).find(o => o.kind === 'kidnap')!;
    op.status = 'ready'; op.launched = true;
    let held = false;
    for (let i = 0; i < 20 && !held; i++) {
      const t = structuredClone(w2);
      resolveOp(t, t.ops[op.id], new Rng(i));
      if (t.ops[op.id].status !== 'done') continue;
      held = true;
      expect(t.safehouses[s.id].hostageIds).toContain(mark.id);
      expect(t.npcs[mark.id].hostage?.safehouseId).toBe(s.id);
      expect(t.npcs[mark.id].alive).toBe(true);          // held, not killed
      expect(allHostages(t).map(n => n.id)).toContain(mark.id);
      expect(t.player.fear).toBeGreaterThan(w2.player.fear);
    }
    expect(held).toBe(true);
  });

  it('somebody you are holding cannot be met in the street', () => {
    const { w, s, mark } = setup();
    w.player.currentBlockId = mark.homeBlockId;
    expect(can(w, { type: 'visit', npcId: mark.id }).ok).toBe(true);
    take(w, mark, s);
    const r = can(w, { type: 'visit', npcId: mark.id });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/tied to a chair/i);
  });

  it('their own life stops while they are held', () => {
    const { w, s, mark } = setup();
    mark.agenda = { kind: 'debt', progress: 10, rate: 5 };
    mark.grudge = { since: 1, reason: 'test', spread: 0 };
    take(w, mark, s);
    let t = w;
    for (const e of t.pendingEvents.slice()) t = dispatch(t, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    const progress0 = t.npcs[mark.id].agenda!.progress;
    const spread0 = t.npcs[mark.id].grudge!.spread;
    t = dispatch(t, { type: 'end_day' });
    expect(t.npcs[mark.id].agenda!.progress).toBe(progress0);   // no agenda
    expect(t.npcs[mark.id].grudge!.spread).toBe(spread0);       // no gossip
  });
});

describe('the risk of holding someone', () => {
  it('rises with the days, the police and the people around', () => {
    const { w, s, mark } = setup();
    s.blockId = select.startBlock(w).id;
    const block = w.blocks[s.blockId];
    mark.traits = [];
    take(w, mark, s);

    block.police = 40; block.population = 60;
    const day0 = holdRisk(w, mark);
    w.day += 7;
    const day7 = holdRisk(w, mark);
    expect(daysHeld(w, mark)).toBe(7);
    expect(day7).toBeGreaterThan(day0);                 // time is the enemy
    w.day -= 7;

    block.police = 4; block.population = 3;             // a derelict block
    const quiet = holdRisk(w, mark);
    block.police = 70; block.population = 95;           // downtown
    const loud = holdRisk(w, mark);
    expect(quiet).toBeLessThan(loud);
    expect(quiet).toBeLessThan(loud / 5);               // and by a wide margin, with no special rule for it
  });

  it('holding on a derelict block is the cheap option, without anything saying so', () => {
    const { w, mark } = setup();
    const quietHouse = safehouse(w, { police: 5, population: 3 });
    take(w, mark, quietHouse);
    const risk = holdRisk(w, mark);
    expect(risk).toBeLessThan(0.02);                    // days can pass without much happening
    release(w, mark);
    expect(mark.hostage).toBeUndefined();
    expect(quietHouse.hostageIds).not.toContain(mark.id);
  });

  it('when it breaks it costs heat, or they get out, or somebody gets hurt', () => {
    let anyHeat = false, anyEscape = false;
    for (let i = 0; i < 40 && !(anyHeat && anyEscape); i++) {
      const { w, s, mark } = setup();
      w.blocks[s.blockId].police = 90; w.blocks[s.blockId].population = 100;
      take(w, mark, s); w.day += 20;                    // long enough that something must give
      const heat0 = w.player.heat;
      tickHostages(w, new Rng(i));
      if (w.player.heat > heat0) anyHeat = true;
      if (!mark.hostage) anyEscape = true;
    }
    expect(anyHeat).toBe(true);
    expect(anyEscape).toBe(true);
  });
});

describe('settling it', () => {
  it('ransom pays out, frees them, and their people hate you for it', () => {
    const { w, s, mark } = setup();
    const f = Object.values(w.factions)[0];
    mark.faction = f.id; f.cash = 100000;
    take(w, mark, s); w.day += 2;
    const ask = ransomValue(w, mark);
    expect(ask).toBeGreaterThan(0);
    const dirty0 = w.player.dirty; const standing0 = f.standing[PLAYER];
    const tone = resolveHostage(w, mark, 'ransom', new Rng(1));
    expect(tone).toBe('good');
    expect(w.player.dirty).toBe(dirty0 + ask);
    expect(mark.hostage).toBeUndefined();
    expect(s.hostageIds).not.toContain(mark.id);
    expect(f.standing[PLAYER]).toBeLessThan(standing0);
  });

  it('ransom on somebody nobody will pay for leaves you with a grudge and no money', () => {
    const { w, s, mark } = setup();
    const f = Object.values(w.factions)[0];
    mark.faction = f.id; f.cash = 0;
    for (const b of Object.values(w.businesses)) if (b.ownerId === mark.id) b.ownerId = 'nobody';
    take(w, mark, s);
    const dirty0 = w.player.dirty;
    expect(resolveHostage(w, mark, 'ransom', new Rng(1))).toBe('bad');
    expect(w.player.dirty).toBe(dirty0);
    expect(f.grudges.some(g => g.startsWith('took:'))).toBe(true);
  });

  it('leverage trades the money for a hold over them, and can fail', () => {
    let worked = false, failed = false;
    for (let i = 0; i < 30 && !(worked && failed); i++) {
      const { w, s, mark } = setup(i + 1);
      mark.nerve = 50; w.player.skills.charm = 4;
      take(w, mark, s); w.day += 2;
      const dirty0 = w.player.dirty;
      const tone = resolveHostage(w, mark, 'leverage', new Rng(i));
      expect(w.player.dirty).toBe(dirty0);              // never about the cash
      expect(mark.hostage).toBeUndefined();
      if (tone === 'good') { worked = true; expect(mark.rel.fear).toBeGreaterThan(30); }
      else { failed = true; expect(mark.grudge).toBeDefined(); }
    }
    expect(worked).toBe(true);
    expect(failed).toBe(true);
  });

  it('letting them go costs an action and ends it', () => {
    let { w, s, mark } = setup();
    take(w, mark, s);
    for (const e of w.pendingEvents.slice()) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    const ap0 = w.player.ap;
    expect(can(w, { type: 'resolve_hostage', npcId: mark.id, mode: 'release' }).ok).toBe(true);
    w = dispatch(w, { type: 'resolve_hostage', npcId: mark.id, mode: 'release' });
    expect(w.player.ap).toBe(ap0 - 1);
    expect(w.npcs[mark.id].hostage).toBeUndefined();
    expect(w.safehouses[s.id].hostageIds).toHaveLength(0);
    // and you cannot settle somebody you are not holding
    expect(can(w, { type: 'resolve_hostage', npcId: mark.id, mode: 'ransom' }).ok).toBe(false);
    void (undefined as unknown as Npc);
  });
});
