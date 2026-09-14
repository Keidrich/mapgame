/** Read-only helpers for the UI. Never mutate. */
import { BUSINESS_DEFS } from '@content/businesses';
import { CASE_JOINT, OP_APPROACHES, OP_DEFS, RACKET_DEFS, type OpApproach } from '@content/rackets';
import { controller, stanceFor } from './generate';
import { CREW_COLOR, crewAt } from './crews';
export { crewAt };
export { lieutenants, lieutenantOf, districtsRunnable, districtIncome, promoteReason, playerAssetsIn } from './lieutenants';
export { nearPolice } from './tick';
export { brokerReason } from './politics';
export { route, travelCost, isHere, npcIsHere, npcBlockIds, npcReachBlock, currentBlock, yourTurf, footholdBlocks, legworkFor, FOOTHOLD } from './travel';
import { openCases } from './cases';
import { abandonedBlocks } from './abandoned';
export { openCases, caseWitnessOf } from './cases';
export { connectionsOf, familyOf, backingOf } from './connections';
export { ownedItems, equippedItems, isEquipped, ownedCount, equippedCount, equipSlotsLeft, kitSkillBoost, kitApproachBias, kitHeatMult, kitMods, isMarket, marketStock, buyPrice, sellPrice, EQUIP_MAX } from './items';
import { authorityDifficulty, buyCaseCost, buyDownCost } from './authority-ops';
import { saturationMult, synergyFor } from './territory';
import { rawRacketIncome } from './economy';
import { equippedItems, kitApproachBias, kitSkillBoost } from './items';
export { confrontations, activeConfrontation, confrontOptions, confrontChance, backupCrew, CONFRONT_AS } from './combat';
export { cards, liveCards, cardById, cardValue, runOdds, dumpValue, tapped, daysTapped, tapRisk, secrets, secretsAbout, unsoldSecrets, dirtPrice, scrubPower, cyberHeat } from './cyber';
/** Rackets a faction has marked: the ones 'Dig In' answers. */
export function threatenedRackets(w: World) {
  return w.player.racketIds.map(id => w.rackets[id]).filter(r => r && (r.threatened ?? 0) >= w.day);
}
import { connectionsOf } from './connections';
export { seatReason, members as commissionMembers } from './commission';
export { protectRoute, protectReason, PROTECT_TRUST, PROTECT_FAVOUR_RATE } from './economy';
export { fixerRate, fixerDailyCap, fixerUsedToday, fixerCapToday, fixerCapLeft, fixersKnown } from './economy';
export { knownRecipes, recipesForKind, restockCost, qualityOf, sellMult, shortageActive, saturationActive, productionQuality } from './production';
import { distanceM } from '@geo/project';
import { STEP_M } from './populate';
import { PLAYER, type Block, type Business, type Racket, type Faction, type FactionId, type Id, type Npc, type OpKind, type RacketKind, type Stance, type World } from './types';

export { controller, stanceFor };

