import { BUSINESS_DEFS } from '@content/businesses';
import { OP_DEFS, PRODUCTION_DEFS, PRODUCT_INFO, RACKET_DEFS, RACKET_UPGRADE_COST, SAFEHOUSE_TIERS } from '@content/rackets';
import type { Action, Affordance, SitDownOffer } from './actions';
import { emptyStash, stanceFor } from './generate';
import { populateChunk } from './populate';
import { launderCapacity, streetPrice } from './economy';
import { resolveEventOption } from './events';
import { endDay } from './tick';
import { PLAYER, type Business, type Id, type Npc, type Op, type Racket, type Safehouse, type World } from './types';
import { activeCrewCount, officialTrust, addHeat, addInfluence, adjustRel, clamp, factionOf, log, money, nid, rngOf, spreadRep, takeCash } from './util';

const no = (reason: string): Affordance => ({ ok: false, reason });
const yes = (cost?: { ap?: number; cash?: number }): Affordance => ({ ok: true, cost });

// ---------------------------------------------------------------- can()
export function can(w: World, a: Action): Affordance {
  if (w.gameOver) return no('The game is over.');
  const p = w.player;
  if (a.type !== 'end_day' && a.type !== 'resolve_event' && a.type !== 'rename' && a.type !== 'populate_chunk' && w.pendingEvents.length) return no('Deal with what is in front of you first.');
  const ap = (n: number) => (p.ap >= n ? null : `Needs ${n} AP. You are out of time today.`);
  const cash = (n: number) => (p.cash >= n ? null : `Needs ${money(n)} clean cash.`);
  const npc = (id: Id) => w.npcs[id];
  const biz = (id: Id) => w.businesses[id];

  switch (a.type) {
    case 'visit': { const n = npc(a.npcId); if (!n?.alive) return no('They are gone.'); const r = ap(1); return r ? no(r) : yes({ ap: 1 }); }
    case 'gift': { const n = npc(a.npcId); if (!n?.alive) return no('They are gone.'); if (a.amount < 50) return no('That is an insult, not a gift.'); const r = cash(a.amount); return r ? no(r) : yes({ cash: a.amount }); }
    case 'threaten': { const n = npc(a.npcId); if (!n?.alive) return no('They are gone.'); if (n.official) return no('Threatening an official is a bad idea. Bribe them.'); if (n.role === 'boss') return no('You do not threaten a boss. You go to war with him.'); const r = ap(1); return r ? no(r) : yes({ ap: 1 }); }
    case 'recruit': {
      const n = npc(a.npcId); if (!n?.alive) return no('They are gone.');
      if (n.crew) return no('Already in your crew.');
      if (!['patron', 'owner', 'soldier', 'fixer'].includes(n.role)) return no('Not the recruiting type.');
      if (n.faction && n.role === 'soldier') return no('They belong to someone else.');
      const r = ap(1); if (r) return no(r);
      const willing = n.rel.trust >= 20 || (n.traits.includes('coward') && n.rel.fear >= 60) || n.rel.respect >= 50;
      if (!willing) return no('They do not trust you enough yet. Visit, gift, or get known.');
      if (bedsLeft(w) <= 0) return no('No room. Rent or upgrade a safehouse.');
      return yes({ ap: 1 });
    }
    case 'fire': { const n = npc(a.npcId); if (!n?.crew) return no('Not your crew.'); return yes(); }
    case 'assign': {
      const n = npc(a.npcId); if (!n?.crew) return no('Not your crew.');
      if (n.crew.status === 'dead') return no('Dead.'); if (n.crew.status === 'jailed') return no('In jail.'); if (n.crew.status === 'injured') return no('Injured. Give them a few days.');
      if (!a.assignment) return yes();
      if (a.assignment.kind === 'racket') { const r = w.rackets[a.assignment.racketId]; if (!r || r.owner !== PLAYER) return no('Not your racket.'); if (r.runnerId && r.runnerId !== n.id) return no('Someone already runs it.'); }
      if (a.assignment.kind === 'production') { const pr = w.productions[a.assignment.productionId]; if (!pr) return no('No such production.'); if (pr.workerId && pr.workerId !== n.id) return no('Someone already works it.'); }
      if (a.assignment.kind === 'op') { const o = w.ops[a.assignment.opId]; if (!o || o.status !== 'planning') return no('That op is not being planned.'); }
      return yes();
    }
    case 'bribe_official': { const n = npc(a.npcId); if (!n?.official) return no('Not an official.'); if (a.amount < 500) return no('Officials do not get out of bed for less than $500.'); const r = cash(a.amount); return r ? no(r) : yes({ cash: a.amount }); }

    case 'shakedown': {
      const b = biz(a.businessId); if (!b) return no('No such place.');
      if (b.ownedBy === 'player') return no('You own it. Shake yourself down?');
      if (!BUSINESS_DEFS[b.type].rackets.includes('protection')) return no('Nothing to shake here.');
      if (b.lastShakedownDay !== undefined && w.day - b.lastShakedownDay < 3) return no('You were just here. Give it a few days.');
      const r = ap(1); return r ? no(r) : yes({ ap: 1 });
    }
    case 'protect': {
      const b = biz(a.businessId); if (!b) return no('No such place.');
      if (b.ownedBy === 'player') return no('You own it already.');
      if (!BUSINESS_DEFS[b.type].rackets.includes('protection')) return no('Not the kind of place that pays protection.');
      if (b.protection?.factionId === PLAYER) return no('Already paying you.');
      if (a.rate < 0.05 || a.rate > 0.4) return no('Rate must be 5–40%.');
      const r = ap(1); if (r) return no(r);
      const owner = npc(b.ownerId);
      if (owner.rel.fear + owner.rel.respect < owner.nerve * 0.6) return no(`${owner.name} is not scared of you yet. Shake them down or send a message first.`);
      return yes({ ap: 1 });
    }
    case 'buy_business': {
      const b = biz(a.businessId); if (!b) return no('No such place.');
      if (b.ownedBy === 'player') return no('Already yours.');
      if (!BUSINESS_DEFS[b.type].valueMult) return no('Not for sale. Ever.');
      if (b.ownedBy !== 'npc') return no('A faction owns this. Take it at a sit-down or by force.');
      const owner = npc(b.ownerId);
      const r = cash(a.offer); if (r) return no(r);
      if (owner.traits.includes('honest') && p.heat > 60) return no(`${owner.name} will not sell to someone this hot.`);
      const need = b.value * (owner.rel.trust >= 30 ? 0.9 : owner.rel.fear >= 60 ? 0.8 : 1.15) * (officialTrust(w, 'councillor') >= 40 ? 0.85 : 1);
      if (a.offer < need) return no(`Not enough. ${owner.name} wants about ${money(need)}${owner.rel.trust < 30 ? ' (less if they trusted you)' : ''}.`);
      return yes({ cash: a.offer });
    }
    case 'sell_business': { const b = biz(a.businessId); if (b?.ownedBy !== 'player') return no('Not yours.'); return yes(); }
    case 'insure': { const b = biz(a.businessId); if (b?.ownedBy !== 'player') return no('Not yours.'); if (b.insured) return no('Already insured.'); const c = Math.round(b.value * 0.08); const r = cash(c); return r ? no(r) : yes({ cash: c }); }
    case 'repair': { const b = biz(a.businessId); if (b?.ownedBy !== 'player') return no('Not yours.'); if (b.condition >= 95) return no('Nothing to fix.'); const c = Math.round((100 - b.condition) * b.value / 400); const r = cash(c); return r ? no(r) : yes({ cash: c }); }

    case 'start_racket': {
      const b = biz(a.businessId); if (!b) return no('No such place.');
      const def = RACKET_DEFS[a.kind];
      if (a.kind === 'protection') return no('Use Protect for that.');
      if (!BUSINESS_DEFS[b.type].rackets.includes(a.kind)) return no(`A ${BUSINESS_DEFS[b.type].label.toLowerCase()} cannot host ${def.label.toLowerCase()}.`);
      if (b.racketIds.some(id => w.rackets[id].kind === a.kind)) return no('Already running here.');
      if (b.ownedBy !== 'player' && b.protection?.factionId !== PLAYER) return no('You need to own the place or have it under your protection.');
      if (a.kind === 'dealing' && !a.product) return no('Pick a product to move.');
      const r = cash(def.setupCost); if (r) return no(r);
      const r2 = ap(1); if (r2) return no(r2);
      return yes({ cash: def.setupCost, ap: 1 });
    }
    case 'upgrade_racket': { const r = w.rackets[a.racketId]; if (r?.owner !== PLAYER) return no('Not yours.'); if (r.level >= 3) return no('Maxed out.'); const c = RACKET_UPGRADE_COST[r.level]; const rr = cash(c); return rr ? no(rr) : yes({ cash: c }); }
    case 'close_racket': { const r = w.rackets[a.racketId]; if (r?.owner !== PLAYER) return no('Not yours.'); return yes(); }
    case 'fund_racket': { const r = w.rackets[a.racketId]; if (r?.owner !== PLAYER || r.kind !== 'loansharking') return no('Only loansharking takes a float.'); if (a.amount <= 0) return no('Amount?'); if (p.cash + p.dirty < a.amount) return no('Not enough cash (dirty is fine).'); return yes(); }

    case 'rent_safehouse': {
      const b = w.blocks[a.blockId]; if (!b) return no('No such block.');
      if (b.safehouseId) return no('There is already a safehouse on this block.');
      const c = SAFEHOUSE_TIERS[0].rent; const r = cash(c); if (r) return no(r);
      const ctrl = factionOf(w, a.blockId);
      if (ctrl && ctrl !== PLAYER && (w.factions[ctrl].stance[PLAYER] === 'war' || w.factions[ctrl].stance[PLAYER] === 'beef')) return no(`${w.factions[ctrl].name} would burn it down the same night.`);
      return yes({ cash: c });
    }
    case 'upgrade_safehouse': { const s = w.safehouses[a.safehouseId]; if (s?.owner !== PLAYER) return no('Not yours.'); if (s.tier >= 3) return no('Maxed out.'); const c = SAFEHOUSE_TIERS[s.tier].rent; const r = cash(c); return r ? no(r) : yes({ cash: c }); }
    case 'start_production': {
      const s = w.safehouses[a.safehouseId]; if (s?.owner !== PLAYER) return no('Not yours.');
      if (s.productionIds.length >= s.tier) return no(`A tier ${s.tier} safehouse fits ${s.tier} production${s.tier > 1 ? 's' : ''}. Upgrade it.`);
      if (s.productionIds.some(id => w.productions[id].kind === a.kind)) return no('Already set up here.');
      const c = PRODUCTION_DEFS[a.kind].setupCost; const r = cash(c); return r ? no(r) : yes({ cash: c });
    }
    case 'restock_production': { const pr = w.productions[a.productionId]; if (!pr) return no('No such production.'); if (a.days < 1) return no('Days?'); const c = PRODUCTION_DEFS[pr.kind].ingredientCost * a.days; if (p.cash + p.dirty < c) return no(`Needs ${money(c)}.`); return yes({ cash: c }); }
    case 'close_production': { const pr = w.productions[a.productionId]; return pr ? yes() : no('No such production.'); }
    case 'move_stash': {
      if (a.amount <= 0) return no('Amount?');
      const from = a.from === 'player' ? p.stash : w.safehouses[a.from]?.stash; const to = a.to === 'player' ? p.stash : w.safehouses[a.to]?.stash;
      if (!from || !to) return no('Bad stash.');
      if ((from[a.product] ?? 0) < a.amount) return no('Not that much there.');
      if (a.to !== 'player') { const s = w.safehouses[a.to]; if (stashTotal(s.stash) + a.amount > s.capacity) return no('Safehouse is full.'); }
      return yes();
    }
    case 'sell_product': {
      if (a.amount <= 0) return no('Amount?'); if ((p.stash[a.product] ?? 0) < a.amount) return no('You are not carrying that much.');
      const r = ap(1); if (r) return no(r);
      return yes({ ap: 1 });
    }
    case 'launder': { if (a.amount <= 0) return no('Amount?'); if (p.dirty < a.amount) return no('Not that much dirty cash.'); const cap = launderCapLeft(w); if (cap <= 0) return no('No laundering capacity left today. Start a laundering racket.'); return yes(); }

    case 'plan_op': {
      const def = OP_DEFS[a.kind];
      if (a.crewIds.length < def.minCrew) return no(`Needs at least ${def.minCrew} crew.`);
      if (a.crewIds.length > def.maxCrew) return no(`Too many. Max ${def.maxCrew}.`);
      for (const id of a.crewIds) { const n = npc(id); if (!n?.crew || n.crew.status !== 'idle') return no(`${n?.name ?? 'Someone'} is not available.`); }
      if (def.cost) { const r = cash(def.cost); if (r) return no(r); }
      if (def.target === 'business') {
        const b = a.targetBusinessId ? biz(a.targetBusinessId) : undefined; if (!b) return no('Pick a target.');
        if (def.ownBusiness && b.ownedBy !== 'player') return no('Must be a place you own.');
        if (a.kind === 'insurance_fraud' && !b.insured) return no('Insure it first.');
        if (def.targetTypes && !def.targetTypes.includes(b.type)) return no('Wrong kind of target.');
        if (!def.ownBusiness && b.ownedBy === 'player') return no('That is yours.');
      }
      if (def.target === 'npc' && !a.targetNpcId) return no('Pick a target.');
      if (def.target === 'npc') { const n = npc(a.targetNpcId!); if (!n?.alive) return no('Already dead.'); if (n.official) return no('Killing an official ends careers. Not available.'); }
      const r = ap(1); if (r) return no(r);
      return yes({ ap: 1, cash: def.cost });
    }
    case 'launch_op': { const o = w.ops[a.opId]; if (!o) return no('No such op.'); if (o.status !== 'ready') return no(o.status === 'planning' ? `Still planning. ${o.daysLeft} day${o.daysLeft === 1 ? '' : 's'} left.` : 'Done.'); return yes(); }
    case 'abort_op': { const o = w.ops[a.opId]; if (!o || (o.status !== 'planning' && o.status !== 'ready')) return no('Nothing to abort.'); return yes(); }

    case 'sit_down': {
      const f = w.factions[a.factionId]; if (!f?.alive) return no('They are finished.');
      const r = ap(2); if (r) return no(r);
      if (f.stance[PLAYER] === 'war' && p.respect < 20) return no('They will not sit down with a nobody during a war. Earn respect or bleed them first.');
      if (a.offer.kind === 'cede_block' && factionOf(w, a.offer.blockId) !== PLAYER) return no('You do not control that block.');
      if (a.offer.kind === 'joint_racket' && w.businesses[a.offer.businessId]?.ownedBy !== 'player') return no('You do not own that place.');
      if (a.offer.kind === 'demand_block' && factionOf(w, a.offer.blockId) !== a.factionId) return no('They do not control that block.');
      return yes({ ap: 2 });
    }
    case 'pay_tribute': { const f = w.factions[a.factionId]; if (!f?.alive) return no('They are finished.'); if (a.amount < 200) return no('Insulting.'); if (p.cash + p.dirty < a.amount) return no('Not enough cash.'); return yes(); }
    case 'declare': {
      const f = w.factions[a.factionId]; if (!f?.alive) return no('They are finished.');
      if (a.stance === 'peace') return no('Peace is negotiated at a sit-down, not declared.');
      if (f.stance[PLAYER] === a.stance) return no(`Already at ${a.stance}.`);
      if (a.stance === 'war' && w.player.crewIds.length < 2) return no('A war with no crew is a funeral.');
      return yes();
    }
    case 'hire_lawyer': { if (p.lawyer) return no('Already on retainer.'); const r = cash(5000); return r ? no(r) : yes({ cash: 5000 }); }
    case 'resolve_event': { const e = w.pendingEvents.find(e => e.id === a.eventId); if (!e) return no('No such event.'); const o = e.options.find(o => o.id === a.optionId); if (!o) return no('No such option.'); if (o.costCash && p.cash < o.costCash) return no(`Needs ${money(o.costCash)}.`); if (o.costAp && p.ap < o.costAp) return no(`Needs ${o.costAp} AP.`); return yes({ ap: o.costAp, cash: o.costCash }); }
    case 'end_day': return w.pendingEvents.length ? no('Resolve the events first.') : yes();
    case 'populate_chunk': return w.chunks[a.chunk.key] ? no('Already populated.') : yes();
    case 'rename': return a.name.trim() ? yes() : no('Name?');
  }
}

