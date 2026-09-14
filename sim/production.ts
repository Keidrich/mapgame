/**
 * Production depth: quality, recipes, upgrades, and the things that go wrong.
 * Quality is set per batch from the worker, the level and the recipe, and follows
 * the product as a running average through stashes to the street price.
 */
import { PRODUCTION_DEFS, PRODUCTION_LEVEL, PRODUCT_INFO, RECIPES, qualityMult } from '@content/rackets';
import type { Rng } from './rng';
import { PLAYER, type GameEvent, type Npc, type Production, type ProductKind, type ProductionKind, type Stash, type World } from './types';
import { addHeat, adjustRel, clamp, log, money, spreadRep } from './util';

export const DEFAULT_QUALITY = 50;
type Holder = { stash: Stash; quality?: Partial<Record<ProductKind, number>> };

export function qualityOf(h: Holder, product: ProductKind): number { return h.quality?.[product] ?? DEFAULT_QUALITY; }
/** Add units at a given quality, keeping the holder's running average. */
export function addProduct(h: Holder, product: ProductKind, units: number, q = DEFAULT_QUALITY) {
  if (units <= 0) return;
  const have = h.stash[product] ?? 0;
  const mixed = have + units > 0 ? (qualityOf(h, product) * have + q * units) / (have + units) : q;
  h.stash[product] = have + units;
  h.quality = { ...(h.quality ?? {}), [product]: Math.round(mixed) };
}
/** Move units between holders, carrying quality with them. */
export function moveProduct(from: Holder, to: Holder, product: ProductKind, units: number) {
  const q = qualityOf(from, product);
  from.stash[product] -= units;
  addProduct(to, product, units, q);
}

/**
 * Your own hands, when nobody else's are on it.
 *
 * An unmanned line runs at `runnerFactor`'s 0.5 — an absentee's half rate — and that was also
 * what you got while standing in your own back room with tech 8 in your head. It made the
 * opening move of the game (a safehouse and a still, before you know a soul) pay like a line
 * nobody was running, which is most of why a solo start felt dead.
 *
 * Deliberately below a dedicated runner (`0.6 + skill/10`, up to 1.6): somebody who does
 * nothing else does it better, and you are also running a city. That gap is the reason to hire
 * — and since you are one person you cover one line, so the *second* still is what pushes you
 * to go and meet people. That is the arc: solo, then a crew.
 */
export const PLAYER_HANDS = { floor: 0.55, per: 12, qualityFloor: 30, qualityPer: 4 };

/**
 * The single production the player works themselves: the unmanned one their own skill does the
 * most good on. Ties break on id so the pick is deterministic and the ledger's estimate and the
 * end-of-day tick can never disagree about which line you were standing in.
 */
export function playerWorked(w: World): string | undefined {
  let best: Production | undefined; let score = -1;
  for (const sid of w.player.safehouseIds) {
    for (const pid of w.safehouses[sid]?.productionIds ?? []) {
      const pr = w.productions[pid]; if (!pr || pr.workerId) continue;
      const sk = w.player.skills[PRODUCTION_DEFS[pr.kind].skill];
      if (sk > score || (sk === score && best && pr.id < best.id)) { best = pr; score = sk; }
    }
  }
  return best?.id;
}
/** Is this the line the player is working? */
export const playerWorks = (w: World, p: Production) => !p.workerId && playerWorked(w) === p.id;

export function productionQuality(w: World, p: Production): number {
  const def = PRODUCTION_DEFS[p.kind];
  const worker = p.workerId ? w.npcs[p.workerId] : undefined;
  const working = worker && worker.crew && worker.crew.status === 'assigned';
  let q = working ? 35 + worker.skills[def.skill] * 5
    : playerWorks(w, p) ? PLAYER_HANDS.qualityFloor + w.player.skills[def.skill] * PLAYER_HANDS.qualityPer
    : 22;
  q += (p.level - 1) * PRODUCTION_LEVEL.quality;
  if (p.recipe && RECIPES[p.recipe]) q += RECIPES[p.recipe].quality;
  if (working) {
    const has = (t: string) => worker.traits.includes(t as Npc['traits'][number]);
    if (has('junkie')) q -= 15; if (has('honest') || has('quiet')) q += 5; if (has('hothead')) q -= 5;
  }
  return clamp(Math.round(q), 5, 100);
}
export function recipeFor(p: Production) { return p.recipe ? RECIPES[p.recipe] : undefined; }
export function knownRecipes(w: World): string[] { return w.player.recipes ?? []; }
export function recipesForKind(w: World, kind: ProductionKind): string[] { return knownRecipes(w).filter(id => RECIPES[id]?.kind === kind); }