export function blockController(w: World, blockId: Id): FactionId | undefined { return controller(w.blocks[blockId]); }
export function factionColor(w: World, f?: FactionId): string {
  if (!f) return '#666a70';
  if (f === PLAYER) return '#f2c94c';
  if (w.crews[f]) return CREW_COLOR;
  return w.factions[f]?.color ?? '#666a70';
}
export function factionName(w: World, f?: FactionId): string {
  if (!f) return 'Unclaimed'; if (f === PLAYER) return w.player.name; if (w.crews[f]) return `The ${w.crews[f].name}`; return w.factions[f]?.name ?? '?';
}
export function businessesIn(w: World, blockId: Id): Business[] { return w.blocks[blockId].businessIds.map(id => w.businesses[id]); }
export function patronsOf(w: World, biz: Business): Npc[] { return biz.patronIds.map(id => w.npcs[id]).filter(n => n.alive); }
export function crew(w: World): Npc[] { return w.player.crewIds.map(id => w.npcs[id]); }
export function idleCrew(w: World): Npc[] { return crew(w).filter(n => n.crew?.status === 'idle'); }
export function playerBlocks(w: World): Block[] { return Object.values(w.blocks).filter(b => controller(b) === PLAYER); }
export function blocksOf(w: World, f: FactionId): Block[] { return Object.values(w.blocks).filter(b => controller(b) === f); }
export function officials(w: World): Npc[] { return Object.values(w.npcs).filter(n => n.official); }
export function stanceWithPlayer(w: World, f: FactionId): Stance { return w.factions[f].stance[PLAYER] ?? 'peace'; }
export function racketsAt(w: World, biz: Business) { return biz.racketIds.map(id => w.rackets[id]); }
export function availableRackets(w: World, biz: Business): RacketKind[] {
  const present = new Set(racketsAt(w, biz).map(r => r.kind));
  return BUSINESS_DEFS[biz.type].rackets.filter(k => !present.has(k) && !(k === 'protection' && biz.ownedBy === 'player'));
}
export function opTargets(w: World, kind: OpKind): Business[] {
  const d = OP_DEFS[kind];
  if (d.target !== 'business') return [];
  return Object.values(w.businesses).filter(b => {
    if (d.ownBusiness) return b.ownedBy === 'player';
    if (d.targetTypes) return d.targetTypes.includes(b.type) && b.ownedBy !== 'player';
    if (kind === 'raid_rival') return b.racketIds.some(r => w.rackets[r].owner !== PLAYER) || (b.protection && b.protection.factionId !== PLAYER);
    return b.ownedBy !== 'player' && !['bank', 'armored_depot'].includes(b.type);
  });
}
export function crewSkillSum(w: World, ids: Id[]): Record<string, number> {
  const s: Record<string, number> = { muscle: 0, brains: 0, charm: 0, wheels: 0, tech: 0 };
  for (const id of ids) { const n = w.npcs[id]; if (!n) continue; for (const k of Object.keys(s)) s[k] += n.skills[k as keyof typeof n.skills]; }
  return s;
}
export interface OpTarget { businessId?: Id; npcId?: Id; caseId?: Id }
/** Old call sites pass a business id; newer ops need a person or a file, so both are accepted. */
function asTarget(t?: Id | OpTarget): OpTarget { return typeof t === 'string' ? { businessId: t } : (t ?? {}); }

export function opChance(w: World, kind: OpKind, crewIds: Id[], approach?: OpApproach, target?: Id | OpTarget): number {
  const d = OP_DEFS[kind]; const s = crewSkillSum(w, crewIds); const ap = approach ? OP_APPROACHES[approach] : undefined;
  const tgt = asTarget(target); const targetBusinessId = tgt.businessId;
  // On a job you can do alone, you are one of the hands. Without this a minCrew-0 op with no crew
  // on it has a skill sum of zero and floors at 3% — the tree says "solo ok" and the game says no.
  // It matters most on the wire, where the skill the job wants (tech) is the player's own and
  // hiring somebody with tech 11 is a long way past where these ops sit in the tree. Jobs that
  // *require* crew are untouched on purpose: their balance is the crew you bring, not you.
  if (d.minCrew === 0) for (const k of Object.keys(s)) s[k] += w.player.skills[k as keyof typeof w.player.skills];
  // what the player is carrying counts: kit adds to the crew's hands, and it pulls an
  // approach's weights up or down — a sawn-off makes a loud job better and a quiet one worse
  for (const [k, v] of Object.entries(kitSkillBoost(w))) s[k] = (s[k] ?? 0) + (v ?? 0);
  const bias = 1 + kitApproachBias(w, approach);
  let ratio = 0, n = 0;
  for (const [k, need] of Object.entries(d.needs)) { const wgt = (ap?.skillWeight[k as keyof typeof ap.skillWeight] ?? 1) * bias; ratio += Math.min(1.3, (s[k] * wgt) / (need || 1)); n++; }
  ratio = n ? ratio / n : 1;
  // a place you have walked in the last few days is a place you know the back of
  const cased = targetBusinessId && (w.businesses[targetBusinessId]?.casedUntil ?? 0) >= w.day ? CASE_JOINT.difficulty : 0;
  // Work aimed at the law is harder the harder the law is already looking, and harder again on
  // ground they are standing on — the same way every other op reads its target's state.
  const authority = d.target === 'case' || d.requires?.officialTarget || d.requires?.jailedTarget
    ? authorityDifficulty(w, tgt) : 0;
  const base = 50 + (ratio - 1) * 70 - (d.difficulty + (ap?.difficulty ?? 0) + cased + authority - 50) * 0.6 - w.player.heat * 0.15;
  return Math.max(3, Math.min(97, Math.round(base)));
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
  if (n.role === 'owner') return Object.values(w.businesses).find(b => b.ownerId === n.id);
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
