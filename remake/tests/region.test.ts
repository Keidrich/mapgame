/**
 * The region: the cities down the road. What it promises — the first city is exactly what it was,
 * a second city is the same for every save with the seed, the road opens at a quarter of a city,
 * the fare and the route's price are what they say — and that the scenario reaches all of it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { generateCity } from '@r/sim/city';
import { can, dispatch, migrate, newWorld, select, PLAYER, type World } from '@r/sim/index';
import { hire } from '@r/sim/people';
import { buildJob } from '@r/sim/jobs';
import { REGION, controlIn, foundCity, routePrice } from '@r/sim/region';
import { generateRegion } from '@r/sim/regionmap';
import { Rng } from '@r/sim/rng';
import { missing, REGION_SYSTEMS, run, SYSTEMS } from '@r/scripts/bot';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

const mk = (seed = 7) => newWorld({ seed, size: 'medium', name: 'T', background: 'grifter' });
const endDay = (w: World) => { w.events = []; return dispatch(w, { type: 'end_day' }); };
const second = (w: World) => w.region!.cities.find(c => c.id !== 'c0' && c.links.includes('c0'))!;
/** Straight to a second city, as if the road had opened. */
function go(w: World): World { const c = second(w); c.open = true; w.player.cash = 50000; w.player.ap = 9; return dispatch(w, { type: 'travel_city', cityId: c.id }); }

describe('the region map', () => {
  it.each([1, 2, 7, 11])('seed %i: five or six cities, all reachable from home, named once each, home paying the street\'s price', seed => {
    const w = mk(seed);
    const cs = w.region!.cities;
    expect(cs.length).toBeGreaterThanOrEqual(5); expect(cs.length).toBeLessThanOrEqual(6);
    expect(cs[0]).toMatchObject({ id: 'c0', founded: true, name: w.city.name });
    expect(new Set(cs.map(c => c.name)).size).toBe(cs.length);
    const seen = new Set(['c0']); const q = ['c0'];
    while (q.length) { const at = q.shift()!; for (const id of cs.find(c => c.id === at)!.links) if (!seen.has(id)) { seen.add(id); q.push(id); } }
    expect(seen.size).toBe(cs.length);
    expect(Object.values(cs[0].demand).every(d => d === 1)).toBe(true);
    for (const c of cs) for (const l of c.links) expect(cs.find(x => x.id === l)!.links).toContain(c.id);
  });
  it('comes from its own stream: generating it twice gives the same region, and it changes nothing else', () => {
    const w = mk();
    const before = JSON.stringify({ ...w, region: undefined });
    expect(generateRegion(w)).toEqual(w.region);
    expect(JSON.stringify({ ...w, region: undefined })).toBe(before);
  });
  it('a save from before the region gains one, with only its own city founded', () => {
    const w = mk();
    delete (w as { region?: unknown }).region;
    migrate(w);
    expect(w.region!.cities.filter(c => c.founded).map(c => c.id)).toEqual(['c0']);
  });
});