export function unlockRecipe(w: World, id: string, how: string): boolean {
  const r = RECIPES[id]; if (!r) return false;
  const known = knownRecipes(w); if (known.includes(id)) return false;
  w.player.recipes = [...known, id];
  log(w, `${how} You now know ${r.label} for the ${PRODUCTION_DEFS[r.kind].label.toLowerCase()}: ${r.blurb}`, 'good');
  return true;
}
/** Called whenever someone joins the player's crew: specialists bring what they know. */
export function onJoin(w: World, n: Npc) {
  if (n.recipe) unlockRecipe(w, n.recipe, `${n.name} knows a thing or two.`);
}
export function restockCost(w: World, p: Production, days: number): number {
  const def = PRODUCTION_DEFS[p.kind];
  const short = (w.market?.shortage[p.kind] ?? 0) > w.day;
  return Math.round(def.ingredientCost * days * (short ? 2 : 1));
}
export function shortageActive(w: World, kind: ProductionKind): boolean { return (w.market?.shortage[kind] ?? 0) > w.day; }
export function saturationActive(w: World, product: ProductKind): boolean { return (w.market?.saturation[product] ?? 0) > w.day; }
/** Street price multiplier for the player's carried stash of a product: quality and saturation. */
export function sellMult(w: World, product: ProductKind): number {
  return qualityMult(qualityOf(w.player, product)) * (saturationActive(w, product) ? 0.7 : 1);
}
function market(w: World) { return (w.market ??= { shortage: {}, saturation: {} }); }