// ---------------------------------------------------------------- dispatch()
export function dispatch(prev: World, a: Action): World {
  const check = can(prev, a);
  if (!check.ok) { const w = structuredClone(prev); log(w, check.reason, 'warn'); return w; }
  const w: World = structuredClone(prev);
  const p = w.player;
  if (check.cost?.ap) p.ap -= check.cost.ap;
  const { rng, done } = rngOf(w);
  const npc = (id: Id) => w.npcs[id];

  switch (a.type) {
    case 'visit': {
      const n = npc(a.npcId);
      const charm = p.skills.charm;
      const gain = 3 + Math.round(charm / 2) + (n.traits.includes('quiet') ? -1 : 0);
      adjustRel(n, { trust: gain, respect: 2 });
      const biz = n.favouriteBusinessIds[0] ? w.businesses[n.favouriteBusinessIds[0]] : undefined;
      let extra = '';
      if (n.role === 'patron' && n.rel.trust >= 30 && rng.chance(0.5)) {
        const tip = patronTip(w, n, rng); if (tip) { extra = ` ${tip}`; }
      }
      if (n.official && n.rel.trust >= 20) extra = ' They mention, unofficially, that a donation would be remembered.';
      log(w, `You spend time with ${n.name}${biz ? ` at ${biz.name}` : ''}. (+${gain} trust)${extra}`, 'info', { npcId: n.id, businessId: biz?.id });
      break;
    }
    case 'gift': {
      const n = npc(a.npcId); takeCash(w, a.amount);
      const greedy = n.traits.includes('greedy') ? 1.5 : n.traits.includes('honest') ? 0.5 : 1;
      const gain = Math.round(Math.min(30, Math.sqrt(a.amount) / 2) * greedy);
      adjustRel(n, { trust: gain, respect: Math.round(gain / 3) });
      log(w, `${n.name} takes your ${money(a.amount)}. (+${gain} trust)`, 'money', { npcId: n.id });
      break;
    }
    case 'threaten': {
      const n = npc(a.npcId);
      const force = p.skills.muscle * 6 + p.fear + activeCrewCount(w) * 5 + n.rel.fear * 0.5;
      if (force + rng.int(0, 40) > n.nerve) {
        const fear = 12 + Math.round(p.skills.muscle) + (n.traits.includes('coward') ? 15 : 0);
        adjustRel(n, { fear, trust: -8 }); p.fear = clamp(p.fear + 1); addHeat(w, 1, n.homeBlockId);
        log(w, `${n.name} gets the message. (+${fear} fear)`, 'info', { npcId: n.id });
      } else {
        adjustRel(n, { trust: -10, respect: -3, fear: 4 }); addHeat(w, 2, n.homeBlockId);
        log(w, `${n.name} does not back down. ${n.traits.includes('hothead') ? 'They are looking for a fight now.' : 'Word gets around that you can be ignored.'} (+4 fear anyway)`, 'bad', { npcId: n.id });
        if (n.faction && w.factions[n.faction]) w.factions[n.faction].standing[PLAYER] -= 5;
      }
      break;
    }
    case 'recruit': {
      const n = npc(a.npcId);
      const cut = 30 + Math.round((n.skills.muscle + n.skills.brains + n.skills.charm + n.skills.wheels + n.skills.tech) * 3);
      n.crew = { loyalty: clamp(40 + n.rel.trust / 2), cut, status: 'idle', statusDays: 0, joinedDay: w.day };
      n.role = 'crew'; p.crewIds.push(n.id);
      for (const bid of n.favouriteBusinessIds) { const b = w.businesses[bid]; b.patronIds = b.patronIds.filter(id => id !== n.id); }
      if (Object.values(w.businesses).some(b => b.ownerId === n.id)) { /* owner keeps managing */ }
      log(w, `${n.name} joins your crew. Wants ${money(cut)}/day.`, 'good', { npcId: n.id });
      break;
    }
    case 'fire': {
      const n = npc(a.npcId); if (!n.crew) break;
      const angry = n.crew.loyalty < 40;
      p.crewIds = p.crewIds.filter(id => id !== n.id);
      clearAssignment(w, n);
      n.role = 'patron'; n.crew = undefined; adjustRel(n, { trust: angry ? -40 : -10 });
      if (angry && rng.chance(0.3)) { addHeat(w, 8); log(w, `${n.name} leaves bitter and talks to the wrong people. (+8 heat)`, 'bad', { npcId: n.id }); }
      else log(w, `${n.name} is out.`, 'info', { npcId: n.id });
      break;
    }
    case 'assign': {
      const n = npc(a.npcId); if (!n.crew) break;
      clearAssignment(w, n);
      if (a.assignment) {
        n.crew.assignment = a.assignment; n.crew.status = 'assigned';
        if (a.assignment.kind === 'racket') w.rackets[a.assignment.racketId].runnerId = n.id;
        if (a.assignment.kind === 'production') w.productions[a.assignment.productionId].workerId = n.id;
        if (a.assignment.kind === 'op') { const o = w.ops[a.assignment.opId]; if (!o.crewIds.includes(n.id)) o.crewIds.push(n.id); }
      }
      break;
    }
    case 'bribe_official': {
      const n = npc(a.npcId); takeCash(w, a.amount);
      const o = n.official!;
      const gain = Math.round(Math.min(35, Math.sqrt(a.amount) / 3) * (0.5 + o.corruption / 100));
      adjustRel(n, { trust: gain });
      o.retainerDay = w.day; o.boughtBy = n.rel.trust >= 40 ? PLAYER : o.boughtBy;
      if (o.kind === 'captain') { const cut = Math.round(a.amount / 250); p.heat = clamp(p.heat - cut); log(w, `${n.name} pockets ${money(a.amount)}. Some files get lost. (-${cut} heat)`, 'money', { npcId: n.id }); }
      else if (o.kind === 'judge') log(w, `${n.name} accepts your "campaign contribution". Your people will see lighter sentences.`, 'money', { npcId: n.id });
      else log(w, `${n.name} takes ${money(a.amount)} and remembers your name. Permits will be easier.`, 'money', { npcId: n.id });
      if (n.rel.trust < 40 && rng.chance(0.15)) { addHeat(w, 6); log(w, `${n.name} took the money and also told a reporter. (+6 heat)`, 'bad'); }
      break;
    }

    case 'shakedown': {
      const b = w.businesses[a.businessId]; const owner = npc(b.ownerId);
      b.lastShakedownDay = w.day;
      const pressure = p.skills.muscle * 5 + p.fear * 0.6 + owner.rel.fear + activeCrewCount(w) * 4 + rng.int(0, 30);
      const resist = owner.nerve + (owner.rel.trust > 40 ? 20 : 0) + (b.protection && b.protection.factionId !== PLAYER ? 25 : 0);
      if (pressure > resist) {
        const take = Math.round(b.baseIncome * (0.8 + rng.float() * 1.2));
        p.dirty += take; adjustRel(owner, { fear: 12, trust: -10 }); addHeat(w, 2, b.blockId); p.fear = clamp(p.fear + 2);
        addInfluence(w, b.blockId, PLAYER, 4); spreadRep(w, b.blockId, { fear: 3 });
        log(w, `${owner.name} hands over ${money(take)} at ${b.name}. (+12 fear)`, 'money', { businessId: b.id, npcId: owner.id });
        if (b.protection && b.protection.factionId !== PLAYER) { const f = w.factions[b.protection.factionId]; f.standing[PLAYER] -= 12; f.grudges.push(`shakedown:${b.id}`); log(w, `${b.name} pays ${f.name}. They will hear about this.`, 'warn', { factionId: f.id }); }
      } else {
        adjustRel(owner, { trust: -15, respect: -5 }); addHeat(w, 5, b.blockId);
        const called = b.protection && b.protection.factionId !== PLAYER;
        log(w, `${owner.name} refuses. ${called ? `"I pay ${w.factions[b.protection!.factionId].short}. Take it up with them."` : owner.traits.includes('honest') ? 'They threaten to call the cops.' : 'Not scared. Yet.'} (+5 heat)`, 'bad', { businessId: b.id, npcId: owner.id });
        if (called) w.factions[b.protection!.factionId].standing[PLAYER] -= 6;
        if (owner.traits.includes('honest') || owner.rel.trust < -30) addHeat(w, 4);
      }
      break;
    }
    case 'protect': {
      const b = w.businesses[a.businessId]; const owner = npc(b.ownerId);
      const prev = b.protection;
      if (prev && prev.factionId !== PLAYER) { const f = w.factions[prev.factionId]; f.standing[PLAYER] -= 20; f.grudges.push(`stolen:${b.id}`); log(w, `You just took ${b.name} away from ${f.name}. That is a provocation.`, 'warn', { factionId: f.id, businessId: b.id }); }
      b.protection = { factionId: PLAYER, rate: a.rate, since: w.day };
      owner.faction = PLAYER;
      const r = mkRacket(w, 'protection', b);
      adjustRel(owner, { fear: 5, trust: a.rate <= 0.15 ? 3 : -5 });
      addInfluence(w, b.blockId, PLAYER, 8); addHeat(w, 1, b.blockId);
      log(w, `${b.name} now pays you ${Math.round(a.rate * 100)}%.`, 'good', { businessId: b.id, racketId: r.id });
      break;
    }
    case 'buy_business': {
      const b = w.businesses[a.businessId]; const owner = npc(b.ownerId); takeCash(w, a.offer);
      b.ownedBy = 'player'; p.businessIds.push(b.id);
      if (b.protection) { const pf = b.protection.factionId; if (pf !== PLAYER) { w.factions[pf].standing[PLAYER] -= 10; log(w, `${w.factions[pf].name} was collecting from ${b.name}. Not any more.`, 'warn', { factionId: pf }); } for (const rid of b.racketIds) if (w.rackets[rid].kind === 'protection') { delete w.rackets[rid]; p.racketIds = p.racketIds.filter(id => id !== rid); } b.racketIds = b.racketIds.filter(id => w.rackets[id]); b.protection = undefined; }
      adjustRel(owner, { trust: 10, respect: 8 }); owner.faction = PLAYER;
      addInfluence(w, b.blockId, PLAYER, 12); spreadRep(w, b.blockId, { respect: 2 });
      log(w, `You bought ${b.name} for ${money(a.offer)}. ${owner.name} stays on to run it.`, 'good', { businessId: b.id });
      break;
    }
    case 'sell_business': {
      const b = w.businesses[a.businessId]; const price = Math.round(b.value * 0.7 * (b.condition / 100));
      p.cash += price; b.ownedBy = 'npc'; p.businessIds = p.businessIds.filter(id => id !== b.id);
      for (const rid of b.racketIds) closeRacket(w, rid);
      addInfluence(w, b.blockId, PLAYER, -10);
      log(w, `Sold ${b.name} for ${money(price)}.`, 'money', { businessId: b.id });
      break;
    }
    case 'insure': { const b = w.businesses[a.businessId]; takeCash(w, check.cost!.cash!); b.insured = true; log(w, `${b.name} is insured.`, 'info', { businessId: b.id }); break; }
    case 'repair': { const b = w.businesses[a.businessId]; takeCash(w, check.cost!.cash!); b.condition = 100; b.flags = b.flags.filter(f => f !== 'torched'); log(w, `${b.name} repaired.`, 'info', { businessId: b.id }); break; }

    case 'start_racket': {
      const b = w.businesses[a.businessId]; takeCash(w, RACKET_DEFS[a.kind].setupCost);
      const r = mkRacket(w, a.kind, b); if (a.product) r.product = a.product;
      addHeat(w, 1, b.blockId); addInfluence(w, b.blockId, PLAYER, 5);
      log(w, `${RACKET_DEFS[a.kind].label} set up at ${b.name}. Assign someone to run it.`, 'good', { businessId: b.id, racketId: r.id });
      break;
    }
    case 'upgrade_racket': { const r = w.rackets[a.racketId]; takeCash(w, RACKET_UPGRADE_COST[r.level]); r.level++; log(w, `${RACKET_DEFS[r.kind].label} at ${w.businesses[r.businessId].name} is now level ${r.level}.`, 'good', { racketId: r.id }); break; }
    case 'close_racket': { const r = w.rackets[a.racketId]; log(w, `Closed ${RACKET_DEFS[r.kind].label} at ${w.businesses[r.businessId].name}.`, 'info'); closeRacket(w, a.racketId); break; }
    case 'fund_racket': { const r = w.rackets[a.racketId]; spend(w, a.amount); r.float = (r.float ?? 0) + a.amount; log(w, `Float at ${w.businesses[r.businessId].name} is now ${money(r.float)}.`, 'money', { racketId: r.id }); break; }

    case 'rent_safehouse': {
      takeCash(w, SAFEHOUSE_TIERS[0].rent);
      const b = w.blocks[a.blockId];
      const s: Safehouse = { id: nid(w, 's'), blockId: b.id, name: `${SAFEHOUSE_TIERS[0].label} on ${b.name}`, tier: 1, owner: PLAYER, stash: emptyStash(), cash: 0, productionIds: [], capacity: SAFEHOUSE_TIERS[0].capacity };
      w.safehouses[s.id] = s; b.safehouseId = s.id; p.safehouseIds.push(s.id);
      addInfluence(w, b.id, PLAYER, 10);
      log(w, `Rented a ${SAFEHOUSE_TIERS[0].label.toLowerCase()} on ${b.name}.`, 'good', { blockId: b.id });
      break;
    }
    case 'upgrade_safehouse': { const s = w.safehouses[a.safehouseId]; takeCash(w, SAFEHOUSE_TIERS[s.tier].rent); s.tier++; s.capacity = SAFEHOUSE_TIERS[s.tier - 1].capacity; s.name = `${SAFEHOUSE_TIERS[s.tier - 1].label} on ${w.blocks[s.blockId].name}`; log(w, `${s.name} upgraded to tier ${s.tier}.`, 'good', { blockId: s.blockId }); break; }
    case 'start_production': {
      const s = w.safehouses[a.safehouseId]; takeCash(w, PRODUCTION_DEFS[a.kind].setupCost);
      const pr = { id: nid(w, 'p'), kind: a.kind, safehouseId: s.id, level: 1, stock: 0, lastOutput: 0, disrupted: 0 };
      w.productions[pr.id] = pr; s.productionIds.push(pr.id);
      log(w, `${PRODUCTION_DEFS[a.kind].label} built at ${s.name}. Stock it and put someone on it.`, 'good', { blockId: s.blockId });
      break;
    }
    case 'restock_production': { const pr = w.productions[a.productionId]; spend(w, PRODUCTION_DEFS[pr.kind].ingredientCost * a.days); pr.stock += a.days; log(w, `Stocked the ${PRODUCTION_DEFS[pr.kind].label.toLowerCase()} for ${a.days} more days.`, 'money'); break; }
    case 'close_production': {
      const pr = w.productions[a.productionId]; const s = w.safehouses[pr.safehouseId];
      if (pr.workerId) { const n = npc(pr.workerId); if (n.crew) { n.crew.assignment = undefined; n.crew.status = 'idle'; } }
      s.productionIds = s.productionIds.filter(id => id !== pr.id); delete w.productions[pr.id];
      log(w, `Tore down the ${PRODUCTION_DEFS[pr.kind].label.toLowerCase()}.`, 'info'); break;
    }
    case 'move_stash': {
      const from = a.from === 'player' ? p.stash : w.safehouses[a.from].stash; const to = a.to === 'player' ? p.stash : w.safehouses[a.to].stash;
      from[a.product] -= a.amount; to[a.product] += a.amount; break;
    }
    case 'sell_product': {
      const b = w.blocks[a.blockId];
      const price = streetPrice(w, b.id, a.product);
      const demand = b.demand[a.product] * 3; // a street session can move ~3 days of demand
      const sold = Math.min(a.amount, Math.max(1, Math.round(demand)));
      const take = Math.round(sold * price * (0.8 + p.skills.charm / 40));
      p.stash[a.product] -= sold; p.dirty += take;
      addHeat(w, PRODUCT_INFO[a.product].heat, b.id); addInfluence(w, b.id, PLAYER, 2);
      log(w, `Moved ${sold} ${PRODUCT_INFO[a.product].label.toLowerCase()} on ${b.name} for ${money(take)}.${sold < a.amount ? ' The block could not take more today.' : ''}`, 'money', { blockId: b.id });
      break;
    }
    case 'launder': {
      const cap = launderCapLeft(w); const amt = Math.min(a.amount, cap);
      const cut = 0.15; p.dirty -= amt; p.cash += Math.round(amt * (1 - cut));
      p.launderedToday += amt;
      log(w, `Cleaned ${money(amt)} (${Math.round(cut * 100)}% cut).`, 'money'); break;
    }

    case 'plan_op': {
      const def = OP_DEFS[a.kind]; if (def.cost) takeCash(w, def.cost);
      const o: Op = { id: nid(w, 'o'), kind: a.kind, targetBusinessId: a.targetBusinessId, targetNpcId: a.targetNpcId, targetFactionId: a.targetFactionId, targetBlockId: a.targetBlockId, crewIds: a.crewIds.slice(), planDays: def.planDays, daysLeft: def.planDays, status: def.planDays === 0 ? 'ready' : 'planning', createdDay: w.day };
      w.ops[o.id] = o; p.opIds.push(o.id);
      for (const id of a.crewIds) { const n = npc(id); n.crew!.assignment = { kind: 'op', opId: o.id }; n.crew!.status = 'assigned'; }
      log(w, `${def.label} is ${o.status === 'ready' ? 'ready to go' : `in planning (${def.planDays} days)`}.`, 'info', { opId: o.id });
      break;
    }
    case 'launch_op': { const o = w.ops[a.opId]; o.status = 'ready'; o.daysLeft = 0; o.launched = true; log(w, `${OP_DEFS[o.kind].label} goes tonight.`, 'warn', { opId: o.id }); break; }
    case 'abort_op': { const o = w.ops[a.opId]; o.status = 'aborted'; freeOpCrew(w, o); p.opIds = p.opIds.filter(id => id !== o.id); log(w, `${OP_DEFS[o.kind].label} called off.`, 'info'); break; }

    case 'sit_down': sitDown(w, a.factionId, a.offer, rng); break;
    case 'pay_tribute': {
      const f = w.factions[a.factionId]; spend(w, a.amount); f.cash += a.amount;
      const gain = Math.round(Math.min(25, Math.sqrt(a.amount) / 4) * (f.temperament === 'greedy' ? 1.5 : 1));
      f.standing[PLAYER] = clamp(f.standing[PLAYER] + gain, -100, 100); f.stance[PLAYER] = stanceFor(f.standing[PLAYER]);
      log(w, `${f.name} accepts ${money(a.amount)}. (+${gain} standing)`, 'money', { factionId: f.id });
      break;
    }
    case 'declare': {
      const f = w.factions[a.factionId];
      f.stance[PLAYER] = a.stance; f.standing[PLAYER] = Math.min(f.standing[PLAYER], a.stance === 'war' ? -80 : -50);
      p.respect = clamp(p.respect + (a.stance === 'war' ? 5 : 2)); addHeat(w, a.stance === 'war' ? 6 : 2);
      log(w, a.stance === 'war' ? `You declare war on ${f.name}. Their soldiers will be hunting your people.` : `You start a beef with ${f.name}. Expect trouble at your rackets.`, 'warn', { factionId: f.id });
      break;
    }
    case 'hire_lawyer': { takeCash(w, 5000); p.lawyer = true; log(w, 'A lawyer is on retainer. Your people will do less time.', 'good'); break; }
    case 'resolve_event': {
      const e = w.pendingEvents.find(e => e.id === a.eventId)!; const o = e.options.find(o => o.id === a.optionId)!;
      if (o.costCash) takeCash(w, o.costCash);
      e.resolved = o.id; w.pendingEvents = w.pendingEvents.filter(x => x.id !== e.id);
      resolveEventOption(w, e, o.id, rng);
      break;
    }
    case 'end_day': { done(); return endDay(w); }
    case 'populate_chunk': { const added = populateChunk(w, a.chunk, rng); if (added.length) log(w, `You get to know a new part of town: ${added.length} blocks around ${w.blocks[added[0].id].name}.`, 'info', { blockId: added[0].id }); break; }
    case 'rename': p.name = a.name.trim(); break;
  }
  done();
  return w;
}

