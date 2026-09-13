import { describe, expect, it } from 'vitest';
import { PLAYER, approachChance, can, dispatch, generateWorld, select, type World } from './index';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
const startBlock = (w: World) => select.startBlock(w);
const softTarget = (w: World) => select.businessesIn(w, startBlock(w).id).concat(...Object.values(w.blocks).filter(b => select.distanceFromStart(w, b.id) <= 1).map(b => select.businessesIn(w, b.id)))
  .filter(b => !b.protection && b.ownedBy === 'npc' && b.type !== 'bank' && b.type !== 'armored_depot').sort((a, b) => w.npcs[a.ownerId].nerve - w.npcs[b.ownerId].nerve)[0];

describe('reducer', () => {
  it('never mutates the previous world', () => {
    const w = mk(); const snap = JSON.stringify(w);
    const n = select.businessesIn(w, startBlock(w).id)[0].ownerId;
    dispatch(w, { type: 'visit', npcId: n });
    expect(JSON.stringify(w)).toBe(snap);
  });
  it('is deterministic: same actions, same world', () => {
    const run = () => { let w = mk(); const n = select.businessesIn(w, startBlock(w).id)[0].ownerId; w = dispatch(w, { type: 'visit', npcId: n }); w = dispatch(w, { type: 'threaten', npcId: n }); for (let i = 0; i < 5; i++) { for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options[e.options.length - 1].id }); w = dispatch(w, { type: 'end_day' }); } return JSON.stringify(w); };
    expect(run()).toBe(run());
  });
  it('spends AP and refuses when out of AP', () => {
    let w = mk(); const n = select.businessesIn(w, startBlock(w).id)[0].ownerId;
    for (let i = 0; i < 8; i++) w = dispatch(w, { type: 'visit', npcId: n });
    expect(w.player.ap).toBe(0);
    expect(can(w, { type: 'visit', npcId: n }).ok).toBe(false);
    const before = w.npcs[n].rel.trust; w = dispatch(w, { type: 'visit', npcId: n });
    expect(w.npcs[n].rel.trust).toBe(before);
  });
  it('protection needs fear first, then pays out daily', () => {
    let w = mk(); const t = softTarget(w);
    expect(can(w, { type: 'protect', businessId: t.id, rate: 0.15 }).ok).toBe(false);
    let tries = 0;
    while (!can(w, { type: 'protect', businessId: t.id, rate: 0.15 }).ok && tries++ < 12) { if (w.player.ap === 0) { for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id }); w = dispatch(w, { type: 'end_day' }); } w = dispatch(w, { type: 'threaten', npcId: t.ownerId }); }
    w = dispatch(w, { type: 'protect', businessId: t.id, rate: 0.15 });
    expect(w.businesses[t.id].protection?.factionId).toBe(PLAYER);
    expect(w.player.racketIds.length).toBe(1);
    for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    const dirty = w.player.dirty; w = dispatch(w, { type: 'end_day' });
    expect(w.player.dirty).toBeGreaterThan(dirty);
    expect(w.player.ap).toBe(w.player.apMax);
  });
  it('a friend does not have to be frightened first', () => {
    let w = mk(); const t = softTarget(w);
    const owner = w.npcs[t.ownerId];
    owner.rel.fear = 0; owner.rel.respect = 0; owner.nerve = Math.max(owner.nerve, 30); owner.rel.trust = 45;
    // a favour, yes; a third of the till, no
    const greedy = can(w, { type: 'protect', businessId: t.id, rate: 0.3 });
    expect(greedy.ok).toBe(false);
    expect(greedy.ok === false && greedy.reason).toMatch(/not a favour/i);
    expect(can(w, { type: 'protect', businessId: t.id, rate: 0.15 }).ok).toBe(true);
    w = dispatch(w, { type: 'protect', businessId: t.id, rate: 0.15 });
    expect(w.businesses[t.id].protection?.factionId).toBe(PLAYER);
    const after = w.npcs[t.ownerId];
    expect(after.rel.fear).toBe(0);                       // nobody got hurt to get here
    expect(after.rel.trust).toBeGreaterThan(45);          // and it brought you closer, not further
  });
  it('a stranger is told both doors, not just the violent one', () => {
    const w = mk(); const t = softTarget(w);
    const owner = w.npcs[t.ownerId];
    owner.rel.fear = 0; owner.rel.respect = 0; owner.nerve = Math.max(owner.nerve, 30); owner.rel.trust = 0;
    const r = can(w, { type: 'protect', businessId: t.id, rate: 0.15 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/scared/i);
    expect(r.ok === false && r.reason).toMatch(/trust to 40/i);
  });
  it('an owner takes far more talking round than a regular', () => {
    const w = mk(); const t = softTarget(w); const owner = w.npcs[t.ownerId];
    owner.rel.trust = 50; w.player.skills.charm = 6; owner.traits = [];
    const asOwner = approachChance(w, 'recruit', 'promise', owner);
    owner.role = 'patron';
    const asPatron = approachChance(w, 'recruit', 'promise', owner);
    expect(asOwner).toBeLessThan(asPatron);
    expect(asPatron - asOwner).toBeGreaterThan(20);
  });
  it('a recruited owner brings their place in as a partner, and takes it back when they go', () => {
    let w = mk(); const t = softTarget(w); const owner = w.npcs[t.ownerId];
    owner.rel.trust = 95; owner.traits = []; w.player.skills.charm = 10;
    w.player.currentBlockId = owner.homeBlockId;
    let tries = 0;
    while (!w.npcs[owner.id].crew && tries++ < 20) {
      if (w.player.ap === 0) { for (const e of w.pendingEvents.slice()) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id }); w = dispatch(w, { type: 'end_day' }); }
      w = dispatch(w, { type: 'recruit', npcId: owner.id, approach: 'promise' });
    }
    expect(w.npcs[owner.id].crew).toBeDefined();
    const b = w.businesses[t.id];
    expect(b.protection?.partner).toBe(true);
    expect(b.protection?.rate).toBe(0.2);                     // not a negotiation
    expect(b.protection?.factionId).toBe(PLAYER);
    const r = w.rackets[b.racketIds.find(id => w.rackets[id].kind === 'protection')!];
    expect(r).toBeDefined();
    expect(r.runnerId).toBeUndefined();                       // nobody stands over it
    expect(w.npcs[owner.id].crew!.status).toBe('idle');       // and they are free for other work
    // it pays like any protection racket
    for (const e of w.pendingEvents.slice()) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    const dirty = w.player.dirty; w = dispatch(w, { type: 'end_day' });
    expect(w.player.dirty).toBeGreaterThan(dirty);
    // and it lasts exactly as long as the partner does
    for (const e of w.pendingEvents.slice()) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    w = dispatch(w, { type: 'fire', npcId: owner.id });
    w = dispatch(w, { type: 'end_day' });
    expect(w.businesses[t.id].protection).toBeUndefined();
    expect(w.player.racketIds.some(id => w.rackets[id]?.businessId === t.id)).toBe(false);
  });
  it('the testing tools all apply, and leave a world the sim still plays', () => {
    let w = mk();
    const all = ['cash', 'dirty', 'ap', 'legwork', 'heat', 'skills', 'crew', 'unlock', 'safehouse', 'own_block', 'turf', 'reveal', 'stash'] as const;
    expect(w.cheated).toBeUndefined();
    for (const what of all) { expect(can(w, { type: 'cheat', what }).ok).toBe(true); w = dispatch(w, { type: 'cheat', what }); }
    expect(w.cheated).toBe(true);
    expect(w.player.cash).toBeGreaterThanOrEqual(10000);
    expect(w.player.ap).toBe(w.player.apMax);
    expect(w.player.heat).toBe(0);
    expect(w.player.crewIds.length).toBe(3);
    expect(w.player.safehouseIds.length).toBe(1);
    expect(select.opsAvailable(w)).toContain('heist_bank');
    expect(select.controller(w.blocks[w.player.currentBlockId])).toBe(PLAYER);
    // and the day still ends cleanly on top of all of it
    for (const e of w.pendingEvents.slice()) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    w = dispatch(w, { type: 'end_day' });
    expect(w.day).toBe(2);
    expect(w.gameOver).toBeUndefined();
  });
  it('buying a business requires trust or a premium', () => {
    let w = mk(); const b = select.businessesIn(w, startBlock(w).id).find(b => b.type !== 'bank' && b.type !== 'armored_depot')!;
    w.player.cash = 1e6;
    expect(can(w, { type: 'buy_business', businessId: b.id, offer: b.value }).ok).toBe(false);
    expect(can(w, { type: 'buy_business', businessId: b.id, offer: b.value * 1.2 }).ok).toBe(true);
    w = dispatch(w, { type: 'buy_business', businessId: b.id, offer: b.value * 1.2 });
    expect(w.businesses[b.id].ownedBy).toBe('player');
    expect(select.availableRackets(w, w.businesses[b.id])).not.toContain('protection');
  });
  it('safehouse + production makes product; raids and busts do not corrupt state', () => {
    let w = mk(); w.player.cash = 50000;
    w = dispatch(w, { type: 'rent_safehouse', blockId: startBlock(w).id });
    const s = w.safehouses[w.player.safehouseIds[0]];
    w = dispatch(w, { type: 'start_production', safehouseId: s.id, kind: 'still' });
    const pid = w.safehouses[s.id].productionIds[0];
    w = dispatch(w, { type: 'restock_production', productionId: pid, days: 3 });
    w.player.heat = 100;
    for (let i = 0; i < 3; i++) { for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id }); w = dispatch(w, { type: 'end_day' }); }
    expect(w.player.busts).toBe(1);
    expect(w.player.heat).toBeLessThan(100);
    expect(Number.isFinite(w.player.cash)).toBe(true);
    for (const v of Object.values(w.safehouses[s.id].stash)) expect(Number.isFinite(v)).toBe(true);
  });
  it('sit-down cede block moves influence and improves standing', () => {
    let w = mk(); const f = Object.values(w.factions)[0]; const b = startBlock(w);
    b.influence[PLAYER] = 80;
    const before = f.standing[PLAYER];
    w = dispatch(w, { type: 'sit_down', factionId: f.id, offer: { kind: 'cede_block', blockId: b.id } });
    expect(w.factions[f.id].standing[PLAYER]).toBeGreaterThan(before);
    expect(select.blockController(w, b.id)).toBe(f.id);
  });
  it('declaring war makes the faction hostile and the faction AI reacts', () => {
    let w = mk(); const f = Object.values(w.factions)[0];
    w.player.crewIds = []; // no crew → refused
    expect(can(w, { type: 'declare', factionId: f.id, stance: 'war' }).ok).toBe(false);
  });
});

