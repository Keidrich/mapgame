/**
 * Read-only questions for the UI. Components never compute an outcome; they ask here, and every
 * answer comes from the same function the simulation itself uses.
 */
import { BUSINESSES, LABS, RACKETS } from '@r/content/world';
import { can } from './reducer';
import type { RacketKind } from './types';
import { protectionTake, racketIncome, washCap, washRate } from './economy';
import { PLAYER } from './types';
import type { Block, Business, Id, Npc, World } from './types';
import { controller, money as money_ } from './util';

export { businessPrice, crewCut, fixerCap, fixerRate, labOutput, labQuality, levelMult, netWorth, nextRank, notoriety, protectionTake, racketIncome, rankOf, runnerFactor, saturationMult, sellCapacity, stashTotal, streetPrice, synergyOf, upgradeCost, washCap, washRate, INSTITUTION_RESPECT, FAIR_RATE } from './economy';
export { bedsTotal, blockCity, controlShare, crewCity, crewIn, playerBlocks, travelCost } from './select-core';
export { quote, agendaLine, secretLine, type SceneKind, type SceneQuote } from './scenes';
export { jobOdds, payoutFor, complicationOdds, caseKinds, insider, leansFor } from './jobs';
export { stanceOf, sitDownOdds, tributeEffect, factionBlocks, STANCE_LABEL } from './factions';
export { evidenceRate, convictionOdds, openCases } from './law';
export { depth, accrualMult, heldDays, T as TERRITORY } from './territory';
export { stashCapacity, STRAIGHT, WIN_SHARE } from './tick';
export { restockCost, auditOdds } from './reducer';
export { crewOn, crewOf, crewWage, crewCost, CREW } from './streetcrews';
export { specialistFee, present, setpieceOpen, SETPIECE_REST, SETPIECE_HARDEN } from './jobs';
export { needsMet, isDerelict } from './catalogue';
export { CHEATS } from './cheats';
export { consigliere, underboss, familyRank, makeBlock } from './family';
export { canBeOutlet, outletDemand, outletPrice, driverCarry, drivers, outlets, hijackChance, ordersIn, yourCarry } from './supply';
export { OUTLETS, SUPPLY } from '@r/content/supply';
export { reputation, trainBlock, trainFee, trainXp, streakNow, boostBlock, boostedWith, boostedToday, shaking, pepHours } from './character';
export { TRAINING, TRAIN, BOOSTS, HABIT, REPUTATION } from '@r/content/character';
export { hasTable, tableBlock, diceBlock, numbersBlock, yourNumbers, nextBlock, readChance, cheatChance, cardName, describe as describeHand, score as handScore, autoHold, pad3, RANKS, SUITS } from './backroom';
export { POKER, DICE, NUMBERS } from '@r/content/backroom';
export { parkedOn, stealOdds, garageRoom, chopper, sprayShop, chopValue, sellValue, getawayBonus } from './cars';
export { MODELS, STEAL, CHOP, RESPRAY, SELL, GETAWAY } from '@r/content/cars';
export { detective, heir, bribePrice, digOdds, leanOdds, meetOdds, duelOdds, detBlock, heirBlock } from './stories';
export { DETECTIVE, HEIR } from '@r/content/stories';
export { seasonNow, machineOdds, backBlock, attentionAdd, bribeMult } from './seasons';
export { SEASONS, SEASON, ELECTION, RESPONSES } from '@r/content/seasons';
export { fightOdds, soldiersOn, sideOf, personPower, ambushOdds } from './fights';
export { GUNS, BULLETS, HURT, ATTACK } from '@r/content/fights';
export { MAKING, RANK_LABEL, RANK_BLURB, POSTS } from '@r/content/family';
export { half, isNight, hours, whereIs, whereLine, jobHour, closedNow, hourFactor } from './clock';
import { closedNow as closedNow_ } from './clock';
import { RANKS as RANKS_ } from '@r/content/world';
import { rankOf as rankOf_ } from './economy';
export { HOME, REGION, arrivalIn, cityBlocks, cityGeo, cityName_ as cityName, cityOfBlock, controlIn, currentCity, demandIn, fare, fareBetween, isOpen, regionCity, routePrice, safehouseIn } from './region';
import { HOME as HOME_, cityGeo as cityGeo_ } from './region';
/**
 * The world as the map draws it: one city's streets, blocks, places and corners. With only the home
 * city founded that is the whole world, returned as it is.
 */