// ---------------------------------------------------------------- helpers
export function stashTotal(s: Record<string, number>): number { return Object.values(s).reduce((a, b) => a + b, 0); }

export function bedsLeft(w: World): number {
  const beds = 2 + w.player.safehouseIds.reduce((s, id) => s + SAFEHOUSE_TIERS[w.safehouses[id].tier - 1].crewBeds, 0);
  return beds - w.player.crewIds.filter(id => w.npcs[id].crew?.status !== 'dead').length;
}

export function launderCapLeft(w: World): number {
  const total = w.player.racketIds.map(id => w.rackets[id]).filter(r => r && r.kind === 'laundering' && !r.disrupted).reduce((s, r) => s + launderCapacity(w, r), 0);
  const used = w.player.launderedToday;
  return Math.max(0, Math.round(total - used));
}

function spend(w: World, amount: number) {
  const fromDirty = Math.min(w.player.dirty, amount); w.player.dirty -= fromDirty; w.player.cash -= amount - fromDirty;
}

export function mkRacket(w: World, kind: Racket['kind'], b: Business): Racket {
  const r: Racket = { id: nid(w, 'r'), kind, businessId: b.id, owner: PLAYER, startedDay: w.day, level: 1, lastIncome: 0, disrupted: 0 };
  w.rackets[r.id] = r; b.racketIds.push(r.id); w.player.racketIds.push(r.id); return r;
}

