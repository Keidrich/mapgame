/**
 * What the bot does with a day.
 *
 * Split out of `headless.ts` so the scripted player is a thing that can be tested and extended
 * rather than one long loop. The ordering matters and is roughly a real player's: answer
 * whatever is in your face, keep the empire running, then go and do something.
 *
 * The second half of this file is everything the bot could not previously reach — planning and
 * launching real ops, answering mid-job complications, working the law, working the wire. Those
 * paths mostly need an admin scenario to be reachable at all (see `admin.ts`); the honest
 * scenario will still spend most of its days shaking down bars, which is correct.
 */
import { PLAYER, can, dispatch, select, type Action, type Id, type OpKind, type ProductKind, type World } from '@sim/index';
import { OP_DEFS, RACKET_DEFS } from '@content/rackets';
import type { Rng } from '@sim/rng';
import { bump, bumpComplication, bumpOp, warn, type Coverage } from './coverage';

export interface Ctx { w: World; rng: Rng; cov: Coverage; crewCap: number }

export const tryAct = (c: Ctx, a: Action): boolean => {
  const gate = can(c.w, a);
  if (!gate.ok) return false;
  c.w = dispatch(c.w, a);
  return true;
};
const at = (c: Ctx, blockId?: Id) => !!blockId && c.w.player.currentBlockId === blockId;
export const goTo = (c: Ctx, blockId?: Id) => {
  if (!blockId) return false;
  if (at(c, blockId)) return true;
  const moved = tryAct(c, { type: 'move', toBlockId: blockId });
  if (moved) bump(c.cov, 'moves');
  return moved;
};
const npcBlock = (c: Ctx, id: Id) => c.w.npcs[id]?.homeBlockId;
const nearBiz = (c: Ctx) => Object.values(c.w.blocks).filter(b => select.distanceFromStart(c.w, b.id) <= 2).flatMap(b => select.businessesIn(c.w, b.id));

// ---------------------------------------------------------------- things in your face
/** Anything waiting for an answer, answered on best odds. Covers doorstep fights and mid-job complications alike. */
export function answerEverything(c: Ctx) {
  let guard = 0;
  while (select.activeConfrontation(c.w) && guard++ < 40) {
    const x = select.activeConfrontation(c.w)!;
    const best = select.confrontOptions(c.w, x).filter(o => !o.disabled).sort((a, b) => b.chance - a.chance)[0];
    if (!best) { warn(c.cov, 'a confrontation had no answerable option'); break; }
    const gate = can(c.w, { type: 'resolve_confrontation', id: x.id, approach: best.id });
    if (!gate.ok) {
      // refused rather than answered: counting it as exercised would be a lie, and looping on it
      // would inflate the numbers. This is how the pending-event soft-lock was found.
      warn(c.cov, `could not answer a confrontation: ${gate.reason}`);
      break;
    }
    const isComplication = x.kind === 'op';
    if (isComplication) { bump(c.cov, 'complications'); if (x.complication) bumpComplication(c.cov, x.complication); }
    else bump(c.cov, 'confrontations');
    c.w = dispatch(c.w, { type: 'resolve_confrontation', id: x.id, approach: best.id });
    if (isComplication) bump(c.cov, 'complications_answered');
    if (select.activeConfrontation(c.w)?.id === x.id) { warn(c.cov, 'a confrontation survived being answered'); break; }
  }
  if (guard >= 40) warn(c.cov, 'confrontations did not drain — possible loop');
}

export function resolveEvents(c: Ctx) {
  let guard = 0;
  while (c.w.pendingEvents.length && guard++ < 20) {
    const e = c.w.pendingEvents[0];
    const opts = e.options.filter(o => can(c.w, { type: 'resolve_event', eventId: e.id, optionId: o.id }).ok);
    const o = opts.length ? c.rng.pick(opts) : e.options[e.options.length - 1];
    c.w = dispatch(c.w, { type: 'resolve_event', eventId: e.id, optionId: o.id });
  }
}

