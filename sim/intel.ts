/**
 * The bank and the armoured depot, before you rob them.
 *
 * Both were pure heist targets: no income, no value, no rackets, nothing to do with them on any
 * other day. Rather than bolt an implausible racket onto a bank (nobody shakes down a teller for
 * protection money), they pay out through the wire — get inside somebody who works there and
 * what you learn is the thing worth having.
 *
 * It reuses the per-target unlock the wire already had: `Npc.ratted` is set by either mode of
 * `rat`, exactly as wire fraud reads it. No new gating mechanism.
 */
import { CONSIGN, INTEL, OFFSHORE, ROUTE, SKIM, TRADE, type IntelKind } from '@content/intel';
import { openCase } from './cases';
import { cyberHeat } from './cyber';
import type { Rng } from './rng';
import { PLAYER, type Business, type Id, type Npc, type World } from './types';
import { adjustRel, clamp, log, money } from './util';

/** Where this person works, if it is one of the two buildings that carry intel. */
export function intelSourceFor(w: World, n: Npc): { biz: Business; kind: IntelKind } | undefined {
  const places = [...n.favouriteBusinessIds, ...Object.values(w.businesses).filter(b => b.ownerId === n.id && !b.shut).map(b => b.id)];
  for (const id of new Set(places)) {
    const biz = w.businesses[id]; if (!biz) continue;
    // `INTEL[kind].from` is the whole mapping now. It was two hand-written branches, which meant
    // adding an institution meant remembering to come back here; it does not any more.
    const kind = (Object.keys(INTEL) as IntelKind[]).find(k => INTEL[k].from === biz.type);
    if (kind) return { biz, kind };
  }
  return undefined;
}

/** Everybody you have been inside of who works somewhere worth knowing about. */
export function intelCandidates(w: World): { npc: Npc; biz: Business; kind: IntelKind }[] {
  return Object.values(w.npcs)
    .filter(n => n.alive && !n.crew && n.ratted && !n.intel)
    .map(n => { const src = intelSourceFor(w, n); return src ? { npc: n, ...src } : undefined; })
    .filter(Boolean) as { npc: Npc; biz: Business; kind: IntelKind }[];
}

/** Open one. Called when a rat or a tap lands on somebody who works at a bank or a depot. */
export function openIntel(w: World, n: Npc, rng: Rng): IntelKind | undefined {
  if (n.intel) return undefined;
  const src = intelSourceFor(w, n); if (!src) return undefined;
  n.intel = { kind: src.kind, since: w.day, businessId: src.biz.id };
  n.ratted = w.day;
  const def = INTEL[src.kind];
  log(w, `${n.name} works at ${src.biz.name}, and now you know what they know. ${def.blurb}`, 'good', { npcId: n.id, businessId: src.biz.id });
  void rng;
  return src.kind;
}

// ---------------------------------------------------------------- the skim
export function skimmers(w: World): Npc[] { return Object.values(w.npcs).filter(n => n.alive && n.intel?.kind === 'skim'); }
export function daysRunning(w: World, n: Npc): number { return n.intel ? w.day - n.intel.since : 0; }

/** What a day's skim is worth: small, steady, and better the more you know about systems. */
export function skimTake(w: World, n: Npc): number {
  if (n.intel?.kind !== 'skim') return 0;
  const tech = w.player.skills.tech;
  const nerve = 1 - Math.min(0.4, n.nerve / 250);   // a steady person moves more without flinching
  return Math.max(0, Math.round((SKIM.base + tech * SKIM.perTech) * nerve));
}
/** The chance today is the day an auditor notices. Compounds, the way a tap's discovery does. */
export function skimRisk(w: World, n: Npc): number {
  if (n.intel?.kind !== 'skim') return 0;
  return Math.max(0, SKIM.baseRisk * (1 + daysRunning(w, n) * SKIM.dayRisk));
}