export function closeRacket(w: World, id: Id) {
  const r = w.rackets[id]; if (!r) return;
  const b = w.businesses[r.businessId];
  if (r.runnerId) { const n = w.npcs[r.runnerId]; if (n?.crew) { n.crew.assignment = undefined; if (n.crew.status === 'assigned') n.crew.status = 'idle'; } }
  if (r.kind === 'protection' && b.protection?.factionId === r.owner) b.protection = undefined;
  if (r.kind === 'loansharking' && r.float) w.player.dirty += Math.round(r.float * 0.7);
  b.racketIds = b.racketIds.filter(x => x !== id);
  w.player.racketIds = w.player.racketIds.filter(x => x !== id);
  delete w.rackets[id];
}

export function clearAssignment(w: World, n: Npc) {
  const asg = n.crew?.assignment; if (!n.crew) return;
  if (asg?.kind === 'racket' && w.rackets[asg.racketId]?.runnerId === n.id) w.rackets[asg.racketId].runnerId = undefined;
  if (asg?.kind === 'production' && w.productions[asg.productionId]?.workerId === n.id) w.productions[asg.productionId].workerId = undefined;
  if (asg?.kind === 'op' && w.ops[asg.opId]) w.ops[asg.opId].crewIds = w.ops[asg.opId].crewIds.filter(id => id !== n.id);
  n.crew.assignment = undefined; if (n.crew.status === 'assigned') n.crew.status = 'idle';
}