// ---------------------------------------------------------------- ops
/** Whatever target this op wants, picked greedily. Undefined when nothing valid exists. */
function pickTarget(c: Ctx, kind: OpKind): Partial<Action & { type: 'plan_op' }> | undefined {
  const w = c.w; const def = OP_DEFS[kind];
  switch (def.target) {
    case 'none': return {};
    case 'business': {
      const pool = select.opTargets(w, kind);
      const best = pool.find(b => !select.opLocked(w, kind, { businessId: b.id })) ?? pool[0];
      return best ? { targetBusinessId: best.id } : undefined;
    }
    case 'npc': {
      const people = Object.values(w.npcs).filter(n => n.alive && !select.opLocked(w, kind, { npcId: n.id }));
      // prefer somebody who is not one of your own, unless the op is about your own
      const pick = people.find(n => def.requires?.jailedTarget ? n.crew?.status === 'jailed' : !n.crew) ?? people[0];
      return pick ? { targetNpcId: pick.id } : undefined;
    }
    case 'faction': {
      const f = select.factionsAt(w, ['war', 'beef'])[0] ?? Object.values(w.factions).find(x => x.alive);
      return f ? { targetFactionId: f.id } : undefined;
    }
    case 'block': {
      const b = kind === 'claim_abandoned' ? select.abandonedBlocks(w, { known: true, unclaimed: true })[0] : Object.values(w.blocks).find(x => select.blockController(w, x.id) !== PLAYER);
      return b ? { targetBlockId: b.id } : undefined;
    }
    case 'district': { const d = Object.values(w.districts)[0]; return d ? { targetDistrictId: d.id } : undefined; }
    case 'case': { const f = select.openCases(w)[0]; return f ? { targetCaseId: f.id } : undefined; }
  }
}

/**
 * Plan the most interesting op currently available. "Interesting" is deliberately biased toward
 * the top of the tree and toward kinds this run has not exercised yet — a soak that runs its
 * fortieth stick-up has told you nothing new.
 */
export function planAnOp(c: Ctx): boolean {
  const w = c.w;
  const open = select.opsAvailable(w).filter(k => {
    const def = OP_DEFS[k];
    if (w.player.crewIds.filter(id => w.npcs[id]?.crew?.status === 'idle').length < def.minCrew) return false;
    return true;
  });
  if (!open.length) return false;
  const ranked = open.slice().sort((a, b) => {
    const fresh = (c.cov.opKinds[a] ?? 0) - (c.cov.opKinds[b] ?? 0);
    if (fresh !== 0) return fresh;                                  // things never tried first
    return (OP_DEFS[b].tier ?? 0) - (OP_DEFS[a].tier ?? 0);         // then the biggest job going
  });
  for (const kind of ranked) {
    const def = OP_DEFS[kind];
    const target = pickTarget(c, kind);
    if (!target) continue;
    const idle = select.idleCrew(c.w).slice(0, def.maxCrew).map(n => n.id);
    if (idle.length < def.minCrew) continue;
    const approach = def.target === 'business' ? c.rng.pick(['loud', 'quiet'] as const) : undefined;
    const action: Action = { type: 'plan_op', kind, crewIds: idle, approach, ...target } as Action;
    if (!tryAct(c, action)) continue;
    bump(c.cov, 'ops_planned'); bumpOp(c.cov, kind);
    if ((def.tier ?? 0) >= 2) bump(c.cov, 'tier2_ops');
    if (kind === 'buy_down' || kind === 'spring_crew' || kind === 'buy_case') {
      bump(c.cov, 'law_ops');
      bump(c.cov, kind === 'buy_down' ? 'attention_bought' : kind === 'spring_crew' ? 'sprung' : 'cases_killed');
    }
    return true;
  }
  return false;
}

/** Launch anything ready. */
export function launchOps(c: Ctx) {
  for (const o of Object.values(c.w.ops)) {
    if (o.status === 'ready' && !o.launched) tryAct(c, { type: 'launch_op', opId: o.id });
  }
}