describe('a second city', () => {
  it('is the same city with its ids prefixed: a prefix changes no name, shape or count', () => {
    const a = generateCity(99, 'small'), b = generateCity(99, 'small', 'c3.');
    expect(Object.keys(b.blocks)).toEqual(Object.keys(a.blocks).map(k => `c3.${k}`));
    expect(Object.values(b.blocks).map(x => x.name)).toEqual(Object.values(a.blocks).map(x => x.name));
    expect(Object.values(b.districts).map(d => d.blockIds.every(id => id.startsWith('c3.')))).not.toContain(false);
  });
  it('is closed until a city on the road to it is a quarter yours', () => {
    let w = mk();
    const c = second(w);
    expect(can(w, { type: 'travel_city', cityId: c.id }).why).toMatch(/quarter/);
    const home = Object.values(w.blocks);
    // comfortably past the line, so one night of outfits pushing back does not take it under again
    for (const b of home.slice(0, Math.ceil(home.length * (REGION.unlockAt + 0.1)))) b.influence[PLAYER] = 100;
    expect(controlIn(w, 'c0')).toBeGreaterThanOrEqual(REGION.unlockAt);
    w = endDay(w);
    expect(w.region!.cities.find(x => x.id === c.id)!.open).toBe(true);
    w.player.cash = 50000; w.player.ap = 9; w.events = [];   // whatever the night brought is answered
    const q = can(w, { type: 'travel_city', cityId: c.id });
    expect(q.ok).toBe(true);
    expect(q.cash).toBe(select.fare(w, c.id));
  });
  it('is generated on arrival, into the same world, with no id colliding and every piece belonging to it', () => {
    const w0 = mk();
    const counts = { blocks: Object.keys(w0.blocks).length, npcs: Object.keys(w0.npcs).length, factions: Object.keys(w0.factions).length };
    const c = second(w0);
    const w = go(w0);
    const mine = Object.values(w.blocks).filter(b => w.districts[b.districtId].cityId === c.id);
    expect(mine.length).toBeGreaterThan(20);
    expect(Object.keys(w.blocks).length).toBe(counts.blocks + mine.length);
    for (const b of mine) { expect(b.id.startsWith(`${c.id}.`)).toBe(true); for (const n of b.neighborIds) expect(w.districts[w.blocks[n].districtId].cityId).toBe(c.id); }
    expect(Object.keys(w.npcs).length).toBeGreaterThan(counts.npcs);
    expect(Object.keys(w.factions).filter(id => id.startsWith(`${c.id}.`)).length).toBeGreaterThanOrEqual(3);
    expect(select.currentCity(w)).toBe(c.id);
    expect(w.blocks[w.player.blockId].influence[PLAYER]).toBeGreaterThanOrEqual(10);
    expect(select.controlShare(w)).toBe(controlIn(w, 'c0'));
  });
  it('is the same second city for every save with the seed', () => {
    const a = go(mk()), b = go(mk());
    const c = second(a).id;
    const names = (w: World) => Object.values(w.factions).filter(f => f.id.startsWith(c)).map(f => f.name).concat(Object.values(w.districts).filter(d => d.cityId === c).map(d => d.name));
    expect(names(a)).toEqual(names(b));
  });
  it('you cannot walk there, and the train back puts you in your own city, not a new copy of it', () => {
    let w = go(mk());
    const home = Object.values(w.blocks).find(b => !w.districts[b.districtId].cityId)!;
    expect(can(w, { type: 'travel', blockId: home.id }).why).toMatch(/train/);
    const n = Object.keys(w.blocks).length;
    w.player.ap = 9;
    w = dispatch(w, { type: 'travel_city', cityId: 'c0' });
    expect(select.currentCity(w)).toBe('c0');
    expect(Object.keys(w.blocks).length).toBe(n);
  });
  it('pays its own price for what you sell', () => {
    const w = go(mk());
    const c = second(w);
    const p = (Object.keys(c.demand) as (keyof typeof c.demand)[]).find(k => c.demand[k] !== 1)!;
    const there = w.player.blockId;
    const home = Object.values(w.blocks).find(b => !w.districts[b.districtId].cityId && b.wealth === w.blocks[there].wealth);
    if (home) expect(select.streetPrice(w, p, there)).toBe(Math.round(select.streetPrice(w, p, home.id) * c.demand[p]) || select.streetPrice(w, p, there));
    else expect(select.streetPrice(w, p, there)).toBeGreaterThan(0);
  });
  it('survives a save: a two-city world round-trips through JSON and migrate unchanged', () => {
    const w = go(mk());
    const s = JSON.stringify(w);
    expect(JSON.stringify(migrate(JSON.parse(s)))).toBe(s);
  });
});