export function freeOpCrew(w: World, o: Op) {
  for (const id of o.crewIds) { const n = w.npcs[id]; if (n?.crew && n.crew.assignment?.kind === 'op' && n.crew.assignment.opId === o.id) { n.crew.assignment = undefined; if (n.crew.status === 'assigned') n.crew.status = 'idle'; } }
}

function patronTip(w: World, n: Npc, rng: import('./rng').Rng): string | undefined {
  const block = w.blocks[n.homeBlockId];
  const options: string[] = [];
  const ctrl = Object.entries(block.influence).sort((a, b) => b[1] - a[1])[0];
  if (ctrl && ctrl[0] !== PLAYER && w.factions[ctrl[0]]) options.push(`"${w.factions[ctrl[0]].short} collect on this block every week. ${w.npcs[w.factions[ctrl[0]].lieutenantIds[0]].name} handles it."`);
  const rich = Object.values(w.businesses).filter(b => b.blockId === block.id && b.baseIncome > 250)[0];
  if (rich) options.push(`"${rich.name} does better than it looks. ${w.npcs[rich.ownerId].name} keeps cash in the back."`);
  const coward = block.businessIds.map(id => w.npcs[w.businesses[id].ownerId]).find(o => o.traits.includes('coward'));
  if (coward) options.push(`"${coward.name} scares easy. Everybody knows it."`);
  if (block.police > 60) options.push('"Cops sit on this block. Careful what you carry."');
  if (!options.length) return undefined;
  return rng.pick(options);
}

