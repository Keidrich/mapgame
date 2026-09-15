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
import { PLAYER, can, dispatch, select, type Action, type FactionId, type Id, type OpKind, type ProductKind, type World } from '@sim/index';
import { OP_DEFS } from '@content/rackets';
import { LANDMARKS } from '@content/landmarks';
import type { Rng } from '@sim/rng';
import { bump, bumpComplication, bumpOp, count, warn, type Coverage } from './coverage';

export interface Ctx {
  w: World; rng: Rng; cov: Coverage; crewCap: number;
  /**
   * People kept off racket and production duty so there is somebody to take on a job. Zero for
   * the honest scenario, whose day must not change: it plans no ops, so it has nothing to hold
   * anybody back for. For the rest it is the difference between a soak that runs the roster and
   * one that only ever runs the jobs needing nobody — with a racket of every kind sitting
   * unmanned, the loop below used to assign every last body and `idleCrew` was empty for ever.
   */
  reserve: number;
  /** Cash in hand before the bot will build a production line. See `Scenario.stillAt`. */
  stillAt: number;
  /**
   * Cash in hand before the bot spends anything on the money sinks. High by design: these are
   * what late money is for, and a bot that bought a lifestyle rung out of its first $60,000
   * would be testing the reducer while lying about the economy. `Infinity` switches the whole
   * lane off, which is what every scenario that is not about a fortune gets.
   */
  sinksAt: number;
  /**
   * The bot is trying to get out rather than get on. Changes what a day is for: buy
   * respectability, wash everything, and stop doing the things that put heat on you. It is a
   * flag rather than a scenario check because the day loop should not know scenario names.
   */
  goingStraight: boolean;
}

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
  // A walk writes exactly one line — "You walk from J8 to K7" — and `onTheWay` writes whatever
  // happened on the way after it. So anything past the first line is an encounter, which is a
  // more honest count than matching the text of a table that is meant to keep growing.
  const lines = c.w.log.length;
  const moved = tryAct(c, { type: 'move', toBlockId: blockId });
  if (!moved) return false;
  bump(c.cov, 'moves');
  if (c.w.log.length > lines + 1) bump(c.cov, 'encounters', c.w.log.length - lines - 1);
  return true;
};
const npcBlock = (c: Ctx, id: Id) => c.w.npcs[id]?.homeBlockId;
const nearBiz = (c: Ctx) => Object.values(c.w.blocks).filter(b => select.distanceFromStart(c.w, b.id) <= 2).flatMap(b => select.businessesIn(c.w, b.id));