describe('trade and work between cities', () => {
  function twoDoors(): World {
    let w = go(mk());
    w = dispatch(w, { type: 'rent_safehouse', blockId: w.player.blockId });
    const home = Object.values(w.blocks).find(b => !w.districts[b.districtId].cityId && b.businessIds.length)!;
    home.influence[PLAYER] = 40;
    const id = 'sh-home'; w.safehouses[id] = { id, blockId: home.id, name: 'x', tier: 1, labs: [] }; home.safehouseId = id; w.player.safehouseIds.push(id);
    return w;
  }
  it('a route needs a back room at both ends and costs what the button says', () => {
    let w = go(mk());
    const c = second(w);
    expect(can(w, { type: 'open_route', from: 'c0', to: c.id, product: 'booze' }).ok).toBe(false);
    w = twoDoors();
    const q = can(w, { type: 'open_route', from: 'c0', to: c.id, product: 'booze' });
    expect(q.cash).toBe(REGION.routeSetup);
    const cash = w.player.cash + w.player.dirty;
    w = dispatch(w, { type: 'open_route', from: 'c0', to: c.id, product: 'booze' });
    expect(w.player.cash + w.player.dirty).toBe(cash - REGION.routeSetup);
    expect(can(w, { type: 'open_route', from: 'c0', to: c.id, product: 'booze' }).ok).toBe(false);
  });
  it('a route sells up to its nightly load at the far city\'s price, the number the sheet shows', () => {
    let w = twoDoors();
    const c = second(w);
    w = dispatch(w, { type: 'open_route', from: 'c0', to: c.id, product: 'booze' });
    w.player.stash.booze = { n: 30, q: 60 };
    const each = routePrice(w, { to: c.id, product: 'booze' });
    for (let k = 0; k < 20; k++) {
      const x = structuredClone(w); x.rng = 77 + k * 131;
      const dirty = x.player.dirty;
      const y = endDay(x);
      const moved = y.routes![0].moved ?? 0;
      if (!moved) continue;                                  // stopped on the road: try another night
      expect(moved).toBe(REGION.routePerDay);
      expect(y.player.stash.booze.n).toBeLessThanOrEqual(30 - REGION.routePerDay);
      expect(y.log.some(l => l.text.includes(`${(REGION.routePerDay * each).toLocaleString('en-US')}`) || l.text.includes('The routes moved'))).toBe(true);
      expect(y.player.dirty).toBeGreaterThan(dirty);
      return;
    }
    throw new Error('every night was a bust');
  });
  it('a job in another city runs without you: it needs somebody to go, and your own skills do not count', () => {
    const w = go(mk());
    const home = Object.values(w.businesses).find(b => !w.districts[w.blocks[b.blockId].districtId].cityId && b.tier < 3 && b.ownedBy !== PLAYER)!;
    const j = buildJob(w, new Rng(3), { kind: 'burglary', blockId: home.blockId, businessId: home.id })!;
    j.status = 'ready'; w.player.ap = 9;
    expect(select.present(w, j)).toBe(false);
    expect(can(w, { type: 'launch_job', jobId: j.id, approach: 'quiet' }).why).toMatch(/send somebody/);
    const odds = select.jobOdds(w, j, [], 'quiet');
    expect(odds.factors.some(f => /without you/.test(f.label))).toBe(true);
    const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.faction && !x.official)!; hire(w, n, 100);
    j.crewIds = [n.id];
    expect(can(w, { type: 'launch_job', jobId: j.id, approach: 'quiet' }).ok).toBe(true);
    w.player.skills.brains = 10; w.player.skills.tech = 10;
    expect(select.jobOdds(w, j, [n.id], 'quiet').chance).toBe(select.jobOdds({ ...w, player: { ...w.player, skills: { ...w.player.skills, brains: 1, tech: 1 } } }, j, [n.id], 'quiet').chance);
  });
});

describe('the region scenario', () => {
  it('goes to another city, runs a trade route and works from a distance', () => {
    const r = run({ days: 60, seed: 7, size: 'medium', scenario: 'region' });
    const reached = SYSTEMS.filter(s => REGION_SYSTEMS.includes(s.label)).map(s => s.label).filter(l => !missing(r.counts).includes(l));
    expect(reached).toEqual(REGION_SYSTEMS);
    expect(r.w.region!.cities.filter(c => c.founded).length).toBeGreaterThanOrEqual(2);
    void foundCity;
  }, 120000);
});

