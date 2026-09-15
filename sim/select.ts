/** Read-only helpers for the UI. Never mutate. */
import { BUSINESS_DEFS } from '@content/businesses';
import { CASE_JOINT, OP_APPROACHES, OP_DEFS, PRODUCTION_DEFS, RACKET_DEFS, RECIPES, qualityMult, type OpApproach } from '@content/rackets';
import { controller, stanceFor } from './generate';
import { CREW_COLOR, crewAt } from './crews';
export { crewAt };
export { fundReason, fundTarget, fundedRacket } from './crews';
export { lieutenants, lieutenantOf, districtsRunnable, districtIncome, promoteReason, playerAssetsIn } from './lieutenants';
export { nearPolice } from './tick';
export { brokerReason } from './politics';
export { route, travelCost, isHere, npcIsHere, npcBlockIds, npcReachBlock, currentBlock, yourTurf, footholdBlocks, legworkFor, FOOTHOLD } from './travel';
import { openCases } from './cases';
import { abandonedBlocks } from './abandoned';
import { activeHelp, helpAgainst } from './informants';
export { openCases, caseWitnessOf } from './cases';
export { connectionsOf, familyOf, backingOf } from './connections';
export { ownedItems, equippedItems, isEquipped, ownedCount, equippedCount, equipSlotsLeft, kitSkillBoost, kitApproachBias, kitHeatMult, kitMods, handsOn, jobKit, jobSkillBoost, jobApproachBias, jobHeatMult, isMarket, marketStock, buyPrice, sellPrice, EQUIP_MAX } from './items';
import { authorityDifficulty, buyCaseCost, buyDownCost } from './authority-ops';
import { saturationMult, synergyFor } from './territory';
import { coverFor } from './lieutenants';
import { racketsAllowed } from './tiers';
import { foremanOf, supplyReading, SUPPLY_LABELS } from './automation';
import { productionOutput } from './economy';
import { laneDiscount, routeDiscount } from './intel';
import { rawRacketIncome, streetPrice } from './economy';
import { playerWorks, qualityOf, sellMult } from './production';
import { equippedItems, jobApproachBias, jobHeatMult, jobSkillBoost } from './items';
export { confrontations, activeConfrontation, confrontOptions, confrontChance, backupCrew, CONFRONT_AS } from './combat';
export { cards, liveCards, cardById, cardValue, runOdds, dumpValue, tapped, daysTapped, tapRisk, secrets, secretsAbout, unsoldSecrets, dirtPrice, scrubPower, cyberHeat } from './cyber';
/** Rackets a faction has marked: the ones 'Dig In' answers. */
export function threatenedRackets(w: World) {
  return w.player.racketIds.map(id => w.rackets[id]).filter(r => r && (r.threatened ?? 0) >= w.day);
}
import { connectionsOf } from './connections';
export { seatReason, members as commissionMembers } from './commission';
export { protectRoute, protectReason, PROTECT_TRUST, PROTECT_FAVOUR_RATE } from './economy';
// informants and assets: a standing arrangement, and an introduction
export { assets, assetOf, assetReason, hearsAbout, referrals, referralReason, goneCold } from './informants';
// the lieutenant who keeps turning up
export { nemesisName, isNemesis, notoriety, candidatesFor, successionWeight, playerName, withNickname } from './nemesis';
import { playerName } from './nemesis';
import { isLoneWolf } from './economy';
import { LONE_WOLF } from '@content/backgrounds';
import { DAYPARTS, DEFAULT_HOUR, daypartAt } from '@content/timeofday';
import { specialistWorth } from './specialists';
export { rolesFor, isSetPiece, candidatesFor as specialistsFor, specialistFee, reliability, hireReason, hiredOn } from './specialists';
import { activeCrewCount, heatMult } from './util';
export { defectReason } from './defect';
// the systemic core: how well you know somebody, what you have over them, and what they owe you
export { daysKnown, familiar, familiarReason, favours, leverageOver, concessionReason, trustCeiling, fearCeiling, recruitRoleReason, RECRUITABLE_ROLES } from './standing';
// the personal history screen, and what a conversation can do with it
export { dossier, ledgerOf, owedToThem, LEDGER_MAX } from './ledger';
// the social layer as a picture: layout only, computed from data that already exists
export { headlines, hasNews } from './news';
export { trophies, type Trophy } from './trophies';
export { relationshipWeb, WEB_MAX, type Web, type WebNode, type WebLink, type WebKind } from './relationships';
export { personalPull } from './commission';
// business tiers: what a place can host, what it costs, and whether fear is a door at all
export { racketsAllowed, setupCost, tierOf, tierInfo, extortReason, wayIn, hasWayIn, canHost, standingReason } from './tiers';
export { agendaKnown, agendaMoves, agendaCost, agendaChance, agendaReason, agendaTargetName, sharedConnections } from './agendas';
export { talkOptions, isTalk, TALK } from './conversation';
export { fixerRate, fixerDailyCap, fixerUsedToday, fixerCapToday, fixerCapLeft, fixersKnown } from './economy';
export { DAYPARTS, DEFAULT_HOUR, daypartAt, HOURS } from '@content/timeofday';
/** The part of the day the next job would run in. */
export const daypart = (w: World) => daypartAt(w.hour ?? DEFAULT_HOUR);
export { layingLow, layLowLeft, cacheCap, cacheCapLeft, cacheReason, isLoneWolf } from './economy';
// what a fortune is for: prices, caps and the quotes the screens read
export { lovedOne, lovedStatus, isLoved, heirs, hunters, willComeForYou, personalCover, goStraightReason, goStraightDays, GO_STRAIGHT } from './legacy';
// the outfit that started after you did. Read-only: nothing outside `tickUpstart` moves it.
export { upstart, hasArrived, UPSTART } from './upstart';
// one of your own, about a name on one of your lists
export { kinOnTheJob, kinChance, KIN, KIN_ANSWERS, type KinAnswer } from './kin';
export { favourPrice, favourReason, lifestyleAt, nextStep, lifestyleOwned, standingShow, securityCover, legitimacy, legitimacyHeatMult, legitimacyGain, legitimacyReason, ceilingAt, ceilingPrice, extraBeds, safehouseLimit, bedsTotal } from './fortune';
export { knownRecipes, recipesForKind, restockCost, qualityOf, sellMult, shortageActive, saturationActive, productionQuality, playerWorks, playerWorked, PLAYER_HANDS } from './production';
import { distanceM } from '@geo/project';
import { STEP_M } from './populate';
import { PLAYER, type Block, type Business, type ProductKind, type Racket, type Faction, type FactionId, type Id, type Npc, type OpKind, type RacketKind, type Stance, type World } from './types';

