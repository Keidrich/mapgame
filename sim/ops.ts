import { RECIPES } from '@content/rackets';
import { successionOrDeath } from './politics';
import { caseWitnessOf, openCase, silenceWitness } from './cases';
import { addProduct, knownRecipes, unlockRecipe } from './production';
import { addCard, cyberHeat, learnSecret, rollCard, startTap } from './cyber';
import { authorityOf } from './authority';
import { openIntel, routeFor } from './intel';
import { ROUTE } from '@content/intel';
import { POSTURES } from '@content/authority';
import { buyDownAttention, killCase, openCaseById, springFrom } from './authority-ops';
import { CARD_TIERS } from '@content/cyber';
import { CRYPTO_WASH, OP_APPROACHES, OP_DEFS, PRISON_WING, WARD } from '@content/rackets';
import type { Rng } from './rng';
import { opChance } from './select';
import { complicationHeat, complicationSwing, maybeComplicate } from './complications';
import { kitHeatMult } from './items';
import { PLAYER, type Op, type World } from './types';
import { addHeat, addInfluence, adjustRel, clamp, jailDays, log, money, spreadRep } from './util';
import { remember } from './ledger';
import { doFavour } from './standing';
import { freeOpCrew, shutBusiness } from './reducer';
import { addMemory } from './people';
import { crewAt, dissolveCrew } from './crews';
import { claim, revealOne } from './abandoned';
import { take as takeHostage } from './hostages';