// ---------------------------------------------------------------- things in your face
/** Anything waiting for an answer, answered on best odds. Covers doorstep fights and mid-job complications alike. */
export function answerEverything(c: Ctx) {
  let guard = 0;
  while (select.activeConfrontation(c.w) && guard++ < 40) {
    const x = select.activeConfrontation(c.w)!;
    // Best odds, except for one of your own asking about a name on a list: there the four answers
    // are a decision rather than a contest, and two of them are flat 100%. Taking the best odds
    // meant the bot called every single job off and three of the four branches never ran once.
    const opts = select.confrontOptions(c.w, x).filter(o => !o.disabled);
    const best = x.kind === 'kin' ? opts[c.rng.int(0, opts.length - 1)] : opts.slice().sort((a, b) => b.chance - a.chance)[0];
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
    // The two personal ones are counted here for the same reason `asset_warnings` is: the queue
    // is drained by the time any tally runs, so a confrontation that came for the player rather
    // than for a racket leaves nothing behind to count. This is where it is seen or nowhere.
    if (x.kind === 'you') bump(c.cov, 'hunted');
    if (x.kind === 'loved') bump(c.cov, 'loved_hit');
    if (x.kind === 'kin') { bump(c.cov, 'kin_raised'); bump(c.cov, 'kin_answered'); }
    // counted here rather than in `tallyPeople`: by the time that runs the queue has been
    // answered and drained, and a warning that was acted on leaves nothing behind to count
    if (x.warned) bump(c.cov, 'asset_warnings');
    if (x.byNpcId) bump(c.cov, 'nemesis_met');
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
      // A job that ends somebody, on a name one of your own people loves, is the whole of the kin
      // scene — and left to pick greedily the bot never once landed on one in sixty days, so that
      // system read ✗ while working perfectly. Prefer such a mark when the city offers one: it is
      // also what a player meets eventually, the bot simply has to be told to look.
      const kin = people.find(n => !n.crew && select.kinOnTheJob(w, kind, n.id));
      // otherwise somebody who is not one of your own, unless the op is about your own
      const pick = kin ?? people.find(n => def.requires?.jailedTarget ? n.crew?.status === 'jailed' : !n.crew) ?? people[0];
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
    // then the one that ties up the fewest people. Preferring the biggest job among the untried
    // meant a five-hander took the whole outfit and every other untried kind that day needed
    // somebody who was already out; a sixty-day sweep left a quarter of the roster unrun.
    const crew = OP_DEFS[a].minCrew - OP_DEFS[b].minCrew;
    if (crew !== 0) return crew;
    return (OP_DEFS[b].tier ?? 0) - (OP_DEFS[a].tier ?? 0);         // and among equals, the biggest
  });
  for (const kind of ranked) {
    const def = OP_DEFS[kind];
    const target = pickTarget(c, kind);
    if (!target) continue;
    // Take what the job actually needs, and only pad it out when there are people spare. Sending
    // `maxCrew` on everything meant two jobs tied up the whole outfit and every day after that
    // could only plan the ops that need nobody — which is why a sixty-day sweep never once ran
    // half the roster. Breadth is the whole point of a soak.
    const free = select.idleCrew(c.w);
    const want = Math.min(def.maxCrew, def.minCrew + (free.length - def.minCrew >= 3 ? 2 : 0));
    const idle = free.slice(0, want).map(n => n.id);
    if (idle.length < def.minCrew) continue;
    const approach = def.target === 'business' ? c.rng.pick(['loud', 'quiet'] as const) : undefined;
    const action: Action = { type: 'plan_op', kind, crewIds: idle, approach, ...target } as Action;
    if (!tryAct(c, action)) continue;
    bump(c.cov, 'ops_planned'); bumpOp(c.cov, kind);
    // Did anything a crew member owns actually go on this job? `jobKit` says what counts, so ask it
    // rather than re-deriving: a gun that loses its category to the player's better one is not
    // coverage of the crew's kit reaching a job, and this is the row that says so.
    if (idle.some(id => (c.w.npcs[id]?.equipped ?? []).length) && select.jobKit(c.w, idle).length) bump(c.cov, 'crew_kit_on_job');
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
    // A production nobody runs bleeds ingredients every day, so the foreman comes before the
    // reserve — a job can wait a day, a still cannot.
    if (orphan && tryAct(c, { type: 'assign', npcId: n.id, assignment: { kind: 'foreman', productionId: orphan } })) { bump(c.cov, 'foremen'); continue; }
    if (select.idleCrew(c.w).length <= c.reserve) break;   // somebody has to be free to take a job
    const r = c.w.player.racketIds.map(id => c.w.rackets[id]).find(x => x && !x.runnerId);
    if (r) { tryAct(c, { type: 'assign', npcId: n.id, assignment: { kind: 'racket', racketId: r.id } }); continue; }
    if (select.liveCards(c.w).length >= 3) tryAct(c, { type: 'assign', npcId: n.id, assignment: { kind: 'hack' } });
  }
  setStandingOrders(c);
  for (const sid of c.w.player.safehouseIds) {
    const sh = c.w.safehouses[sid]; if (!sh) continue;
    if (!sh.productionIds.length && c.w.player.cash > c.stillAt && tryAct(c, { type: 'start_production', safehouseId: sid, kind: 'still' })) bump(c.cov, 'lines_built');
    for (const pid of sh.productionIds) {
      const pr = c.w.productions[pid]; if (!pr) continue;
      if (pr.stock < 2) tryAct(c, { type: 'restock_production', productionId: pid, days: 7 });
      // a foreman is strictly better than a plain worker, so only fall back to one if nobody
      // could take the job — which is also how a player would do it
      if (!pr.workerId && !select.foremanOf(c.w, pid) && select.idleCrew(c.w).length > c.reserve) { const free = select.idleCrew(c.w)[0]; if (free) tryAct(c, { type: 'assign', npcId: free.id, assignment: { kind: 'production', productionId: pid } }); }
      if (select.playerWorks(c.w, pr)) bump(c.cov, 'lines_self_worked');
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
 * Carry it to a corner and sell it yourself.
 *
 * The bot has made booze since the production pack shipped and had no idea how to sell any of
 * it: `sell_product` had never once been called in a soak, so street price, block demand and the
 * quality multiplier were only ever exercised through the racket tick. That is half the opening
 * a player with no crew actually has — make a thing, walk it to a corner, take dirty cash — and
 * it was the half with no coverage at all.
 *
 * One session, on the block the player is standing on, biggest pile first, and only once there
 * is a pile worth the walk. The block caps what it can absorb (`demand × 3`), so this is a
 * trickle by design, not a money printer. A sale also costs the AP an op would have used, which
 * is why it waits for a load rather than going out with a handful.
 *
 * Where it sits in the day is `run.ts`'s call, and it matters: run *last*, with the rest of the
 * empire, it never fired once in a boosted sixteen-day run, because by then a confrontation is
 * usually queued and every action comes back "Deal with what is in front of you first."
 */
const SELL_AT = 15;
export function sellSomethingOnTheStreet(c: Ctx) {
  const here = c.w.player.currentBlockId; if (!here) return;
  const stash = c.w.player.stash;
  const best = (Object.keys(stash) as (keyof typeof stash)[])
    .filter(k => (stash[k] ?? 0) > 0)
    .sort((a, b) => (stash[b] ?? 0) - (stash[a] ?? 0))[0];
  if (!best || (stash[best] ?? 0) < SELL_AT) return;
  if (tryAct(c, { type: 'sell_product', blockId: here, product: best, amount: stash[best] ?? 0 })) bump(c.cov, 'street_sales');
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
  // A player whose plan is to make and sell something buys the still before the gun. Without
  // this the solo run spent its opening on kit and did not get a line up until day 49 of 60, so
  // the half of the pass about making a living had eleven days of coverage. Only bites on a
  // scenario that actually wants a line early (`stillAt` below the cautious default), so the
  // honest run's day is untouched.
  if (c.stillAt < 5000 && !Object.keys(w.productions).length && w.player.cash < c.stillAt * 2) return;
  if (w.player.cash > 800 && (w.player.equipped ?? []).length < select.EQUIP_MAX) {
    const shop = Object.values(w.businesses).filter(b => select.isMarket(b) && (select.travelCost(w, b.blockId) ?? 9) <= 1)[0];
    const want = shop && select.marketStock(shop).filter(i => !(w.player.items ?? []).includes(i.id)).sort((a, b) => b.cost - a.cost).find(i => i.cost < w.player.cash * 0.7);
    if (shop && want && goTo(c, shop.blockId) && tryAct(c, { type: 'buy_item', businessId: shop.id, itemId: want.id })) bump(c.cov, 'items_bought');
  }
  for (const item of select.ownedItems(c.w)) {
    if (select.equipSlotsLeft(c.w) > 0 && !select.isEquipped(c.w, item.id)) tryAct(c, { type: 'equip', itemId: item.id, on: true });
  }
  armTheCrew(c);
}

/**
 * Buy somebody of yours a gun, and make sure it ends up in their hands.
 *
 * Its own step rather than more lines in `buyKit`, because the two fail differently: the player's
 * kit is bought once and carried forever, while a crew member's is bought per person and has to
 * survive them being reassigned, jailed and coming back. Both halves are counted separately for the
 * same reason — the purchase is not the feature, the gun being on a job is.
 *
 * The bot arms **one** crew member, not all of them, and that is deliberate: `jobKit` takes one
 * item per category across everybody on a job, so five identically-armed people prove nothing that
 * one armed person does not. One is also what a player does.
 */
function armTheCrew(c: Ctx) {
  const w = c.w;
  // Only on a scenario that actually sends people on jobs. `reserve` is already the flag for that
  // (`run.ts` sets it from `opsPerDay`), and the honest run plans no ops — so buying somebody a gun
  // there would spend its cash and its legwork on kit that never goes anywhere, which is exactly
  // the kind of "improvement" to the frozen run that CLAUDE.md forbids. Measured: without this the
  // honest 60-day close moved from $212 dirty / heat 3 to $378 / heat 0.
  if (c.reserve <= 0) return;
  if (w.player.cash < 1500) return;
  const mine = w.player.crewIds.map(id => w.npcs[id]).filter(n => n?.crew && n.alive && n.crew.status !== 'dead' && n.crew.status !== 'jailed');
  // Somebody with a free slot. Once one of them is carrying something this step costs nothing.
  const them = mine.find(n => select.equipSlotsLeft(w, n) > 0);
  if (!them) return;
  const unarmed = !(them.equipped ?? []).length;
  if (unarmed) {
    const shop = Object.values(w.businesses).filter(b => select.isMarket(b) && (select.travelCost(w, b.blockId) ?? 9) <= 1)[0];
    const want = shop && select.marketStock(shop).filter(i => i.category !== 'armor' && !(them.items ?? []).includes(i.id)).sort((a, b) => b.cost - a.cost).find(i => i.cost < w.player.cash * 0.5);
    if (shop && want && goTo(c, shop.blockId) && tryAct(c, { type: 'buy_item', businessId: shop.id, itemId: want.id, forNpcId: them.id })) bump(c.cov, 'crew_kitted');
  }
  // Re-read: `tryAct` replaces the world, so the record from before the purchase is stale.
  const now = c.w.npcs[them.id];
  for (const item of select.ownedItems(c.w, now)) {
    if (select.equipSlotsLeft(c.w, now) > 0 && !select.isEquipped(c.w, item.id, now)) tryAct(c, { type: 'equip', itemId: item.id, on: true, npcId: them.id });
  }
}

/**
 * The corners. A street crew is the one part of the map the bot walked past for its whole life:
 * it took the street tax on its own rackets every day and never once stood on the stoop. All
 * three of the old answers and the staked one are ordinary `parley` scenes, so this is a walk
 * and a button — and staking them is preferred where it is open, because it is the only one of
 * the four that leaves a racket running that nobody of yours is standing in.
 */
export function workTheCorners(c: Ctx) {
  const w = c.w;
  const near = Object.values(w.crews)
    .filter(x => !x.tribute && (select.travelCost(w, x.blockId) ?? 9) <= 1)
    .sort((a, b) => (a.funded ? 1 : 0) - (b.funded ? 1 : 0));
  for (const crew of near.slice(0, 2)) {
    const boss = w.npcs[crew.bossId]; if (!boss?.alive) continue;
    // a crew of yours that is paying honestly is left alone; one that has been caught sending
    // short gets the only answer the game has for it
    const short = !!crew.funded?.noticed;
    if (crew.funded && !short) continue;
    if (!goTo(c, crew.blockId)) continue;
    const want = short ? 'warn'
      : !select.fundReason(c.w, crew) ? 'fund'
      : c.w.player.respect > 30 ? 'tribute'
      : 'warn';
    if (!tryAct(c, { type: 'parley', npcId: boss.id, approach: want })) continue;
    bump(c.cov, 'parleys');
    if (c.w.crews[crew.id]?.funded && !crew.funded) bump(c.cov, 'crews_funded');
    return;    // one corner a day: a parley is a whole errand across town
  }
}

/** The street: recruit, lie low, add rackets, expand, buy in. Roughly what it always did. */
let bribedOn = -1;
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
      // One bribe a day, not one per pass round this loop: the captain takes the money every
      // time he is asked, and the loop asked seven times in a day in the law scenario.
      const captain = select.officials(w).find(o => o.official!.kind === 'captain');
      if (captain && p.cash > 2500 && bribedOn !== w.day && tryAct(c, { type: 'bribe_official', npcId: captain.id, amount: 1000 })) bribedOn = w.day;
      const n = c.rng.pick(biz.flatMap(b => [b.ownerId, ...b.patronIds]));
      // same trap as the fallback at the bottom of this loop: a failed visit must end the day,
      // not send the bot walking between two blocks until the guard runs out
      if (goTo(c, npcBlock(c, n)) && tryAct(c, { type: 'visit', npcId: n })) continue;
      break;
    }
    // Which racket to put where is a real decision now: saturation decays the fifth of a kind in
    // a district and synergy pays kinds that feed each other. `racketsByOutlook` is the same
    // ranking the block sheet shows a player, so the bot picks the way a reader of that panel
    // would — best actual yield first, not a fixed favourite list.
    // …but only among kinds it can actually pay for. Ranking on yield alone made the bot keep
    // choosing a policy bank it could not afford and install nothing at all, which halved its
    // racket count on three of six seeds before this filter went in.
    // ...and the price it checks has to be the price it will be charged. This read
    // `RACKET_DEFS[kind].setupCost` — the base — which stopped being what anything costs when the
    // tier pass made setting up inside an established place dearer. The bot kept picking a kind
    // it could not pay for, installed nothing, and a sixty-day honest run came back with three
    // rackets where it used to come back with four.
    const affordable = (b: typeof mine[number]) => select.racketsByOutlook(w, b).filter(x => select.setupCost(b, x.kind) <= p.cash - 200)[0];
    const ranked = mine.map(b => ({ b, best: affordable(b) })).filter(x => x.best).sort((x, y) => y.best.income - x.best.income)[0];
    if (ranked && p.cash > 1500) {
      if (tryAct(c, { type: 'start_racket', businessId: ranked.b.id, kind: ranked.best.kind })) { bump(c.cov, 'rackets_started'); continue; }
    }
    // Only places that can be leaned on at all. Since the tier pass a third of the city cannot:
    // an institution refuses a shakedown at any amount of fear, and the bot used to pick one as
    // its "softest" target, fail all three moves, and spend the legwork walking there anyway.
    // Honest income fell from about $14,000 to $63 on one seed before this filter went in.
    const t = soft.filter(b => !select.extortReason(b))
      .sort((a, b) => (w.npcs[a.ownerId].nerve - w.npcs[a.ownerId].rel.fear) - (w.npcs[b.ownerId].nerve - w.npcs[b.ownerId].rel.fear))[0];
    if (t) {
      if (tryAct(c, { type: 'protect', businessId: t.id, rate: 0.15 })) continue;
      if (goTo(c, t.blockId)) {
        // Escalate to what the owner actually needs. An established owner's nerve sits above what
        // a raised voice can reach, so talking at them for ever is wasted AP; breaking something
        // is a `property` act and clears it. A street owner still folds to the cheap version.
        const owner = w.npcs[t.ownerId];
        const hard = owner.nerve * 0.6 > 35;
        if (hard && tryAct(c, { type: 'shakedown', businessId: t.id, approach: 'wreck' })) continue;
        if (tryAct(c, { type: 'shakedown', businessId: t.id })) continue;
        if (hard && tryAct(c, { type: 'threaten', npcId: t.ownerId, approach: 'crew' })) continue;
        if (tryAct(c, { type: 'threaten', npcId: t.ownerId })) continue;
      }
    }
    const buy = biz.find(b => b.ownedBy === 'npc' && can(w, { type: 'buy_business', businessId: b.id, offer: Math.round(b.value * 0.9) }).ok);
    if (buy && p.cash > buy.value * 1.5) {
      if (tryAct(c, { type: 'buy_business', businessId: buy.id, offer: Math.round(buy.value * 0.9) })) { bump(c.cov, 'businesses_bought'); continue; }
    }
    // Last resort: go and talk to somebody. If even that will not take — everybody nearby has
    // already been spoken to today — the day is over as far as this loop is concerned.
    //
    // This used to `continue` on a failed visit, and once a walk between two adjacent blocks
    // costs no legwork the bot oscillated between the same pair for the rest of the guard's
    // thirty iterations, logging a walk each time and doing nothing. It is the eight identical
    // "You walk from J8 to K7" lines at the end of a long honest run.
    const n = c.rng.pick(biz.flatMap(b => [b.ownerId, ...b.patronIds]));
    if (goTo(c, npcBlock(c, n)) && tryAct(c, { type: 'visit', npcId: n })) continue;
    break;
  }
}