export { controller, stanceFor };

export function blockController(w: World, blockId: Id): FactionId | undefined { return controller(w.blocks[blockId]); }
export function factionColor(w: World, f?: FactionId): string {
  if (!f) return '#666a70';
  if (f === PLAYER) return '#f2c94c';
  if (w.crews[f]) return CREW_COLOR;
  return w.factions[f]?.color ?? '#666a70';
}
export function factionName(w: World, f?: FactionId): string {
  if (!f) return 'Unclaimed'; if (f === PLAYER) return playerName(w); if (w.crews[f]) return `The ${w.crews[f].name}`; return w.factions[f]?.name ?? '?';
}
export function businessesIn(w: World, blockId: Id): Business[] { return w.blocks[blockId].businessIds.map(id => w.businesses[id]).filter(b => b && !b.shut); }
export function patronsOf(w: World, biz: Business): Npc[] { return biz.patronIds.map(id => w.npcs[id]).filter(n => n.alive); }
export function crew(w: World): Npc[] { return w.player.crewIds.map(id => w.npcs[id]); }
export function idleCrew(w: World): Npc[] { return crew(w).filter(n => n.crew?.status === 'idle'); }
export function playerBlocks(w: World): Block[] { return Object.values(w.blocks).filter(b => controller(b) === PLAYER); }
export function blocksOf(w: World, f: FactionId): Block[] { return Object.values(w.blocks).filter(b => controller(b) === f); }
export function officials(w: World): Npc[] { return Object.values(w.npcs).filter(n => n.official); }
/** Where an outfit stands with the player. A street crew or a dangling id is at peace by default. */
export function stanceWithPlayer(w: World, f: FactionId): Stance { return w.factions[f]?.stance[PLAYER] ?? 'peace'; }
export function racketsAt(w: World, biz: Business) { return biz.racketIds.map(id => w.rackets[id]); }
export function availableRackets(w: World, biz: Business): RacketKind[] {
  const present = new Set(racketsAt(w, biz).map(r => r.kind));
  // `racketsAllowed`, not the type's raw list: the tier gate has to be the same one `can` uses or
  // the block sheet offers a racket the reducer then refuses.
  return racketsAllowed(biz).filter(k => !present.has(k) && !(k === 'protection' && biz.ownedBy === 'player'));
}
export function opTargets(w: World, kind: OpKind): Business[] {
  const d = OP_DEFS[kind];
  if (d.target !== 'business') return [];
  // a landmark job has exactly one address, and the planner should offer exactly that one
  if (d.requires?.landmarkTarget) return Object.values(w.businesses).filter(b => b.landmark === d.requires!.landmarkTarget && !b.shut);
  return Object.values(w.businesses).filter(b => {
    if (b.shut) return false;   // a bust-out leaves a building, not a business
    if (d.ownBusiness) return b.ownedBy === 'player';
    if (d.targetTypes) return d.targetTypes.includes(b.type) && b.ownedBy !== 'player';
    if (kind === 'raid_rival') return b.racketIds.some(r => w.rackets[r].owner !== PLAYER) || (b.protection && b.protection.factionId !== PLAYER);
    return b.ownedBy !== 'player' && !['bank', 'armored_depot'].includes(b.type);
  });
}
/**
 * Who the planner will let you point an NPC job at.
 *
 * Lived in the component as a hard-coded role list — `boss | lieutenant | owner | official |
 * soldier` — and that list had a hole exactly where it mattered most. **Every** route out of your
 * crew leaves somebody on `role: 'patron'`: the betrayal event, being fired, walking out on low
 * loyalty, a skim confrontation that went the wrong way, a deposed rival. So the man who took your
 * money, told the police and left could not be selected for a hit, a kidnapping or a frame, while
 * a hundred and seventy strangers stayed on the list. The reducer had no such rule and would have
 * planned the job; only the picker refused, by never showing him.
 *
 * The rule is **the people who matter in the city, plus anybody you have actually dealt with** —
 * history being the ledger and the grudge, both of which the game already writes for its own
 * reasons, so this invents no new tracking. It is here rather than in the component for the reason
 * the recruit button was moved here: a permission and the control that offers it must not be two
 * lists.
 */
