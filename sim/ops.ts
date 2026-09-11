import { OP_DEFS } from '@content/rackets';
import type { Rng } from './rng';
import { opChance } from './select';
import { PLAYER, type Op, type World } from './types';
import { addHeat, addInfluence, adjustRel, clamp, jailDays, log, money, spreadRep } from './util';
import { freeOpCrew } from './reducer';

/** Resolve one launched op. Called from the tick. */
export function resolveOp(w: World, o: Op, rng: Rng) {
  const def = OP_DEFS[o.kind]; const p = w.player;
  const chance = opChance(w, o.kind, o.crewIds);
  const roll = rng.int(1, 100);
  const success = roll <= chance;
  const crew = o.crewIds.map(id => w.npcs[id]).filter(Boolean);
  const target = o.targetBusinessId ? w.businesses[o.targetBusinessId] : undefined;
  const blockId = target?.blockId ?? o.targetBlockId ?? (o.targetNpcId ? w.npcs[o.targetNpcId].homeBlockId : undefined);
  const res = { success, cash: 0, loot: {} as Partial<Record<string, number>>, heat: 0, text: '' };
  const margin = chance - roll; // positive = clean success

  if (success) {
    const [lo, hi] = def.payout;
    const value = Math.round(lo + (hi - lo) * rng.float() * (0.7 + Math.min(1, Math.max(0, margin) / 60)));
    res.heat = Math.round(def.heat * (margin > 30 ? 0.6 : 1));
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
        if (o.kind === 'robbery' && target) { adjustRel(w.npcs[target.ownerId], { fear: 20, trust: -30 }); target.condition = clamp(target.condition - 10); }
        break;
      }
      case 'heist_jeweller': case 'heist_warehouse': {
        const units = Math.max(5, Math.round(value / 100)); p.stash.hot_goods += units; res.loot = { hot_goods: units };
        res.text = `${def.label} at ${target?.name}: in and out. ${units} crates of hot goods (~${money(value)}). Fence them.`;
        break;
      }
      case 'insurance_fraud': {
        const payout = Math.round((target?.value ?? 0) * 1.1); p.cash += payout; res.cash = payout;
        if (target) { target.condition = 5; target.insured = false; target.flags.push('torched'); }
        res.text = `${target?.name} burns. The insurer pays ${money(payout)}. Nobody asks questions. Yet.`;
        break;
      }
      case 'smuggle_run': { const units = 25 + rng.int(0, 15); p.stash.booze += units; res.loot = { booze: units }; res.text = `The truck makes it in. ${units} cases of booze at cost.`; break; }
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
    res.heat = Math.round(def.heat * 1.4);
    const bad = -margin > 30; // badly failed
    const victim = crew.length ? rng.pick(crew) : undefined;
    let fate = '';
    if (victim?.crew) {
      const r = rng.float();
      if (bad && r < 0.35) { victim.crew.status = 'jailed'; victim.crew.statusDays = jailDays(w, 14); victim.crew.assignment = undefined; fate = `${victim.name} was arrested.`; }
      else if (r < 0.55) { victim.crew.status = 'injured'; victim.crew.statusDays = rng.int(3, 7); victim.crew.assignment = undefined; fate = `${victim.name} took a bullet and is laid up.`; }
      else if (bad && r < 0.65 && def.difficulty >= 55) { victim.crew.status = 'dead'; victim.crew.assignment = undefined; victim.alive = false; fate = `${victim.name} did not make it out.`; }
    }
    res.text = `${def.label}${target ? ` at ${target.name}` : ''} goes wrong. ${fate} ${bad ? 'Sirens everywhere.' : 'You get out with nothing.'}`;
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

export function successionOrDeath(w: World, f: import('./types').Faction) {
  const lt = f.lieutenantIds.map(id => w.npcs[id]).find(n => n.alive);
  if (lt) { f.bossId = lt.id; lt.role = 'boss'; f.lieutenantIds = f.lieutenantIds.filter(id => id !== lt.id); log(w, `${lt.name} takes over ${f.name}.`, 'warn', { factionId: f.id }); }
  else { f.alive = false; log(w, `${f.name} is finished. Their blocks are up for grabs.`, 'warn', { factionId: f.id }); for (const b of Object.values(w.blocks)) delete b.influence[f.id]; for (const b of Object.values(w.businesses)) if (b.protection?.factionId === f.id) b.protection = undefined; }
}
