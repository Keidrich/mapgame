/** End of day. Everything that happens while the player sleeps. */
import { legworkFor } from './travel';
import { PRODUCTION_DEFS, PRODUCT_INFO, RACKET_DEFS, SAFEHOUSE_TIERS } from '@content/rackets';
import { effectivePolice, raidPressure, tickAuthorities } from './authority';
import { applyDailyInfluence, updateTenure, yieldMult } from './territory';
import { foremanOf, haulHeat, tickAutomation } from './automation';
import { tickIntel } from './intel';
import { tickAssets } from './informants';
import { launderCapacity, productionOutput, racketIncome, streetPrice } from './economy';
import { LAUNDER_RATE } from '@content/rackets';
import { resolveConfrontation } from './combat';
import { tickCards, tickHackCrew, tickTaps } from './cyber';
import { drawEvents } from './events';
import { addMemory, tickAgendas, tickGossip } from './people';
import { tickCrews } from './crews';
import { runFaction } from './factions';
import { resolveOp } from './ops';
import { closeRacket, stashTotal } from './reducer';
import { controlShare } from './select';
import { PLAYER, type World } from './types';
import { addHeat, addInfluence, adjustRel, clamp, collectors, factionOf, jailDays, log, money, rngOf } from './util';
import { LIEUTENANT } from '@content/rackets';
import { coverFor, tickLieutenants } from './lieutenants';
import { addProduct, productionQuality, recipeFor, sellMult } from './production';
import { tickCases } from './cases';
import { tickCommission } from './commission';
import { heldIds, tickHostages } from './hostages';
import { PRODUCTION_LEVEL } from '@content/rackets';


/** Which product a racket sells, for the standing orders. Undefined for the ones that sell nothing. */
function productOf(r: import('./types').Racket): import('./types').ProductKind | undefined {
  if (r.kind === 'dealing') return r.product ?? 'green';
  if (r.kind === 'fencing') return 'hot_goods';
  if (r.kind === 'counterfeiting') return 'counterfeit';
  return undefined;
}