export function opNpcTargets(w: World, kind: OpKind): Npc[] {
  const d = OP_DEFS[kind];
  if (d.target !== 'npc') return [];
  // the per-target requirements come first: they are the whole point of the job, not a filter on it
  if (d.requires?.jailedTarget) return crew(w).filter(n => n.crew?.status === 'jailed');
  if (d.requires?.rattedTarget) return Object.values(w.npcs).filter(n => n.alive && !n.crew && n.ratted !== undefined);
  if (d.requires?.officialTarget) return Object.values(w.npcs).filter(n => n.alive && n.official?.authorityId);

  const matters = (n: Npc) => ['boss', 'lieutenant', 'owner', 'official', 'soldier'].includes(n.role);
  // what has actually passed between you: a recruit writes a ledger entry the day they join, so an
  // ex-crew member is caught by the first of these even when they left without hard feelings
  const history = (n: Npc) => !!(n.ledger?.length || n.grudge);
  return Object.values(w.npcs)
    .filter(n => n.alive && !n.crew && (matters(n) || history(n)))
    // History first: the list is long and the screen cuts it, and somebody you have unfinished
    // business with is who you came to this screen looking for.
    .sort((a, b) => Number(history(b)) - Number(history(a)) || a.name.localeCompare(b.name));
}

export function crewSkillSum(w: World, ids: Id[]): Record<string, number> {
  const s: Record<string, number> = { muscle: 0, brains: 0, charm: 0, wheels: 0, tech: 0 };
  for (const id of ids) { const n = w.npcs[id]; if (!n) continue; for (const k of Object.keys(s)) s[k] += n.skills[k as keyof typeof n.skills]; }
  return s;
}
/**
 * What a job would actually put on your heat bar, as the planner should show it.
 *
 * `OpDef.heat` is the job's *rating*, not a promise: the approach, the kit in your hands and then
 * the whole `heatMult` stack — working alone, bought legitimacy, the hour, home turf, a school on
 * the corner — all sit between it and the bar. Printing the raw rating next to "Difficulty 60" was
 * the planner half of the bug where a 16-heat job announced "+16" and moved the bar by 9.
 *
 * Deliberately the *typical* case: the one term left out is the clean-job discount (a margin over
 * 30 pays 0.6), because nobody can know before the night whether it went that well. So this is the
 * honest upper end of an ordinary result, not a floor.
 */
export function opHeat(w: World, kind: OpKind, opts: { approach?: OpApproach; blockId?: Id; crewIds?: readonly Id[] } = {}): number {
  const def = OP_DEFS[kind];
  const ap = opts.approach ? OP_APPROACHES[opts.approach] : undefined;
  // The kit term is `jobKit`'s, not the player's alone: the planner has to price the crew you are
  // about to send, or it quotes one number and the night charges another. With no crew picked yet
  // that is just your own kit, which is what it always was.
  return Math.round(def.heat * (ap?.heat ?? 1) * jobHeatMult(w, opts.crewIds ?? []) * heatMult(w, opts.blockId));
}

export interface OpTarget { businessId?: Id; npcId?: Id; caseId?: Id; factionId?: FactionId }
/** Old call sites pass a business id; newer ops need a person or a file, so both are accepted. */
function asTarget(t?: Id | OpTarget): OpTarget { return typeof t === 'string' ? { businessId: t } : (t ?? {}); }

