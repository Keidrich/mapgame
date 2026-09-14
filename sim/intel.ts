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
import { INTEL, ROUTE, SKIM, type IntelKind } from '@content/intel';
import { cyberHeat } from './cyber';
import type { Rng } from './rng';
import { PLAYER, type Business, type Id, type Npc, type World } from './types';
import { adjustRel, clamp, log, money } from './util';

/** Where this person works, if it is one of the two buildings that carry intel. */
export function intelSourceFor(w: World, n: Npc): { biz: Business; kind: IntelKind } | undefined {
  const places = [...n.favouriteBusinessIds, ...Object.values(w.businesses).filter(b => b.ownerId === n.id).map(b => b.id)];
  for (const id of new Set(places)) {
    const biz = w.businesses[id]; if (!biz) continue;
    if (biz.type === 'bank') return { biz, kind: 'skim' };
    if (biz.type === 'armored_depot') return { biz, kind: 'route' };
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
  log(w, `${def.icon} ${n.name} works at ${src.biz.name}, and now you know what they know. ${def.blurb}`, 'good', { npcId: n.id, businessId: src.biz.id });
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
  adjustRel(n, { trust: SKIM.trustHit, fear: 10 });
  n.notes.push('Was caught moving money that was not theirs.');
  log(w, `An auditor at ${where ?? 'the bank'} pulled a thread and ${n.name} was on the end of it. That money has stopped, and they know exactly whose idea it was.`, 'bad', { npcId: n.id });
}

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