describe('crew belong to a city', () => {
  function withCrew(): { w: World; ids: string[] } {
    const w = go(mk());
    const ids: string[] = [];
    for (const n of Object.values(w.npcs)) { if (ids.length >= 3) break; if (n.alive && !n.crew && !n.faction && !n.official && n.id !== w.fixerId && !w.districts[w.blocks[n.homeBlockId].districtId].cityId) { hire(w, n, 100); ids.push(n.id); } }
    return { w, ids };
  }
  it('a recruit belongs to the city they live in', () => {
    const w = go(mk());
    const there = Object.values(w.npcs).find(n => n.alive && !n.crew && !n.faction && !n.official && w.districts[w.blocks[n.homeBlockId].districtId].cityId)!;
    hire(w, there, 100);
    expect(select.crewCity(w, there.id)).toBe(select.currentCity(w));
  });
  it('works only there: a post or a job in another city is refused with where they are', () => {
    const { w, ids } = withCrew();
    const b = w.player.blockId;
    expect(can(w, { type: 'assign', npcId: ids[0], assignment: { kind: 'guard', blockId: b } }).why).toMatch(/Move them/);
    const j = Object.values(w.jobs).find(x => select.cityOfBlock(w, x.blockId) === select.currentCity(w) && x.crewMax > 0 && x.status === 'offer');
    if (j) expect(can(w, { type: 'take_job', jobId: j.id, crewIds: [ids[0]] }).ok).toBe(false);
  });
  it('sending somebody costs their fare, takes a day, and takes them off their post', () => {
    let { w, ids } = withCrew();
    const home = Object.values(w.blocks).find(b => !w.districts[b.districtId].cityId)!;
    w.npcs[ids[0]].crew!.assignment = { kind: 'guard', blockId: home.id };
    const to = select.currentCity(w);
    const q = can(w, { type: 'move_crew', npcId: ids[0], to });
    expect(q.cash).toBe(select.fareBetween(w, 'c0', to));
    const cash = w.player.cash + w.player.dirty;
    w = dispatch(w, { type: 'move_crew', npcId: ids[0], to });
    expect(w.player.cash + w.player.dirty).toBe(cash - q.cash!);
    expect(w.npcs[ids[0]].crew).toMatchObject({ cityId: to, status: 'travel' });
    expect(w.npcs[ids[0]].crew!.assignment).toBeUndefined();
    expect(can(w, { type: 'assign', npcId: ids[0], assignment: { kind: 'guard', blockId: w.player.blockId } }).why).toMatch(/road/);
    w = endDay(w);
    expect(w.npcs[ids[0]].crew!.status).toBe('ready');
    expect(can(w, { type: 'assign', npcId: ids[0], assignment: { kind: 'guard', blockId: w.player.blockId } }).ok).toBe(true);
  });
  it('whoever you bring on the train comes with you, free; everybody else stays', () => {
    const { w: w0, ids } = withCrew();
    let w = w0; w.player.ap = 9;
    w = dispatch(w, { type: 'travel_city', cityId: 'c0' });
    expect(select.currentCity(w)).toBe('c0');
    w.player.ap = 9;
    const back = second(w).id;
    w = dispatch(w, { type: 'travel_city', cityId: back, bring: [ids[0]] });
    expect(select.crewCity(w, ids[0])).toBe(back);
    expect(select.crewCity(w, ids[1])).toBe('c0');
    expect(can(w, { type: 'travel_city', cityId: 'c0', bring: [ids[1]] }).why).toMatch(/not in this city/);
  });
  it('a save from before crews had a city puts each where their work is, else where you are', () => {
    const { w, ids } = withCrew();
    const home = Object.values(w.blocks).find(b => !w.districts[b.districtId].cityId)!;
    w.npcs[ids[0]].crew!.assignment = { kind: 'guard', blockId: home.id };
    for (const id of ids) delete w.npcs[id].crew!.cityId;
    migrate(w);
    expect(select.crewCity(w, ids[0])).toBe('c0');
    expect(select.crewCity(w, ids[1])).toBe(select.currentCity(w));
  });
});

describe('every city has its own Commission', () => {
  it('a founded city gets its own table, of its own outfits, and lobbying there moves only that table', () => {
    let w = go(mk());
    const c = select.currentCity(w);
    for (let d = 0; d < 14 && !select.commissionOf(w, c).proposal; d++) w = endDay(w);
    const t = select.commissionOf(w, c);
    expect(t).not.toBe(w.commission);
    if (t.proposal) {
      const votes = select.tally(w, t.proposal).votes;
      for (const v of votes) expect(w.districts[w.factions[v.id].homeDistrictId].cityId).toBe(c);
      const f = w.factions[votes[0].id]; w.player.cash = 100000; w.player.ap = 9; w.events = [];
      w = dispatch(w, { type: 'lobby', factionId: f.id, side: 'yes' });
      expect(select.commissionOf(w, c).pulls[f.id]).toBe(select.LOBBY_PULL);
      expect(w.commission.pulls[f.id]).toBeUndefined();
    }
  });
});

describe('a landmark remembers being hit', () => {
  it('shut for a month after a set-piece, then open again and harder', () => {
    const w = mk();
    const b = Object.values(w.blocks).find(x => select.setpieceOpen(w, x.id))!;
    w.player.fear = 40; w.player.respect = 40; w.player.ap = 9;
    b.hitDay = w.day; b.hardened = 10;
    expect(select.setpieceOpen(w, b.id)).toBe(false);
    expect(can(w, { type: 'case', kind: 'setpiece', blockId: b.id }).why).toMatch(/until day/);
    w.day += select.SETPIECE_REST;
    expect(select.setpieceOpen(w, b.id)).toBe(true);
    const j = buildJob(w, new Rng(1), { kind: 'setpiece', blockId: b.id })!;
    const fresh = buildJob(mk(), new Rng(1), { kind: 'setpiece', blockId: b.id })!;
    expect(j.difficulty).toBe(Math.min(95, fresh.difficulty + 10));
  });
});

describe('the testing tools', () => {
  it('every tool runs through dispatch and marks the save as tested', () => {
    for (const t of select.CHEATS) {
      const w0 = mk();
      expect(can(w0, { type: 'cheat', what: t.kind }).ok).toBe(true);
      const w = dispatch(w0, { type: 'cheat', what: t.kind });
      expect(w.cheated, t.kind).toBe(true);
    }
    const w = dispatch(mk(), { type: 'cheat', what: 'road' });
    expect(w.region!.cities.every(c => c.founded || c.open)).toBe(true);
    const x = dispatch(mk(), { type: 'cheat', what: 'crew' });
    expect(x.player.crewIds.length).toBe(3);
  });
});