/**
 * Have a real conversation with somebody, the way the UI now does: open it, work an opener if
 * one is on offer, then close on the scene's own approach. The bot used to dispatch `visit` and
 * `threaten` straight, which is still legal and still what most of its day is — this exists so
 * the opener/closer path has coverage at all, because nothing else in the sweep touches it.
 */
export function haveAConversation(c: Ctx, scene: 'visit' | 'shakedown' | 'threaten', npcId: Id, businessId?: Id): boolean {
  if (!tryAct(c, { type: 'talk', scene, npcId, businessId })) return false;
  bump(c.cov, 'talks');
  let guard = 0;
  while (guard++ < 4) {
    const live = select.activeConfrontation(c.w);
    if (!live || live.kind !== 'talk') break;
    const opts = select.confrontOptions(c.w, live) as unknown as { id: string; closes: boolean; chance: number; disabled?: string }[];
    const usable = opts.filter(o => !o.disabled);
    // settling somebody's problem beats anything else on the menu: it is the only move that
    // leaves them owing you, which is what every real ask is gated on
    const agenda = usable.find(o => o.id.startsWith('agenda:settle'));
    const opener = usable.filter(o => !o.closes).sort((a, b) => b.chance - a.chance)[0];
    const closer = usable.filter(o => o.closes && o.id.startsWith('approach:')).sort((a, b) => b.chance - a.chance)[0];
    const pick = agenda ?? (opener && opener.chance >= 55 ? opener : closer);
    if (!pick) { tryAct(c, { type: 'resolve_confrontation', id: live.id, approach: 'leave' }); break; }
    if (!tryAct(c, { type: 'resolve_confrontation', id: live.id, approach: pick.id as never })) { tryAct(c, { type: 'resolve_confrontation', id: live.id, approach: 'leave' }); break; }
    if (pick === opener) bump(c.cov, 'talk_openers');
    else { if (pick === closer) bump(c.cov, 'talk_closed'); break; }
  }
  return true;
}