export function opChance(w: World, kind: OpKind, crewIds: Id[], approach?: OpApproach, target?: Id | OpTarget, op?: { kind: OpKind; specialists?: { role: string; npcId: Id }[] }): number {
  const d = OP_DEFS[kind]; const s = crewSkillSum(w, crewIds); const ap = approach ? OP_APPROACHES[approach] : undefined;
  const tgt = asTarget(target); const targetBusinessId = tgt.businessId;
  // On a job you can do alone, you are one of the hands. Without this a minCrew-0 op with no crew
  // on it has a skill sum of zero and floors at 3% — the tree says "solo ok" and the game says no.
  // It matters most on the wire, where the skill the job wants (tech) is the player's own and
  // hiring somebody with tech 11 is a long way past where these ops sit in the tree. Jobs that
  // *require* crew are untouched on purpose: their balance is the crew you bring, not you.
  if (d.minCrew === 0) for (const k of Object.keys(s)) s[k] += w.player.skills[k as keyof typeof w.player.skills];
  // what the people on the job are carrying counts: kit adds to the crew's hands, and it pulls an
  // approach's weights up or down — a sawn-off makes a loud job better and a quiet one worse. One
  // item per category across everybody on it, whichever is the dearest of its kind; see `jobKit`.
  for (const [k, v] of Object.entries(jobSkillBoost(w, crewIds))) s[k] = (s[k] ?? 0) + (v ?? 0);
  const bias = 1 + jobApproachBias(w, crewIds, approach);
  let ratio = 0, n = 0;
  for (const [k, need] of Object.entries(d.needs)) { const wgt = (ap?.skillWeight[k as keyof typeof ap.skillWeight] ?? 1) * bias; ratio += Math.min(1.3, (s[k] * wgt) / (need || 1)); n++; }
  ratio = n ? ratio / n : 1;
  // a place you have walked in the last few days is a place you know the back of
  const cased = targetBusinessId && (w.businesses[targetBusinessId]?.casedUntil ?? 0) >= w.day ? CASE_JOINT.difficulty : 0;
  // a current route off a depot employee is the same kind of discount as having walked the place
  const route = kind === 'heist_armored' ? -routeDiscount(w, targetBusinessId) : -laneDiscount(w, kind);
  // Work aimed at the law is harder the harder the law is already looking, and harder again on
  // ground they are standing on — the same way every other op reads its target's state.
  const authority = d.target === 'case' || d.requires?.officialTarget || d.requires?.jailedTarget
    ? authorityDifficulty(w, tgt) : 0;
  // Somebody of yours already inside their people. An asset is standing, not a favour spent, so
  // it pays on every job against them — which is what separates it from a one-off introduction.
  const inside = assetBonus(w, tgt);
  // Nobody else to be somewhere at the wrong moment. Only on a job you are genuinely running
  // alone while you *are* alone — bringing somebody turns it off, which is the point of it.
  const solo = crewIds.length === 0 && isLoneWolf(w) ? LONE_WOLF.opBonus : 0;
  // when you run it. Quiet hours help the odds and cost the take; see `content/timeofday.ts`
  const when = DAYPARTS[daypartAt(w.hour ?? DEFAULT_HOUR)].chance;
  const base = 50 + (ratio - 1) * 70 - (d.difficulty + (ap?.difficulty ?? 0) + cased + route + authority - 50) * 0.6 - w.player.heat * 0.15;
  // The people hired for one night, at their expected value — the planner shows what they are
  // worth *on average*, and the night itself rolls each of them separately (`rollSpecialists`).
  const hired = op ? specialistWorth(w, op) : 0;
  return Math.max(3, Math.min(97, Math.round(base + inside + solo + when + hired)));
}
/** People at a target who trust you enough to be an inside man (best first). */
export function insidersFor(w: World, businessId?: Id): Npc[] {
  if (!businessId) return [];
  const b = w.businesses[businessId]; if (!b) return [];
  return [b.ownerId, ...b.patronIds].map(id => w.npcs[id]).filter(n => n && n.alive && !n.crew && n.rel.trust >= 35).sort((x, y) => y.rel.trust - x.rel.trust);
}
export function racketLabel(k: RacketKind) { return RACKET_DEFS[k].label; }
export function dailyEstimate(w: World): { clean: number; dirty: number; wages: number; rent: number } {
  let clean = 0, dirty = 0;
  for (const id of w.player.businessIds) clean += w.businesses[id].baseIncome * (w.businesses[id].condition / 100);
  for (const id of w.player.racketIds) { const r = w.rackets[id]; if (RACKET_DEFS[r.kind].dirty) dirty += r.lastIncome; else clean += r.lastIncome; }
  const wages = crew(w).reduce((s, n) => s + (n.crew?.status === 'dead' ? 0 : n.crew?.cut ?? 0), 0);
  const rent = w.player.safehouseIds.reduce((s, id) => s + [600, 2500, 8000][w.safehouses[id].tier - 1] / 30, 0);
  return { clean: Math.round(clean), dirty: Math.round(dirty), wages, rent: Math.round(rent) };
}
/** Distance from the start point in block steps (~330 m). */
export function distanceFromStart(w: World, blockId: Id): number { return distanceM(w.blocks[blockId].center, w.origin) / STEP_M; }
export function startBlock(w: World): Block { return Object.values(w.blocks).slice().sort((a, b) => distanceM(a.center, w.origin) - distanceM(b.center, w.origin))[0]; }
export function neighborsOf(w: World, blockId: Id): Block[] { return w.blocks[blockId].neighborIds.map(id => w.blocks[id]).filter(Boolean); }
export function npcLocation(w: World, n: Npc): Business | undefined {
  if (n.favouriteBusinessIds.length) return w.businesses[n.favouriteBusinessIds[0]];
  if (n.role === 'owner') return Object.values(w.businesses).find(b => b.ownerId === n.id && !b.shut);
  return undefined;
}
export function agendaLabel(n: Npc): string | undefined {
  if (!n.agenda || n.agenda.done || !(n.known || n.rel.trust >= 20)) return undefined;
  const L: Record<string, string> = { debt: 'Owes money to the wrong people', leave: 'Wants out of this life', revenge: 'Wants to get even', ambition: 'Wants to be somebody', family: 'Protecting their family' };
  return `${L[n.agenda.kind]} (${Math.round(n.agenda.progress)}%)`;
}
export function isKnown(n: Npc): boolean { return n.known || n.rel.trust >= 20; }

// ---------------------------------------------------------------- who you know
/** How long a note the player can keep on somebody. */
export const PLAYER_NOTE_MAX = 240;
/**
 * Everybody the player has met, for the Social tab. "Met" is the same test the person's own
 * sheet uses to decide whether to show their traits, so the roster never knows more than the
 * sheet does. The dead are left out: this is an address book, not a memorial.
 */