export function endDay(w: World): World {
  const { rng, done } = rngOf(w);
  const p = w.player;
  const summary = { clean: 0, dirty: 0, spent: 0 };

  // Anything still standing in front of the player when the day ends happens anyway: an
  // unanswered confrontation lands exactly as it would have before any of this existed.
  for (const c of [...(w.confrontations ?? [])]) resolveConfrontation(w, c, 'absent', rng);

  // ---- the wire: cards go stale, taps report or get found, crew on the wire work the pile ----
  tickCards(w);
  tickTaps(w, rng);
  tickHackCrew(w, rng);
  tickIntel(w, rng);
  tickAssets(w, rng);   // an informant you never call stops answering

  // Influence is gathered per block and applied once at the end of the day rather than per
  // asset, so `accrualMult` can see the whole depth of what you run there. Adding it per racket
  // is what made three rackets on one block worth exactly three on three blocks.
  const influenceGain: Record<string, number> = {};
  const gain = (blockId: string, n: number) => { influenceGain[blockId] = (influenceGain[blockId] ?? 0) + n; };

  // ---- crew upkeep ----
  for (const id of p.crewIds) {
    const n = w.npcs[id]; const c = n.crew; if (!c) continue;
    if (c.status === 'injured' || c.status === 'jailed') { c.statusDays--; if (c.statusDays <= 0) { c.status = 'idle'; log(w, `${n.name} is back.`, 'good', { npcId: n.id }); } }
    if (c.status === 'dead') continue;
    if (c.cut > 0) {
      if (p.cash + p.dirty >= c.cut) { spend(w, c.cut); summary.spent += c.cut; }
      else { c.loyalty = clamp(c.loyalty - 10); log(w, `You could not pay ${n.name}. (−10 loyalty)`, 'bad', { npcId: n.id }); }
    }
    if (c.assignment?.kind === 'guard') { gain(c.assignment.blockId, 3); w.blocks[c.assignment.blockId].heat = clamp(w.blocks[c.assignment.blockId].heat + 0.5); }
    if (c.loyalty < 15 && rng.chance(0.2)) { p.crewIds = p.crewIds.filter(x => x !== n.id); n.crew = undefined; n.role = 'patron'; n.rel.trust = -30; log(w, `${n.name} walked. Nobody saw them go.`, 'bad', { npcId: n.id }); }
  }

  // ---- owned businesses ----
  for (const id of p.businessIds) {
    const b = w.businesses[id];
    const inc = Math.round(b.baseIncome * (b.condition / 100) * (b.flags.includes('owner_dead') ? 0.5 : 1));
    p.cash += inc; summary.clean += inc;
    if (b.condition < 100 && !b.flags.includes('torched')) b.condition = clamp(b.condition + 1);
    gain(b.blockId, 1);
  }

  // ---- standing orders: foremen, then deliveries to the corners ----
  // Runs before the rackets so what arrived this morning is what sells today. This generalises
  // the same-block restock the dealing fix shipped with: every product racket now has a rule
  // saying where it may draw from, and `block` is the default that behaviour became.
  const hauled = tickAutomation(w, r => productOf(r));
  if (hauled > 0) addHeat(w, haulHeat(hauled));

  // ---- rackets ----
  const districtTake: Record<string, number> = {};
  for (const id of p.racketIds.slice()) {
    const r = w.rackets[id]; if (!r) continue;
    const def = RACKET_DEFS[r.kind]; const b = w.businesses[r.businessId]; const owner = w.npcs[b.ownerId];
    const lt = coverFor(w, b);
    if (r.disrupted > 0) { r.disrupted--; r.lastIncome = 0; continue; }
    let income = 0;
    switch (r.kind) {
      case 'dealing': {
        const prod = r.product ?? 'green';
        const have = p.stash[prod];
        if (have > 0) { const demand = w.blocks[b.blockId].demand[prod] * (1 + (r.level - 1) * 0.5) * (0.6 + b.patronIds.length * 0.15); const sold = Math.min(have, Math.max(0, Math.round(demand))); p.stash[prod] -= sold; income = Math.round(sold * streetPrice(w, b.blockId, prod) * sellMult(w, prod) * yieldMult(w, r)); addHeat(w, sold * PRODUCT_INFO[prod].heat * 0.3, b.blockId); }
        break;
      }
      case 'counterfeiting': { const have = p.stash.counterfeit; if (have > 0) { const sold = Math.min(have, 5 + r.level * 4); p.stash.counterfeit -= sold; income = Math.round(sold * PRODUCT_INFO.counterfeit.price * 0.7 * (1 + (r.level - 1) * 0.15) * yieldMult(w, r)); } break; }
      case 'fencing': { const have = p.stash.hot_goods; if (have > 0) { const sold = Math.min(have, 6 + r.level * 4); p.stash.hot_goods -= sold; income = Math.round(sold * PRODUCT_INFO.hot_goods.price * 0.6 * (1 + (r.level - 1) * 0.15) * yieldMult(w, r)); } break; }
      case 'laundering': { const cap = Math.max(0, launderCapacity(w, r) - p.launderedToday); const amt = Math.min(p.dirty, cap); if (amt > 0) { p.dirty -= amt; const clean = Math.round(amt * LAUNDER_RATE); p.cash += clean; income = clean; summary.clean += clean; p.launderedToday += amt; } break; }
      case 'protection': {
        income = Math.round(racketIncome(w, r) * (1 + Math.min(0.3, collectors(w) * 0.1) + (lt ? 0.1 : 0))); // collectors (and a lieutenant) make sure it all arrives
        // owners under protection drift: fair rates build trust, high rates build resentment. A partner is crew: neither applies.
        if (!b.protection?.partner) {
          if ((b.protection?.rate ?? 0.15) <= 0.15) { if (rng.chance(0.2)) adjustRel(w, owner, { trust: 1 }); } else if (rng.chance(0.3)) adjustRel(w, owner, { trust: -1 });
          if (owner.rel.trust < -40 && owner.rel.fear < 30 && rng.chance(0.1)) { addHeat(w, 6, b.blockId); log(w, `${owner.name} at ${b.name} talked to the police. (+6 heat)`, 'bad', { businessId: b.id, npcId: owner.id }); }
        }
        break;
      }
      default: income = Math.round(racketIncome(w, r));
    }
    if (r.kind === 'loansharking' && r.float && rng.chance(0.05)) { const loss = Math.round(r.float * 0.1); r.float -= loss; log(w, `A borrower skipped town. Float down ${money(loss)}.`, 'bad', { racketId: r.id }); }
    r.lastIncome = income; districtTake[w.blocks[b.blockId].districtId] = (districtTake[w.blocks[b.blockId].districtId] ?? 0) + income;
    if (def.dirty) { p.dirty += income; summary.dirty += income; } else if (r.kind !== 'laundering') { p.cash += income; summary.clean += income; }
    addHeat(w, def.heat * 0.25 * r.level, b.blockId);
    // incidents
    // a partner minds their own place without being assigned to it, so it runs as safely as one with a runner
    const minded = !!r.runnerId || (r.kind === 'protection' && !!b.protection?.partner);
    const risk = def.risk * (1 + (r.level - 1) * 0.5) * (effectivePolice(w, b.blockId) / 50) * (minded ? 0.7 : lt ? LIEUTENANT.riskMult : 1.2);
    if (rng.chance(risk)) {
      if (rng.chance(0.5)) { r.disrupted = rng.int(1, 3); addHeat(w, 4, b.blockId); log(w, `Cops rolled through ${b.name}. ${def.label} shut for ${r.disrupted} day${r.disrupted > 1 ? 's' : ''}.`, 'bad', { businessId: b.id, racketId: r.id }); }
      else if (r.runnerId && rng.chance(0.4)) { const n = w.npcs[r.runnerId]; if (n.crew) { n.crew.status = 'jailed'; n.crew.statusDays = jailDays(w, 10); n.crew.assignment = undefined; r.runnerId = undefined; log(w, `${n.name} got picked up running the ${def.label.toLowerCase()} at ${b.name}. ${p.lawyer ? 'Your lawyer is on it.' : 'No lawyer, so it will be a while.'}`, 'bad', { npcId: n.id, businessId: b.id }); } }
      else { const loss = Math.round(income * 1.5); p.dirty = Math.max(0, p.dirty - loss); log(w, `Somebody robbed the ${def.label.toLowerCase()} at ${b.name}. ${money(loss)} gone.`, 'bad', { businessId: b.id }); }
    }
    // a player business or protected place with rackets pulls influence
    gain(b.blockId, r.kind === 'protection' ? 1.5 : 1);
  }

  // ---- productions ----
  for (const s of p.safehouseIds.map(id => w.safehouses[id])) {
    for (const pid of s.productionIds) {
      const pr = w.productions[pid]; const def = PRODUCTION_DEFS[pr.kind];
      if (pr.disrupted > 0) { pr.disrupted--; pr.lastOutput = 0; continue; }
      if (pr.stock <= 0) { pr.lastOutput = 0; continue; }
      pr.stock--;
      const recipe = recipeFor(pr);
      let out = Math.round(productionOutput(w, pr));
      const worker = pr.workerId ? w.npcs[pr.workerId] : foremanOf(w, pr.id);
      if (worker?.crew && worker.notes.includes('skims product')) out = Math.max(0, out - Math.ceil(out * 0.12)); // the ones you let get away with it
      const room = Math.max(0, s.capacity - stashTotal(s.stash));
      const made = Math.min(out, room);
      pr.quality = productionQuality(w, pr);
      addProduct(s, def.product, made, pr.quality); pr.lastOutput = made;
      if (made < out) log(w, `${s.name} is full. ${out - made} ${PRODUCT_INFO[def.product].label.toLowerCase()} wasted.`, 'warn', { blockId: s.blockId });
      addHeat(w, def.heat * 0.25 * (1 + (pr.level - 1) * PRODUCTION_LEVEL.heat) * (recipe?.heat ?? 1), s.blockId);
      if (rng.chance(def.risk * (recipe?.risk ?? 1) * (1 + (pr.level - 1) * 0.25) * (effectivePolice(w, s.blockId) / 60))) {
        pr.disrupted = rng.int(2, 4); addHeat(w, 5, s.blockId);
        log(w, `${pr.kind === 'still' ? 'The still blew a seal' : pr.kind === 'lab' ? 'Chemical fire at the lab' : 'Neighbours complained about the smell'} at ${s.name}. Down ${pr.disrupted} days.`, 'bad', { blockId: s.blockId });
        if (worker?.crew && rng.chance(0.3)) { worker.crew.status = 'jailed'; worker.crew.statusDays = jailDays(w, 12); worker.crew.assignment = undefined; pr.workerId = undefined; log(w, `The cops came with the fire department. ${worker.name} was inside.`, 'bad', { npcId: worker.id, blockId: s.blockId }); }
      }
    }
    const rent = s.squatted ? 0 : Math.round(SAFEHOUSE_TIERS[s.tier - 1].rent / 30); // nobody bills you for a place you took
    if (!rent) { /* squatted */ } else if (p.cash + p.dirty >= rent) spend(w, rent); else { addInfluence(w, s.blockId, PLAYER, -4); if (w.day % 5 === 0) log(w, `You are behind on rent at ${s.name}.`, 'warn', { blockId: s.blockId }); }
    gain(s.blockId, 2);
  }

  // ---- ops ----
  for (const id of p.opIds.slice()) {
    const o = w.ops[id]; if (!o) continue;
    if (o.status === 'planning') { o.daysLeft--; if (o.daysLeft <= 0) { o.status = 'ready'; log(w, `${o.kind.replace(/_/g, ' ')} is ready. Launch it when you want.`, 'info', { opId: o.id }); } }
    else if (o.status === 'ready' && o.launched) resolveOp(w, o, rng);
  }

  // ---- factions ----
  for (const f of Object.values(w.factions)) runFaction(w, f, rng);
  tickCrews(w, rng);
  tickLieutenants(w, rng, districtTake);

  // ---- police ----
  // the buildings decide how hard they are looking before anything is rolled against that
  tickAuthorities(w);
  const captain = Object.values(w.npcs).find(n => n.official?.kind === 'captain');
  const captainHelp = captain && captain.rel.trust >= 30 ? 1.5 : 0;
  if (p.heat >= 100) bust(w, rng);
  // a task force raids more often than a routine watch: the ladder has to cost something
  else if (p.heat > 60 && rng.chance(((p.heat - 60) / 150) * (nearPoliceAssets(w).length ? 1.5 : 1) * raidPressure(w))) raid(w, rng);
  p.heat = clamp(p.heat - (4 + captainHelp + p.heat * 0.03)); // old news cools fastest
  for (const b of Object.values(w.blocks)) b.heat = clamp(b.heat - 3);

  // ---- people's own business ----
  tickAgendas(w, rng); tickGossip(w, rng);
  tickHostages(w, rng);
  tickCases(w, rng); tickCommission(w, rng);

  // ---- relationship drift & influence decay ----
  const held = heldIds(w);
  for (const n of Object.values(w.npcs)) {
    if (!n.alive || held.has(n.id)) continue;   // a person in a cellar is not drifting back to normal
    if (n.rel.fear > 0 && w.day % 2 === 0) n.rel.fear = clamp(n.rel.fear - 1);
    if (n.rel.trust > 0 && !n.crew && w.day % 4 === 0 && n.faction !== PLAYER) n.rel.trust--;
    if (n.rel.trust < 0 && w.day % 3 === 0) n.rel.trust++;
  }
  // the day's influence, applied once per block so depth and tenure can multiply it, and rivals
  // pushed off ground you actually run
  for (const [blockId, base] of Object.entries(influenceGain)) applyDailyInfluence(w, blockId, base);
  updateTenure(w);

  for (const b of Object.values(w.blocks)) {
    const hasAsset = b.safehouseId && w.safehouses[b.safehouseId]?.owner === PLAYER || b.businessIds.some(id => { const z = w.businesses[id]; return z.ownedBy === 'player' || z.protection?.factionId === PLAYER; });
    if (!hasAsset && (b.influence[PLAYER] ?? 0) > 0) addInfluence(w, b.id, PLAYER, -2);
    // rival influence in a block slowly erodes if they have nothing there
    for (const f of Object.keys(b.influence)) if (f !== PLAYER && w.factions[f] && !w.factions[f].alive) delete b.influence[f];
  }

  // ---- reputation settles ----
  if (w.day % 3 === 0) { p.fear = clamp(p.fear - 1); }

  // ---- events, day summary, endgame ----
  p.ap = p.apMax; p.legworkMax = legworkFor(p.skills.wheels); p.legwork = p.legworkMax; p.launderedToday = 0; w.day++;
  const share = controlShare(w);
  if (!w.victory && share >= 0.6) { w.victory = true; log(w, `You run ${Math.round(share * 100)}% of ${w.placeName}. This is your city now.`, 'good'); }
  if (p.cash + p.dirty < -2000 && !p.businessIds.length && !p.racketIds.length && !p.crewIds.some(id => w.npcs[id].crew?.status !== 'dead')) {
    w.gameOver = { reason: 'broke', text: 'No money, no crew, no rackets. The city forgets your name.' };
  }
  log(w, `Day ${w.day}. Took in ${money(summary.clean)} clean, ${money(summary.dirty)} dirty. Paid out ${money(summary.spent)}. Heat ${Math.round(p.heat)}.`, 'info');
  drawEvents(w, rng);
  done();
  return w;
}