// ---------------------------------------------------------------- events
type Candidate = { w: number; make: () => GameEvent | undefined };
export function productionCandidates(w: World, rng: Rng, ev: (kind: string, title: string, text: string, options: GameEvent['options'], refs?: GameEvent['refs']) => GameEvent): Candidate[] {
  const p = w.player;
  const prods = p.safehouseIds.flatMap(id => w.safehouses[id]?.productionIds ?? []).map(id => w.productions[id]).filter(Boolean);
  if (!prods.length) return [];
  const sh = (pr: Production) => w.safehouses[pr.safehouseId];
  const bad = prods.filter(pr => (pr.quality ?? DEFAULT_QUALITY) < 35 && pr.lastOutput > 0);
  const skimmers = prods.filter(pr => { const n = pr.workerId ? w.npcs[pr.workerId] : undefined; return n?.crew && (n.crew.loyalty < 45 || n.traits.includes('junkie')) && pr.lastOutput > 0; });
  const snitches = p.crewIds.map(id => w.npcs[id]).filter(n => n.crew?.status === 'jailed' && n.crew.loyalty < 40);
  const hostileNear = (blockId: string) => Object.values(w.factions).filter(f => { const st = f.stance[PLAYER]; if (!f.alive || (st !== 'beef' && st !== 'war')) return false; const b = w.blocks[blockId]; return (b.influence[f.id] ?? 0) >= 10 || b.neighborIds.some(nb => (w.blocks[nb]?.influence[f.id] ?? 0) >= 30); });
  const sabotage = prods.filter(pr => !pr.disrupted && hostileNear(sh(pr).blockId).length);
  const totalOf = (prod: ProductKind) => p.stash[prod] + p.safehouseIds.reduce((s, id) => s + (w.safehouses[id]?.stash[prod] ?? 0), 0);
  const flooded = (['booze', 'green', 'pills', 'counterfeit'] as ProductKind[]).filter(pk => totalOf(pk) > 120 && !saturationActive(w, pk));
  const shortable = prods.filter(pr => !shortageActive(w, pr.kind));
  return [
    { w: bad.length ? 3 : 0, make: () => { const pr = rng.pick(bad); const def = PRODUCTION_DEFS[pr.kind]; const s = sh(pr); const prod = PRODUCT_INFO[def.product].label.toLowerCase(); return ev('bad_batch', `Bad batch at ${s.name}`, `The ${def.label.toLowerCase()} turned out a run of ${prod} that ${pr.kind === 'still' ? 'could strip paint' : pr.kind === 'print_shop' ? 'a child could spot' : 'is mostly filler'}. Quality ${pr.quality}. It is sitting in the stash with the good stuff.`, [
      { id: 'dump', label: 'Dump it', detail: `Lose about 30% of the ${prod} at ${s.name}; the rest is clean` },
      { id: 'cut', label: 'Cut it into the good stuff', detail: 'Keep it all; quality drops' },
      { id: 'sell', label: 'Sell it anyway', detail: 'Keep it all; the block finds out, +heat' },
    ], { blockId: s.blockId }); } },
    { w: skimmers.length ? 3 : 0, make: () => { const pr = rng.pick(skimmers); const n = w.npcs[pr.workerId!]; const s = sh(pr); const def = PRODUCTION_DEFS[pr.kind]; return ev('worker_skims', `${n.name} is walking out with product`, `The ${def.label.toLowerCase()} at ${s.name} makes ${pr.lastOutput} a day on paper and less than that in the stash. ${n.name} works it. ${n.traits.includes('junkie') ? 'You know where it goes.' : 'Somebody is buying it off them.'}`, [
      { id: 'confront', label: 'Have a word', detail: 'Muscle check. They stop, or they quit and talk.' },
      { id: 'replace', label: 'Pull them off it', detail: 'Production runs unmanned; −loyalty' },
      { id: 'ignore', label: 'Cost of doing business', detail: 'Lose a little product a day; +loyalty' },
    ], { npcId: n.id, blockId: s.blockId }); } },
    { w: snitches.length ? 3 : 0, make: () => { const n = rng.pick(snitches); const pr = rng.pick(prods); const s = sh(pr); const def = PRODUCTION_DEFS[pr.kind]; return ev('worker_snitch', `${n.name} is talking`, `Your lawyer hears it from a clerk: ${n.name} has been offered a deal and has started describing a ${def.label.toLowerCase()} at ${s.name}.`, [
      { id: 'lawyer', label: `Get them a better deal (${money(2000)})`, detail: '−heat; they come out sooner and grateful', costCash: 2000 },
      { id: 'move', label: 'Move the operation', detail: `${def.label} down 3 days; the block cools off` },
      { id: 'message', label: 'Send a message inside', detail: 'Muscle check. They go quiet, or the whole wing hears.' },
    ], { npcId: n.id, blockId: s.blockId }); } },
    { w: sabotage.length ? 3 : 0, make: () => { const pr = rng.pick(sabotage); const s = sh(pr); const f = rng.pick(hostileNear(s.blockId)); const def = PRODUCTION_DEFS[pr.kind]; pr.disrupted = Math.max(pr.disrupted, 3); return ev('sabotage', `${f.short} hit ${s.name}`, `Somebody ${pr.kind === 'grow_op' ? 'cut the power and the lamps are dead' : pr.kind === 'still' ? 'put a hammer through the still' : 'tossed the place and torched the stock'}. Word is it was ${f.short}. The ${def.label.toLowerCase()} is down 3 days.`, [
      { id: 'rebuild', label: `Rebuild fast (${money(800)})`, detail: 'Back up tomorrow', costCash: 800 },
      { id: 'guard', label: 'Put a guard on it', detail: 'Needs an idle crew member; they guard the block from now on' },
      { id: 'hitback', label: 'Hit them back', detail: 'Muscle check. +fear, +heat, −standing either way.' },
    ], { blockId: s.blockId, factionId: f.id }); } },
    { w: flooded.length ? 2 : 0, make: () => { const pk = rng.pick(flooded); const info = PRODUCT_INFO[pk]; market(w).saturation[pk] = w.day + 5; const units = totalOf(pk); return ev('saturation', `The street is flooded with ${info.label.toLowerCase()}`, `You are sitting on ${Math.round(units)} ${info.label.toLowerCase()} and so is everyone you sell to. Prices are down 30% for a few days.`, [
      { id: 'hold', label: 'Sit on it', detail: 'Wait for the price to come back' },
      { id: 'dump', label: 'Dump half now', detail: 'Half the carried stock at half price, tonight' },
      { id: 'push', label: 'Push it into the next district', detail: 'Needs an idle driver (wheels 5+). Full price, +heat.' },
    ], {}); } },
    { w: shortable.length ? 2 : 0, make: () => { const pr = rng.pick(shortable); const def = PRODUCTION_DEFS[pr.kind]; market(w).shortage[pr.kind] = w.day + 6; return ev('shortage', `Your supplier dried up`, `Whoever was selling you ${pr.kind === 'still' ? 'sugar and yeast by the sack' : pr.kind === 'grow_op' ? 'seed and nutrients' : pr.kind === 'lab' ? 'precursor' : 'paper and ink'} got pinched. Restocking the ${def.label.toLowerCase()} costs double for a week.`, [
      { id: 'pay', label: 'Pay the spike', detail: 'Nothing changes; you eat the cost' },
      { id: 'find', label: 'Find a new supplier', detail: 'Charm check. Shortage over, or +heat asking around.' },
      { id: 'steal', label: 'Steal a load', detail: 'Needs an idle crew member. 5 days of stock free, +heat.' },
    ], { blockId: sh(pr).blockId }); } },
  ];
}