export function metNpcs(w: World): Npc[] {
  return Object.values(w.npcs).filter(n => n.alive && isKnown(n)).sort((a, b) => a.name.localeCompare(b.name));
}
/** Their ties to people the player has also met — the ones worth tracking in a roster. */
export function knownConnectionsOf(w: World, n: Npc) {
  return connectionsOf(w, n).filter(c => isKnown(c.npc));
}
export function relLabel(n: Npc): string {
  const { trust, fear } = n.rel;
  if (trust >= 60) return 'Friend'; if (trust >= 25) return 'Warm'; if (fear >= 60) return 'Terrified';
  if (trust <= -50) return 'Enemy'; if (trust <= -20) return 'Cold'; if (fear >= 30) return 'Wary';
  return 'Neutral';
}
export function controlShare(w: World): number {
  const all = Object.values(w.blocks); return all.filter(b => controller(b) === PLAYER).length / all.length;
}

// ---------------------------------------------------------------- op progression
/** Why this op is not on the table yet, or undefined when it is. Same shape as availableRackets. */
export function opLocked(w: World, kind: OpKind, target?: { npcId?: Id; businessId?: Id; caseId?: Id; blockId?: Id }): string | undefined {
  const req = OP_DEFS[kind].requires; if (!req) return undefined;
  const p = w.player;
  if (req.crewCount !== undefined && p.crewEver < req.crewCount) return `Needs ${req.crewCount} ${req.crewCount === 1 ? 'person' : 'people'} to have joined your crew. You have had ${p.crewEver}.`;
  if (req.safehouseTier !== undefined) {
    const best = Math.max(0, ...p.safehouseIds.map(id => w.safehouses[id]?.tier ?? 0));
    if (best < req.safehouseTier) return `Needs a tier ${req.safehouseTier} safehouse. Your best is ${best || 'none'}.`;
  }
  if (req.businessOwned && !p.businessIds.length) return 'Needs a business of your own.';
  if (req.racketKinds?.length) {
    const running = new Set(p.racketIds.map(id => w.rackets[id]?.kind).filter(Boolean));
    if (!req.racketKinds.some(k => running.has(k))) return 'Needs a racket of your own up and running.';
  }
  if (req.priorOps?.length) {
    const done = new Set(Object.values(w.ops).filter(o => o.status === 'done').map(o => o.kind));
    if (!req.priorOps.some(k => done.has(k))) return `Needs a ${req.priorOps.map(k => OP_DEFS[k].label).join(' or ')} behind you.`;
  }
  if (req.stance?.length && !factionsAt(w, req.stance).length) {
    return `War work. Nobody is at ${req.stance.join(' or ')} with you${req.stance.includes('beef') ? ' yet' : ''}.`;
  }
  if (req.weapon && !equippedItems(w).some(i => i.category === 'weapon')) return 'You do not walk into this one empty-handed. Carry a weapon.';
  if (req.landmarkTarget) {
    const here = target?.businessId ? w.businesses[target.businessId] : undefined;
    const any = Object.values(w.businesses).find(b => b.landmark === req.landmarkTarget && !b.shut);
    if (!any) return 'There is no such place in this city.';
    if (here && here.landmark !== req.landmarkTarget) return `Only at ${any.name}. There is one of those.`;
  }
  if (req.alone && !isLoneWolf(w)) {
    const n = activeCrewCount(w);
    return `Work for one person. You have ${n} ${n === 1 ? 'person' : 'people'} on the books, and there is no version of this with somebody else standing there.`;
  }
  // The per-target family, all cut from the same template as rattedTarget below: each asks about
  // *this mark* rather than about the empire, so each takes the op's own target. With no target
  // in hand (browsing the tree) they ask only whether any valid mark exists at all.
  if (req.officialTarget) {
    const n = target?.npcId ? w.npcs[target.npcId] : undefined;
    if (n) { if (!n.official?.authorityId) return `${n.name} does not answer to anybody worth reaching.`; }
    else if (!Object.values(w.npcs).some(x => x.official?.authorityId && x.alive)) return 'Nobody inside a precinct or city hall to sit down with.';
  }
  if (req.jailedTarget) {
    const n = target?.npcId ? w.npcs[target.npcId] : undefined;
    if (n) { if (n.crew?.status !== 'jailed') return `${n.name} is not in a cell.`; }
    else if (!w.player.crewIds.some(id => w.npcs[id]?.crew?.status === 'jailed')) return 'Nobody of yours is inside. This one is for getting your own people out.';
  }
  if (req.casedTarget) {
    const b = target?.businessId ? w.businesses[target.businessId] : undefined;
    if (b) { if ((b.casedUntil ?? 0) < w.day) return `You have not walked ${b.name}. Case the joint first — this one needs the room in your head.`; }
    else if (!Object.values(w.businesses).some(x => (x.casedUntil ?? 0) >= w.day)) return 'Nothing you have cased recently. Walk the place first.';
  }
  if (req.caseTarget) {
    const c = target?.caseId ? (w.cases ?? []).find(x => x.id === target.caseId) : undefined;
    if (c) { if (c.status !== 'open') return 'That file is already closed.'; }
    else if (!openCases(w).length) return 'No open investigation to reach into. Nothing to kill yet.';
  }
  if (req.derelictTarget) {
    const b = target?.blockId ? w.blocks[target.blockId] : undefined;
    if (b) {
      if (!b.abandoned) return `${b.name} is not derelict.`;
      if (!b.abandoned.known) return `You have not found anything on ${b.name}.`;
      if (b.abandoned.claimedBy) return `${b.name} is already claimed.`;
    } else if (!abandonedBlocks(w, { known: true, unclaimed: true }).length) {
      return 'No derelict ground you have found. Walk the quiet edges of a district, or run Scout the Edges.';
    }
  }
  if (req.rattedTarget) {
    // The only per-target requirement in the game: it asks about this mark, not about you. With a
    // target in hand that is the whole check. Without one — the ops tree, browsing — the honest
    // question is whether you have any mark at all, otherwise the node could never read unlocked.
    const n = target?.npcId ? w.npcs[target.npcId] : undefined;
    if (n) { if (!n.ratted) return `You have never been inside ${n.name}'s business. Get in there first.`; }
    else if (!rattedNpcs(w).length) return 'Only possible against somebody whose business you have already been inside. Get inside one first — one good look, or a tap left running.';
  }
  return undefined;
}
/** Factions holding one of these stances toward the player right now. */
export function factionsAt(w: World, stances: Stance[]): Faction[] {
  return Object.values(w.factions).filter(f => f.alive && stances.includes(f.stance[PLAYER] ?? 'peace'));
}