function spend(w: World, amount: number) {
  const fromDirty = Math.min(w.player.dirty, amount); w.player.dirty -= fromDirty; w.player.cash -= amount - fromDirty;
}

/** Blocks with a police station on them or next door. */
export function nearPolice(w: World, blockId: string): boolean {
  const b = w.blocks[blockId]; if (!b) return false;
  return b.tags.includes('police') || b.neighborIds.some(id => w.blocks[id]?.tags.includes('police'));
}
function nearPoliceAssets(w: World): ({ kind: 'racket'; id: string } | { kind: 'safehouse'; id: string })[] {
  const p = w.player;
  return [
    ...p.racketIds.filter(id => w.rackets[id] && nearPolice(w, w.businesses[w.rackets[id].businessId].blockId)).map(id => ({ kind: 'racket' as const, id })),
    ...p.safehouseIds.filter(id => w.safehouses[id] && nearPolice(w, w.safehouses[id].blockId)).map(id => ({ kind: 'safehouse' as const, id })),
  ];
}

function raid(w: World, rng: import('./rng').Rng) {
  const p = w.player;
  const targets = [...p.racketIds.map(id => ({ kind: 'racket' as const, id })), ...p.safehouseIds.map(id => ({ kind: 'safehouse' as const, id }))];
  if (!targets.length) return;
  const close = nearPoliceAssets(w); // the station down the street gets there first
  const t = close.length && rng.chance(0.7) ? rng.pick(close) : rng.pick(targets);
  if (t.kind === 'racket') {
    const r = w.rackets[t.id]; const b = w.businesses[r.businessId];
    r.disrupted = rng.int(3, 6); const fine = Math.round(500 + r.lastIncome * 4); spend(w, fine);
    if (r.runnerId) { const n = w.npcs[r.runnerId]; if (n.crew) { n.crew.status = 'jailed'; n.crew.statusDays = jailDays(w, 12); n.crew.assignment = undefined; r.runnerId = undefined; } }
    log(w, `RAID: police hit the ${RACKET_DEFS[r.kind].label.toLowerCase()} at ${b.name}. ${money(fine)} in fines and lawyers; shut ${r.disrupted} days.`, 'bad', { businessId: b.id, racketId: r.id });
    addMemory(w, b.blockId, 'raid', `The cops raided ${b.name}.`, { businessId: b.id, npcId: b.ownerId });
  } else {
    const s = w.safehouses[t.id];
    const lost = Math.round(stashTotal(s.stash) * (p.lawyer ? 0.3 : 0.6));
    for (const k of Object.keys(s.stash) as (keyof typeof s.stash)[]) s.stash[k] = Math.round(s.stash[k] * (1 - lost / Math.max(1, stashTotal(s.stash) || 1)));
    for (const pid of s.productionIds) w.productions[pid].disrupted = 4;
    log(w, `RAID: police tossed ${s.name}. Lost ${lost} units of product; productions down 4 days.`, 'bad', { blockId: s.blockId });
    addMemory(w, s.blockId, 'raid', `Police tossed a safehouse on this block.`);
  }
  p.heat = clamp(p.heat - 15);
}