/** Resolve one launched op. Called from the tick. */
export function resolveOp(w: World, o: Op, rng: Rng) {
  const def = OP_DEFS[o.kind]; const p = w.player; const ap = o.approach ? OP_APPROACHES[o.approach] : undefined;

  // Big jobs can stop halfway and ask. When one does, the op does not resolve now: it waits for
  // the answer, and `resolveConfrontation` calls straight back into here with it recorded. Tier
  // 0 and 1 never get here at all — a street job stays one fast roll, on purpose.
  if (maybeComplicate(w, o, rng)) return;

  const swing = complicationSwing(o, !!o.complication?.won, o.complication?.answered ?? 'absent');
  const chance = clamp(opChance(w, o.kind, o.crewIds, o.approach, { businessId: o.targetBusinessId, npcId: o.targetNpcId, caseId: o.targetCaseId, factionId: o.targetFactionId }) + swing, 3, 97);
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
    // the kit you carried changes what the job leaves behind, the same way the approach does
    res.heat = Math.round(def.heat * (margin > 30 ? 0.6 : 1) * (ap?.heat ?? 1) * kitHeatMult(w) * complicationHeat(o)
      * (o.kind === 'heist_armored' && routeFor(w, o.targetBusinessId) ? ROUTE.heatMult : 1));
    if (o.insideId && w.npcs[o.insideId]) adjustRel(w, w.npcs[o.insideId], { trust: 5, respect: 5 });
    switch (o.kind) {
      case 'mugging': {
        const n = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        p.dirty += value; res.cash = value;
        let extra = '';
        if (n) {
          adjustRel(w, n, { fear: 20, trust: -25 }, 'violence');
          remember(w, n, 'harm', 'Somebody put them against a wall and went through their pockets. They did not see who.');
          addMemory(w, n.homeBlockId, 'mugging', `Somebody put ${n.name} against a wall and went through their pockets.`, { npcId: n.id });
          // a pocket sometimes has a card in it: everything on the wire starts here
          if (rng.chance(0.45)) { const card = rollCard(w, rng, n.id); addCard(w, card); extra = ` There was a ${CARD_TIERS[card.tier].label} in the wallet.`; }
        }
        res.text = `${n?.name ?? 'They'} never saw who it was. ${money(value)} and a bad night for them.${extra}`;
        break;
      }
      case 'rat': {
        const n = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        if (!n) { res.text = 'Nothing there to get into.'; break; }
        n.ratted = w.day;
        remember(w, n, 'intel', 'You have been through their books.');
        // a bank teller or a depot driver is worth more than a secret: what they know is a
        // standing skim or a route, and that is what these two buildings are for on every other day
        const opened = openIntel(w, n, rng);
        if (opened) { res.text = `Inside ${n.name}'s business, and it turns out to be worth rather more than a look.`; cyberHeat(w, 2, n.homeBlockId); break; }
        if (o.mode === 'tap') {
          startTap(w, n);
          res.text = `You are inside ${n.name}'s business and you are staying there. Every day it runs is a day something useful comes back — and a day closer to them finding it.`;
        } else {
          const secret = learnSecret(w, n, rng);
          res.text = secret
            ? `One good look through ${n.name}'s business. ${secret.text}`
            : `You get inside ${n.name}'s business and find nothing anybody would pay for. Some people really are that dull.`;
        }
        cyberHeat(w, 2, n.homeBlockId);
        break;
      }
      case 'wire_fraud': {
        const n = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        p.dirty += value; res.cash = value;
        if (n) { adjustRel(w, n, { trust: -20 }); n.notes.push('Money went missing from their arrangements.'); }
        cyberHeat(w, Math.round(def.heat / 2), n?.homeBlockId);
        res.text = `${money(value)} moves out of ${n?.name ?? 'their'} arrangements and into somewhere quiet. It will be weeks before anybody reconciles it.`;
        break;
      }
      case 'digital_strike': {
        const biz2 = target;
        const hit = biz2?.racketIds.map(id => w.rackets[id]).filter(r => r && r.owner !== PLAYER) ?? [];
        const days = rng.int(3, 6);
        for (const r of hit) r.disrupted = Math.max(r.disrupted, days);
        p.dirty += value; res.cash = value;
        const owner = biz2?.protection?.factionId ? w.factions[biz2.protection.factionId] : undefined;
        if (owner) { owner.standing[PLAYER] = clamp(owner.standing[PLAYER] - 4, -100, 100); }
        cyberHeat(w, def.heat, biz2?.blockId);
        res.text = hit.length
          ? `The tills at ${biz2?.name ?? 'their place'} stop ringing and the book stops balancing. ${hit.length} of their operations are dead for ${days} days, and nobody has a face to blame.`
          : `${biz2?.name ?? 'The place'} is dark for a few days. Nothing of theirs was running there worth killing.`;
        break;
      }
      case 'ambush_soldiers': {
        const f = o.targetFactionId ? w.factions[o.targetFactionId] : undefined;
        p.dirty += value; res.cash = value;
        if (f) {
          f.soldiers = Math.max(0, f.soldiers - rng.int(1, 3));
          f.standing[PLAYER] = clamp(f.standing[PLAYER] - 8, -100, 100);
          f.grudges.push('ambushed');
        }
        res.text = `You took ${f?.short ?? 'them'} on a street of your choosing for once. ${money(value)} off them and two of theirs in the hospital.`;
        spreadRep(w, blockId ?? p.currentBlockId, { respect: 4, fear: 4 }, 1, 'property');
        break;
      }
      case 'defend_racket': {
        const biz2 = target;
        const held = biz2?.racketIds.map(id => w.rackets[id]).filter(r => r?.owner === PLAYER) ?? [];
        for (const r of held) { r.threatened = undefined; r.disrupted = 0; }
        if (biz2) addInfluence(w, biz2.blockId, PLAYER, 6);
        res.text = `Your people were sitting in ${biz2?.name ?? 'the place'} when the muscle arrived. They turned round and left. Nobody is marking it now.`;
        spreadRep(w, blockId ?? p.currentBlockId, { respect: 3 });
        break;
      }
      case 'war_strike': {
        const n = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        const f = n?.faction ? w.factions[n.faction] : undefined;
        if (n) { n.alive = false; }
        if (f) {
          f.soldiers = Math.max(0, f.soldiers - 2);
          f.standing[PLAYER] = clamp(f.standing[PLAYER] - 15, -100, 100);
          f.lieutenantIds = f.lieutenantIds.filter(id => id !== n?.id);
          if (n && f.bossId === n.id) successionOrDeath(w, f);
          f.grudges.push(`war_strike:${n?.id ?? ''}`);
        }
        res.text = `${n?.name ?? 'Their lieutenant'} is dead, and everybody knows whose war it was. ${f?.short ?? 'They'} are down a man they could not spare.`;
        spreadRep(w, blockId ?? p.currentBlockId, { fear: 8 }, 2, 'violence');
        openCase(w, 'hit', `The shooting of ${n?.name ?? 'a lieutenant'}`, { npcId: n?.id, opId: o.id, blockId }, o.crewIds, rng);
        break;
      }
      case 'armed_intimidation': {
        const owner = target ? w.npcs[target.ownerId] : undefined;
        if (owner) adjustRel(w, owner, { fear: 26 + Math.round(p.skills.muscle / 2), trust: -10 }, 'violence');
        if (target) { target.condition = clamp(target.condition - 8); addMemory(w, target.blockId, 'armed', `Somebody showed ${owner?.name ?? 'the owner'} a gun in ${target.name}.`, { npcId: owner?.id, businessId: target.id }); }
        spreadRep(w, blockId ?? p.currentBlockId, { fear: 6 }, 1, 'violence');
        res.text = `Nobody in ${target?.name ?? 'the place'} is going to forget what was under your coat. ${owner?.name ?? 'The owner'} understood it the first time.`;
        break;
      }
      // ---- the law, pushed back on ----
      case 'buy_down': {
        const n = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        const a = n ? authorityOf(w, n) : undefined;
        const dropped = n ? buyDownAttention(w, n, true) : 0;
        if (n) adjustRel(w, n, { trust: 6 });
        res.text = dropped
          ? `${n?.name ?? 'They'} takes the envelope and finds somewhere else to look. ${a?.name ?? 'The building'} eases off — attention down ${dropped}, and they are ${a ? POSTURES[a.posture].label.toLowerCase() : 'quieter'} now.`
          : `${n?.name ?? 'They'} takes the envelope. Nothing visibly changes, but you have a name inside now.`;
        break;
      }
      case 'spring_crew': {
        const n = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        const owed = n ? springFrom(n) : 0;
        res.text = `${n?.name ?? 'Your man'} walks out ${owed} day${owed === 1 ? '' : 's'} early, blinking. Nobody at the desk can explain it and nobody is going to try. They will not forget who came for them.`;
        if (n) spreadRep(w, n.homeBlockId, { respect: 3 });
        break;
      }
      case 'buy_case': {
        const file = openCaseById(w, o.targetCaseId);
        if (file) killCase(w, file, true, rng);
        res.text = file
          ? `The ${file.title} is closed. Not solved — closed. A box goes downstairs and a detective gets a different desk.`
          : 'Whatever you were reaching for is not there any more.';
        break;
      }
      // ---- paper, patience, and things that should not be moving ----
      case 'long_con': case 'staged_accident': case 'shell_company': case 'charity_front': {
        const clean = o.kind === 'shell_company' || o.kind === 'charity_front';
        if (clean) { p.cash += value; } else { p.dirty += value; }
        res.cash = value;
        const mark = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        if (mark) adjustRel(w, mark, { trust: -35, fear: 4 });
        if (o.kind === 'charity_front') { p.respect = clamp(p.respect + 4); spreadRep(w, blockId ?? p.currentBlockId, { respect: 4 }); }
        res.text = o.kind === 'long_con'
          ? `${mark?.name ?? 'They'} signs the last of it without reading it. ${money(value)}, and a person who will spend a long time working out what happened.`
          : o.kind === 'staged_accident' ? `A claim goes in, an adjuster shrugs, and ${money(value)} comes out. Nobody was really hurt, which was the difficult part.`
          : o.kind === 'shell_company' ? `Invoices go one way and ${money(value)} comes back the other, all of it explainable.`
          : `The collection does very well. ${money(value)} clean, and the city thinks better of you for it.`;
        break;
      }
      case 'counterfeit_run': case 'dockside_pickup': case 'convoy_run': {
        const kind2 = def.lootKind ?? 'hot_goods';
        const units = Math.max(1, Math.round((def.difficulty / 4) * (0.7 + rng.float() * 0.8)));
        addProduct(p, kind2, units);
        res.loot = { [kind2]: units };
        res.text = o.kind === 'counterfeit_run'
          ? `${units} units off the run, and they look right enough to move.`
          : o.kind === 'dockside_pickup' ? `The boat is early and gone again inside twenty minutes. ${units} units into the stash.`
          : `Four vans, one night, nobody stopped. ${units} units through in a single move — a quarter's work in an evening.`;
        break;
      }
      case 'hijack_load': case 'heist_containers': case 'heist_gallery': {
        const kind3 = def.lootKind ?? 'hot_goods';
        const units = Math.max(1, Math.round(value / 220));
        addProduct(p, kind3, units);
        res.loot = { [kind3]: units };
        res.text = `${def.label}${target ? ` at ${target.name}` : ''}: away clean with ${units} units. It needs fencing before it is money.`;
        break;
      }
      case 'heist_payroll': case 'heist_countroom': {
        p.dirty += value; res.cash = value;
        res.text = o.kind === 'heist_payroll'
          ? `The bag changes hands in a yard nobody overlooks. ${money(value)}.`
          : `You were in the count room while it was being counted. ${money(value)}, and everybody in that building knows it was somebody who had been inside before.`;
        if (o.kind === 'heist_countroom') openCase(w, 'heist', `The count room at ${target?.name ?? 'the club'}`, { businessId: target?.id, opId: o.id, blockId }, o.crewIds, rng);
        break;
      }
      case 'heist_bank': case 'heist_armored': case 'robbery': case 'armed_robbery': case 'raid_rival': case 'check_kiting': {
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
        if (o.kind === 'robbery' && target) { adjustRel(w, w.npcs[target.ownerId], { fear: 20, trust: -30 }, 'property'); target.condition = clamp(target.condition - 10); }
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
        if (n.role === 'owner') { for (const b of Object.values(w.businesses)) if (b.ownerId === n.id && !b.shut) { b.flags.push('owner_dead'); b.condition = clamp(b.condition - 20); } }
        p.fear = clamp(p.fear + 10); spreadRep(w, n.homeBlockId, { fear: 12, trust: -5 }, 2, 'grave');
        addMemory(w, n.homeBlockId, 'hit', `${n.name} was killed. Everybody knows who ordered it.`, { npcId: n.id });
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
        const captain = Object.values(w.npcs).find(x => x.official?.kind === 'captain'); if (captain) adjustRel(w, captain, { trust: 5 });
        p.heat = clamp(p.heat - 3); res.heat = Math.max(0, res.heat - 3);
        addMemory(w, n.homeBlockId, 'frame', `${n.name} went away on a case nobody around here believes.`, { npcId: n.id });
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
        if (o.approach === 'loud') { p.fear = clamp(p.fear + 4); spreadRep(w, b.id, { fear: 5 }, 1, 'violence'); res.text = `You run the squatters off ${b.name} with bats and a lot of noise. The lots are yours.`; }
        else if (o.approach === 'inside') { const c = Object.values(w.npcs).find(x => x.official?.kind === 'councillor'); if (c) adjustRel(w, c, { trust: 4 }); res.text = `A file moves at City Hall and ${b.name} quietly becomes somebody else's problem. Yours.`; }
        else res.text = `You take ${b.name} over a few quiet nights. Nobody who was sleeping there wanted an argument.`;
        break;
      }
      case 'kidnap': {
        const n = w.npcs[o.targetNpcId!];
        const s = o.safehouseId ? w.safehouses[o.safehouseId] : w.safehouses[p.safehouseIds[0]];
        if (!s) { res.text = 'Nowhere to put them. The van drives around the block twice and goes home.'; break; }
        takeHostage(w, n, s);
        if (n.crew) { p.crewIds = p.crewIds.filter(id => id !== n.id); n.crew = undefined; }
        p.fear = clamp(p.fear + 6); spreadRep(w, n.homeBlockId, { fear: 8, trust: -5 }, 2, 'violence');
        addMemory(w, n.homeBlockId, 'kidnap', `${n.name} went out for cigarettes and did not come back.`, { npcId: n.id });
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
          p.dirty += value; res.cash = value; p.fear = clamp(p.fear + 5); p.respect = clamp(p.respect + 4); spreadRep(w, blk.id, { fear: 8, respect: 3 }, 2, 'violence');
          addMemory(w, blk.id, 'takeover', `${w.player.name}'s people ran the ${name} off the corner.`);
          res.text = `The ${name} are finished. ${blk.name} is yours, plus ${money(value)} from their stash. Their people are scared enough to listen.`;
        } else res.text = 'The corner was empty. Somebody got there first.';
        break;
      }
      case 'intimidate': {
        if (target) { const owner = w.npcs[target.ownerId]; adjustRel(w, owner, { fear: 30, trust: -10 }, 'property'); remember(w, owner, 'harm', `Windows out at ${target.name}, bats swung.`); target.condition = clamp(target.condition - 15); spreadRep(w, target.blockId, { fear: 6 }, 1, 'property'); p.fear = clamp(p.fear + 3);
          if (target.protection && target.protection.factionId !== PLAYER) { w.factions[target.protection.factionId].standing[PLAYER] -= 10; } }
        res.text = `Windows out, bats swung. ${target ? w.npcs[target.ownerId].name : 'The owner'} got the message.`;
        break;
      }

      // ============================================================ the crime pass
      // Every case below says who paid, what it cost and who found out. None of them says how a
      // thing was done, and none of them should ever start to.

      // ---- street work. It comes back as goods, not money, which is what a fence is for.
      case 'porch_piracy': case 'bike_ring': case 'copper_strip': {
        const units = Math.max(1, Math.round(value / 80));
        p.stash.hot_goods += units; res.loot = { hot_goods: units };
        res.text = o.kind === 'porch_piracy'
          ? `A morning behind the vans and ${units} boxes in the back of yours. Nobody on that street reports the same thing twice.`
          : o.kind === 'bike_ring' ? `${units} frames off the racks in one night. The good ones are worth what a car was.`
          : `${units} loads out of the walls of a building nobody was watching. It weighs more than it pays.`;
        break;
      }
      case 'squatter_scheme': {
        const blk = o.targetBlockId ? w.blocks[o.targetBlockId] : undefined;
        p.dirty += value; res.cash = value;
        if (blk) {
          // you are the only authority in that building, which is influence whether you wanted it or not
          addInfluence(w, blk.id, PLAYER, 8);
          spreadRep(w, blk.id, { fear: 4, trust: -6 }, 1, 'property');
          addMemory(w, blk.id, 'squat', `Somebody is collecting rent on the empty building on ${blk.name}, and it is not the council.`);
        }
        res.text = `Forty people in a building with no landlord, paying every Friday. ${money(value)}.`;
        break;
      }
      case 'sim_swap': {
        const n = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        p.dirty += value; res.cash = value;
        // it happened on the wire, so it lands on the half of your heat that scrubbing can touch
        cyberHeat(w, Math.round(def.heat * 0.6), n?.homeBlockId);
        if (n) {
          adjustRel(w, n, { trust: -20, fear: 8 }, 'property');
          remember(w, n, 'harm', 'Their phone stopped working for an afternoon and things moved that they did not move.');
        }
        res.text = `${n?.name ?? 'They'} spend the afternoon on hold to somebody who cannot help them. ${money(value)} while they wait.`;
        break;
      }

      // ---- paper and professionals. Cash, and somebody who signed something.
      case 'vape_bootleg': case 'stream_piracy': case 'betting_app': case 'straw_purchase': case 'resort_fraud': case 'boiler_room': {
        p.dirty += value; res.cash = value;
        res.text = {
          vape_bootleg: `Cartons under a hundred counters by the end of the week. ${money(value)}, and every shopkeeper on the round knows your name now.`,
          stream_piracy: `Half a district pays somebody a month for something that was never theirs to sell. ${money(value)}.`,
          betting_app: `The book runs all night in everybody's pocket and never opens a door. ${money(value)}.`,
          straw_purchase: `Other people's names on paperwork for stock that was never theirs. ${money(value)}, and a row of signatures nobody will be answering the phone about.`,
          resort_fraud: `The room signs because the room is signing. ${money(value)}, and a coach party that finds out in April.`,
          boiler_room: `Twenty phones, three weeks and ${money(value)}. The company was a filing cabinet, and the filing cabinet is gone.`,
        }[o.kind];
        break;
      }
      case 'match_fixing': {
        const n = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        p.dirty += value; res.cash = value;
        if (n) {
          // they took your money to lose, which is a thing you now know about them for ever
          adjustRel(w, n, { trust: -8, fear: 12 }, 'words');
          remember(w, n, 'deal', 'They took money to lose, and you are the one holding that.');
        }
        res.text = `It goes the way it was paid to go, in the fourth. ${money(value)} across three books, none of them yours.`;
        break;
      }
      case 'synth_identity': {
        // paper rather than cash in a bag: it comes out clean, and a name that is not yours takes
        // a little of the city's attention off the one that is
        p.cash += value; res.cash = value;
        p.heat = clamp(p.heat - 4); res.heat = Math.max(0, res.heat - 2);
        res.text = `A name with a history, a rating and a signature, and nobody behind it. ${money(value)} clean, and a little less attention on your own name.`;
        break;
      }

      // ---- organised: a client, a commission, or a cost you do not get back.
      case 'illegal_dumping': {
        const d = o.targetDistrictId ? w.districts[o.targetDistrictId] : undefined;
        p.dirty += value; res.cash = value;
        if (d?.blockIds.length) {
          const where = w.blocks[d.blockIds[0]];
          // the district does not find out for years, so this is trust bleeding rather than fear
          spreadRep(w, where.id, { trust: -4 }, 2, 'property');
          addMemory(w, where.id, 'dumping', `Barrels went into the ground somewhere on ${d.name} and nobody will say whose.`);
        }
        res.text = `The barrels go away. ${money(value)} from a company that will never know where, in ${d?.name ?? 'somebody else\'s district'}.`;
        break;
      }
      case 'arson_hire': {
        // Deliberately not insurance_fraud: somebody else's building, somebody else's insurer, and
        // a fee from a client instead of a payout from a policy. You end up with cash and an owner
        // who knows exactly what happened, rather than cash and a claim form.
        p.dirty += value; res.cash = value;
        if (target) {
          target.condition = 5; target.insured = false; target.flags.push('torched');
          for (const rid of target.racketIds) { const r = w.rackets[rid]; if (r) r.disrupted = Math.max(r.disrupted, 8); }
          const owner = w.npcs[target.ownerId];
          adjustRel(w, owner, { fear: 30, trust: -40 }, 'violence');
          remember(w, owner, 'harm', `${target.name} burned down in the night. Nobody was ever charged.`);
          spreadRep(w, target.blockId, { fear: 10, trust: -6 }, 2, 'violence');
          addMemory(w, target.blockId, 'fire', `${target.name} went up in the night. The street has its own opinion about why.`, { businessId: target.id });
          p.fear = clamp(p.fear + 6);
          if (margin < 40) openCase(w, 'arson', `${target.name} fire`, { businessId: target.id, blockId: target.blockId, opId: o.id }, o.crewIds, rng, 20);
        }
        res.text = `${target?.name ?? 'The building'} burns, and the man who wanted it gone pays ${money(value)} without ever meeting you.`;
        break;
      }
      case 'bust_out': {
        // The only op in the game that spends something you cannot buy back. Everything the name
        // will carry is ordered, sold, and never paid for; what is left does not open again. The
        // payout is the biggest on the board because the asset is gone with it — see `shutBusiness`.
        p.dirty += value; res.cash = value;
        if (target) {
          const lost = target.value;
          shutBusiness(w, target, 'busted_out');
          openCase(w, 'fraud', `creditors of ${target.name}`, { businessId: target.id, blockId: target.blockId, opId: o.id }, o.crewIds, rng, margin > 30 ? 15 : 30);
          res.text = `Everything ${target.name}'s name would carry is ordered, sold and never paid for. ${money(value)} out of it, ${money(lost)} of business gone for good. The doors do not open again.`;
        } else res.text = `${money(value)} out of a name that does not mean anything any more.`;
        break;
      }
      case 'bid_rigging': {
        const n = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        p.cash += value; res.cash = value;   // public money arrives in the light
        if (n) { adjustRel(w, n, { trust: 6 }); remember(w, n, 'deal', 'A contract went the way they said it would go.'); }
        res.text = `${n?.name ?? 'The committee'} reads a name out and it is yours. ${money(value)} of public money, all of it explainable.`;
        break;
      }
      case 'campaign_wash': {
        // No payout: you spent the money and what you bought is a person. The trust goes in through
        // `adjustRel` like everybody else's, so `officialTrust` picks it up wherever it is already
        // read — buying down a case, jail time, the paperwork route into a derelict block.
        const n = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        if (n) {
          adjustRel(w, n, { trust: 18, respect: 6 });
          doFavour(w, n, 'their campaign, paid for through names that were not yours');
          remember(w, n, 'favour', 'Their campaign was paid for through a hundred names, none of them yours.');
          if (n.official) n.official.corruption = clamp(n.official.corruption + 10);
        }
        res.text = `The money arrives from a hundred people who have never met each other. ${n?.name ?? 'The office'} wins, and takes your calls afterwards.`;
        break;
      }
      case 'prison_supply': {
        const n = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        p.dirty += value; res.cash = value;
        if (n?.crew) {
          n.crew.loyalty = clamp(n.crew.loyalty + 12);
          remember(w, n, 'favour', 'Somebody kept the wing supplied the whole time they were inside.');
          // and it keeps paying while they are in there. Ends by itself the day they walk out.
          p.wing = { npcId: n.id, since: w.day, perDay: Math.max(1, Math.round(value * PRISON_WING.share)) };
        }
        res.text = `Everything in there costs ten times what it costs out here, and ${n?.name ?? 'somebody of yours'} is the one handing it out. ${money(value)}, and it keeps coming while they are inside.`;
        break;
      }
      case 'corporate_extortion': {
        const n = o.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
        p.dirty += value; res.cash = value;
        if (n) {
          adjustRel(w, n, { fear: 25, trust: -20 }, 'property');
          remember(w, n, 'harm', 'Somebody read the thing they most wanted unread, and then said a number.');
        }
        res.text = `Not a man behind a counter: a quarterly number, and something in it they would rather nobody read. ${money(value)}, invoiced.`;
        break;
      }

      // ---- the two that reach the whole city.
      case 'crypto_wash': {
        const cap = CRYPTO_WASH.base + p.skills.tech * CRYPTO_WASH.perTech;
        const amt = Math.min(p.dirty, cap);
        const clean = Math.round(amt * CRYPTO_WASH.rate);
        p.dirty -= amt; p.cash += clean; res.cash = clean;
        cyberHeat(w, Math.round(def.heat * 0.5));
        res.text = amt > 0
          ? `${money(amt)} goes in one shape and ${money(clean)} comes back in another, through enough hands that nobody is sure which were yours.`
          : 'Everything set up, and nothing dirty to put through it. The people involved are paid either way.';
        break;
      }
      case 'vote_buying': {
        // The Commission tie: a chair is counted in blocks where you are the name on the street,
        // and a ward bought door by door moves every block in the district at once.
        const d = o.targetDistrictId ? w.districts[o.targetDistrictId] : undefined;
        if (d) {
          for (const id of d.blockIds) addInfluence(w, id, PLAYER, WARD.perBlock);
          if (d.blockIds.length) {
            spreadRep(w, d.blockIds[0], { respect: 6 }, 2, 'words');
            addMemory(w, d.blockIds[0], 'ward', `The ward went one way and everybody on it knows why. Nobody can prove it.`);
          }
        }
        const councillor = Object.values(w.npcs).find(x => x.official?.kind === 'councillor' && x.alive);
        if (councillor) adjustRel(w, councillor, { trust: WARD.councillor, respect: 6 });
        p.respect = clamp(p.respect + WARD.respect);
        res.text = `${d?.name ?? 'The ward'} votes the way it was paid to, door by door. Everybody can see it and nobody can prove it.`;
        break;
      }
    }
    p.respect = clamp(p.respect + (def.difficulty >= 60 ? 6 : 2));
    for (const n of crew) if (n.crew) n.crew.loyalty = clamp(n.crew.loyalty + 5);
  } else {
    res.heat = Math.round(def.heat * 1.4 * (ap?.heat ?? 1) * kitHeatMult(w) * complicationHeat(o));
    const bad = -margin > 30; // badly failed
    if (o.insideId && w.npcs[o.insideId]) { const ins = w.npcs[o.insideId]; ins.rel.trust = -50; ins.notes.push('Burned as an inside man.'); if (target) adjustRel(w, w.npcs[target.ownerId], { trust: -30, fear: 10 }, 'property'); }
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
    if (o.kind === 'kidnap' && o.targetNpcId) { const n = w.npcs[o.targetNpcId]; adjustRel(w, n, { fear: 30, trust: -70 }, 'grave'); n.grudge = { since: w.day, reason: 'you tried to put them in a van', spread: 0 }; if (n.faction && w.factions[n.faction]) { const f = w.factions[n.faction]; f.standing[PLAYER] -= 30; f.grudges.push(`grab:${n.name.split(' ')[0]}`); } addMemory(w, n.homeBlockId, 'kidnap', `Somebody tried to grab ${n.name} in the street and failed.`); }
    if (o.kind === 'frame' && o.targetNpcId) { const n = w.npcs[o.targetNpcId]; adjustRel(w, n, { trust: -50 }); if (n.faction && w.factions[n.faction]) { const f = w.factions[n.faction]; f.standing[PLAYER] -= 30; f.grudges.push(`frame:${n.name.split(' ')[0]}`); res.text += ` ${f.short} found the plant and know whose it was.`; } }
    if (o.kind === 'hit' && o.targetNpcId) { const n = w.npcs[o.targetNpcId]; adjustRel(w, n, { fear: 15, trust: -60 }, 'grave'); if (n.faction && w.factions[n.faction]) { w.factions[n.faction].standing[PLAYER] -= 30; w.factions[n.faction].grudges.push(`attempt:${n.id}`); } }
    if (o.kind === 'war_strike' && o.targetNpcId) { const n = w.npcs[o.targetNpcId]; const f = n.faction ? w.factions[n.faction] : undefined; if (f) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 20, -100, 100); f.soldiers += 2; f.grudges.push(`war_strike_failed:${n.id}`); res.text += ` ${f.short} know exactly who sent them, and they are hiring.`; } }
    if (o.kind === 'defend_racket' && target) { const held = target.racketIds.map(id => w.rackets[id]).filter(r => r?.owner === PLAYER); for (const r of held) r.disrupted = Math.max(r.disrupted, 3); res.text += ' They came through anyway.'; }
    if (o.kind === 'insurance_fraud' && target) { target.condition = clamp(target.condition - 40); target.insured = false; target.flags.push('arson_suspect'); res.heat += 10; res.text += ' The fire marshal is asking about you.'; }
    // ---- the crime pass: a failed job here costs more than the trip home
    if (o.kind === 'arson_hire' && target) { target.condition = clamp(target.condition - 20); adjustRel(w, w.npcs[target.ownerId], { fear: 15, trust: -25 }, 'violence'); openCase(w, 'arson', `the fire at ${target.name}`, { businessId: target.id, blockId: target.blockId, opId: o.id }, o.crewIds, rng, 20); res.text += ' It goes out before it takes, and the marshal can see where it started.'; }
    if (o.kind === 'bust_out' && target) { target.condition = clamp(target.condition - 25); target.flags.push('paper'); openCase(w, 'fraud', `the accounts at ${target.name}`, { businessId: target.id, blockId: target.blockId, opId: o.id }, o.crewIds, rng, 25); res.text += ` ${target.name} keeps its doors, and its suppliers stop taking orders.`; }
    if (o.kind === 'prison_supply' && o.targetNpcId) { const n = w.npcs[o.targetNpcId]; if (n?.crew?.status === 'jailed') { n.crew.statusDays += 7; n.crew.loyalty = clamp(n.crew.loyalty - 10); res.text += ` ${n.name} was searched on the way back to the wing, and it goes on their sheet.`; } }
    if (o.kind === 'campaign_wash' && o.targetNpcId) { const n = w.npcs[o.targetNpcId]; adjustRel(w, n, { trust: -12 }); res.text += ` ${n.name} gives the money back in front of a camera.`; }
    if (o.kind === 'vote_buying' && o.targetDistrictId) { const d = w.districts[o.targetDistrictId]; if (d?.blockIds.length) { spreadRep(w, d.blockIds[0], { trust: -8, respect: -4 }, 2, 'words'); addMemory(w, d.blockIds[0], 'ward', 'Somebody was going door to door with money, and the ward talked about it for weeks.'); } }
    if ((o.kind === 'sim_swap' || o.kind === 'crypto_wash') && !success) cyberHeat(w, Math.round(def.heat * 0.5));
    for (const n of crew) if (n.crew) n.crew.loyalty = clamp(n.crew.loyalty - 8);
  }
  addHeat(w, res.heat, blockId);
  o.status = success ? 'done' : 'failed'; o.result = res;
  freeOpCrew(w, o);
  w.player.opIds = w.player.opIds.filter(id => id !== o.id);
  log(w, res.text + (res.heat ? ` (+${res.heat} heat)` : ''), success ? 'good' : 'bad', { opId: o.id, businessId: target?.id, blockId });
}

export { successionOrDeath } from './politics';