/** Ops whose requirements are met right now. */
export function opsAvailable(w: World, target?: { npcId?: Id; businessId?: Id; caseId?: Id; blockId?: Id }): OpKind[] {
  return (Object.keys(OP_DEFS) as OpKind[]).filter(k => !opLocked(w, k, target));
}
/** The player's rackets of one kind — the carding racket a card dump needs, for instance. */
export function playerRacketsOfKind(w: World, kind: RacketKind) {
  return w.player.racketIds.map(id => w.rackets[id]).filter(r => r && r.kind === kind && !r.disrupted);
}

/** Everybody whose business you have been inside: the marks wire fraud is possible against. */
export function rattedNpcs(w: World): Npc[] { return Object.values(w.npcs).filter(n => n.ratted && n.alive); }
export { isAbandoned, isKnownAbandoned, isClaimable, claimedByPlayer, abandonedBlocks } from './abandoned';
export { allHostages, hostagesOf, isHeld, daysHeld, ransomValue, holdRisk } from './hostages';
export {
  authorities, authorityById, authorityOf, officialsOf, watchersOf,
  effectivePolice, monitoringAt, monitoringField, hopsWithin,
  pressureOn, boughtRelief, postureFor, topPosture, raidPressure,
} from './authority';
export { presenceBlocks, revealable, isFogged, withinReach, distanceToChunk, nearestFoggedDistance, REVEAL_M } from './fog';

/**
 * What an op costs upfront. Most are a constant; the law-facing ones scale with how hard the
 * building is already looking. `can()` and the dispatch both read this, so the number quoted in
 * the planner and the number taken out of your pocket can never drift apart.
 */
export function opCost(w: World, kind: OpKind, target?: { npcId?: Id; caseId?: Id }): number {
  const d = OP_DEFS[kind];
  if (d.costScales !== 'authority') return d.cost ?? 0;
  return (d.cost ?? 0) + (kind === 'buy_case' ? buyCaseCost(w, target?.caseId) : buyDownCost(w, target?.npcId));
}
export {
  targetAuthority, authorityDifficulty, buyDownCost, buyCaseCost, buyDownAmount,
  jailedCrew, isJailedCrew, openCaseById, lawJobPrice, rungOf,
} from './authority-ops';

/**
 * What a racket of this kind would actually be worth on this business today, with the district's
 * saturation and any synergy already folded in. This is the number that makes diversifying a
 * decision rather than flavour: a fifth protection in a flooded district reads visibly worse
 * than a first fencing next to your dealing.
 */
export function racketOutlook(w: World, biz: Business, kind: RacketKind): { income: number; saturation: number; synergy?: { bonus: number; why: string; needs: RacketKind } } {
  const probe: Racket = { id: '__probe', kind, businessId: biz.id, owner: PLAYER, startedDay: w.day + 1, level: 1, lastIncome: 0, disrupted: 0 };
  const saturation = saturationMult(w, probe);
  const synergy = synergyFor(w, probe);
  const def = RACKET_DEFS[kind];
  // stash-scale kinds earn from stock rather than a formula, so quote their base as a stand-in
  const raw = def.scale === 'stash' ? def.incomeBase || 150 : rawRacketIncome(w, probe);
  return { income: Math.round(raw * saturation * (1 + (synergy?.bonus ?? 0))), saturation, synergy };
}
/** The kinds you could start here, best first by what they would actually pay. */
export function racketsByOutlook(w: World, biz: Business): { kind: RacketKind; income: number; saturation: number; synergy?: { bonus: number; why: string; needs: RacketKind } }[] {
  return availableRackets(w, biz)
    .map(kind => ({ kind, ...racketOutlook(w, biz, kind) }))
    .sort((a, b) => b.income - a.income);
}
export {
  saturationMult, synergyMult, synergyFor, yieldMult, blockDepth, heldDays, accrualMult,
  territoryReading, racketReading, sameKindInDistrict,
} from './territory';
export {
  bestRecipeFor, foremanOf, supplyRule, supplyReading, SUPPLY_LABELS, moveProduct,
} from './automation';
export {
  intelCandidates, intelSourceFor, intelReading, skimmers, routeHolders, routeFor, anyRoute,
  routeDiscount, skimTake, skimRisk, daysRunning as intelDays,
  laneDiscount, anyLane, consignTake, consignRisk, offshoreCapacity, offshorePaper, consigners, offshoreHolders, laneHolders,
} from './intel';