function bust(w: World, rng: import('./rng').Rng) {
  const p = w.player; p.busts++;
  const lostDirty = Math.round(p.dirty * 0.8); p.dirty -= lostDirty;
  for (const k of Object.keys(p.stash) as (keyof typeof p.stash)[]) p.stash[k] = 0;
  let jailed = 0;
  for (const id of p.crewIds) { const n = w.npcs[id]; if (n.crew && n.crew.status !== 'dead' && rng.chance(p.lawyer ? 0.3 : 0.5)) { n.crew.status = 'jailed'; n.crew.statusDays = jailDays(w, 14); n.crew.assignment = undefined; jailed++; } }
  for (const id of p.racketIds) { const r = w.rackets[id]; if (r) { r.disrupted = 5; r.runnerId = undefined; } }
  for (const id of p.racketIds.slice()) if (w.rackets[id]?.kind === 'gambling_den' && rng.chance(0.5)) closeRacket(w, id);
  p.heat = 40; p.respect = clamp(p.respect - 10);
  if (w.blocks[p.homeBlockId]) addMemory(w, p.homeBlockId, 'bust', 'The task force took you away in front of everybody.');
  log(w, `BUSTED. The task force came through everything at once. ${money(lostDirty)} dirty cash and all product seized, ${jailed} of your people jailed, every racket dark for 5 days. Heat resets to 40.`, 'bad');
  for (const f of Object.values(w.factions)) if (f.alive) f.standing[PLAYER] = clamp(f.standing[PLAYER] - 5, -100, 100);
  void factionOf;
}
