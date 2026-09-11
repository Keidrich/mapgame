/** End of day. Everything that happens while the player sleeps. */
import { PRODUCTION_DEFS, PRODUCT_INFO, RACKET_DEFS, SAFEHOUSE_TIERS } from '@content/rackets';
import { launderCapacity, productionOutput, racketIncome, streetPrice } from './economy';
import { drawEvents } from './events';
import { runFaction } from './factions';
import { resolveOp } from './ops';
import { closeRacket, stashTotal } from './reducer';
import { controlShare } from './select';
import { PLAYER, type World } from './types';
import { addHeat, addInfluence, adjustRel, clamp, collectors, factionOf, jailDays, log, money, rngOf } from './util';

export function endDay(w: World): World {
  const { rng, done } = rngOf(w);
  const p = w.player;
  const summary = { clean: 0, dirty: 0, spent: 0 };

  // ---- crew upkeep ----
  for (const id of p.crewIds) {
    const n = w.npcs[id]; const c = n.crew; if (!c) continue;
    if (c.status === 'injured' || c.status === 'jailed') { c.statusDays--; if (c.statusDays <= 0) { c.status = 'idle'; log(w, `${n.name} is back.`, 'good', { npcId: n.id }); } }
    if (c.status === 'dead') continue;
    if (c.cut > 0) {
      if (p.cash + p.dirty >= c.cut) { spend(w, c.cut); summary.spent += c.cut; }
      else { c.loyalty = clamp(c.loyalty - 10); log(w, `You could not pay ${n.name}. (−10 loyalty)`, 'bad', { npcId: n.id }); }
    }
    if (c.assignment?.kind === 'guard') { addInfluence(w, c.assignment.blockId, PLAYER, 3); w.blocks[c.assignment.blockId].heat = clamp(w.blocks[c.assignment.blockId].heat + 0.5); }
    if (c.loyalty < 15 && rng.chance(0.2)) { p.crewIds = p.crewIds.filter(x => x !== n.id); n.crew = undefined; n.role = 'patron'; n.rel.trust = -30; log(w, `${n.name} walked. Nobody saw them go.`, 'bad', { npcId: n.id }); }
  }

  // ---- owned businesses ----
  for (const id of p.businessIds) {
    const b = w.businesses[id];
    const inc = Math.round(b.baseIncome * (b.condition / 100) * (b.flags.includes('owner_dead') ? 0.5 : 1));
    p.cash += inc; summary.clean += inc;
    if (b.condition < 100 && !b.flags.includes('torched')) b.condition = clamp(b.condition + 1);
    addInfluence(w, b.blockId, PLAYER, 1);
  }

  // ---- rackets ----
  for (const id of p.racketIds.slice()) {
    const r = w.rackets[id]; if (!r) continue;
    const def = RACKET_DEFS[r.kind]; const b = w.businesses[r.businessId]; const owner = w.npcs[b.ownerId];
    if (r.disrupted > 0) { r.disrupted--; r.lastIncome = 0; continue; }
    let income = 0;
    switch (r.kind) {
      case 'dealing': {
        const prod = r.product ?? 'green'; const have = p.stash[prod];
        if (have > 0) { const demand = w.blocks[b.blockId].demand[prod] * (1 + (r.level - 1) * 0.5) * (0.6 + b.patronIds.length * 0.15); const sold = Math.min(have, Math.max(0, Math.round(demand))); p.stash[prod] -= sold; income = Math.round(sold * streetPrice(w, b.blockId, prod)); addHeat(w, sold * PRODUCT_INFO[prod].heat * 0.3, b.blockId); }
        break;
      }
      case 'fencing': { const have = p.stash.hot_goods; if (have > 0) { const sold = Math.min(have, 6 + r.level * 4); p.stash.hot_goods -= sold; income = Math.round(sold * PRODUCT_INFO.hot_goods.price * 0.6 * (1 + (r.level - 1) * 0.15)); } break; }
      case 'laundering': { const cap = Math.max(0, launderCapacity(w, r) - p.launderedToday); const amt = Math.min(p.dirty, cap); if (amt > 0) { p.dirty -= amt; const clean = Math.round(amt * 0.85); p.cash += clean; income = clean; summary.clean += clean; p.launderedToday += amt; } break; }
      case 'protection': {
        income = Math.round(racketIncome(w, r) * (1 + Math.min(0.3, collectors(w) * 0.1))); // collectors make sure it all arrives
        // owners under protection drift: fair rates build trust, high rates build resentment
        if ((b.protection?.rate ?? 0.15) <= 0.15) { if (rng.chance(0.2)) adjustRel(owner, { trust: 1 }); } else if (rng.chance(0.3)) adjustRel(owner, { trust: -1 });
        if (owner.rel.trust < -40 && owner.rel.fear < 30 && rng.chance(0.1)) { addHeat(w, 6, b.blockId); log(w, `${owner.name} at ${b.name} talked to the police. (+6 heat)`, 'bad', { businessId: b.id, npcId: owner.id }); }
        break;
      }
      default: income = Math.round(racketIncome(w, r));
    }
    if (r.kind === 'loansharking' && r.float && rng.chance(0.05)) { const loss = Math.round(r.float * 0.1); r.float -= loss; log(w, `A borrower skipped town. Float down ${money(loss)}.`, 'bad', { racketId: r.id }); }
    r.lastIncome = income;
    if (def.dirty) { p.dirty += income; summary.dirty += income; } else if (r.kind !== 'laundering') { p.cash += income; summary.clean += income; }
    addHeat(w, def.heat * 0.25 * r.level, b.blockId);
    // incidents
    const risk = def.risk * (1 + (r.level - 1) * 0.5) * (w.blocks[b.blockId].police / 50) * (r.runnerId ? 0.7 : 1.2);
    if (rng.chance(risk)) {
      if (rng.chance(0.5)) { r.disrupted = rng.int(1, 3); addHeat(w, 4, b.blockId); log(w, `Cops rolled through ${b.name}. ${def.label} shut for ${r.disrupted} day${r.disrupted > 1 ? 's' : ''}.`, 'bad', { businessId: b.id, racketId: r.id }); }
      else if (r.runnerId && rng.chance(0.4)) { const n = w.npcs[r.runnerId]; if (n.crew) { n.crew.status = 'jailed'; n.crew.statusDays = jailDays(w, 10); n.crew.assignment = undefined; r.runnerId = undefined; log(w, `${n.name} got picked up running the ${def.label.toLowerCase()} at ${b.name}. ${p.lawyer ? 'Your lawyer is on it.' : 'No lawyer, so it will be a while.'}`, 'bad', { npcId: n.id, businessId: b.id }); } }
      else { const loss = Math.round(income * 1.5); p.dirty = Math.max(0, p.dirty - loss); log(w, `Somebody robbed the ${def.label.toLowerCase()} at ${b.name}. ${money(loss)} gone.`, 'bad', { businessId: b.id }); }
    }
    // a player business or protected place with rackets pulls influence
    addInfluence(w, b.blockId, PLAYER, r.kind === 'protection' ? 1.5 : 1);
  }

  // ---- productions ----
  for (const s of p.safehouseIds.map(id => w.safehouses[id])) {
    for (const pid of s.productionIds) {
      const pr = w.productions[pid]; const def = PRODUCTION_DEFS[pr.kind];
      if (pr.disrupted > 0) { pr.disrupted--; pr.lastOutput = 0; continue; }
      if (pr.stock <= 0) { pr.lastOutput = 0; continue; }
      pr.stock--;
      const out = Math.round(productionOutput(w, pr));
      const room = Math.max(0, s.capacity - stashTotal(s.stash));
      const made = Math.min(out, room);
      s.stash[def.product] += made; pr.lastOutput = made;
      if (made < out) log(w, `${s.name} is full. ${out - made} ${PRODUCT_INFO[def.product].label.toLowerCase()} wasted.`, 'warn', { blockId: s.blockId });
      addHeat(w, def.heat * 0.25, s.blockId);
      if (rng.chance(def.risk * (w.blocks[s.blockId].police / 60))) { pr.disrupted = rng.int(2, 4); addHeat(w, 5, s.blockId); log(w, `${pr.kind === 'still' ? 'The still blew a seal' : pr.kind === 'lab' ? 'Chemical fire at the lab' : 'Neighbours complained about the smell'} at ${s.name}. Down ${pr.disrupted} days.`, 'bad', { blockId: s.blockId }); }
    }
    const rent = Math.round(SAFEHOUSE_TIERS[s.tier - 1].rent / 30); // daily rent
    if (p.cash + p.dirty >= rent) spend(w, rent); else { addInfluence(w, s.blockId, PLAYER, -4); if (w.day % 5 === 0) log(w, `You are behind on rent at ${s.name}.`, 'warn', { blockId: s.blockId }); }
    addInfluence(w, s.blockId, PLAYER, 2);
  }

  // ---- ops ----
  for (const id of p.opIds.slice()) {
    const o = w.ops[id]; if (!o) continue;
    if (o.status === 'planning') { o.daysLeft--; if (o.daysLeft <= 0) { o.status = 'ready'; log(w, `${o.kind.replace(/_/g, ' ')} is ready. Launch it when you want.`, 'info', { opId: o.id }); } }
    else if (o.status === 'ready' && o.launched) resolveOp(w, o, rng);
  }

  // ---- factions ----
  for (const f of Object.values(w.factions)) runFaction(w, f, rng);

  // ---- police ----
  const captain = Object.values(w.npcs).find(n => n.official?.kind === 'captain');
  const captainHelp = captain && captain.rel.trust >= 30 ? 1.5 : 0;
  if (p.heat >= 100) bust(w, rng);
  else if (p.heat > 60 && rng.chance((p.heat - 60) / 150)) raid(w, rng);
  p.heat = clamp(p.heat - (4 + captainHelp + p.heat * 0.03)); // old news cools fastest
  for (const b of Object.values(w.blocks)) b.heat = clamp(b.heat - 3);

  // ---- relationship drift & influence decay ----
  for (const n of Object.values(w.npcs)) {
    if (!n.alive) continue;
    if (n.rel.fear > 0 && w.day % 2 === 0) n.rel.fear = clamp(n.rel.fear - 1);
    if (n.rel.trust > 0 && !n.crew && w.day % 4 === 0 && n.faction !== PLAYER) n.rel.trust--;
    if (n.rel.trust < 0 && w.day % 3 === 0) n.rel.trust++;
  }
  for (const b of Object.values(w.blocks)) {
    const hasAsset = b.safehouseId && w.safehouses[b.safehouseId]?.owner === PLAYER || b.businessIds.some(id => { const z = w.businesses[id]; return z.ownedBy === 'player' || z.protection?.factionId === PLAYER; });
    if (!hasAsset && (b.influence[PLAYER] ?? 0) > 0) addInfluence(w, b.id, PLAYER, -2);
    // rival influence in a block slowly erodes if they have nothing there
    for (const f of Object.keys(b.influence)) if (f !== PLAYER && w.factions[f] && !w.factions[f].alive) delete b.influence[f];
  }

  // ---- reputation settles ----
  if (w.day % 3 === 0) { p.fear = clamp(p.fear - 1); }

  // ---- events, day summary, endgame ----
  p.ap = p.apMax; p.launderedToday = 0; w.day++;
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

function raid(w: World, rng: import('./rng').Rng) {
  const p = w.player;
  const targets = [...p.racketIds.map(id => ({ kind: 'racket' as const, id })), ...p.safehouseIds.map(id => ({ kind: 'safehouse' as const, id }))];
  if (!targets.length) return;
  const t = rng.pick(targets);
  if (t.kind === 'racket') {
    const r = w.rackets[t.id]; const b = w.businesses[r.businessId];
    r.disrupted = rng.int(3, 6); const fine = Math.round(500 + r.lastIncome * 4); spend(w, fine);
    if (r.runnerId) { const n = w.npcs[r.runnerId]; if (n.crew) { n.crew.status = 'jailed'; n.crew.statusDays = jailDays(w, 12); n.crew.assignment = undefined; r.runnerId = undefined; } }
    log(w, `RAID: police hit the ${RACKET_DEFS[r.kind].label.toLowerCase()} at ${b.name}. ${money(fine)} in fines and lawyers; shut ${r.disrupted} days.`, 'bad', { businessId: b.id, racketId: r.id });
  } else {
    const s = w.safehouses[t.id];
    const lost = Math.round(stashTotal(s.stash) * (p.lawyer ? 0.3 : 0.6));
    for (const k of Object.keys(s.stash) as (keyof typeof s.stash)[]) s.stash[k] = Math.round(s.stash[k] * (1 - lost / Math.max(1, stashTotal(s.stash) || 1)));
    for (const pid of s.productionIds) w.productions[pid].disrupted = 4;
    log(w, `RAID: police tossed ${s.name}. Lost ${lost} units of product; productions down 4 days.`, 'bad', { blockId: s.blockId });
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
  log(w, `BUSTED. The task force came through everything at once. ${money(lostDirty)} dirty cash and all product seized, ${jailed} of your people jailed, every racket dark for 5 days. Heat resets to 40.`, 'bad');
  for (const f of Object.values(w.factions)) if (f.alive) f.standing[PLAYER] = clamp(f.standing[PLAYER] - 5, -100, 100);
  void factionOf;
}