// ---------------------------------------------------------------- what you are holding
/** Every unit of every product, wherever it is: on you and in every safehouse you own. */
export function stashTotals(w: World): Record<ProductKind, number> {
  const out: Record<ProductKind, number> = { booze: 0, green: 0, pills: 0, hot_goods: 0, counterfeit: 0, streetwear: 0 };
  for (const k of Object.keys(out) as ProductKind[]) {
    out[k] = w.player.stash[k] ?? 0;
    for (const id of w.player.safehouseIds) out[k] += w.safehouses[id]?.stash[k] ?? 0;
  }
  return out;
}
/** What one unit fetches where the player is standing, at the quality they are actually holding. */
export function unitPrice(w: World, product: ProductKind): number {
  const base = streetPrice(w, w.player.currentBlockId, product);
  return Math.round(base * sellMult(w, product) * qualityMult(qualityOf(w.player, product)));
}
/** Everything you hold, valued at what it would fetch. The one number worth putting at the top. */
export function stashValue(w: World): number {
  const totals = stashTotals(w);
  return Math.round((Object.keys(totals) as ProductKind[]).reduce((n, p) => n + totals[p] * unitPrice(w, p), 0));
}
/**
 * The named style the player is mostly holding of a product, if any production of theirs is
 * making one. Identity lives on the production that makes it — the stash is a bare count by
 * design and stays that way — so this reports rather than stores.
 */
export function styleOf(w: World, product: ProductKind): string | undefined {
  const making = Object.values(w.productions)
    .filter(pr => w.player.safehouseIds.includes(pr.safehouseId) && PRODUCTION_DEFS[pr.kind].product === product && pr.recipe && RECIPES[pr.recipe])
    .sort((a, b) => b.lastOutput - a.lastOutput);
  return making[0]?.recipe;
}


/**
 * What a pair of hands close to the target is worth on this job. Reads the target the same way
 * every other modifier above it does — a faction, a person who belongs to one, or the owner of
 * the place — so an asset works against whoever they are actually placed against.
 */
export function assetBonus(w: World, tgt: OpTarget): number {
  const direct = activeHelp(w, tgt.factionId);
  if (direct) return direct.bonus;
  const n = tgt.npcId ? w.npcs[tgt.npcId] : undefined;
  const viaNpc = helpAgainst(w, n);
  if (viaNpc) return viaNpc.bonus;
  const owner = tgt.businessId ? w.npcs[w.businesses[tgt.businessId]?.ownerId] : undefined;
  return helpAgainst(w, owner)?.bonus ?? 0;
}

// ---------------------------------------------------------------- the empire ledger
/**
 * Every holding, in one shape.
 *
 * Businesses, rackets and productions each had their own row on their own tab, showing whatever
 * that tab happened to know: the racket card knew its income, the block sheet knew saturation, the
 * inventory knew whether a production had a foreman, and nothing anywhere put the three side by
 * side. A player with twenty holdings could not answer "which of these is being crowded out" or
 * "which of these is running itself" without opening twenty sheets.
 *
 * This is assembly, not simulation. Every number here is read from the system that owns it —
 * `territory.ts` for saturation and synergy, `automation.ts` for the foreman and the standing
 * order, `economy.ts` for income — and nothing is recomputed a second way.
 */
export type HoldingKind = 'business' | 'racket' | 'production';
export interface HoldingAuto { state: 'foreman' | 'standing' | 'manual' | 'unmanned'; label: string; good: boolean }
export interface Holding {
  id: Id;
  kind: HoldingKind;
  icon: string;
  /**
   * The content id behind the row — a business type, a racket kind, a production kind. The UI
   * draws its own icons from these; `icon` above is still the emoji, which is data and is what a
   * log line or a share card uses.
   */
  typeId: string;
  name: string;
  where: string;
  blockId: Id;
  districtId?: Id;
  /** $/day. Actual last take for a racket, the day's estimate for a business or a production. */
  income: number;
  dirty: boolean;
  /** 1 is clear; below 1 is your own kind crowding this one out of its district. */
  saturation: number;
  synergy?: { bonus: number; why: string };
  auto: HoldingAuto;
  /** Anything wrong right now, in the player's words. */
  flags: string[];
}