// ---------------------------------------------------------------- the wire
export function workTheWire(c: Ctx) {
  const w = c.w;
  const cards = select.liveCards(w);
  if (cards.length) {
    // dump through a carding racket when there is one and the pile is stale, otherwise run them
    const dumpTo = select.playerRacketsOfKind(w, 'carding')[0];
    const stale = cards.filter(x => x.freshness < 45).length > cards.length / 2;
    if (dumpTo && (stale || w.player.heat > 70)) {
      if (tryAct(c, { type: 'dump_cards', racketId: dumpTo.id })) bump(c.cov, 'cards_dumped');
    } else {
      for (const card of cards.slice(0, 3)) {
        const odds = select.runOdds(w, card, 'small');
        const mode = card.freshness > 70 && odds.dead < 0.3 ? 'small' : 'big';
        if (tryAct(c, { type: 'run_card', cardId: card.id, mode })) bump(c.cov, 'cards_run');
      }
    }
  }
  // sell what you know to whoever will buy it
  for (const s of select.unsoldSecrets(c.w)) {
    const subject = c.w.npcs[s.npcId];
    const buyer = Object.values(c.w.factions).find(f => f.alive && f.id !== subject?.faction && select.stanceWithPlayer(c.w, f.id) !== 'war');
    if (buyer && tryAct(c, { type: 'sell_dirt', secretId: s.id, factionId: buyer.id })) bump(c.cov, 'secrets_sold');
  }
  // pull a tap before it is found, and clean up after yourself
  for (const n of Object.values(c.w.npcs)) {
    if (!n.tap) continue;
    bump(c.cov, 'taps');
    if (select.tapRisk(c.w, n) > 0.25) tryAct(c, { type: 'pull_tap', npcId: n.id });
  }
  if ((c.w.player.cyberHeat ?? 0) > 12 && tryAct(c, { type: 'scrub_trail' })) bump(c.cov, 'scrubs');
}

// ---------------------------------------------------------------- the empire
/**
 * Promote somebody to run a district. Early in the day, like the original bot did it — the
 * ordering of this whole file is load-bearing for the honest scenario's economy curve, which is
 * the only number in the soak comparable with earlier passes. Moving a step changes the RNG
 * stream and the curve with it, for no gameplay reason.
 */
export function promoteLieutenants(c: Ctx) {
  for (const d of select.districtsRunnable(c.w)) {
    if (select.lieutenantOf(c.w, d.id)) continue;
    const pool = select.crew(c.w).filter(n => n.crew?.status === 'idle' || n.crew?.assignment?.kind === 'racket');
    const pick = pool.find(n => !select.promoteReason(c.w, n, d.id));
    if (pick) tryAct(c, { type: 'assign', npcId: pick.id, assignment: { kind: 'lieutenant', districtId: d.id } });
  }
}

export function runTheEmpire(c: Ctx, startBlockId: Id) {
  if (!c.w.player.safehouseIds.length) tryAct(c, { type: 'rent_safehouse', blockId: startBlockId });

  // crew: a foreman first, then rackets, then the wire once there is a pile worth working.
  // Ordering matters and it was wrong once: with rackets first, forty-odd unmanned rackets
  // always won and no foreman was ever posted in a sixty-day run. A production nobody runs
  // wastes ingredients every single day and drifts onto the wrong recipe; one more racket
  // runner is worth a few hundred. There is normally one production, so this costs one body.
  for (const n of select.idleCrew(c.w)) {
    const orphan = unmannedProduction(c);
    if (orphan && tryAct(c, { type: 'assign', npcId: n.id, assignment: { kind: 'foreman', productionId: orphan } })) { bump(c.cov, 'foremen'); continue; }
    const r = c.w.player.racketIds.map(id => c.w.rackets[id]).find(x => x && !x.runnerId);
    if (r) { tryAct(c, { type: 'assign', npcId: n.id, assignment: { kind: 'racket', racketId: r.id } }); continue; }
    if (select.liveCards(c.w).length >= 3) tryAct(c, { type: 'assign', npcId: n.id, assignment: { kind: 'hack' } });
  }
  setStandingOrders(c);
  for (const sid of c.w.player.safehouseIds) {
    const sh = c.w.safehouses[sid]; if (!sh) continue;
    if (!sh.productionIds.length && c.w.player.cash > 5000) tryAct(c, { type: 'start_production', safehouseId: sid, kind: 'still' });
    for (const pid of sh.productionIds) {
      const pr = c.w.productions[pid]; if (!pr) continue;
      if (pr.stock < 2) tryAct(c, { type: 'restock_production', productionId: pid, days: 7 });
      // a foreman is strictly better than a plain worker, so only fall back to one if nobody
      // could take the job — which is also how a player would do it
      if (!pr.workerId && !select.foremanOf(c.w, pid)) { const free = select.idleCrew(c.w)[0]; if (free) tryAct(c, { type: 'assign', npcId: free.id, assignment: { kind: 'production', productionId: pid } }); }
      if (pr.level < 3 && c.w.player.cash > 15000) tryAct(c, { type: 'upgrade_production', productionId: pid });
      const known = select.recipesForKind(c.w, pr.kind); if (known.length && !pr.recipe) tryAct(c, { type: 'set_recipe', productionId: pid, recipe: known[0] });
    }
    if (sh.stash.booze > 0) tryAct(c, { type: 'move_stash', from: sid, to: 'player', product: 'booze', amount: sh.stash.booze });
  }
  if (c.w.player.stash.booze > 10 && !c.w.player.racketIds.some(id => c.w.rackets[id]?.kind === 'dealing')) {
    const spot = nearBiz(c).find(b => b.protection?.factionId === PLAYER && can(c.w, { type: 'start_racket', businessId: b.id, kind: 'dealing', product: 'booze' }).ok);
    if (spot && tryAct(c, { type: 'start_racket', businessId: spot.id, kind: 'dealing', product: 'booze' })) bump(c.cov, 'rackets_started');
  }
}