/**
 * Do something about what somebody actually wants. Settling it is the only thing in the game
 * that produces reciprocity on demand, so the bot reaches for it before it reaches for a
 * shakedown — and takes the dark route when a mark it cannot afford to help is worth trapping.
 */
export function workTheAgendas(c: Ctx): boolean {
  const near = Object.values(c.w.blocks)
    .filter(b => select.distanceFromStart(c.w, b.id) <= 2)
    .flatMap(b => select.businessesIn(c.w, b.id))
    .flatMap(b => [b.ownerId, ...b.patronIds]);
  for (const id of near) {
    const n = c.w.npcs[id]; if (!n || !select.agendaKnown(c.w, n)) continue;
    // Settling is the good deal and the default. But spending real money to do a favour for
    // somebody who dislikes you is poor value, and the dark route is exactly what it is for —
    // it is cheaper, and it works on people who would not have owed you anything anyway.
    const moves = select.agendaMoves(c.w, n).slice().sort((a, b) => rank(c, n, a.mode) - rank(c, n, b.mode));
    for (const m of moves) {
      if (select.agendaReason(c.w, n, m.mode)) continue;
      if (!goTo(c, npcBlock(c, id))) continue;
      const before = select.favours(n);
      if (!tryAct(c, { type: 'resolve_agenda', npcId: id, mode: m.mode })) continue;
      bump(c.cov, m.mode === 'trap' ? 'agendas_trapped' : 'agendas_settled');
      if (select.favours(c.w.npcs[id]) > before) bump(c.cov, 'favours_owed');
      return true;
    }
  }
  // nobody's agenda is legible yet: size somebody up, which is one of the three ways in
  const blind = near.map(id => c.w.npcs[id]).find(n => n && n.alive && !n.known && n.agenda && !n.agenda.done);
  if (blind && goTo(c, npcBlock(c, blind.id))) return tryAct(c, { type: 'read', npcId: blind.id });
  return false;
}