export function cityView(w: World, id: string): World {
  if (id === HOME_ && !Object.keys(w.cities ?? {}).length) return w;
  const inCity = (blockId: string) => { const b = w.blocks[blockId]; return !!b && (w.districts[b.districtId]?.cityId || HOME_) === id; };
  const pick = <T,>(r: Record<string, T>, ok: (x: T) => boolean) => Object.fromEntries(Object.entries(r).filter(([, x]) => ok(x))) as Record<string, T>;
  return {
    ...w, city: cityGeo_(w, id),
    districts: pick(w.districts, d => (d.cityId || HOME_) === id),
    blocks: pick(w.blocks, b => inCity(b.id)),
    businesses: pick(w.businesses, b => inCity(b.blockId)),
    crews: pick(w.crews ?? {}, c => inCity(c.blockId)),
    safehouses: pick(w.safehouses, s => inCity(s.blockId)),
  };
}
import { CATALOGUE, isCatalogue } from '@r/content/catalogue';
/** What a job kind is pointed at, for the catalogue's kinds; undefined for the first fourteen. */
export const jobTarget = (k: string) => (isCatalogue(k) ? CATALOGUE[k].target : undefined);
export { kitOf, kitBonus, armourOf, skillOf, shopItems, isShop } from './kit';
export { holdingRoom, heldBy, isHeld, hostageChoices, HOSTAGE } from './hostages';
export { leanOf, lobbyCost, describeProposal, tally, commissionOf, COMMISSION, LOBBY_PULL } from './commission';
export { controller, fullName, shortName, money } from './util';
import { fullName } from './util';
import { playerBlocks } from './select-core';

export const blockController = (w: World, id: Id) => { const b = w.blocks[id]; return b ? controller(b) : undefined; };
export const businessesIn = (w: World, blockId: Id): Business[] => (w.blocks[blockId]?.businessIds ?? []).map(id => w.businesses[id]).filter(Boolean);
export const peopleOn = (w: World, blockId: Id): Npc[] => Object.values(w.npcs).filter(n => n.alive && n.homeBlockId === blockId && !n.crew);
export const crew = (w: World): Npc[] => w.player.crewIds.map(id => w.npcs[id]).filter(n => n?.alive && n.crew);
export const known = (w: World): Npc[] => Object.values(w.npcs).filter(n => n.alive && n.rel.met && !n.crew).sort((a, b) => (b.rel.met ?? 0) - (a.rel.met ?? 0));
export const officials = (w: World): Npc[] => Object.values(w.npcs).filter(n => n.alive && n.official);
export const protectedBy = (w: World, who = PLAYER): Business[] => Object.values(w.businesses).filter(b => b.protection?.by === who);
export const isParkBlock = (b: Block) => !!b.landmark && /Park|Gardens|Common|Green|Fields/.test(b.landmark) && b.businessIds.length === 0;

/** Tomorrow's money, forecast from the same formulas the tick uses. Sellers and the laundry are estimates. */
export function forecast(w: World): { dirty: number; clean: number; costs: number; washed: number } {
  const p = w.player;
  let dirty = 0, clean = 0, costs = 0, washed = 0;
  for (const b of protectedBy(w)) dirty += protectionTake(b);
  for (const id of p.businessIds) { const b = w.businesses[id]; if (b && b.closed === 0) clean += Math.round(b.income * 0.45); }
  for (const id of p.racketIds) {
    const r = w.rackets[id]; if (!r || r.down > 0) continue;
    const def = RACKETS[r.kind];
    if (def.wash) { if (r.on !== false) washed += washCap(w, r); continue; }
    if (def.sells) continue;
    const x = racketIncome(w, r); if (def.clean) clean += x; else dirty += x;
  }
  for (const id of p.crewIds) costs += w.npcs[id]?.crew?.cut ?? 0;
  const wash = Math.min(washed, p.dirty + dirty);
  return { dirty: dirty - wash, clean: clean + Math.round(wash * washRate(w)), costs, washed: wash };
}