/**
 * Money, last thing before bed — after the street work that earned it. Running this earlier
 * washes an empty pocket and leaves the day's takings dirty, which is what it did for one
 * confusing run while this was being written.
 */
export function handleMoney(c: Ctx) {
  if (c.w.player.dirty > 500 && tryAct(c, { type: 'launder', amount: c.w.player.dirty })) bump(c.cov, 'launders');
  if (c.w.player.dirty > 0 && !c.w.player.racketIds.some(id => c.w.rackets[id]?.kind === 'laundering')) {
    const fx = select.fixersKnown(c.w)[0];
    const room = fx ? select.fixerCapLeft(c.w, fx) : 0;
    if (fx && room > 0 && goTo(c, npcBlock(c, fx.id))) {
      if (tryAct(c, { type: 'launder_with_fixer', npcId: fx.id, amount: Math.min(c.w.player.dirty, room) })) bump(c.cov, 'fixer_launders');
    }
  }
  if (c.w.player.cash > 8000 && !c.w.player.lawyer) tryAct(c, { type: 'hire_lawyer' });
}

export function buyKit(c: Ctx) {
  const w = c.w;
  if (w.player.cash > 800 && (w.player.equipped ?? []).length < select.EQUIP_MAX) {
    const shop = Object.values(w.businesses).filter(b => select.isMarket(b) && (select.travelCost(w, b.blockId) ?? 9) <= 1)[0];
    const want = shop && select.marketStock(shop).filter(i => !(w.player.items ?? []).includes(i.id)).sort((a, b) => b.cost - a.cost).find(i => i.cost < w.player.cash * 0.7);
    if (shop && want && goTo(c, shop.blockId) && tryAct(c, { type: 'buy_item', businessId: shop.id, itemId: want.id })) bump(c.cov, 'items_bought');
  }
  for (const item of select.ownedItems(c.w)) {
    if (select.equipSlotsLeft(c.w) > 0 && !select.isEquipped(c.w, item.id)) tryAct(c, { type: 'equip', itemId: item.id, on: true });
  }
}