/**
 * The plays that need a standing relationship behind them: turn somebody, get introduced, and —
 * when a lieutenant has been settled with — ask them to walk out on their own people.
 *
 * All three go through `concessionReason`, so the bot needs no idea of its own about who will say
 * yes: it asks the same gate the UI shows a player, and acts on the answer.
 */
export function workTheRoom(c: Ctx): boolean {
  const w = c.w;
  // One of each, not one in total. Returning after the first success meant the list was really a
  // priority order and the bottom of it never ran at all: introductions had zero coverage in a
  // sixty-day sweep because a defection or an asset always came first.
  let did = false;
  const near = Object.values(w.blocks)
    .filter(b => select.distanceFromStart(w, b.id) <= 2)
    .flatMap(b => select.businessesIn(w, b.id))
    .flatMap(b => [b.ownerId, ...b.patronIds]);

  // 1. a lieutenant who owes you is the biggest thing on this list by a distance
  for (const f of Object.values(w.factions)) {
    for (const id of f.lieutenantIds) {
      const n = w.npcs[id]; if (!n?.alive) continue;
      if (select.defectReason(w, n)) continue;
      if (!goTo(c, npcBlock(c, id))) continue;
      if (tryAct(c, { type: 'defect', npcId: id })) { bump(c.cov, 'defections'); did = true; break; }
    }
  }

  // 2. somebody on the inside. Ears first — a warning is worth more than a pair of hands — and
  //    hands from anybody who is not placed to hear anything worth having
  for (const id of near) {
    const n = w.npcs[id]; if (!n || n.asset || n.crew) continue;
    const kind = !select.assetReason(w, n, 'informant') ? 'informant' : !select.assetReason(w, n, 'muscle') ? 'muscle' : undefined;
    if (!kind) continue;
    if (!goTo(c, npcBlock(c, id))) continue;
    if (tryAct(c, { type: 'turn_asset', npcId: id, kind })) { bump(c.cov, 'assets_turned'); did = true; break; }
  }

  // 3. an introduction, which is the cheapest way past the familiarity floor there is
  for (const id of near) {
    const n = w.npcs[id]; if (!n) continue;
    const to = select.referrals(w, n)[0]; if (!to) continue;
    if (!goTo(c, npcBlock(c, id))) continue;
    if (tryAct(c, { type: 'introduce', npcId: id, toNpcId: to.id })) { bump(c.cov, 'referrals'); did = true; break; }
  }
  return did;
}

/** Count what the people around you turned into, after End Day. */
export function tallyPeople(c: Ctx) {
  for (const n of Object.values(c.w.npcs)) {
    if (!n.nemesis?.earned.length || madeNemesis.has(n.id)) continue;
    madeNemesis.add(n.id); bump(c.cov, 'nemesis_made');
  }
}
const madeNemesis = new Set<Id>();