describe('street crews', () => {
  const world = () => { let w = mk(9); w.player.cash = 50000; return w; };
  it('spawn on open blocks in the right districts and hold influence', () => {
    const w = world();
    const crews = Object.values(w.crews);
    expect(crews.length).toBeGreaterThan(0);
    for (const c of crews) {
      expect(select.blockController(w, c.blockId)).toBe(c.id);
      expect(w.npcs[c.bossId].role).toBe('gang_boss');
      expect(select.factionName(w, c.id)).toContain(c.name);
    }
  });
  it('parley can put a crew on the payroll, which flips the block', () => {
    let w = world(); const c = Object.values(w.crews)[0]; const boss = w.npcs[c.bossId];
    w.player.currentBlockId = c.blockId; // you have to be on the corner to talk to them
    w.player.skills.charm = 10; w.player.respect = 90; w.player.fear = 60; boss.traits = ['greedy', 'coward']; c.strength = 1;
    expect(approachChance(w, 'parley', 'tribute', boss)).toBeGreaterThan(80);
    let tries = 0;
    while (!w.crews[c.id]?.tribute && tries++ < 6) { w = dispatch(w, { type: 'parley', npcId: boss.id, approach: 'tribute' }); w.player.ap = 8; }
    expect(w.crews[c.id].tribute).toBe(PLAYER);
    expect(select.blockController(w, c.blockId)).toBe(PLAYER);
  });
  it('a takeover op dissolves the crew and takes the corner', () => {
    let w = world(); const c = Object.values(w.crews)[0];
    // give the player a strong crew member
    const patron = Object.values(w.npcs).find(n => n.role === 'patron')!; patron.rel.trust = 80; patron.skills.muscle = 10;
    w.player.currentBlockId = patron.homeBlockId;
    let tries = 0;
    while (!w.npcs[patron.id].crew && tries++ < 6) { w = dispatch(w, { type: 'recruit', npcId: patron.id, approach: 'cut' }); w.player.ap = 8; }
    expect(w.npcs[patron.id].crew).toBeDefined();
    w.player.heat = 0; w.crews[c.id].strength = 1;
    w = dispatch(w, { type: 'plan_op', kind: 'takeover', crewIds: [patron.id], targetBlockId: c.blockId });
    const op = Object.values(w.ops).find(o => o.kind === 'takeover')!;
    expect(op.status).toBe('ready');
    expect(select.opChance(w, 'takeover', [patron.id])).toBeGreaterThan(60);
    w = dispatch(w, { type: 'launch_op', opId: op.id });
    for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    w = dispatch(w, { type: 'end_day' });
    const done = w.ops[op.id];
    expect(['done', 'failed']).toContain(done.status);
    if (done.status === 'done') { expect(w.crews[c.id]).toBeUndefined(); expect(select.blockController(w, c.blockId)).toBe(PLAYER); }
  });
  it('ignored crews grow and get absorbed by a neighbouring faction', () => {
    let w = world(); const c = Object.values(w.crews)[0]; c.strength = 7.9;
    // one neighbour, unambiguously theirs: absorption follows whoever holds the next block
    const nb = w.blocks[c.blockId].neighborIds[0]; const f = Object.values(w.factions)[0];
    for (const other of w.blocks[c.blockId].neighborIds) w.blocks[other].influence = {};
    w.blocks[nb].influence[f.id] = 80;
    for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    w = dispatch(w, { type: 'end_day' });
    expect(w.crews[c.id]).toBeUndefined();
    expect(select.blockController(w, c.blockId)).toBe(f.id);
  });
});
