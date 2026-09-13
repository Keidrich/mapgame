import { RECIPES } from '@content/rackets';
import { successionOrDeath } from './politics';
import { caseWitnessOf, openCase, silenceWitness } from './cases';
import { addProduct, knownRecipes, unlockRecipe } from './production';
import { OP_APPROACHES, OP_DEFS } from '@content/rackets';
import type { Rng } from './rng';
import { opChance } from './select';
import { PLAYER, type Op, type World } from './types';
import { addHeat, addInfluence, adjustRel, clamp, jailDays, log, money, spreadRep } from './util';
import { freeOpCrew } from './reducer';
import { addMemory } from './people';
import { crewAt, dissolveCrew } from './crews';
import { claim, revealOne } from './abandoned';
import { take as takeHostage } from './hostages';

/** Resolve one launched op. Called from the tick. */
export function resolveOp(w: World, o: Op, rng: Rng) {
  const def = OP_DEFS[o.kind]; const p = w.player; const ap = o.approach ? OP_APPROACHES[o.approach] : undefined;
  const chance = opChance(w, o.kind, o.crewIds, o.approach);
  const roll = rng.int(1, 100);
  const success = roll <= chance;
  const crew = o.crewIds.map(id => w.npcs[id]).filter(Boolean);
  const target = o.targetBusinessId ? w.businesses[o.targetBusinessId] : undefined;
  const blockId = target?.blockId ?? o.targetBlockId ?? (o.targetNpcId ? w.npcs[o.targetNpcId].homeBlockId : undefined);
  const res = { success, cash: 0, loot: {} as Partial<Record<string, number>>, heat: 0, text: '' };
  const margin = chance - roll; // positive = clean success

  if (success) {
    const [lo, hi] = def.payout;
    const value = Math.round(lo + (hi - lo) * rng.float() * (0.7 + Math.min(1, Math.max(0, margin) / 60)) * (ap?.payout ?? 1));
    res.heat = Math.round(def.heat * (margin > 30 ? 0.6 : 1) * (ap?.heat ?? 1));
    if (o.insideId && w.npcs[o.insideId]) adjustRel(w.npcs[o.insideId], { trust: 5, respect: 5 });
    switch (o.kind) {
      case 'heist_bank': case 'heist_armored': case 'robbery': case 'raid_rival': case 'check_kiting': {
        p.dirty += value; res.cash = value; res.text = `${def.label} at ${target?.name ?? '?'}: clean. ${money(value)} in the bag.`;
        if (o.kind === 'raid_rival' && target) {
          const victims = new Set<string>();
          for (const rid of target.racketIds) { const r = w.rackets[rid]; if (r.owner !== PLAYER) { victims.add(r.owner); r.disrupted = Math.max(r.disrupted, 5); } }
          if (target.protection && target.protection.factionId !== PLAYER) victims.add(target.protection.factionId);
          target.condition = clamp(target.condition - 30);
          for (const v of victims) { const f = w.factions[v]; if (!f) continue; f.standing[PLAYER] -= 25; f.grudges.push(`raid:${target.id}`); addInfluence(w, target.blockId, v, -15); }
          addInfluence(w, target.blockId, PLAYER, 12); p.fear = clamp(p.fear + 4); p.respect = clamp(p.respect + 3);
        }
        if (o.kind === 'check_kiting' && target) target.flags.push('paper');
        if ((o.kind === 'heist_bank' || o.kind === 'heist_armored') && target) openCase(w, 'heist', `${target.name} job`, { businessId: target.id, blockId: target.blockId, opId: o.id }, o.crewIds, rng, margin > 30 ? 10 : 25);
        if (o.kind === 'robbery' && target) { adjustRel(w.npcs[target.ownerId], { fear: 20, trust: -30 }); target.condition = clamp(target.condition - 10); }
        break;
      }
      case 'heist_jeweller': case 'heist_warehouse': {
        const units = Math.max(5, Math.round(value / 100)); p.stash.hot_goods += units; res.loot = { hot_goods: units };
        res.text = `${def.label} at ${target?.name}: in and out. ${units} crates of hot goods (~${money(value)}). Fence them.`;
        if (o.kind === 'heist_jeweller' && target && margin < 30) openCase(w, 'heist', `${target.name} robbery`, { businessId: target.id, blockId: target.blockId, opId: o.id }, o.crewIds, rng, 15);
        break;
      }
      case 'insurance_fraud': {
        const payout = Math.round((target?.value ?? 0) * 1.1); p.cash += payout; res.cash = payout;
        if (target) { target.condition = 5; target.insured = false; target.flags.push('torched'); }
        res.text = `${target?.name} burns. The insurer pays ${money(payout)}. Nobody asks questions. Yet.`;
        if (target && margin < 40) openCase(w, 'arson', `${target.name} fire`, { businessId: target.id, blockId: target.blockId, opId: o.id }, o.crewIds, rng, 15);
        break;
      }
      case 'smuggle_run': { const units = 25 + rng.int(0, 15); addProduct(p, 'booze', units, 45); res.loot = { booze: units }; res.text = `The truck makes it in. ${units} cases of booze at cost.`; break; }
      case 'steal_formula': {
        const mine = new Set(p.safehouseIds.flatMap(id => w.safehouses[id]?.productionIds ?? []).map(id => w.productions[id]?.kind));
        const unknown = Object.keys(RECIPES).filter(id => !knownRecipes(w).includes(id));
        const pool = unknown.filter(id => mine.has(RECIPES[id].kind));
        const pick = pool.length ? rng.pick(pool) : unknown.length ? rng.pick(unknown) : undefined;
        if (pick) { unlockRecipe(w, pick, 'The crew comes back with a notebook and a sample.'); res.text = `${RECIPES[pick].label}: yours now.`; }
        else { const v = 1500 + rng.int(0, 1500); p.dirty += v; res.cash = v; res.text = `Nothing you did not already know, so they sold the notebook on. ${money(v)}.`; }
        break;
      }
      case 'hit': {
        const n = w.npcs[o.targetNpcId!]; n.alive = false;
        res.text = `${n.name} is found in the river. `;
        if (n.faction && w.factions[n.faction]) {
          const f = w.factions[n.faction];
          if (n.role === 'boss') { res.text += `${f.name} is headless. `; f.soldiers = Math.round(f.soldiers * 0.6); f.standing[PLAYER] = -100; f.stance[PLAYER] = 'war'; successionOrDeath(w, f); }
          else if (n.role === 'lieutenant') { f.lieutenantIds = f.lieutenantIds.filter(id => id !== n.id); f.standing[PLAYER] -= 40; f.grudges.push(`hit:${n.id}`); res.text += `${f.name} wants blood.`; }
          else { f.standing[PLAYER] -= 15; f.soldiers = Math.max(0, f.soldiers - 1); }
        }
        if (n.role === 'owner') { for (const b of Object.values(w.businesses)) if (b.ownerId === n.id) { b.flags.push('owner_dead'); b.condition = clamp(b.condition - 20); } }
        p.fear = clamp(p.fear + 10); spreadRep(w, n.homeBlockId, { fear: 12, trust: -5 }, 2);
        addMemory(w, n.homeBlockId, 'hit', `${n.name} was killed. Everybody knows who ordered it.`);
        if (caseWitnessOf(w, n.id)) silenceWitness(w, n.id, 'gone');
        openCase(w, 'hit', `${n.name.split(' ').slice(-1)[0]} killing`, { npcId: n.id, blockId: n.homeBlockId, opId: o.id }, o.crewIds, rng, o.approach === 'quiet' ? 10 : 25);
        break;
      }
      case 'frame': {
        const n = w.npcs[o.targetNpcId!]; const f = n.faction ? w.factions[n.faction] : undefined;
        n.alive = false; n.notes.push('Doing time on a case that was not theirs.');
        const years = 6 + rng.int(0, 9);
        res.text = `The cops kick in ${n.name}'s door and find exactly what your people left there. ${years} years. `;
        if (f) {
          const suspects = rng.chance(0.35 + Math.max(0, 5 - p.skills.brains) * 0.05);
          if (n.role === 'boss') { res.text += `${f.name} is headless. `; f.soldiers = Math.max(1, f.soldiers - 2); successionOrDeath(w, f); }
          else { f.lieutenantIds = f.lieutenantIds.filter(id => id !== n.id); f.soldiers = Math.max(1, f.soldiers - 2); }
          if (suspects) { f.standing[PLAYER] -= 25; f.grudges.push(`framed:${n.name.split(' ')[0]}`); res.text += `${f.short} do not believe in coincidences.`; openCase(w, 'frame', `${n.name.split(' ').slice(-1)[0]} plant`, { npcId: n.id, blockId: n.homeBlockId, opId: o.id }, o.crewIds, rng, 10); }
          else res.text += `${f.short} blame bad luck and a talkative cousin.`;
        }
        const captain = Object.values(w.npcs).find(x => x.official?.kind === 'captain'); if (captain) adjustRel(captain, { trust: 5 });
        p.heat = clamp(p.heat - 3); res.heat = Math.max(0, res.heat - 3);
        addMemory(w, n.homeBlockId, 'frame', `${n.name} went away on a case nobody around here believes.`);
        break;
      }
      case 'scout_block': {
        const d = o.targetDistrictId ? w.districts[o.targetDistrictId] : undefined;
        const found = d ? revealOne(w, d.id, rng) : undefined;
        if (found) { res.text = `Past the fences on ${d!.name} there is a whole block with nothing left on it: ${found.name}. Nobody has collected anything there in years.`; }
        else { res.text = `${d ? d.name : 'The district'} is walked end to end. Everything still standing has somebody in it.`; res.heat = Math.min(res.heat, 1); }
        break;
      }
      case 'claim_abandoned': {
        const b = w.blocks[o.targetBlockId!];
        claim(w, b);
        addInfluence(w, b.id, PLAYER, 45);
        if (o.approach === 'loud') { p.fear = clamp(p.fear + 4); spreadRep(w, b.id, { fear: 5 }); res.text = `You run the squatters off ${b.name} with bats and a lot of noise. The lots are yours.`; }
        else if (o.approach === 'inside') { const c = Object.values(w.npcs).find(x => x.official?.kind === 'councillor'); if (c) adjustRel(c, { trust: 4 }); res.text = `A file moves at City Hall and ${b.name} quietly becomes somebody else's problem. Yours.`; }
        else res.text = `You take ${b.name} over a few quiet nights. Nobody who was sleeping there wanted an argument.`;
        break;
      }
      case 'kidnap': {
        const n = w.npcs[o.targetNpcId!];
        const s = o.safehouseId ? w.safehouses[o.safehouseId] : w.safehouses[p.safehouseIds[0]];
        if (!s) { res.text = 'Nowhere to put them. The van drives around the block twice and goes home.'; break; }
        takeHostage(w, n, s);
        if (n.crew) { p.crewIds = p.crewIds.filter(id => id !== n.id); n.crew = undefined; }
        p.fear = clamp(p.fear + 6); spreadRep(w, n.homeBlockId, { fear: 8, trust: -5 });
        addMemory(w, n.homeBlockId, 'kidnap', `${n.name} went out for cigarettes and did not come back.`);
        if (n.faction && w.factions[n.faction]) { const f = w.factions[n.faction]; f.standing[PLAYER] = clamp(f.standing[PLAYER] - 10, -100, 100); }
        res.text = `${n.name} is in the back of a van and then in ${s.name}. Now you have to decide what they are worth.`;
        break;
      }
      case 'takeover': {
        const c = o.targetBlockId ? crewAt(w, o.targetBlockId) : undefined;
        if (c) {
          const name = c.name; const blk = w.blocks[c.blockId];
          addInfluence(w, blk.id, PLAYER, (blk.influence[c.id] ?? 40) + 10);
          dissolveCrew(w, c, 'taken');
          p.dirty += value; res.cash = value; p.fear = clamp(p.fear + 5); p.respect = clamp(p.respect + 4); spreadRep(w, blk.id, { fear: 8, respect: 3 });
          addMemory(w, blk.id, 'takeover', `${w.player.name}'s people ran the ${name} off the corner.`);
          res.text = `The ${name} are finished. ${blk.name} is yours, plus ${money(value)} from their stash. Their people are scared enough to listen.`;
        } else res.text = 'The corner was empty. Somebody got there first.';
        break;
      }
      case 'intimidate': {
        if (target) { const owner = w.npcs[target.ownerId]; adjustRel(owner, { fear: 30, trust: -10 }); target.condition = clamp(target.condition - 15); spreadRep(w, target.blockId, { fear: 6 }); p.fear = clamp(p.fear + 3);
          if (target.protection && target.protection.factionId !== PLAYER) { w.factions[target.protection.factionId].standing[PLAYER] -= 10; } }
        res.text = `Windows out, bats swung. ${target ? w.npcs[target.ownerId].name : 'The owner'} got the message.`;
        break;
      }
    }
    p.respect = clamp(p.respect + (def.difficulty >= 60 ? 6 : 2));
    for (const n of crew) if (n.crew) n.crew.loyalty = clamp(n.crew.loyalty + 5);
  } else {
    res.heat = Math.round(def.heat * 1.4 * (ap?.heat ?? 1));
    const bad = -margin > 30; // badly failed
    if (o.insideId && w.npcs[o.insideId]) { const ins = w.npcs[o.insideId]; ins.rel.trust = -50; ins.notes.push('Burned as an inside man.'); if (target) adjustRel(w.npcs[target.ownerId], { trust: -30, fear: 10 }); }
    if (o.approach === 'loud' && bad && crew.length && rng.chance(0.3)) { const v = rng.pick(crew); if (v.crew && v.crew.status !== 'dead') { v.crew.status = 'dead'; v.crew.assignment = undefined; v.alive = false; } }
    const victim = crew.length ? rng.pick(crew) : undefined;
    let fate = '';
    if (victim?.crew) {
      const r = rng.float();
      if (bad && r < 0.35) { victim.crew.status = 'jailed'; victim.crew.statusDays = jailDays(w, 14); victim.crew.assignment = undefined; fate = `${victim.name} was arrested.`; }
      else if (r < 0.55) { victim.crew.status = 'injured'; victim.crew.statusDays = rng.int(3, 7); victim.crew.assignment = undefined; fate = `${victim.name} took a bullet and is laid up.`; }
      else if (bad && r < 0.65 && def.difficulty >= 55) { victim.crew.status = 'dead'; victim.crew.assignment = undefined; victim.alive = false; fate = `${victim.name} did not make it out.`; }
    }
    res.text = `${def.label}${target ? ` at ${target.name}` : ''} goes wrong. ${fate} ${bad ? 'Sirens everywhere.' : 'You get out with nothing.'}`;
    if (o.kind === 'takeover' && o.targetBlockId) { const c = crewAt(w, o.targetBlockId); if (c) { c.strength = Math.min(10, c.strength + 1); c.mood -= 30; res.text += ` The ${c.name} are stronger for it.`; } }
    if (o.kind === 'claim_abandoned' && o.targetBlockId) { const b = w.blocks[o.targetBlockId]; if (b?.abandoned) { addHeat(w, 3, b.id); res.text += ` Whoever is living in ${b.name} is still living in ${b.name}.`; } }
    if (o.kind === 'kidnap' && o.targetNpcId) { const n = w.npcs[o.targetNpcId]; adjustRel(n, { fear: 30, trust: -70 }); n.grudge = { since: w.day, reason: 'you tried to put them in a van', spread: 0 }; if (n.faction && w.factions[n.faction]) { const f = w.factions[n.faction]; f.standing[PLAYER] -= 30; f.grudges.push(`grab:${n.name.split(' ')[0]}`); } addMemory(w, n.homeBlockId, 'kidnap', `Somebody tried to grab ${n.name} in the street and failed.`); }
    if (o.kind === 'frame' && o.targetNpcId) { const n = w.npcs[o.targetNpcId]; adjustRel(n, { trust: -50 }); if (n.faction && w.factions[n.faction]) { const f = w.factions[n.faction]; f.standing[PLAYER] -= 30; f.grudges.push(`frame:${n.name.split(' ')[0]}`); res.text += ` ${f.short} found the plant and know whose it was.`; } }
    if (o.kind === 'hit' && o.targetNpcId) { const n = w.npcs[o.targetNpcId]; adjustRel(n, { fear: 15, trust: -60 }); if (n.faction && w.factions[n.faction]) { w.factions[n.faction].standing[PLAYER] -= 30; w.factions[n.faction].grudges.push(`attempt:${n.id}`); } }
    if (o.kind === 'insurance_fraud' && target) { target.condition = clamp(target.condition - 40); target.insured = false; target.flags.push('arson_suspect'); res.heat += 10; res.text += ' The fire marshal is asking about you.'; }
    for (const n of crew) if (n.crew) n.crew.loyalty = clamp(n.crew.loyalty - 8);
  }
  addHeat(w, res.heat, blockId);
  o.status = success ? 'done' : 'failed'; o.result = res;
  freeOpCrew(w, o);
  w.player.opIds = w.player.opIds.filter(id => id !== o.id);
  log(w, res.text + (res.heat ? ` (+${res.heat} heat)` : ''), success ? 'good' : 'bad', { opId: o.id, businessId: target?.id, blockId });
}

export { successionOrDeath } from './politics';
