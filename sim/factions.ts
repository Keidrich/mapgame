/** Faction AI: runs once per faction per day. Factions play the same game the player does. */
import { BUSINESS_DEFS } from '@content/businesses';
import { stanceFor } from './generate';
import { distanceM } from '@geo/project';
import { STEP_M } from './generate';
import type { Rng } from './rng';
import { PLAYER, type Block, type Faction, type FactionId, type World } from './types';
import { addHeat, addInfluence, adjustRel, clamp, factionOf, log, money } from './util';
import { successionOrDeath } from './ops';

export function runFaction(w: World, f: Faction, rng: Rng) {
  if (!f.alive) return;
  const p = w.player;
  const controlled = Object.values(w.blocks).filter(b => factionOf(w, b.id) === f.id);

  // 1. collect
  let income = 0;
  for (const b of Object.values(w.businesses)) if (b.protection?.factionId === f.id) income += b.baseIncome * b.protection.rate;
  income += controlled.length * 40; // rackets we don't model individually
  income += f.tributeFrom[PLAYER] ?? 0;
  f.cash += income;
  f.cash -= f.soldiers * 60; // wages
  // an empire costs money to hold: influence far from home fades unless there is a protected business there
  for (const b of controlled) {
    if (b.districtId === f.homeDistrictId) continue;
    const protectedHere = b.businessIds.some(id => w.businesses[id].protection?.factionId === f.id);
    if (!protectedHere) addInfluence(w, b.id, f.id, -0.7);
  }
  if (f.tributeFrom[PLAYER]) {
    const t = f.tributeFrom[PLAYER];
    if (p.cash + p.dirty >= t) { const fromDirty = Math.min(p.dirty, t); p.dirty -= fromDirty; p.cash -= t - fromDirty; }
    else { delete f.tributeFrom[PLAYER]; f.standing[PLAYER] -= 20; log(w, `You could not pay ${f.name} their tribute. They noticed.`, 'bad', { factionId: f.id }); }
  }

  // 2. spend: recruit or expand
  const aggressive = f.temperament === 'aggressive';
  if (f.cash > 6000 && f.soldiers < 22 && rng.chance(aggressive ? 0.35 : 0.2)) { f.cash -= 2500; f.soldiers++; }
  const pushCost = 1500 + controlled.length * 200;
  const pushes = f.cash > pushCost ? (aggressive && rng.chance(0.5) ? 2 : rng.chance(0.7) ? 1 : 0) : 0;
  for (let i = 0; i < pushes; i++) {
    const cands: { b: Block; score: number }[] = [];
    const seenCand = new Set<string>();
    for (const b of controlled) for (const nid of b.neighborIds) {
      const nb = w.blocks[nid]; if (!nb || seenCand.has(nid)) continue; seenCand.add(nid);
      const ctrl = factionOf(w, nb.id);
      if (ctrl === f.id) continue;
      const mine = nb.influence[f.id] ?? 0; if (mine >= 100) continue;
      let score = nb.wealth / 20 + nb.businessIds.length - nb.police / 25 + rng.float() * 3;
      if (ctrl === PLAYER) score += stanceOf(f) === 'war' ? 6 : stanceOf(f) === 'beef' ? 2 : -8;
      else if (ctrl) score += f.stance[ctrl] === 'war' ? 4 : f.stance[ctrl] === 'beef' ? 1 : -4;
      if (nb.districtId === f.homeDistrictId) score += 3;
      cands.push({ b: nb, score });
    }
    if (!cands.length) break;
    cands.sort((a, b) => b.score - a.score);
    const t = cands[0].b; f.cash -= pushCost;
    const before = factionOf(w, t.id);
    addInfluence(w, t.id, f.id, 4 + Math.round(f.soldiers / 8));
    // contested: erode the top rival a bit
    const rival = Object.entries(t.influence).filter(([k]) => k !== f.id).sort((a, b) => b[1] - a[1])[0];
    if (rival) addInfluence(w, t.id, rival[0], -3);
    const after = factionOf(w, t.id);
    if (before !== after && after === f.id) {
      log(w, `${f.name} now runs ${t.name}.${before === PLAYER ? ' That was yours.' : ''}`, before === PLAYER ? 'bad' : 'info', { factionId: f.id, blockId: t.id });
      if (before === PLAYER) p.respect = clamp(p.respect - 5);
    }
  }

  // 3. extort unprotected businesses on controlled blocks
  for (const b of controlled) {
    if (!rng.chance(0.12)) continue;
    const target = b.businessIds.map(id => w.businesses[id]).find(z => !z.protection && z.ownedBy === 'npc' && BUSINESS_DEFS[z.type].rackets.includes('protection'));
    if (target) { target.protection = { factionId: f.id, rate: 0.15, since: w.day }; w.npcs[target.ownerId].faction = f.id; }
  }

  // 4. evaluate the player
  const incursions = controlled.filter(b => (b.influence[PLAYER] ?? 0) > 15).length;
  const playerOnTurf = Object.values(w.rackets).filter(r => r.owner === PLAYER && factionOf(w, w.businesses[r.businessId].blockId) === f.id).length;
  let drift = 0;
  const temperK = f.temperament === 'paranoid' ? 1.5 : f.temperament === 'diplomatic' ? 0.6 : 1;
  if (incursions || playerOnTurf) drift -= Math.min(2.5, (incursions * 0.3 + playerOnTurf * 0.5) * temperK);
  if (f.stance[PLAYER] === 'alliance') drift += 0.5;
  else if (f.standing[PLAYER] < 0 && !incursions && !playerOnTurf) drift += f.temperament === 'diplomatic' ? 1.2 : 0.6; // grudges fade
  if (f.grudges.length > 6) f.grudges.splice(0, f.grudges.length - 6);
  f.standing[PLAYER] = clamp(f.standing[PLAYER] + drift, -100, 100);
  const truce = (f.truceUntil[PLAYER] ?? 0) > w.day;
  const oldStance = f.stance[PLAYER];
  let ns = stanceFor(f.standing[PLAYER]);
  if (truce && (ns === 'beef' || ns === 'war')) ns = 'tension';
  if (oldStance === 'alliance' && ns !== 'alliance' && f.standing[PLAYER] >= 40) ns = 'alliance'; // sticky
  if (ns !== oldStance) {
    f.stance[PLAYER] = ns;
    const msg: Record<string, string> = {
      tension: `${f.name} is not happy with you. A lieutenant lets it be known you are "getting close to things that are not yours".`,
      beef: `${f.name} has a beef with you. Expect your rackets to get hit.`,
      war: `${f.name} declares war. Their soldiers are coming for your people and your places.`,
      peace: `${f.name} has cooled off. Things are back to normal.`,
      alliance: `${f.name} calls you an ally.`,
    };
    log(w, msg[ns], ns === 'peace' || ns === 'alliance' ? 'good' : 'warn', { factionId: f.id });
  }

  // 5. act on stance
  if (!truce && (ns === 'beef' || ns === 'war')) actAgainstPlayer(w, f, rng, ns === 'war');

  // 6. faction vs faction: occasional flare-ups shift standing and influence
  for (const other of Object.values(w.factions)) {
    if (other.id === f.id || !other.alive) continue;
    const s = f.standing[other.id] ?? 0;
    const d = (rng.float() - 0.5) * 4 + (f.temperament === 'aggressive' ? -0.3 : f.temperament === 'diplomatic' ? 0.3 : 0);
    f.standing[other.id] = other.standing[f.id] = clamp(s + d, -100, 100);
    const st = stanceFor(f.standing[other.id]);
    if (st !== f.stance[other.id]) { f.stance[other.id] = other.stance[f.id] = st; if (st === 'war' || st === 'beef') log(w, `${f.name} and ${other.name} are at ${st}. Their blocks will be a mess for a while.`, 'info', { factionId: f.id }); }
    if (st === 'war' && rng.chance(0.3)) {
      // border skirmish
      const border = Object.values(w.blocks).find(b => factionOf(w, b.id) === other.id && (b.influence[f.id] ?? 0) > 0);
      if (border) { addInfluence(w, border.id, other.id, -8); addInfluence(w, border.id, f.id, 5); other.soldiers = Math.max(1, other.soldiers - 1); border.heat = clamp(border.heat + 5); }
    }
  }
  if (f.soldiers <= 0 && f.cash < 0) { log(w, `${f.name} has bled out.`, 'warn', { factionId: f.id }); successionOrDeath(w, { ...f, lieutenantIds: [] }); f.alive = false; }
}