/** The street: recruit, lie low, add rackets, expand, buy in. Roughly what it always did. */
export function workTheStreet(c: Ctx) {
  let guard = 0;
  while (c.w.player.ap > 0 && guard++ < 30) {
    const w = c.w; const p = w.player; const biz = nearBiz(c);
    const mine = biz.filter(b => b.protection?.factionId === PLAYER || b.ownedBy === 'player');
    const soft = biz.filter(b => !b.protection && b.ownedBy === 'npc');

    const willing = biz.flatMap(b => b.patronIds).find(id => { const r = can(w, { type: 'recruit', npcId: id }); return r.ok || (!r.ok && /Walk over first/.test(r.reason)); });
    if (willing && select.crew(w).length < c.crewCap && goTo(c, npcBlock(c, willing))) {
      if (tryAct(c, { type: 'recruit', npcId: willing })) bump(c.cov, 'crew_hired');
      continue;
    }
    if (p.heat > 45) {
      const captain = select.officials(w).find(o => o.official!.kind === 'captain');
      if (captain && p.cash > 2500) tryAct(c, { type: 'bribe_official', npcId: captain.id, amount: 1000 });
      const n = c.rng.pick(biz.flatMap(b => [b.ownerId, ...b.patronIds]));
      if (goTo(c, npcBlock(c, n))) tryAct(c, { type: 'visit', npcId: n });
      continue;
    }
    // Which racket to put where is a real decision now: saturation decays the fifth of a kind in
    // a district and synergy pays kinds that feed each other. `racketsByOutlook` is the same
    // ranking the block sheet shows a player, so the bot picks the way a reader of that panel
    // would — best actual yield first, not a fixed favourite list.
    // …but only among kinds it can actually pay for. Ranking on yield alone made the bot keep
    // choosing a policy bank it could not afford and install nothing at all, which halved its
    // racket count on three of six seeds before this filter went in.
    const affordable = (b: typeof mine[number]) => select.racketsByOutlook(w, b).filter(x => RACKET_DEFS[x.kind].setupCost <= p.cash - 200)[0];
    const ranked = mine.map(b => ({ b, best: affordable(b) })).filter(x => x.best).sort((x, y) => y.best.income - x.best.income)[0];
    if (ranked && p.cash > 1500) {
      if (tryAct(c, { type: 'start_racket', businessId: ranked.b.id, kind: ranked.best.kind })) { bump(c.cov, 'rackets_started'); continue; }
    }
    const t = soft.sort((a, b) => (w.npcs[a.ownerId].nerve - w.npcs[a.ownerId].rel.fear) - (w.npcs[b.ownerId].nerve - w.npcs[b.ownerId].rel.fear))[0];
    if (t) {
      if (tryAct(c, { type: 'protect', businessId: t.id, rate: 0.15 })) continue;
      if (goTo(c, t.blockId)) {
        if (tryAct(c, { type: 'shakedown', businessId: t.id })) continue;
        if (tryAct(c, { type: 'threaten', npcId: t.ownerId })) continue;
      }
    }
    const buy = biz.find(b => b.ownedBy === 'npc' && can(w, { type: 'buy_business', businessId: b.id, offer: Math.round(b.value * 0.9) }).ok);
    if (buy && p.cash > buy.value * 1.5) {
      if (tryAct(c, { type: 'buy_business', businessId: buy.id, offer: Math.round(buy.value * 0.9) })) { bump(c.cov, 'businesses_bought'); continue; }
    }
    const n = c.rng.pick(biz.flatMap(b => [b.ownerId, ...b.patronIds]));
    if (goTo(c, npcBlock(c, n))) tryAct(c, { type: 'visit', npcId: n }); else break;
  }
}


/** A production of yours with nobody running it at all. */
function unmannedProduction(c: Ctx): Id | undefined {
  for (const sid of c.w.player.safehouseIds) {
    for (const pid of c.w.safehouses[sid]?.productionIds ?? []) {
      const pr = c.w.productions[pid]; if (!pr) continue;
      if (!select.foremanOf(c.w, pid)) return pid;
    }
  }
  return undefined;
}

/**
 * Point every product racket at stock it can actually reach. Left alone they sit on `block`,
 * which is right when the safehouse is downstairs and useless when it is across town — so widen
 * the rule when nothing on this block can feed it and there is stock elsewhere.
 */
function setStandingOrders(c: Ctx) {
  for (const id of c.w.player.racketIds) {
    const r = c.w.rackets[id]; if (!r) continue;
    const product = PRODUCT_OF[r.kind]?.(r); if (!product) continue;
    const rule = select.supplyRule(r);
    const here = select.supplyReading(c.w, r, product);
    if (here.available > 0) continue;                       // the current rule is already feeding it
    const anywhere = c.w.player.safehouseIds.some(sid => (c.w.safehouses[sid]?.stash[product] ?? 0) > 0);
    const want = anywhere ? 'empire' : 'block';
    if (rule === want) continue;
    if (tryAct(c, { type: 'set_supply', racketId: r.id, rule: want })) bump(c.cov, 'supply_set');
  }
}
const PRODUCT_OF: Partial<Record<string, (r: { product?: ProductKind }) => ProductKind>> = {
  dealing: r => r.product ?? 'green',
  fencing: () => 'hot_goods',
  counterfeiting: () => 'counterfeit',
};

/**
 * Get inside somebody who works at a bank or an armoured depot. Those two buildings do nothing
 * on any other day, and what an employee knows is the entire point of them — so this is worth an
 * op of its own rather than waiting for one to turn up in the deck.
 */
