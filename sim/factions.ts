/** Faction AI: runs once per faction per day. Factions play the same game the player does. */
import { effectivePolice } from './authority';
import { BUSINESS_DEFS } from '@content/businesses';
import { coverFor } from './lieutenants';
import { stanceFor } from './generate';
import { distanceM } from '@geo/project';
import { STEP_M } from './populate';
import type { Rng } from './rng';
import { PLAYER, type Block, type Faction, type FactionId, type World } from './types';
import { addInfluence, clamp, factionOf, log, spreadRep, standingCap } from './util';
import { alreadyAtTheDoor, queueConfrontation } from './combat';
import { leaderFor, nemesisName } from './nemesis';
import { warnedBy } from './informants';
import { bossChurn, successionOrDeath, tickCrisis } from './politics';
export { standingCap };
import { addMemory } from './people';

/** What the tick charges to put one more body on the street. Read by `checkDefeated`. */
const SOLDIER_COST = 2500;

export function runFaction(w: World, f: Faction, rng: Rng) {
  if (!f.alive) return;
  const p = w.player;
  bossChurn(w, f, rng);
  if (f.crisis) tickCrisis(w, f, rng);
  if (!f.alive) return;
  const headless = !!f.crisis;
  const controlled = Object.values(w.blocks).filter(b => factionOf(w, b.id) === f.id);

  // 1. collect
  let income = 0;
  for (const b of Object.values(w.businesses)) if (b.protection?.factionId === f.id) income += b.baseIncome * b.protection.rate;
  income += controlled.length * 40; // rackets we don't model individually
  income += f.tributeFrom[PLAYER] ?? 0;
  f.cash += income;
  f.cash -= f.soldiers * 60; // wages
  // a crew that cannot make payroll thins out: soldiers walk when the till is empty
  if (f.cash < -2000 && f.soldiers > 3 && rng.chance(0.5)) {
    const gone = Math.min(f.soldiers - 3, 1 + Math.floor(-f.cash / 8000));
    f.soldiers -= gone; f.cash += gone * 300; // they take severance from what's left in the safehouse
    if (rng.chance(0.3)) log(w, `${f.name} cannot make payroll. ${gone === 1 ? 'A soldier walks' : `${gone} soldiers walk`}.`, 'info', { factionId: f.id });
  }
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
  if (f.cash > 6000 && f.soldiers < 22 && rng.chance(aggressive ? 0.35 : 0.2)) { f.cash -= SOLDIER_COST; f.soldiers++; }
  const pushCost = 1500 + controlled.length * 200;
  const pushes = headless ? 0 : f.cash > pushCost ? (aggressive && rng.chance(0.5) ? 2 : rng.chance(0.7) ? 1 : 0) : 0;
  for (let i = 0; i < pushes; i++) {
    const cands: { b: Block; score: number }[] = [];
    const seenCand = new Set<string>();
    for (const b of controlled) for (const nid of b.neighborIds) {
      const nb = w.blocks[nid]; if (!nb || seenCand.has(nid)) continue; seenCand.add(nid);
      const ctrl = factionOf(w, nb.id);
      if (ctrl === f.id) continue;
      const mine = nb.influence[f.id] ?? 0; if (mine >= 100) continue;
      let score = nb.wealth / 20 + nb.businessIds.length - effectivePolice(w, nb.id) / 25 + rng.float() * 3;
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
      addMemory(w, t.id, 'takeover', `${f.short} moved in and took over.`);
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
  if (w.commission?.seat && w.commission.memberIds.includes(f.id) && f.standing[PLAYER] < 0) drift += 0.4; // the table keeps things civil
  else if (f.standing[PLAYER] < 0 && !incursions && !playerOnTurf) drift += f.temperament === 'diplomatic' ? 1.2 : 0.6; // grudges fade
  if (f.grudges.length > 6) f.grudges.splice(0, f.grudges.length - 6);
  f.standing[PLAYER] = Math.min(clamp(f.standing[PLAYER] + drift, -100, 100), standingCap(f));
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
  if (!truce && !headless && (ns === 'beef' || ns === 'war')) actAgainstPlayer(w, f, rng, ns === 'war');

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
  else if (!f.defeatedDay) checkDefeated(w, f, controlled);
}

/**
 * The moment somebody is actually finished, and what happens to what they were holding.
 *
 * A faction with no soldiers and no ground used to simply sit there — still nominally at war,
 * still "alive", still listed, with nothing anywhere marking that the player had won. Bleeding
 * out (`soldiers <= 0 && cash < 0`) was the only death, so an outfit crushed in the street while
 * its bank account was healthy became a permanent husk you could neither fight nor finish.
 *
 * Defeat is the street condition plus the one thing that can undo it: nobody to send, nothing to
 * send them to, and **not enough left to put anybody back out there**. That last clause is not
 * bookkeeping — the tick above hires a soldier whenever `f.cash > 6000`, so an outfit with money
 * and nobody is not beaten, it is between hires, and finishing it would be wrong.
 *
 * Which also names the gap this closes exactly. The old death needed `cash < 0`; rebuilding needs
 * `cash > 6000`. An outfit sitting between those two with nobody on the street could neither die
 * nor recover, and simply stood there at war for ever. That is the husk.
 */
function checkDefeated(w: World, f: Faction, controlled: Block[]): void {
  if (f.soldiers > 0 || controlled.length > 0) return;
  // somebody with people still in the field is not finished, whatever the map says
  if (f.lieutenantIds.some(id => w.npcs[id]?.alive)) return;
  // and neither is somebody who can still pay for one. SOLDIER_COST is what the tick charges.
  if (f.cash >= SOLDIER_COST) return;
  f.defeatedDay = w.day;
  f.alive = false;
  f.crisis = undefined;
  for (const other of Object.keys(f.stance)) f.stance[other] = 'peace';

  // What they were still nominally holding goes somewhere real. Ground the player already stands
  // on comes to them; everything else opens up, because an outfit's collapse is an opportunity
  // for whoever gets there, not an automatic gift.
  let taken = 0, opened = 0;
  for (const b of Object.values(w.businesses)) {
    if (b.protection?.factionId !== f.id) continue;
    b.protection = undefined;
    if (factionOf(w, b.blockId) === PLAYER) { addInfluence(w, b.blockId, PLAYER, 4); taken++; } else opened++;
  }
  for (const b of Object.values(w.blocks)) {
    if (!b.influence[f.id]) continue;
    const theirs = b.influence[f.id];
    delete b.influence[f.id];
    // their hold on a block you were already contesting is the clearest thing you inherit
    if ((b.influence[PLAYER] ?? 0) > 0) addInfluence(w, b.id, PLAYER, Math.min(20, theirs * 0.5));
  }
  const by = defeatedBy(w, f);
  f.defeatedBy = by;
  addMemory(w, w.player.homeBlockId, 'faction_gone', `${f.name} are finished.`, { });
  if (by === PLAYER) {
    w.player.respect = clamp(w.player.respect + 10);
    w.player.fear = clamp(w.player.fear + 8);
    spreadRep(w, w.player.currentBlockId, { respect: 6, fear: 5 }, 2, 'grave');
  }
  log(w, `${f.name} are finished. ${by === PLAYER ? 'You broke them' : 'Nobody is left to answer for them'} — no soldiers, no corners, nobody to send.${taken ? ` ${taken} of the places they collected from are on your ground now.` : ''}${opened ? ` ${opened} more are paying nobody.` : ''}`, by === PLAYER ? 'good' : 'warn', { factionId: f.id });
}

/** Whose doing it was. The player, if they were the ones at war with them at the end. */
function defeatedBy(w: World, f: Faction): FactionId | undefined {
  if ((f.stance[PLAYER] === 'war' || f.stance[PLAYER] === 'beef' || (f.standing[PLAYER] ?? 0) <= -50)) return PLAYER;
  const rival = Object.values(w.factions).find(o => o.alive && o.id !== f.id && (f.standing[o.id] ?? 0) <= -50);
  return rival?.id;
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
      // war takes two acts a day and both can land on the same place; one door, one crowd
      if (alreadyAtTheDoor(w, { businessId: biz.id })) continue;
      const guarded = p.crewIds.some(id => { const c = w.npcs[id].crew; return c?.assignment?.kind === 'guard' && c.assignment.blockId === biz.blockId; });
      if (guarded && rng.chance(0.6)) { log(w, `${f.short} muscle showed up at ${biz.name}. Your guard ran them off.`, 'good', { businessId: biz.id, factionId: f.id }); continue; }
      const lt = coverFor(w, biz);
      if (lt && rng.chance(0.25 + lt.skills.muscle * 0.04)) { log(w, `${f.short} muscle showed up at ${biz.name}. ${lt.name} and a couple of the local kids sent them home.`, 'good', { businessId: biz.id, factionId: f.id, npcId: lt.id }); continue; }
      // they are at the door, not gone: the player answers this on their next move
      r.threatened = w.day + 6;
      // and somebody is leading it. A faction used to send an anonymous "they"; naming the
      // lieutenant is the whole of what makes a nemesis, and `leaderFor` sends the one who
      // already has history with the player far more often than a fresh face.
      const led = leaderFor(w, f, rng);
      queueConfrontation(w, { factionId: f.id, kind: 'racket', war, racketId: r.id, businessId: biz.id, blockId: biz.blockId, byNpcId: led?.id,
        warned: warnedBy(w, f, rng)?.id,
        text: `${led ? `${nemesisName(led)} and some ${f.short} muscle are` : `${f.short} muscle are`} standing in ${biz.name} asking who runs the ${r.kind.replace('_', ' ')}. You are looking right at them.` });
    } else if (roll < 0.7 && p.businessIds.length) {
      const biz = w.businesses[rng.pick(p.businessIds)];
      if (alreadyAtTheDoor(w, { businessId: biz.id })) continue;
      const led = leaderFor(w, f, rng);
      queueConfrontation(w, { factionId: f.id, kind: 'business', war, businessId: biz.id, blockId: biz.blockId, byNpcId: led?.id,
        warned: warnedBy(w, f, rng)?.id,
        text: `${led ? `${nemesisName(led)} is` : `${f.short} are`} outside ${biz.name} with ${war ? 'a can of petrol' : 'bats'}. Somebody has to decide what happens next.` });
    } else if (war && p.crewIds.length) {
      const alive = p.crewIds.map(id => w.npcs[id]).filter(n => n.crew && (n.crew.status === 'idle' || n.crew.status === 'assigned'));
      if (!alive.length) continue;
      const victim = rng.pick(alive);
      if (alreadyAtTheDoor(w, { npcId: victim.id })) continue;
      const led = leaderFor(w, f, rng);
      queueConfrontation(w, { factionId: f.id, kind: 'crew', war, npcId: victim.id, blockId: victim.homeBlockId, byNpcId: led?.id,
        warned: warnedBy(w, f, rng)?.id,
        text: `${led ? `${nemesisName(led)} has` : `${f.short} soldiers have`} ${victim.name} against a wall outside their place. You got there at the same time they did.` });
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