// ---------------------------------------------------------------- sit-downs
function sitDown(w: World, fid: string, offer: SitDownOffer, rng: import('./rng').Rng) {
  const f = w.factions[fid]; const p = w.player;
  const standing = f.standing[PLAYER];
  const charm = p.skills.charm * 3 + p.respect * 0.5;
  const temper = f.temperament === 'diplomatic' ? 15 : f.temperament === 'greedy' ? 5 : f.temperament === 'paranoid' ? -10 : -5;
  const roll = rng.int(0, 30);
  const accept = (threshold: number) => charm + standing * 0.5 + temper + roll > threshold;
  const lt = w.npcs[f.lieutenantIds[0]];
  const setStance = (s: number) => { f.standing[PLAYER] = clamp(s, -100, 100); f.stance[PLAYER] = stanceFor(f.standing[PLAYER]); };
  switch (offer.kind) {
    case 'truce': {
      if (accept(f.stance[PLAYER] === 'war' ? 30 : 10)) { f.truceUntil[PLAYER] = w.day + offer.days; setStance(Math.max(standing, -14)); log(w, `${lt.name} agrees to a ${offer.days}-day truce on behalf of ${f.name}. Nobody touches anybody.`, 'good', { factionId: f.id }); }
      else { setStance(standing - 3); log(w, `${lt.name} listens, then leaves. No truce. "Show us something first."`, 'bad', { factionId: f.id }); }
      break;
    }
    case 'tribute': {
      const enough = offer.amountPerDay >= 150 + f.soldiers * 15;
      if (enough && accept(0)) { f.tributeFrom[PLAYER] = offer.amountPerDay; setStance(standing + 20); log(w, `${f.name} will take ${money(offer.amountPerDay)} a day and leave your rackets alone.`, 'good', { factionId: f.id }); }
      else { setStance(standing - 2); log(w, `${lt.name}: "${money(offer.amountPerDay)} a day? ${enough ? 'Not today.' : 'That is a tip, not tribute.'}"`, 'bad', { factionId: f.id }); }
      break;
    }
    case 'cede_block': {
      const b = w.blocks[offer.blockId];
      const gain = 25 + Math.round(b.wealth / 5);
      addInfluence(w, b.id, PLAYER, -60); addInfluence(w, b.id, f.id, 60);
      setStance(standing + gain); f.truceUntil[PLAYER] = Math.max(f.truceUntil[PLAYER] ?? 0, w.day + 10);
      log(w, `You hand ${b.name} to ${f.name}. They are pleased. (+${gain} standing)`, 'info', { factionId: f.id, blockId: b.id });
      break;
    }
    case 'joint_racket': {
      const b = w.businesses[offer.businessId];
      if (accept(5)) { b.protection = { factionId: f.id, rate: 0.2, since: w.day }; setStance(standing + 18); log(w, `${f.name} takes 20% of ${b.name} and calls you a friend. (+18 standing)`, 'good', { factionId: f.id, businessId: b.id }); }
      else { log(w, `${lt.name} does not want a piece of ${b.name}. "Come back when it earns."`, 'bad', { factionId: f.id }); }
      break;
    }
    case 'alliance': {
      if (standing >= 40 && accept(35)) { setStance(Math.max(standing, 70)); log(w, `${w.npcs[f.bossId].name} embraces you. ${f.name} and your outfit are allies now.`, 'good', { factionId: f.id }); }
      else { setStance(standing - 4); log(w, `${lt.name}: "Allies? We barely know you." (needs standing ≥ 40 and a good pitch)`, 'bad', { factionId: f.id }); }
      break;
    }
    case 'demand_block': {
      const b = w.blocks[offer.blockId];
      const strength = p.crewIds.length * 6 + p.fear + p.respect * 0.5;
      if (strength > f.soldiers * 6 + 20 && accept(25)) { addInfluence(w, b.id, f.id, -50); addInfluence(w, b.id, PLAYER, 45); setStance(standing - 10); log(w, `${f.name} backs off ${b.name} rather than fight you for it. They will not forget.`, 'good', { factionId: f.id, blockId: b.id }); }
      else { setStance(standing - 15); log(w, `${lt.name} laughs. "${b.name}? Try and take it." (-15 standing)`, 'bad', { factionId: f.id }); }
      break;
    }
  }
}
