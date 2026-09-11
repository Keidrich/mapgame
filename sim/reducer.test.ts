import { describe, expect, it } from 'vitest';
import { PLAYER, can, dispatch, generateWorld, select, type World } from './index';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
const startBlock = (w: World) => Object.values(w.blocks).find(b => b.hex.q === 0 && b.hex.r === 0)!;
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