/** The label of whoever holds a block, for the map key and the sheets. */
export function holderName(w: World, blockId: Id): string {
  const c = blockController(w, blockId);
  if (!c) return 'Nobody';
  return c === PLAYER ? 'You' : w.factions[c]?.name ?? 'Nobody';
}
/** Where you are on the rank ladder, 0 for Nobody: the number on the HUD's level badge. */
export const rankIndex = (w: World) => RANKS_.findIndex(r => r.label === rankOf_(w).label);
export const pendingJob = (w: World) => Object.values(w.jobs).find(j => j.status === 'paused');

// ------------------------------------------------------------------------------------ leads
export interface Lead {
  id: string; text: string; why: string; done: boolean;
  /** Why it cannot be done yet, in the game's own words. The strip skips a blocked step for the next
   *  one that can be done, and says what the blocked one is waiting on. */
  blocked?: string;
  npcId?: string; businessId?: string; blockId?: string; tab?: 'people' | 'crew' | 'jobs' | 'empire' | 'rivals';
}

/**
 * What to do next, read off the world — never stored, so it cannot drift from what is true. The
 * original taught its opening in a how-to-play sheet the player had to go and find; here the map
 * carries the next two or three steps, each pointing at a real person or place.
 */
export function leads(w: World): Lead[] {
  const p = w.player;
  const here = w.blocks[p.blockId];
  const nearby = [here.id, ...here.neighborIds];
  const owners = nearby.flatMap(id => businessesIn(w, id)).filter(b => b.tier < 3 && b.ownedBy !== PLAYER).map(b => w.npcs[b.ownerId]).filter(n => n?.alive);
  const soft = owners.slice().sort((a, b) => a.nerve - b.nerve)[0];
  // the protect step points at whoever you have already warmed up — most trust or fear, owners
  // not yet paying you — and only falls back to the softest. It used to point at the softest
  // regardless, so a player who had just won somebody over was sent to a stranger at 11%
  const warm = owners.filter(n => { const b = n.workId ? w.businesses[n.workId] : undefined; return b && b.protection?.by !== PLAYER; })
    .map(n => ({ n, v: Math.max(n.rel.trust, n.rel.fear) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)[0]?.n ?? soft;
  // the first step introduces you to somebody new: an owner you already know from the neighbourhood
  // does not count as an introduction, and pointing at one left seed 42 talking to Rufus Tillman forever
  const stranger = owners.filter(n => !n.rel.met).sort((a, b) => a.nerve - b.nerve)[0] ?? nearby.flatMap(id => businessesIn(w, id)).flatMap(b => [b.ownerId, ...b.patronIds]).map(id => w.npcs[id]).find(n => n?.alive && !n.rel.met && !n.faction);
  // `met > 1` alone missed everybody met on day one, the evening a new player is told to do it, and the
  // strip sat on step one for good; `introduced` counts it, and `met > 1` still reads saves from before it
  const met = Object.values(w.npcs).filter(n => n.rel.met && n.rel.met > 1).length;
  const leaned = Object.values(w.npcs).some(n => !n.crew && (n.rel.fear >= 30 || n.rel.trust >= 30) && n.workId && w.businesses[n.workId]?.ownerId === n.id);
  const prot = protectedBy(w).length + p.businessIds.length;
  const washed = w.history.some(h => (h.washed ?? 0) > 0) || p.washedToday > 0;
  const fx = w.fixerId ? w.npcs[w.fixerId] : undefined;
  const patron = nearby.flatMap(id => businessesIn(w, id)).flatMap(b => b.patronIds).map(id => w.npcs[id]).filter(n => n?.alive && !n.crew && !n.faction).sort((a, b) => Math.max(...Object.values(b.skills)) - Math.max(...Object.values(a.skills)))[0];
  const firstBiz = protectedBy(w)[0] ?? w.businesses[p.businessIds[0]];
  const offer = Object.values(w.jobs).find(j => j.status === 'offer');
  // the racket step: the cheapest racket the place allows, and whether it can be paid for. A bruiser
  // starts with $250 and the cheapest racket is $400; the strip used to sit on this for a week, silent
  const racketKinds = firstBiz ? (BUSINESSES[firstBiz.type].rackets as RacketKind[]).slice().sort((a, b) => RACKETS[a].setup - RACKETS[b].setup) : [];
  const racketOk = firstBiz ? racketKinds.map(k => can(w, { type: 'start_racket', businessId: firstBiz.id, kind: k })) : [];
  const racketBlocked = firstBiz && racketOk.length && !racketOk.some(r => r.ok) && !/action points|hours/i.test(racketOk[0].why ?? '') ? racketOk[0].why : undefined;
  // the back-room step points at your best ground, not wherever you are standing: it needs influence 10
  // on the block, and the first cut pointed at the block underfoot, where a new player seldom has it
  const ground = playerBlocks(w)[0] ?? Object.values(w.blocks).filter(b => (b.influence[PLAYER] ?? 0) > 0).sort((a, b) => (b.influence[PLAYER] ?? 0) - (a.influence[PLAYER] ?? 0))[0];
  const room = ground ? can(w, { type: 'rent_safehouse', blockId: ground.id }) : undefined;
  const list: Lead[] = [
    { id: 'talk', text: stranger ? `Introduce yourself to ${fullName(stranger)}` : 'Introduce yourself to somebody', why: 'Talking builds trust and shows you what somebody is like.', done: (p.introduced ?? 0) > 0 || met >= 1, npcId: stranger?.id },
    { id: 'lean', text: soft ? `Get ${fullName(soft)} to trust or fear you` : 'Get an owner to trust or fear you', why: 'Thirty of either and protection becomes a real ask. Cowards and low nerve fold fastest.', done: leaned || prot > 0, npcId: soft?.id },
    { id: 'protect', text: warm && warm.workId ? `Put ${w.businesses[warm.workId].name} under your protection` : 'Put a business under your protection', why: 'Your first daily money, and your first foothold on a block. The odds show on the button; talk or lean more first if they are poor.', done: prot > 0, npcId: warm?.id },
    { id: 'racket', text: firstBiz ? `Start a racket at ${firstBiz.name}` : 'Start a racket in a place you protect', why: 'Rackets earn every night. The cheap ones pay for themselves in a week.', done: p.racketIds.length > 0, businessId: firstBiz?.id, blocked: racketBlocked && `${racketBlocked} Protection pays every night.` },
    { id: 'crew', text: patron ? `Win over ${fullName(patron)} and recruit them` : 'Recruit somebody', why: 'Crew run rackets properly, go on jobs and one day run districts.', done: p.crewIds.length > 0, npcId: patron?.id },
    { id: 'job', text: offer ? `Pull a job: ${offer.title}` : 'Pull a job', why: 'Jobs are the fast money, and the loud way to make a name.', done: Object.values(w.jobs).some(j => j.status === 'done' || j.status === 'failed'), tab: 'jobs' },
    { id: 'wash', text: fx && !fx.rel.met ? `Find the fixer, ${fullName(fx)}, and wash some money` : 'Wash some dirty money', why: 'Buying places, lawyers and officials takes clean money.', done: washed, npcId: fx && !fx.rel.met ? fx.id : undefined, tab: fx?.rel.met ? 'empire' : undefined,
      // wages come out of dirty money first, so one racket and one recruit can leave it at $0 every
      // morning: the step waited on something that could not happen, with $2,961 clean in the drawer
      blocked: fx?.rel.met && p.dirty < 100 ? `Nothing dirty to wash: you have ${money_(p.dirty)}, and wages come out of dirty money first. A job or another racket will leave some over.` : undefined },
    { id: 'safehouse', text: ground ? `Take a back room on ${ground.name}` : 'Take a back room on your ground', why: 'Beds for more crew, room for stock, space for a lab. It needs influence 10 on the block.', done: p.safehouseIds.length > 0, blockId: ground?.id ?? here.id, blocked: !ground ? 'You need a foothold on a block first: protect a place.' : room && !room.ok && !/action points|hours|Landlords/i.test(room.why ?? '') ? room.why : undefined },
    { id: 'hold', text: 'Hold a block', why: 'Thirty influence and the most of anybody. Stack things on one block and it comes fast.', done: playerBlocks(w).length > 0, blockId: here.id },
    { id: 'payroll', text: 'Put an official on your payroll', why: 'A captain cools the precinct; a DA slows the files; a judge shortens sentences.', done: Object.values(w.npcs).some(n => n.payroll), tab: 'people' },
    { id: 'lieutenant', text: 'Put a lieutenant over a district', why: 'Level 2 and loyalty 55. Rackets there run themselves — and they could inherit it all.', done: crew(w).some(n => n.crew?.assignment?.kind === 'district'), tab: 'crew', blocked: crew(w).some(n => n.crew!.level >= 2 && n.crew!.loyalty >= 55) ? undefined : 'Nobody is ready yet: a lieutenant needs level 2 and loyalty 55. Crew learn on jobs and posts, and pay keeps them loyal.' },
    { id: 'road', text: `Hold a quarter of ${w.city.name}`, why: 'The road opens: start up in the next city, with everything you carry. See the region map.', done: !!w.region?.cities.some(c => c.open || (c.founded && c.id !== 'c0')), tab: 'rivals' },
    { id: 'half', text: `Hold half of ${w.city.name}`, why: 'That is winning. The game goes on after.', done: !!w.won, tab: 'rivals' },
  ];
  // the clock: a step whose door is shut at this hour waits, says when it opens, and the strip moves
  // on to something that can be done now — recruiting by day, pitching protection by night
  const hourOf: Partial<Record<string, () => string | undefined>> = {
    protect: () => (warm ? closedNow_(w, { type: 'scene', kind: 'protect', npcId: warm.id }) : undefined),
    crew: () => (patron ? closedNow_(w, { type: 'scene', kind: 'recruit', npcId: patron.id }) : undefined),
    wash: () => (fx?.rel.met ? closedNow_(w, { type: 'fixer_wash', amount: 1 }) : undefined),
    safehouse: () => closedNow_(w, { type: 'rent_safehouse', blockId: here.id }),
    payroll: () => closedNow_(w, { type: 'scene', kind: 'bribe', npcId: here.id }),
  };
  for (const l of list) { if (l.done || l.blocked) continue; const why = hourOf[l.id]?.(); if (why) l.blocked = why; }
  return list;
}

/**
 * Why a racket would earn nothing yet, if it would. Dealing sells your own product, and is cheap
 * enough that a new player picks it first — then watches it take in $0 a night, because nothing
 * makes product until a still is running in a back room. Shown on the button, not buried.
 */
export function racketWarning(w: World, kind: RacketKind): string | undefined {
  const sells = RACKETS[kind].sells; if (!sells?.length) return undefined;
  const have = sells.some(pr => w.player.stash[pr].n > 0);
  const making = w.player.safehouseIds.some(id => w.safehouses[id]?.labs.some(l => sells.includes(LABS[l.kind].product)));
  return have || making ? undefined : 'Sells your own product, and you have none: it earns nothing until a still or grow room is running in a back room.';
}

/**
 * The step the strip shows: the first one not done that can be done now, else the first not done
 * (with what it is waiting on). A blocked step never stalls the whole line — while the racket waits
 * for money the strip moves on to recruiting, and comes back.
 */
export function nextLead(w: World): Lead | undefined {
  const todo = leads(w).filter(l => !l.done);
  return todo.find(l => !l.blocked) ?? todo[0];
}