/** Close one, however it ended. */
export function endIntel(w: World, n: Npc, caught: boolean) {
  const kind = n.intel?.kind;
  const where = n.intel ? w.businesses[n.intel.businessId]?.name : undefined;
  n.intel = undefined;
  if (!kind) return;
  if (!caught) { log(w, `What you had inside ${where ?? 'there'} is no good any more. Rotas change.`, 'info', { npcId: n.id }); return; }
  adjustRel(w, n, { trust: SKIM.trustHit, fear: 10 }, 'backed');
  n.notes.push('Was caught moving money that was not theirs.');
  log(w, `An auditor at ${where ?? 'the bank'} pulled a thread and ${n.name} was on the end of it. That money has stopped, and they know exactly whose idea it was.`, 'bad', { npcId: n.id });
}

// ---------------------------------------------------------------- the consignment window
export function consigners(w: World): Npc[] { return Object.values(w.npcs).filter(n => n.alive && n.intel?.kind === 'consign'); }

/** Hot goods a day, before somewhere to sell them. Charm, because this is a room of polite people. */
export function consignTake(w: World, n: Npc): number {
  if (n.intel?.kind !== 'consign') return 0;
  return Math.max(0, Math.round(CONSIGN.base + w.player.skills.charm * CONSIGN.perCharm));
}
export function consignRisk(w: World, n: Npc): number {
  if (n.intel?.kind !== 'consign') return 0;
  return Math.max(0, CONSIGN.baseRisk * (1 + daysRunning(w, n) * CONSIGN.dayRisk));
}

// ---------------------------------------------------------------- offshore accounts
export function offshoreHolders(w: World): Npc[] { return Object.values(w.npcs).filter(n => n.alive && n.intel?.kind === 'offshore'); }

/**
 * How much a day, which is a great deal more than anything you could build yourself. The trade is
 * not the rate — though the rate is worse — it is the receipt: see `offshorePaper`.
 */
export function offshoreCapacity(w: World, n: Npc): number {
  if (n.intel?.kind !== 'offshore') return 0;
  return Math.max(0, Math.round(OFFSHORE.capacity + w.player.skills.brains * OFFSHORE.perBrains));
}
/** The trail so far. Grows with time and with volume, because both are how these things are found. */
export function offshorePaper(n: Npc): number { return n.intel?.paper ?? 0; }

// ---------------------------------------------------------------- the route
export function routeHolders(w: World): Npc[] { return Object.values(w.npcs).filter(n => n.alive && n.intel?.kind === 'route'); }

/** A current route tip for this depot, if you have one. */
export function routeFor(w: World, businessId?: Id): Npc | undefined {
  if (!businessId) return undefined;
  return routeHolders(w).find(n => n.intel!.businessId === businessId);
}
/** Any current route at all — the ops planner reads this before a target is chosen. */
export function anyRoute(w: World): Npc | undefined { return routeHolders(w)[0]; }

/**
 * What a live route takes off an armoured-car job. Read by `opChance` through the same
 * `casedUntil`-style discount casing already uses, so nothing new gates it.
 */
export function routeDiscount(w: World, businessId?: Id): number {
  const holder = businessId ? routeFor(w, businessId) : anyRoute(w);
  return holder ? ROUTE.difficulty : 0;
}

// ---------------------------------------------------------------- the trade lane
export function laneHolders(w: World): Npc[] { return Object.values(w.npcs).filter(n => n.alive && n.intel?.kind === 'trade'); }
export function anyLane(w: World): Npc | undefined { return laneHolders(w)[0]; }

/**
 * What a live lane takes off the jobs that move goods across the city. Exactly the depot route's
 * shape, pointed at a list of ops instead of one — `TRADE.helps` is content, so which jobs a lane
 * is worth something on is a data question rather than a condition buried in `opChance`.
 */
export function laneDiscount(w: World, kind: string): number {
  return (TRADE.helps as readonly string[]).includes(kind) && anyLane(w) ? TRADE.difficulty : 0;
}