/**
 * Which way round to try an agenda on this person. Lower goes first.
 *
 * The only agenda with two routes is `leave`, and the question it asks is simple: do you want
 * this person to go? Somebody who runs a place is worth more standing behind their counter than
 * gone, so you shut the door — that is the dark route. Anybody else, you help, because a settled
 * favour is worth more than a frightened stranger.
 *
 * Two earlier rules here never fired once in a sixty-day sweep and are worth naming so the next
 * person does not try them again: *trap anyone whose trust is negative* (people near the start
 * block sit at or above zero) and *trap anyone whose place you already collect from* (by the time
 * the protection is installed, the agenda has been settled days earlier).
 */
function rank(c: Ctx, n: { id: Id }, mode: 'settle' | 'trap'): number {
  const runsAPlace = Object.values(c.w.businesses).some(b => b.ownerId === n.id && b.ownedBy !== 'faction');
  return (mode === 'trap') === runsAPlace ? 0 : 1;
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
  knockoffs: () => 'streetwear',
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
  // every kind, not two named ones: the institutions pass added three more and a tally that only
  // knew about skims and routes reported zero coverage for all of them
  const COUNTER = { skim: 'skims', route: 'routes', consign: 'consigns', offshore: 'offshores', trade: 'lanes' } as const;
  for (const n of Object.values(c.w.npcs)) {
    const k = n.intel?.kind; if (!k || seenIntel.has(n.id)) continue;
    seenIntel.add(n.id); bump(c.cov, COUNTER[k]); bump(c.cov, 'intel_ratted');
  }
  for (const f of c.w.cases ?? []) if (f.kind === 'fraud' && !seenCases.has(f.id)) { seenCases.add(f.id); bump(c.cov, 'offshore_filed'); }
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
const seenCases = new Set<Id>();
const lastRecipe = new Map<Id, string | undefined>();

/** Count what the night did to you, after End Day. */
export function tallyNight(c: Ctx, before: { busts: number; logLen: number }) {
  if (c.w.player.busts > before.busts) bump(c.cov, 'busts', c.w.player.busts - before.busts);
  for (const l of c.w.log.slice(before.logLen)) if (l.text.startsWith('RAID')) bump(c.cov, 'raids');
  for (const o of Object.values(c.w.ops)) {
    if ((o.status === 'done' || o.status === 'failed') && !seen.has(o.id)) {
      seen.add(o.id);
      bump(c.cov, o.status === 'done' ? 'ops_done' : 'ops_failed');
      // a job that went out with nobody on it: the whole claim of the solo pass, counted
      if (!o.crewIds.length) bump(c.cov, 'solo_ops');
    }
    if (o.complication?.answered === 'absent' && !absent.has(o.id)) { absent.add(o.id); bump(c.cov, 'complications_absent'); }
  }
}
const seen = new Set<Id>();
const absent = new Set<Id>();
/** Reset the per-run memory, so two runs in one process do not pollute each other. */
export function resetPolicy() {
  bribedOn = -1; seen.clear(); absent.clear(); seenIntel.clear(); seenCases.clear(); lastRecipe.clear(); madeNemesis.clear();
  landmarked.clear(); pairStance.clear(); swallowed.clear();
  upstartSize = -1; succeeded = false; wentStraight = false;
}

// ---------------------------------------------------------------- what a fortune is for
/**
 * Spending real money on things that are not another racket.
 *
 * Every one of these is a sink that did not exist before this pass, and the reason they are all
 * in one function is that they compete for the same pile: a bot that bought an institution first
 * would never have had the cash to test anything else. So the order is cheapest-first — the
 * clock, a ceiling, a lifestyle rung, a favour, respectability, and an institution last — which
 * is also roughly the order a player meets them.
 *
 * Gated on `sinksAt` rather than a constant: the honest scenario must never reach this, both
 * because its curve is frozen and because a player on $40 buying a casino would be a lie.
 */
export function spendTheFortune(c: Ctx) {
  const p = c.w.player;
  if (p.cash < c.sinksAt) return;

  // headroom first: it is the cheapest of these and it unblocks the others by letting the outfit
  // grow past the caps that would otherwise cap what a big job can field
  for (const kind of ['crew', 'safehouse'] as const) {
    const price = select.ceilingPrice(c.w, kind);
    if (price !== undefined && p.cash > price * 3 && tryAct(c, { type: 'buy_ceiling', kind })) bump(c.cov, 'ceilings_bought');
  }

  // the three ladders, one rung a visit, cheapest ladder first
  const rungs = (['home', 'car', 'security'] as const)
    .map(kind => ({ kind, step: select.nextStep(c.w, kind) }))
    .filter(x => x.step)
    .sort((a, b) => a.step!.cost - b.step!.cost);
  for (const r of rungs) {
    if (p.cash < r.step!.cost * 2) continue;
    if (tryAct(c, { type: 'buy_lifestyle', kind: r.kind })) { bump(c.cov, 'lifestyle_bought'); break; }
  }

  // somebody important, paid to owe you one. Cheapest first for the same reason as everything
  // else here: the point of the soak is that the path runs, not that it buys the best favour.
  const marks = Object.values(c.w.npcs)
    .filter(n => n.alive && !select.favourReason(n))
    .sort((a, b) => select.favourPrice(a) - select.favourPrice(b));
  const mark = marks[0];
  if (mark && p.cash > select.favourPrice(mark) * 2 && tryAct(c, { type: 'buy_favour', npcId: mark.id })) bump(c.cov, 'favours_bought');

  // respectability, in one visible chunk rather than a trickle, so the heat discount is large
  // enough to actually show up against the rest of the run
  const spend = Math.min(30000, Math.floor(p.cash * 0.1));
  if (!select.legitimacyReason(c.w, spend) && tryAct(c, { type: 'buy_legitimacy', amount: spend })) bump(c.cov, 'legitimacy_bought');

  // and the top of the ladder. Only ever one: the second is not a different code path and the
  // money is better spent proving the rest of this table is reachable.
  if (!c.w.player.businessIds.some(id => select.tierOf(c.w.businesses[id]) === 4)) {
    const top = Object.values(c.w.businesses)
      .filter(b => b.ownerId !== undefined && select.tierOf(b) === 4 && !c.w.player.businessIds.includes(b.id))
      .sort((a, b) => a.value - b.value)[0];
    if (top && p.cash > top.value * 1.2 && tryAct(c, { type: 'buy_business', businessId: top.id, offer: Math.round(top.value * 1.15) })) {
      bump(c.cov, 'tier4_bought'); bump(c.cov, 'businesses_bought');
    }
  }
}

/**
 * Move the clock. Cycled rather than optimised: the soak's job is to run every daypart through
 * `opChance`, `addHeat` and `effectivePolice`, and a bot that always picked the best hour would
 * only ever exercise one of the four.
 */
export function pickTheHour(c: Ctx, day: number) {
  const hours = select.HOURS;
  const want = hours[day % hours.length].hour;
  if ((c.w.hour ?? select.DEFAULT_HOUR) === want) return;
  if (tryAct(c, { type: 'set_hour', hour: want })) bump(c.cov, 'hours_set');
}

/**
 * Put a specialist on a set-piece that is waiting to go out.
 *
 * On the planned op rather than at planning time, because `hire_specialist` needs an op id —
 * the same reason the UI puts this on the active-job card rather than in the planner.
 */
export function hireSpecialists(c: Ctx) {
  for (const o of Object.values(c.w.ops)) {
    if (o.status !== 'ready' || o.launched) continue;
    if (!select.isSetPiece(o.kind)) continue;
    for (const role of select.rolesFor(o.kind)) {
      if (select.hiredOn(o).some(h => h.role === role)) continue;
      const pro = select.specialistsFor(c.w, role)
        .filter(n => !select.hireReason(c.w, role, n))
        .sort((a, b) => select.specialistFee(c.w, o.kind, role, a) - select.specialistFee(c.w, o.kind, role, b))[0];
      if (!pro) continue;
      if (tryAct(c, { type: 'hire_specialist', opId: o.id, role, npcId: pro.id })) bump(c.cov, 'specialists_hired');
    }
  }
}

/**
 * Everything the world did on its own, counted off things it already wrote down.
 *
 * Deliberately log-and-state reading rather than hooks in the sim: these are systems that run
 * *without* the player, so there is no action to count, and a counter the sim had to call would
 * be test-only code in `/sim`. If a line here stops matching, the system stopped announcing
 * itself, which is worth knowing on its own.
 */
export function tallyTheWorld(c: Ctx) {
  // --- stance between two outfits, neither of which is the player. Read off state rather than
  //     the log, because the claim is that the map changes, not that a line got printed.
  for (const f of Object.values(c.w.factions)) {
    for (const other of Object.values(c.w.factions)) {
      if (f.id === other.id) continue;
      const key = [f.id, other.id].sort().join('>');
      const now = f.stance[other.id];
      const was = pairStance.get(key);
      pairStance.set(key, now);
      if (was !== undefined && was !== now && (now === 'war' || now === 'beef')) bump(c.cov, 'faction_wars');
    }
    // somebody else finished them: absorbed, or simply bled out with nobody left to answer
    if (f.defeatedDay !== undefined && f.defeatedBy !== undefined && f.defeatedBy !== PLAYER && !swallowed.has(f.id)) {
      swallowed.add(f.id); bump(c.cov, 'faction_absorbs');
    }
  }

  // --- the front page, which is a pure read of the log and so is only ever as good as the log
  if (select.hasNews(c.w)) bump(c.cov, 'headlines', select.headlines(c.w).length);

  // --- the one-off places
  for (const o of Object.values(c.w.ops)) {
    if ((o.status === 'done' || o.status === 'failed') && LANDMARK_OPS.has(o.kind) && !landmarked.has(o.id)) { landmarked.add(o.id); bump(c.cov, 'landmark_ops'); }
  }

  // --- the upstart, counted by what it has rather than what it said, because growth is the claim
  const up = select.upstart(c.w);
  if (up) {
    const was = upstartSize;
    upstartSize = up.soldiers + select.blocksOf(c.w, up.id).length;
    if (was >= 0 && upstartSize > was) bump(c.cov, 'upstart_grew');
  }

  // --- the two endings
  if (c.w.player.succeededFrom?.length && !succeeded) { succeeded = true; bump(c.cov, 'succession'); }
  if (c.w.gameOver?.reason === 'straight' && !wentStraight) { wentStraight = true; bump(c.cov, 'went_straight'); }
}
const LANDMARK_OPS = new Set<string>(LANDMARKS.map(l => l.op));
const landmarked = new Set<Id>();
const pairStance = new Map<string, string | undefined>();
const swallowed = new Set<FactionId>();
let upstartSize = -1;
let succeeded = false;
let wentStraight = false;


/**
 * Trying to get out.
 *
 * `GO_STRAIGHT` wants four things at once for a fortnight — clean money sitting there, nothing
 * dirty on the books, nobody looking, and enough bought respectability that somebody might
 * believe it — and the ordinary bot day breaks at least two of them every morning by design.
 * So this is its own shape: buy the respectability, wash the takings, and sit still.
 *
 * It is the only way the clean ending is reachable inside sixty days, and without it the whole
 * of that system shipped with a ✗ next to it.
 */
export function tryToGetOut(c: Ctx) {
  const p = c.w.player;
  // respectability decays daily, so this is a standing order rather than a one-off purchase
  if (select.legitimacy(c.w) < select.GO_STRAIGHT.legitimacy + 8) {
    const spend = Math.min(60000, Math.floor(p.cash * 0.05));
    if (!select.legitimacyReason(c.w, spend) && tryAct(c, { type: 'buy_legitimacy', amount: spend })) bump(c.cov, 'legitimacy_bought');
  }
  // nothing you cannot explain. The fixer is worth using here even at his rate: the cap on what
  // you can wash yourself is the thing most likely to leave a few hundred dirty overnight.
  if (p.dirty > 0 && tryAct(c, { type: 'launder', amount: p.dirty })) bump(c.cov, 'launders');
  if (p.dirty > 0) {
    const fx = select.fixersKnown(c.w)[0];
    const room = fx ? select.fixerCapLeft(c.w, fx) : 0;
    if (fx && room > 0 && tryAct(c, { type: 'launder_with_fixer', npcId: fx.id, amount: Math.min(p.dirty, room) })) bump(c.cov, 'fixer_launders');
  }
  // and nobody looking. Laying low is the only lever on heat that does not cost a job.
  if (p.heat > select.GO_STRAIGHT.maxHeat && !select.layingLow(c.w)) tryAct(c, { type: 'lay_low', days: 3 });
}


/**
 * Walk a landmark before trying to rob it.
 *
 * `count_night` wants `casedTarget` and was the one landmark job a sixty-day sweep never ran: the
 * bot has never cased anything in its life, because until now nothing it could plan asked it to.
 * One walk a day, at whichever one-off place is not currently cased and is nearest to being
 * useful — which is also exactly what a player does before a job of that size.
 */
export function caseALandmark(c: Ctx) {
  for (const lm of LANDMARKS) {
    const biz = Object.values(c.w.businesses).find(b => b.name === lm.name);
    if (!biz || (biz.casedUntil ?? 0) > c.w.day) continue;
    if (!goTo(c, biz.blockId)) continue;
    if (tryAct(c, { type: 'case_joint', businessId: biz.id })) return;
  }
}


/**
 * Put a job on somebody one of your own people loves.
 *
 * Its own step rather than a thumb on `planAnOp`'s ranking, which is what the first attempt was and
 * it cost two other systems their coverage. The scene only exists inside an op the bot had already
 * ticked off: ranking by freshness ran `hit` early, while every crew loyalty was still too low for
 * anybody to care, and never again — so a system that works perfectly read ✗.
 *
 * Once per run, and only when the city actually offers such a mark.
 */
export function takeTheFamilyJob(c: Ctx): boolean {
  if (count(c.cov, 'kin_raised')) return false;
  const kind: OpKind = 'hit';
  if (select.opLocked(c.w, kind)) return false;
  const def = OP_DEFS[kind];
  const want = Math.max(1, def.minCrew);
  const mark = Object.values(c.w.npcs).find(n => n.alive && !n.crew && select.kinOnTheJob(c.w, kind, n.id) && !select.opLocked(c.w, kind, { npcId: n.id }));
  if (!mark) return false;
  // Take somebody off a racket if nobody is spare, which is the whole reason this needed its own
  // step. `promoteLieutenants` and `runTheEmpire` between them assign every last body before the
  // day plans anything, so `idleCrew` is routinely empty here and a one-hander never goes out —
  // which is why a working system read ✗ for a whole pass. A player pulls somebody off a corner
  // for a job like this without thinking about it; the bot does it once in a run.
  for (const n of select.crew(c.w)) {
    if (select.idleCrew(c.w).length >= want) break;
    if (n.crew?.status === 'assigned') tryAct(c, { type: 'assign', npcId: n.id });
  }
  const free = select.idleCrew(c.w);
  if (free.length < want) return false;
  const crewIds = free.slice(0, want).map(n => n.id);
  if (!tryAct(c, { type: 'plan_op', kind, crewIds, targetNpcId: mark.id })) return false;
  bump(c.cov, 'ops_planned'); bumpOp(c.cov, kind);
  if ((def.tier ?? 0) >= 2) bump(c.cov, 'tier2_ops');

  // Answer it here, in the same day it was raised. The queue is swept at End Day — an unanswered
  // scene becomes the 'say nothing' branch, which is correct for a player who walks away and
  // useless as coverage: the morning pass never saw it, so for a whole pass this read ✗ while
  // working. Rolled rather than optimised, because the four answers are a decision and not a
  // contest: taking the best odds picked the same one every time and three branches never ran.
  const at = select.activeConfrontation(c.w);
  if (at?.kind === 'kin') {
    bump(c.cov, 'kin_raised');
    const opts = select.confrontOptions(c.w, at).filter(o => !o.disabled);
    const pick = opts[c.rng.int(0, opts.length - 1)];
    if (pick && tryAct(c, { type: 'resolve_confrontation', id: at.id, approach: pick.id })) bump(c.cov, 'kin_answered');
  }
  return true;
}