export function holdings(w: World): Holding[] {
  const out: Holding[] = [];
  const blockName = (id: Id) => w.blocks[id]?.name ?? 'somewhere';

  for (const id of w.player.businessIds) {
    const b = w.businesses[id]; if (!b) continue;
    const flags: string[] = [];
    if (b.condition < 60) flags.push(`${Math.round(b.condition)}% condition`);
    if (b.flags.includes('torched')) flags.push('burned out');
    if (!b.insured) flags.push('uninsured');
    out.push({
      id: b.id, kind: 'business', icon: BUSINESS_DEFS[b.type].icon, typeId: b.type, name: b.name,
      where: blockName(b.blockId), blockId: b.blockId, districtId: w.blocks[b.blockId]?.districtId,
      income: Math.round(b.baseIncome * (b.condition / 100)), dirty: false,
      saturation: 1, auto: { state: 'manual', label: 'Owned outright', good: true }, flags,
    });
  }

  for (const id of w.player.racketIds) {
    const r = w.rackets[id]; if (!r) continue;
    const b = w.businesses[r.businessId];
    const def = RACKET_DEFS[r.kind];
    const flags: string[] = [];
    if (r.disrupted > 0) flags.push(`disrupted ${r.disrupted}d`);
    if ((r.threatened ?? 0) >= w.day) flags.push('threatened');
    if (!r.runnerId && !(b && coverFor(w, b))) flags.push('nobody running it');
    // a product racket that cannot reach stock earns nothing, and that is invisible on its card
    const product = racketProduct(r);
    const reading = product ? supplyReading(w, r, product) : undefined;
    if (reading && reading.available <= 0) flags.push('no stock to sell');
    out.push({
      id: r.id, kind: 'racket', icon: def.icon, typeId: r.kind, name: def.label,
      where: b ? `${b.name} · ${blockName(b.blockId)}` : blockName(w.player.currentBlockId),
      blockId: b?.blockId ?? w.player.currentBlockId, districtId: b ? w.blocks[b.blockId]?.districtId : undefined,
      income: Math.round(r.lastIncome), dirty: !!def.dirty,
      saturation: saturationMult(w, r), synergy: synergyFor(w, r),
      auto: reading
        ? { state: reading.rule === 'manual' ? 'manual' : 'standing', label: SUPPLY_LABELS[reading.rule].label, good: reading.rule !== 'manual' && reading.available > 0 }
        : { state: r.runnerId ? 'manual' : 'unmanned', label: r.runnerId ? `Run by ${w.npcs[r.runnerId]?.name ?? 'somebody'}` : 'Nobody on it', good: !!r.runnerId },
      flags,
    });
  }

  for (const sid of w.player.safehouseIds) {
    const sh = w.safehouses[sid]; if (!sh) continue;
    for (const pid of sh.productionIds) {
      const pr = w.productions[pid]; if (!pr) continue;
      const def = PRODUCTION_DEFS[pr.kind];
      const boss = foremanOf(w, pid);
      const flags: string[] = [];
      if (pr.disrupted > 0) flags.push(`disrupted ${pr.disrupted}d`);
      if (pr.stock <= 1) flags.push('out of ingredients');
      if (!pr.workerId && !boss && !playerWorks(w, pr)) flags.push('nobody working it');
      out.push({
        id: pr.id, kind: 'production', icon: def.icon, typeId: pr.kind, name: `${def.label}${pr.recipe && RECIPES[pr.recipe] ? ` · ${RECIPES[pr.recipe].label}` : ''}`,
        where: `${sh.name} · ${blockName(sh.blockId)}`, blockId: sh.blockId, districtId: w.blocks[sh.blockId]?.districtId,
        // a production does not take cash, it makes stock: value it at what the street pays
        income: Math.round(productionOutput(w, pr) * streetPrice(w, sh.blockId, def.product)),
        dirty: true, saturation: 1,
        auto: boss
          ? { state: 'foreman', label: `${boss.name} keeps it running`, good: true }
          : pr.workerId ? { state: 'manual', label: `Worked by ${w.npcs[pr.workerId]?.name ?? 'somebody'}`, good: true }
          // the line you are standing in yourself: not idle, but the reason to hire somebody
          : playerWorks(w, pr) ? { state: 'manual', label: 'You work it yourself', good: true }
          : { state: 'unmanned', label: 'Nobody on it', good: false },
        flags,
      });
    }
  }
  return out;
}

/** Which product a racket sells, when it sells one. The same map the automation tick uses. */
function racketProduct(r: Racket): ProductKind | undefined {
  if (r.kind === 'dealing') return r.product ?? 'green';
  if (r.kind === 'fencing') return 'hot_goods';
  if (r.kind === 'counterfeiting') return 'counterfeit';
  if (r.kind === 'knockoffs') return 'streetwear';
  return undefined;
}

export type HoldingSort = 'income' | 'name' | 'saturation' | 'kind' | 'where' | 'trouble';
/**
 * One comparator, in the sim rather than the component, so the order a player sees is a thing a
 * test can assert. Every sort falls back to income and then id, so it is total and stable: two
 * holdings with the same name never swap places between renders.
 */
export function sortHoldings(rows: Holding[], by: HoldingSort): Holding[] {
  const rank: Record<HoldingKind, number> = { business: 0, racket: 1, production: 2 };
  const cmp = (a: Holding, b: Holding): number => {
    switch (by) {
      case 'income': return b.income - a.income;
      case 'name': return a.name.localeCompare(b.name);
      case 'saturation': return a.saturation - b.saturation;   // most crowded out first: it is the problem
      case 'kind': return rank[a.kind] - rank[b.kind];
      case 'where': return a.where.localeCompare(b.where);
      case 'trouble': return b.flags.length - a.flags.length;
    }
  };
  return rows.slice().sort((a, b) => cmp(a, b) || b.income - a.income || a.id.localeCompare(b.id));
}

/** The one-line summary above the table: what the whole empire is actually doing. */
export function holdingsTotals(w: World): { count: number; income: number; dirty: number; crowded: number; synergies: number; automated: number; trouble: number } {
  const rows = holdings(w);
  return {
    count: rows.length,
    income: rows.reduce((n, r) => n + r.income, 0),
    dirty: rows.filter(r => r.dirty).reduce((n, r) => n + r.income, 0),
    crowded: rows.filter(r => r.saturation < 1).length,
    synergies: rows.filter(r => r.synergy).length,
    automated: rows.filter(r => r.auto.state === 'foreman' || r.auto.state === 'standing').length,
    trouble: rows.filter(r => r.flags.length > 0).length,
  };
}