// ---------------------------------------------------------------- the daily pass
export function tickIntel(w: World, rng: Rng) {
  for (const n of Object.values(w.npcs)) {
    const it = n.intel; if (!it || !n.alive) continue;
    const def = INTEL[it.kind];
    if (w.day - it.since > def.lifetime) { endIntel(w, n, false); continue; }

    if (it.kind === 'skim') {
      if (rng.chance(skimRisk(w, n))) { endIntel(w, n, true); continue; }
      const take = skimTake(w, n);
      if (take > 0) { w.player.dirty += take; cyberHeat(w, SKIM.heat, n.homeBlockId); }
      if (w.day % 7 === 0 && take > 0) log(w, `A week of quiet withdrawals out of ${w.businesses[it.businessId]?.name ?? 'the bank'}: ${money(take * 7)}. Nobody has asked a question yet.`, 'money', { npcId: n.id });
    } else if (it.kind === 'consign') {
      if (rng.chance(consignRisk(w, n))) { endIntel(w, n, true); continue; }
      const take = consignTake(w, n);
      if (take > 0) { w.player.stash.hot_goods += take; cyberHeat(w, CONSIGN.heat, n.homeBlockId); }
      if (w.day % 7 === 0 && take > 0) log(w, `Another season's hanging at ${w.businesses[it.businessId]?.name ?? 'the gallery'}, and a few more pieces left with your paperwork on them.`, 'money', { npcId: n.id });
    } else if (it.kind === 'offshore') {
      tickOffshore(w, n, rng);
    } else if (it.kind === 'trade') {
      if (rng.chance(TRADE.staleChance)) endIntel(w, n, false);
    } else if (rng.chance(ROUTE.staleChance)) {
      endIntel(w, n, false);
    }
  }
}

/** For the NPC sheet and the ops planner. */
export function intelReading(w: World, n: Npc): { kind: IntelKind; days: number; left: number; take?: number; risk?: number } | undefined {
  if (!n.intel) return undefined;
  const def = INTEL[n.intel.kind];
  return {
    kind: n.intel.kind,
    days: daysRunning(w, n),
    left: Math.max(0, def.lifetime - daysRunning(w, n)),
    take: n.intel.kind === 'skim' ? skimTake(w, n) : undefined,
    risk: n.intel.kind === 'skim' ? skimRisk(w, n) : undefined,
  };
}
export { INTEL, PLAYER, clamp };


/**
 * A day of offshore accounts.
 *
 * The washing is the easy half: capacity far beyond any laundry the player could build, at a worse
 * rate because somebody else is taking a cut. The paper is the point. Every day it runs and every
 * thousand it moves adds to a trail, and past `OFFSHORE.filesAt` that trail can surface as an
 * ordinary `CaseFile` — the same files a hit or a bank job opens, with the same evidence clock and
 * the same three ways to kill one. It is not a new liability system; it is a new way into the one
 * the game already has.
 */
export function tickOffshore(w: World, n: Npc, rng: Rng): void {
  const it = n.intel!; const p = w.player;
  const cap = Math.max(0, offshoreCapacity(w, n) - p.launderedToday);
  const amount = Math.min(p.dirty, cap);
  if (amount > 0) {
    p.dirty -= amount;
    p.cash += Math.round(amount * OFFSHORE.rate);
    p.launderedToday += amount;
    cyberHeat(w, OFFSHORE.heat, n.homeBlockId);
  }
  it.paper = (it.paper ?? 0) + OFFSHORE.paperPerDay + (amount / 1000) * OFFSHORE.paperPerThousand;
  if (w.day % 7 === 0 && amount > 0) {
    log(w, `${money(Math.round(amount * OFFSHORE.rate))} came back clean through ${w.businesses[it.businessId]?.name ?? 'the office'} this week. All of it is written down somewhere.`, 'money', { npcId: n.id });
  }
  if (it.paper >= OFFSHORE.filesAt && rng.chance(OFFSHORE.surfaceChance)) {
    const biz = w.businesses[it.businessId];
    openCase(w, 'fraud', `${biz?.name ?? 'An accountant'}: the accounts`, { npcId: n.id, businessId: it.businessId, blockId: n.homeBlockId }, [], rng, OFFSHORE.startEvidence);
    log(w, `Somebody has been through ${biz?.name ?? 'the office'}'s filings line by line. There is a file open now, and your money is all over it.`, 'bad', { npcId: n.id, businessId: it.businessId });
    endIntel(w, n, true);
  }
}
