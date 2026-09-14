/**
 * Delegation. A crew member promoted to lieutenant runs one district: rackets there
 * keep earning without a runner, rival muscle gets run off, and your grip on the
 * blocks firms up. In exchange they cost more, they may skim, and a hostile faction
 * with a foothold in the district will try to flip them.
 */
import { LIEUTENANT } from '@content/rackets';
import type { Rng } from './rng';
import { PLAYER, type Business, type District, type Faction, type GameEvent, type Id, type Npc, type Racket, type Safehouse, type World } from './types';
import { addHeat, addInfluence, clamp, crewOf, log, money, nid } from './util';
import { addMemory } from './people';

export function lieutenants(w: World): Npc[] {
  return crewOf(w).filter(n => n.crew?.assignment?.kind === 'lieutenant' && n.crew.status === 'assigned');
}
export function lieutenantOf(w: World, districtId: Id): Npc | undefined {
  return lieutenants(w).find(n => n.crew!.assignment!.kind === 'lieutenant' && n.crew!.assignment!.districtId === districtId);
}
export function districtOfBusiness(w: World, b: Business): District | undefined { return w.districts[w.blocks[b.blockId]?.districtId]; }

export function playerAssetsIn(w: World, d: District): { rackets: Racket[]; businesses: Business[]; safehouses: Safehouse[] } {
  const inD = (blockId: Id) => w.blocks[blockId]?.districtId === d.id;
  const p = w.player;
  return {
    rackets: p.racketIds.map(id => w.rackets[id]).filter(r => r && inD(w.businesses[r.businessId].blockId)),
    businesses: p.businessIds.map(id => w.businesses[id]).filter(b => b && inD(b.blockId)),
    safehouses: p.safehouseIds.map(id => w.safehouses[id]).filter(s => s && inD(s.blockId)),
  };
}
/** Districts where the player has something worth running. */
export function districtsRunnable(w: World): District[] {
  return Object.values(w.districts).filter(d => { const a = playerAssetsIn(w, d); return a.rackets.length + a.businesses.length + a.safehouses.length > 0; });
}
/** Yesterday's take from the player's rackets in a district. */
export function districtIncome(w: World, d: District): number {
  return playerAssetsIn(w, d).rackets.reduce((s, r) => s + r.lastIncome, 0);
}

export function promoteReason(w: World, n: Npc, districtId: Id): string | undefined {
  const c = n.crew; if (!c) return 'Not your crew.';
  const d = w.districts[districtId]; if (!d) return 'No such district.';
  const a = playerAssetsIn(w, d); if (!a.rackets.length && !a.businesses.length && !a.safehouses.length) return `You have nothing in ${d.name} to run.`;
  const cur = lieutenantOf(w, districtId); if (cur && cur.id !== n.id) return `${cur.name} already runs ${d.name}.`;
  if (c.loyalty < LIEUTENANT.minLoyalty) return `Needs loyalty ${LIEUTENANT.minLoyalty}. You do not hand a book to someone you cannot trust.`;
  if (w.day - c.joinedDay < LIEUTENANT.minDays) return `${n.name} has been with you ${w.day - c.joinedDay} day${w.day - c.joinedDay === 1 ? '' : 's'}. Give it ${LIEUTENANT.minDays}.`;
  if (n.skills.muscle + n.skills.brains + n.skills.charm < LIEUTENANT.minSkills) return 'Not sharp enough to run a district. Muscle, brains and charm together need to add up.';
  return undefined;
}

export function promote(w: World, n: Npc, districtId: Id) {
  const c = n.crew!; const d = w.districts[districtId];
  c.baseCut = c.baseCut ?? c.cut; c.cut = Math.round(c.baseCut * LIEUTENANT.cutMult);
  c.assignment = { kind: 'lieutenant', districtId }; c.status = 'assigned'; c.loyalty = clamp(c.loyalty + 10);
  log(w, `${n.name} runs ${d.name} now, at ${money(c.cut)}/day. Rackets there earn without a runner and rival muscle gets shown the door. Keep an eye on the books.`, 'good', { npcId: n.id, blockId: d.blockIds[0] });
}
/** Called when a lieutenant's assignment is cleared for any reason. */
export function onDemote(n: Npc) {
  const c = n.crew; if (!c) return;
  if (c.baseCut !== undefined) { c.cut = c.baseCut; c.baseCut = undefined; }
  c.loyalty = clamp(c.loyalty - 8);
}

/** The lieutenant, if any, covering this business's district. Used by economy and risk. */
export function coverFor(w: World, b: Business): Npc | undefined {
  const d = districtOfBusiness(w, b); return d ? lieutenantOf(w, d.id) : undefined;
}

function hostileWithFoothold(w: World, d: District): Faction[] {
  return Object.values(w.factions).filter(f => {
    if (!f.alive) return false; const st = f.stance[PLAYER]; if (st !== 'tension' && st !== 'beef' && st !== 'war') return false;
    return d.blockIds.some(bid => { const b = w.blocks[bid]; return (b.influence[f.id] ?? 0) >= 10 || b.neighborIds.some(nb => (w.blocks[nb]?.influence[f.id] ?? 0) >= 40); });
  });
}