function stanceOf(f: Faction) { return f.stance[PLAYER]; }

function actAgainstPlayer(w: World, f: Faction, rng: Rng, war: boolean) {
  const p = w.player;
  const myRackets = p.racketIds.map(id => w.rackets[id]).filter(r => r && !r.disrupted);
  const near = (blockId: string) => Object.values(w.blocks).some(b => factionOf(w, b.id) === f.id && distanceM(b.center, w.blocks[blockId].center) <= 3 * STEP_M);
  const acts = war ? 2 : 1;
  for (let i = 0; i < acts; i++) {
    const roll = rng.float();
    if (roll < 0.45 && myRackets.length) {
      const r = rng.pick(myRackets); const biz = w.businesses[r.businessId];
      if (!near(biz.blockId) && !war) continue;
      const guarded = p.crewIds.some(id => { const c = w.npcs[id].crew; return c?.assignment?.kind === 'guard' && c.assignment.blockId === biz.blockId; });
      if (guarded && rng.chance(0.6)) { log(w, `${f.short} muscle showed up at ${biz.name}. Your guard ran them off.`, 'good', { businessId: biz.id, factionId: f.id }); continue; }
      r.disrupted = rng.int(2, 5); biz.condition = clamp(biz.condition - 15); const stolen = Math.round(r.lastIncome * 2); p.dirty = Math.max(0, p.dirty - stolen);
      log(w, `${f.short} hit your ${r.kind.replace('_', ' ')} at ${biz.name}. Wrecked for ${r.disrupted} days${stolen ? `, ${money(stolen)} taken` : ''}.`, 'bad', { businessId: biz.id, factionId: f.id });
    } else if (roll < 0.7 && p.businessIds.length) {
      const biz = w.businesses[rng.pick(p.businessIds)];
      const owner = w.npcs[biz.ownerId];
      biz.condition = clamp(biz.condition - (war ? 25 : 10)); adjustRel(owner, { fear: 8 });
      log(w, `${f.short} ${war ? 'firebombed' : 'trashed'} ${biz.name}.`, 'bad', { businessId: biz.id, factionId: f.id });
    } else if (war && p.crewIds.length) {
      const alive = p.crewIds.map(id => w.npcs[id]).filter(n => n.crew && (n.crew.status === 'idle' || n.crew.status === 'assigned'));
      if (!alive.length) continue;
      const victim = rng.pick(alive);
      const defence = victim.skills.muscle + p.crewIds.length + rng.int(0, 8);
      if (defence > 10 + f.soldiers / 3) { f.soldiers = Math.max(0, f.soldiers - 1); log(w, `${f.short} soldiers came for ${victim.name}. ${victim.name} sent one of them to the hospital.`, 'good', { npcId: victim.id, factionId: f.id }); }
      else if (rng.chance(0.7)) { victim.crew!.status = 'injured'; victim.crew!.statusDays = rng.int(4, 9); victim.crew!.assignment = undefined; log(w, `${f.short} shot ${victim.name} outside their place. Laid up ${victim.crew!.statusDays} days.`, 'bad', { npcId: victim.id, factionId: f.id }); }
      else { victim.crew!.status = 'dead'; victim.alive = false; victim.crew!.assignment = undefined; log(w, `${f.short} killed ${victim.name}.`, 'bad', { npcId: victim.id, factionId: f.id }); }
      addHeat(w, 4, victim.homeBlockId);
    } else {
      // push into a player block
      const target = Object.values(w.blocks).find(b => factionOf(w, b.id) === PLAYER && near(b.id));
      if (target) { addInfluence(w, target.id, PLAYER, -10); addInfluence(w, target.id, f.id, 8); log(w, `${f.short} soldiers are hanging around ${target.name}. Your grip is slipping.`, 'warn', { blockId: target.id, factionId: f.id }); }
    }
  }
}

/** Player attacking a faction's assets shifts everyone's opinion a little. */
export function factionWitness(w: World, actorHurt: FactionId) {
  for (const f of Object.values(w.factions)) if (f.id !== actorHurt && f.alive) {
    if (f.stance[actorHurt] === 'war' || f.stance[actorHurt] === 'beef') f.standing[PLAYER] = clamp(f.standing[PLAYER] + 3, -100, 100);
    else if (f.stance[actorHurt] === 'alliance') f.standing[PLAYER] = clamp(f.standing[PLAYER] - 5, -100, 100);
  }
}