/** Applies a production event choice. Returns false if the event is not one of ours. */
export function resolveProductionEvent(w: World, e: GameEvent, opt: string, rng: Rng): boolean {
  const p = w.player;
  const n = e.refs.npcId ? w.npcs[e.refs.npcId] : undefined;
  const f = e.refs.factionId ? w.factions[e.refs.factionId] : undefined;
  const sh = e.refs.blockId ? p.safehouseIds.map(id => w.safehouses[id]).find(s => s && s.blockId === e.refs.blockId) : undefined;
  const muscleCheck = () => p.skills.muscle * 5 + p.crewIds.length * 5 + p.fear * 0.3 + rng.int(0, 30) > 45;
  const charmCheck = () => p.skills.charm * 5 + p.respect * 0.3 + rng.int(0, 30) > 40;
  const idle = () => p.crewIds.map(id => w.npcs[id]).find(c => c.crew?.status === 'idle');
  const prodOf = (s: typeof sh) => s ? s.productionIds.map(id => w.productions[id]).find(pr => pr && (pr.quality ?? 50) < 35) ?? w.productions[s.productionIds[0]] : undefined;
  switch (`${e.kind}:${opt}`) {
    case 'bad_batch:dump': { const pr = prodOf(sh); if (sh && pr) { const pk = PRODUCTION_DEFS[pr.kind].product; const lost = Math.round(sh.stash[pk] * 0.3); sh.stash[pk] -= lost; sh.quality = { ...(sh.quality ?? {}), [pk]: Math.max(DEFAULT_QUALITY, qualityOf(sh, pk)) }; log(w, `${lost} ${PRODUCT_INFO[pk].label.toLowerCase()} down the drain. What is left is good.`, 'info', e.refs); } return true; }
    case 'bad_batch:cut': { const pr = prodOf(sh); if (sh && pr) { const pk = PRODUCTION_DEFS[pr.kind].product; sh.quality = { ...(sh.quality ?? {}), [pk]: clamp(qualityOf(sh, pk) - 12, 5, 100) }; log(w, `It all goes in the same bag. Quality of the ${PRODUCT_INFO[pk].label.toLowerCase()} at ${sh.name} is down.`, 'warn', e.refs); } return true; }
    case 'bad_batch:sell': { if (sh) { addHeat(w, 4, sh.blockId); spreadRep(w, sh.blockId, { trust: -3, respect: -2 }); log(w, `It sells. Then people start asking who sold it. (+4 heat, the block trusts you less)`, 'bad', e.refs); } return true; }
    case 'worker_skims:confront': { if (n?.crew) { if (muscleCheck()) { n.crew.loyalty = clamp(n.crew.loyalty - 10); adjustRel(w, n, { fear: 15 }, 'backed'); log(w, `${n.name} stops. (−10 loyalty, +fear)`, 'good', e.refs); } else { p.crewIds = p.crewIds.filter(id => id !== n.id); for (const pr of Object.values(w.productions)) if (pr.workerId === n.id) pr.workerId = undefined; n.crew = undefined; n.role = 'patron'; n.rel.trust = -50; addHeat(w, 6); log(w, `${n.name} quits on the spot and tells a cop where the safehouse is. (+6 heat)`, 'bad', e.refs); } } return true; }
    case 'worker_skims:replace': { if (n?.crew) { for (const pr of Object.values(w.productions)) if (pr.workerId === n.id) pr.workerId = undefined; n.crew.assignment = undefined; n.crew.status = 'idle'; n.crew.loyalty = clamp(n.crew.loyalty - 8); log(w, `${n.name} is off it. Somebody else will have to run it. (−8 loyalty)`, 'info', e.refs); } return true; }
    case 'worker_skims:ignore': { if (n?.crew) { n.crew.loyalty = clamp(n.crew.loyalty + 8); n.notes.push('skims product'); log(w, `You let it go. ${n.name} keeps a little back every day. (+8 loyalty)`, 'info', e.refs); } return true; }
    case 'worker_snitch:lawyer': { if (n?.crew) { p.heat = clamp(p.heat - 6); n.crew.statusDays = Math.max(1, Math.round(n.crew.statusDays * 0.5)); n.crew.loyalty = clamp(n.crew.loyalty + 25); log(w, `A better lawyer, a shorter stretch, and ${n.name} forgets what they were going to say. (−6 heat, +25 loyalty)`, 'money', e.refs); } return true; }
    case 'worker_snitch:move': { if (sh) { for (const id of sh.productionIds) w.productions[id].disrupted = Math.max(w.productions[id].disrupted, 3); w.blocks[sh.blockId].heat = clamp(w.blocks[sh.blockId].heat - 20); p.heat = clamp(p.heat - 4); log(w, `Everything at ${sh.name} goes into a van for three days. Whatever ${n?.name ?? 'they'} described is not there any more. (−4 heat)`, 'info', e.refs); } return true; }
    case 'worker_snitch:message': { if (n?.crew) { if (muscleCheck()) { n.crew.loyalty = clamp(n.crew.loyalty + 5); adjustRel(w, n, { fear: 30 }, 'violence'); p.fear = clamp(p.fear + 2); log(w, `${n.name} gets a visitor in the yard and stops talking.`, 'warn', e.refs); } else { addHeat(w, 10); log(w, `The visit goes wrong and now the guards know your name too. (+10 heat)`, 'bad', e.refs); } } return true; }
    case 'sabotage:rebuild': { if (sh) { for (const id of sh.productionIds) w.productions[id].disrupted = Math.min(w.productions[id].disrupted, 1); log(w, `Cash and a long night. ${sh.name} is back up tomorrow.`, 'money', e.refs); } return true; }
    case 'sabotage:guard': { const c = idle(); if (c?.crew && sh) { c.crew.assignment = { kind: 'guard', blockId: sh.blockId }; c.crew.status = 'assigned'; log(w, `${c.name} sleeps at ${sh.name} now.`, 'info', e.refs); } else log(w, 'Nobody free to stand guard.', 'warn', e.refs); return true; }
    case 'sabotage:hitback': { if (f) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 15, -100, 100); addHeat(w, 6); if (muscleCheck()) { f.soldiers = Math.max(0, f.soldiers - 1); p.fear = clamp(p.fear + 5); log(w, `One of ${f.short}'s people goes to the hospital. Everybody understands. (+5 fear, +6 heat)`, 'good', e.refs); } else { const c = p.crewIds.map(id => w.npcs[id]).find(c => c.crew?.status === 'idle' || c.crew?.status === 'assigned'); if (c?.crew) { c.crew.status = 'injured'; c.crew.statusDays = 4; c.crew.assignment = undefined; } log(w, `It goes badly. ${c ? `${c.name} is hurt.` : ''} (+6 heat)`, 'bad', e.refs); } } return true; }
    case 'saturation:hold': return true;
    case 'saturation:dump': { for (const pk of Object.keys(p.stash) as ProductKind[]) { if (!saturationActive(w, pk) || p.stash[pk] < 2) continue; const units = Math.floor(p.stash[pk] / 2); const take = Math.round(units * PRODUCT_INFO[pk].price * 0.5 * qualityMult(qualityOf(p, pk))); p.stash[pk] -= units; p.dirty += take; log(w, `${units} ${PRODUCT_INFO[pk].label.toLowerCase()} gone for ${money(take)}.`, 'money'); } return true; }
    case 'saturation:push': { const c = p.crewIds.map(id => w.npcs[id]).find(c => c.crew?.status === 'idle' && c.skills.wheels >= 5); if (!c) { log(w, 'No driver free. It sits.', 'warn'); return true; } for (const pk of Object.keys(p.stash) as ProductKind[]) { if (!saturationActive(w, pk) || p.stash[pk] < 2) continue; const units = Math.floor(p.stash[pk] * 0.6); const take = Math.round(units * PRODUCT_INFO[pk].price * qualityMult(qualityOf(p, pk))); p.stash[pk] -= units; p.dirty += take; addHeat(w, PRODUCT_INFO[pk].heat * 3); log(w, `${c.name} drives ${units} ${PRODUCT_INFO[pk].label.toLowerCase()} across town. ${money(take)}.`, 'money', { npcId: c.id }); } return true; }
    case 'shortage:pay': return true;
    case 'shortage:find': { const kinds = Object.keys(market(w).shortage) as ProductionKind[]; if (charmCheck()) { for (const k of kinds) delete market(w).shortage[k]; log(w, 'A cousin of a cousin. The new supplier is dearer by nothing.', 'good'); } else { addHeat(w, 5); log(w, 'You ask around too loudly. (+5 heat)', 'bad'); } return true; }
    case 'shortage:steal': { const c = idle(); const pr = sh ? w.productions[sh.productionIds[0]] : undefined; if (c && pr) { pr.stock += 5; addHeat(w, 7, sh!.blockId); log(w, `${c.name} takes a van from a loading dock. Five days of stock, and a report filed. (+7 heat)`, 'warn', { npcId: c.id }); } else log(w, 'Nobody free to do it.', 'warn'); return true; }
    default: return false;
  }
}