export function tickLieutenants(w: World, rng: Rng, income: Record<Id, number>) {
  const p = w.player;
  for (const n of lieutenants(w)) {
    const c = n.crew!; const a = c.assignment as { kind: 'lieutenant'; districtId: Id };
    const d = w.districts[a.districtId]; if (!d) { c.assignment = undefined; c.status = 'idle'; continue; }
    const has = (t: Npc['traits'][number]) => n.traits.includes(t);
    const take = income[d.id] ?? 0;
    // the district feels run
    for (const bid of d.blockIds) if ((w.blocks[bid].influence[PLAYER] ?? 0) > 0) addInfluence(w, bid, PLAYER, LIEUTENANT.influencePerDay);
    if (has('hothead') && rng.chance(0.25)) addHeat(w, 1.5, rng.pick(d.blockIds));
    // people settle into the job differently
    if (w.day % 3 === 0) {
      if (has('ambitious')) c.loyalty = clamp(c.loyalty - 1);
      if (has('loyal')) c.loyalty = clamp(c.loyalty + 1);
      if (take > 0 && c.cut < take * 0.05) c.loyalty = clamp(c.loyalty - 1); // they see what the district makes and what they get
    }
    // skimming
    const skimP = Math.max(0, (c.loyalty < 55 ? 0.15 : 0.04) + (has('greedy') ? 0.15 : 0) - (has('honest') ? 0.1 : 0));
    if (take > 0 && rng.chance(skimP)) {
      const amt = Math.round(take * (LIEUTENANT.skimMin + rng.float() * (LIEUTENANT.skimMax - LIEUTENANT.skimMin)));
      if (amt > 0) { p.dirty = Math.max(0, p.dirty - amt); c.skim = (c.skim ?? 0) + amt; }
    }
    // rivals come calling
    const hostile = hostileWithFoothold(w, d);
    if (hostile.length && rng.chance(LIEUTENANT.flipChance * (hostile.some(f => f.stance[PLAYER] === 'war') ? 2 : 1))) {
      const f = rng.pick(hostile);
      const resist = c.loyalty + (has('loyal') ? 25 : 0) - (has('ambitious') ? 15 : 0) - (has('greedy') ? 10 : 0) + (c.cut >= take * 0.1 ? 5 : 0);
      if (resist >= LIEUTENANT.flipResist) {
        if (!w.pendingEvents.some(e => e.kind === 'lt_offer' && e.refs.npcId === n.id)) w.pendingEvents.push(offerEvent(w, n, d, f));
      } else flipLieutenant(w, n, f);
    }
  }
}

function offerEvent(w: World, n: Npc, d: District, f: Faction): GameEvent {
  const c = n.crew!;
  return {
    id: nid(w, 'e'), day: w.day, kind: 'lt_offer', title: `${f.short} made ${n.name} an offer`,
    text: `${n.name} comes to you first. "${w.npcs[f.bossId]?.name ?? f.short} sent a guy. They want me to bring ${d.name} over. Better cut, my own book." A pause. "I said I would think about it."`,
    options: [
      { id: 'raise', label: `Match it (${money(Math.round(c.cut * 0.4))}/day more)`, detail: '+loyalty; they stay' },
      { id: 'lean', label: 'Remind them what happens to rats', detail: 'Muscle check. They stay scared, or they walk tonight.' },
      { id: 'letgo', label: 'Wish them luck', detail: `They go over to ${f.short}. You keep the district, for now.` },
    ],
    refs: { npcId: n.id, factionId: f.id, blockId: d.blockIds[0] },
  };
}

export function flipLieutenant(w: World, n: Npc, f: Faction, quiet = false) {
  const p = w.player;
  const c = n.crew;
  // They may not be a lieutenant — or even crew — by the time this runs. The event that offers
  // them a better job is drawn at End Day and answered the next morning, and plenty can happen in
  // between: the tick jails them and clears the assignment, a case charges them, the player moves
  // them. This used to cast `c.assignment` and read `.districtId` off undefined, which crashed
  // the whole game on resolving the card. Found by the soak bot's coverage sweep.
  if (!c) { log(w, `${n.name} was never yours to lose.`, 'info', { npcId: n.id }); return; }
  const a = c.assignment?.kind === 'lieutenant' ? c.assignment : undefined;
  const d = a ? w.districts[a.districtId] : undefined;
  const taken = c.skim ?? 0;
  p.crewIds = p.crewIds.filter(id => id !== n.id);
  n.crew = undefined; n.role = 'lieutenant'; n.faction = f.id; if (!f.lieutenantIds.includes(n.id)) f.lieutenantIds.push(n.id);
  n.rel.trust = quiet ? -10 : -50; n.rel.respect = clamp(n.rel.respect - 20);
  f.cash += taken;
  const loss = quiet ? 5 : LIEUTENANT.flipInfluence;
  if (d) {
    for (const bid of d.blockIds) { const b = w.blocks[bid]; if ((b.influence[PLAYER] ?? 0) > 0) { addInfluence(w, bid, PLAYER, -loss); addInfluence(w, bid, f.id, Math.round(loss * 0.6)); } }
    if (!quiet) for (const r of playerAssetsIn(w, d).rackets) if (!r.runnerId) r.disrupted = Math.max(r.disrupted, 2);
    addMemory(w, d.blockIds[0], 'flip', `${n.name} ran this district for you, then went over to ${f.short}.`);
  }
  if (quiet) log(w, `${n.name} goes to work for ${f.name}. ${d ? `${d.name} is nobody's book tonight.` : ''}`, 'warn', { npcId: n.id, factionId: f.id });
  else log(w, `${n.name} went over to ${f.name}, and took ${d?.name ?? 'the district'}'s book with them${taken ? ` along with ${money(taken)} they had been skimming` : ''}. Your rackets there stall while you pick up the pieces.`, 'bad', { npcId: n.id, factionId: f.id, blockId: d?.blockIds[0] });
}