export function workTheBuildings(c: Ctx): boolean {
  // 1. follow through on anything already open: a route is only worth having if a job uses it
  const route = select.anyRoute(c.w);
  if (route) {
    const depot = c.w.businesses[route.intel!.businessId];
    const idle = select.idleCrew(c.w).slice(0, OP_DEFS.heist_armored.maxCrew).map(n => n.id);
    if (depot && idle.length >= OP_DEFS.heist_armored.minCrew && !select.opLocked(c.w, 'heist_armored', { businessId: depot.id })) {
      const already = Object.values(c.w.ops).some(o => o.kind === 'heist_armored' && (o.status === 'planning' || o.status === 'ready'));
      if (!already && tryAct(c, { type: 'plan_op', kind: 'heist_armored', crewIds: idle, approach: 'loud', targetBusinessId: depot.id })) {
        bump(c.cov, 'route_used'); bump(c.cov, 'ops_planned'); bumpOp(c.cov, 'heist_armored');
        bump(c.cov, 'tier2_ops');
        return true;
      }
    }
  }

  // 2. otherwise go and get inside somebody who works at one
  const mark = Object.values(c.w.npcs).find(n => {
    if (!n.alive || n.crew || n.intel) return false;
    const src = select.intelSourceFor(c.w, n);
    return !!src && !select.opLocked(c.w, 'rat', { npcId: n.id });
  });
  if (!mark) return false;
  const idle = select.idleCrew(c.w).slice(0, OP_DEFS.rat.maxCrew).map(n => n.id);
  if (idle.length < OP_DEFS.rat.minCrew) return false;
  if (Object.values(c.w.ops).some(o => o.kind === 'rat' && o.targetNpcId === mark.id && (o.status === 'planning' || o.status === 'ready'))) return false;
  if (!tryAct(c, { type: 'plan_op', kind: 'rat', crewIds: idle, mode: 'read', targetNpcId: mark.id })) return false;
  bump(c.cov, 'ops_planned'); bumpOp(c.cov, 'rat');
  return true;
}

/** Count what the production pack actually did overnight, after End Day. */
export function tallyProduction(c: Ctx) {
  for (const n of Object.values(c.w.npcs)) {
    if (n.intel?.kind === 'skim' && !seenIntel.has(n.id)) { seenIntel.add(n.id); bump(c.cov, 'skims'); bump(c.cov, 'intel_ratted'); }
    if (n.intel?.kind === 'route' && !seenIntel.has(n.id)) { seenIntel.add(n.id); bump(c.cov, 'routes'); bump(c.cov, 'intel_ratted'); }
  }
  for (const sid of c.w.player.safehouseIds) {
    for (const pid of c.w.safehouses[sid]?.productionIds ?? []) {
      const pr = c.w.productions[pid]; if (!pr) continue;
      const was = lastRecipe.get(pid);
      if (select.foremanOf(c.w, pid) && was !== pr.recipe) { lastRecipe.set(pid, pr.recipe); if (was !== undefined) bump(c.cov, 'foreman_switches'); }
      else if (was === undefined) lastRecipe.set(pid, pr.recipe);
    }
  }
  // a delivery is stock that left a safehouse and turned up on the player without a manual move
  for (const id of c.w.player.racketIds) {
    const r = c.w.rackets[id]; if (!r) continue;
    const product = PRODUCT_OF[r.kind]?.(r); if (!product) continue;
    if (select.supplyRule(r) !== 'manual' && r.lastIncome > 0) { bump(c.cov, 'supply_delivered'); break; }
  }
}
const seenIntel = new Set<Id>();
const lastRecipe = new Map<Id, string | undefined>();

/** Count what the night did to you, after End Day. */
export function tallyNight(c: Ctx, before: { busts: number; logLen: number }) {
  if (c.w.player.busts > before.busts) bump(c.cov, 'busts', c.w.player.busts - before.busts);
  for (const l of c.w.log.slice(before.logLen)) if (l.text.startsWith('RAID')) bump(c.cov, 'raids');
  for (const o of Object.values(c.w.ops)) {
    if (o.status === 'done' && !seen.has(o.id)) { seen.add(o.id); bump(c.cov, 'ops_done'); }
    if (o.status === 'failed' && !seen.has(o.id)) { seen.add(o.id); bump(c.cov, 'ops_failed'); }
    if (o.complication?.answered === 'absent' && !absent.has(o.id)) { absent.add(o.id); bump(c.cov, 'complications_absent'); }
  }
}
const seen = new Set<Id>();
const absent = new Set<Id>();
/** Reset the per-run memory, so two runs in one process do not pollute each other. */
export function resetPolicy() { seen.clear(); absent.clear(); seenIntel.clear(); lastRecipe.clear(); }
