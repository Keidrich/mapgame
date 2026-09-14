import { effectivePolice } from './authority';
import { BUSINESS_DEFS } from '@content/businesses';
import { OP_APPROACHES, OP_DEFS, PRODUCTION_DEFS, PRODUCT_INFO, RACKET_DEFS, RACKET_UPGRADE_COST, SAFEHOUSE_TIERS } from '@content/rackets';
import { insidersFor } from './select';
import type { Action, Affordance, CheatKind, SitDownOffer } from './actions';
import { emptyStash, stanceFor } from './generate';
import { populateChunk } from './populate';
import { PARTNER_RATE, businessesOwnedBy, fixerCapLeft, fixerCapToday, fixerDailyCap, fixerRate, fixerUsedToday, launderCapacity, protectReason, protectRoute, streetPrice } from './economy';
import { resolveEventOption } from './events';
import { approachChance, resultLine } from './scenes';
import { AGENDA_LABEL, addGrudge, addMemory } from './people';
import { standingCap } from './factions';
import { crewAt, crewOfBoss, parley } from './crews';
import { endDay } from './tick';
import { PLAYER, type Business, type Id, type Npc, type Op, type Racket, type Safehouse, type World } from './types';
import { onDemote, promote, promoteReason } from './lieutenants';
import { backCandidate, broker, brokerReason } from './politics';
import { buryEvidence, caseWitnessOf, silenceWitness } from './cases';
import { blockName as blockNameOf, isHere, legworkFor, npcBlockIds, npcIsHere, route, travelCost } from './travel';
import { petition, seatReason } from './commission';
import { claimedByPlayer } from './abandoned';
import { isHeld, resolveHostage, roomFor } from './hostages';
import { PLAYER_NOTE_MAX, opLocked } from './select';
import { EQUIP_MAX, buyPrice, equipSlotsLeft, isMarket, marketStock, ownedCount, sellPrice } from './items';
import { activeConfrontation, confrontOptions, confrontations, resolveConfrontation } from './combat';
import { cardById, dumpCards, endTap, liveCards, runCard, scrubPower, scrubTrail, secrets, sellDirt } from './cyber';
import { SCRUB } from '@content/cyber';
import { CASE_JOINT } from '@content/rackets';
import { ITEM_DEFS } from '@content/items';
import { moveProduct, onJoin, recipesForKind, restockCost, sellMult } from './production';
import { PRODUCTION_UPGRADE_MULT, RECIPES } from '@content/rackets';
import { FIXER, LAUNDER_RATE, LIEUTENANT } from '@content/rackets';
import { activeCrewCount, officialTrust, addHeat, addInfluence, adjustRel, clamp, factionOf, log, money, nid, rngOf, spreadRep, takeCash } from './util';

const no = (reason: string): Affordance => ({ ok: false, reason });
const yes = (cost?: { ap?: number; cash?: number }): Affordance => ({ ok: true, cost });

// ---------------------------------------------------------------- can()
export function can(w: World, a: Action): Affordance {
  if (w.gameOver) return no('The game is over.');
  const p = w.player;
  // bookkeeping (renaming yourself, a note to self, streaming in geometry) is not a move, so it is never blocked
  const freeAlways = ['end_day', 'resolve_event', 'rename', 'set_note', 'populate_chunk'];
  if (!freeAlways.includes(a.type) && w.pendingEvents.length) return no('Deal with what is in front of you first.');
  // somebody is standing in front of you: nothing else happens until you answer them
  if (!freeAlways.includes(a.type) && a.type !== 'resolve_confrontation' && activeConfrontation(w)) {
    return no(`${w.factions[activeConfrontation(w)!.factionId]?.short ?? 'They'} are in front of you right now. Deal with that first.`);
  }
  const ap = (n: number) => (p.ap >= n ? null : `Needs ${n} AP. You are out of time today.`);
  const cash = (n: number) => (p.cash >= n ? null : `Needs ${money(n)} clean cash.`);
  const npc = (id: Id) => w.npcs[id];
  const biz = (id: Id) => w.businesses[id];
  /** Face to face: you have to be standing where they are. */
  const hereNpc = (n: Npc) => {
    if (isHeld(n)) return `${n.name} is tied to a chair in one of your safehouses. Settle that first.`;
    if (npcIsHere(w, n)) return null;
    const where = npcBlockIds(w, n)[0];
    const c = where ? travelCost(w, where) : undefined;
    return `${n.name} is on ${blockNameOf(w, where)}. Walk over first${c !== undefined ? ` (${c} legwork)` : ''}.`;
  };
  const hereBiz = (b: Business) => isHere(w, b.blockId) ? null : `${b.name} is on ${blockNameOf(w, b.blockId)}. Walk over first${travelCost(w, b.blockId) !== undefined ? ` (${travelCost(w, b.blockId)} legwork)` : ''}.`;

  switch (a.type) {
    case 'move': {
      const to = w.blocks[a.toBlockId]; if (!to) return no('No such block.');
      if (a.toBlockId === p.currentBlockId) return no('You are already there.');
      const r = route(w, p.currentBlockId, a.toBlockId);
      if (!r) return no('No way through from here. The streets in between are not mapped yet.');
      if (r.cost > p.legwork) return no(`${to.name} is ${r.cost} legwork away and you have ${p.legwork} left today.`);
      return yes();
    }
    case 'visit': { const n = npc(a.npcId); if (!n?.alive) return no('They are gone.'); const h = hereNpc(n); if (h) return no(h); const r = ap(1); if (r) return no(r); if (a.approach === 'drinks' && p.cash < 50) return no('Needs $50.'); return yes({ ap: 1, cash: a.approach === 'drinks' ? 50 : 0 }); }
    case 'gift': { const n = npc(a.npcId); if (!n?.alive) return no('They are gone.'); if (a.amount < 50) return no('That is an insult, not a gift.'); const r = cash(a.amount); return r ? no(r) : yes({ cash: a.amount }); }
    case 'read': { const n = npc(a.npcId); if (!n?.alive) return no('They are gone.'); if (n.known) return no('You already have their number.'); const h = hereNpc(n); if (h) return no(h); const r = ap(1); return r ? no(r) : yes({ ap: 1 }); }
    case 'threaten': { const n = npc(a.npcId); if (!n?.alive) return no('They are gone.'); if (n.official) return no('Threatening an official is a bad idea. Bribe them.'); if (n.role === 'boss') return no('You do not threaten a boss. You go to war with him.'); const h = hereNpc(n); if (h) return no(h); const r = ap(1); if (r) return no(r); if (a.approach === 'crew' && activeCrewCount(w) === 0) return no('No crew to bring.'); return yes({ ap: 1 }); }
    case 'parley': { const n = npc(a.npcId); if (!n?.alive) return no('They are gone.'); const c0 = crewOfBoss(w, n.id); if (!c0) return no('They do not run a crew.'); if (!isHere(w, c0.blockId)) return no(`The ${c0.name} hold ${blockNameOf(w, c0.blockId)}. Walk over first${travelCost(w, c0.blockId) !== undefined ? ` (${travelCost(w, c0.blockId)} legwork)` : ''}.`); const r = ap(1); if (r) return no(r); if (a.approach === 'join' && bedsLeft(w) <= 0) return no('No room in your safehouses for their boss.'); return yes({ ap: 1 }); }
    case 'broker': { const n = npc(a.npcId); if (!n?.alive) return no('They are gone.'); const why = brokerReason(w, n, a.otherFactionId); if (why) return no(why); const r = ap(2); if (r) return no(r); if (a.approach === 'split') { const c = cash(4000); if (c) return no(c); } return yes({ ap: 2, cash: a.approach === 'split' ? 4000 : 0 }); }
    case 'resolve_confrontation': {
      const c = confrontations(w).find(x => x.id === a.id); if (!c) return no('That is over.');
      const opt = confrontOptions(w, c).find(o => o.id === a.approach);
      if (opt?.disabled) return no(opt.disabled);
      return yes();
    }
    case 'case_joint': {
      const b = biz(a.businessId); if (!b) return no('No such place.');
      const h = hereBiz(b); if (h) return no(h);
      if ((b.casedUntil ?? 0) > w.day) return no(`You have already walked ${b.name}. What you know keeps until day ${b.casedUntil}.`);
      const r = ap(CASE_JOINT.ap); return r ? no(r) : yes({ ap: CASE_JOINT.ap });
    }
    case 'set_note': { const n = npc(a.npcId); if (!n) return no('Nobody by that name.'); if (a.text.length > PLAYER_NOTE_MAX) return no(`Keep it under ${PLAYER_NOTE_MAX} characters.`); return yes(); }
    case 'petition_seat': { const why = seatReason(w); if (why) return no(why); const r = ap(2); return r ? no(r) : yes({ ap: 2 }); }
    case 'resolve_hostage': { const n = npc(a.npcId); if (!n || !isHeld(n)) return no('You are not holding them.'); const r = ap(1); return r ? no(r) : yes({ ap: 1 }); }
    case 'back_candidate': { const f = w.factions[a.factionId]; if (!f?.alive || !f.crisis) return no('No crisis there.'); if (!f.crisis.candidateIds.includes(a.npcId)) return no('They are not in the running.'); if (a.amount < 500) return no('Under $500 is an insult.'); const c = cash(a.amount); return c ? no(c) : yes({ cash: a.amount }); }
    case 'recruit': {
      const n = npc(a.npcId); if (!n?.alive) return no('They are gone.');
      if (n.crew) return no('Already in your crew.');
      if (!['patron', 'owner', 'soldier', 'fixer'].includes(n.role)) return no('Not the recruiting type.');
      if (n.faction && n.role === 'soldier') return no('They belong to someone else.');
      const h = hereNpc(n); if (h) return no(h);
      const r = ap(1); if (r) return no(r);
      if (bedsLeft(w) <= 0) return no('No room. Rent or upgrade a safehouse.');
      if (a.approach === 'cut' && p.cash < 200) return no('Needs $200 up front.');
      if (a.approach === 'lean' && n.traits.includes('loyal')) return no('Loyal people do not fold.');
      return yes({ ap: 1, cash: a.approach === 'cut' ? 200 : 0 });
    }
    case 'fire': { const n = npc(a.npcId); if (!n?.crew) return no('Not your crew.'); return yes(); }
    case 'assign': {
      const n = npc(a.npcId); if (!n?.crew) return no('Not your crew.');
      if (n.crew.status === 'dead') return no('Dead.'); if (n.crew.status === 'jailed') return no('In jail.'); if (n.crew.status === 'injured') return no('Injured. Give them a few days.');
      if (!a.assignment) return yes();
      if (a.assignment.kind === 'racket') { const r = w.rackets[a.assignment.racketId]; if (!r || r.owner !== PLAYER) return no('Not your racket.'); if (r.runnerId && r.runnerId !== n.id) return no('Someone already runs it.'); }
      if (a.assignment.kind === 'production') { const pr = w.productions[a.assignment.productionId]; if (!pr) return no('No such production.'); if (pr.workerId && pr.workerId !== n.id) return no('Someone already works it.'); }
      if (a.assignment.kind === 'op') { const o = w.ops[a.assignment.opId]; if (!o || o.status !== 'planning') return no('That op is not being planned.'); }
      if (a.assignment.kind === 'lieutenant') { const why = promoteReason(w, n, a.assignment.districtId); if (why) return no(why); const r = ap(LIEUTENANT.ap); return r ? no(r) : yes({ ap: LIEUTENANT.ap }); }
      return yes();
    }
    case 'audit': { const n = npc(a.npcId); if (!n?.crew) return no('Not your crew.'); if (n.crew.assignment?.kind !== 'lieutenant') return no('Only lieutenants keep a book.'); const r = ap(1); return r ? no(r) : yes({ ap: 1 }); }
    case 'bribe_official': { const n = npc(a.npcId); if (!n?.official) return no('Not an official.'); if (a.amount < 500) return no('Officials do not get out of bed for less than $500.'); const r = cash(a.amount); return r ? no(r) : yes({ cash: a.amount }); }

    case 'shakedown': {
      const b = biz(a.businessId); if (!b) return no('No such place.');
      if (b.ownedBy === 'player') return no('You own it. Shake yourself down?');
      if (!BUSINESS_DEFS[b.type].rackets.includes('protection')) return no('Nothing to shake here.');
      const h = hereBiz(b); if (h) return no(h);
      if (b.lastShakedownDay !== undefined && w.day - b.lastShakedownDay < 3) return no('You were just here. Give it a few days.');
      if (a.approach === 'wreck' && activeCrewCount(w) === 0) return no('Needs crew to wreck the place.');
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
      const why = protectReason(owner, a.rate); if (why) return no(why);
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

    case 'buy_item': {
      const b = biz(a.businessId); if (!b) return no('No such place.');
      if (!isMarket(b)) return no(`${b.name} does not deal in that kind of thing.`);
      const item = ITEM_DEFS[a.itemId]; if (!item) return no('No such thing.');
      if (!marketStock(b).some(i => i.id === item.id)) return no(`${b.name} has no ${item.label.toLowerCase()} on the shelf.`);
      const h = hereBiz(b); if (h) return no(h);
      const r = cash(buyPrice(item)); return r ? no(r) : yes({ cash: buyPrice(item) });
    }
    case 'sell_item': {
      const b = biz(a.businessId); if (!b) return no('No such place.');
      if (!isMarket(b)) return no(`${b.name} is not buying.`);
      const item = ITEM_DEFS[a.itemId]; if (!item) return no('No such thing.');
      if (!ownedCount(w, item.id)) return no(`You do not have a ${item.label.toLowerCase()}.`);
      const h = hereBiz(b); if (h) return no(h);
      return yes();
    }
    case 'equip': {
      const item = ITEM_DEFS[a.itemId]; if (!item) return no('No such thing.');
      if (!a.on) return (p.equipped ?? []).includes(item.id) ? yes() : no('Not on you.');
      if (!ownedCount(w, item.id)) return no(`You do not own a ${item.label.toLowerCase()}.`);
      if ((p.equipped ?? []).filter(id => id === item.id).length >= ownedCount(w, item.id)) return no(`You are already carrying ${ownedCount(w, item.id) > 1 ? 'all of those' : 'it'}.`);
      if (equipSlotsLeft(w) <= 0) return no(`You can carry ${EQUIP_MAX} things. Leave something at home first.`);
      return yes();
    }
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
      const c = claimedByPlayer(b) ? 0 : SAFEHOUSE_TIERS[0].rent;   // nobody collects rent on a derelict block you took
      const r = c ? cash(c) : null; if (r) return no(r);
      // Whoever holds this corner may object. `factionOf` returns whoever controls the block,
      // and that is a street crew id as often as a faction's — so never index w.factions with
      // it blind. Doing that threw here, and a throw inside can() runs during render: it took
      // the whole screen down every time a crew-held block was opened.
      const ctrl = factionOf(w, a.blockId);
      if (ctrl && ctrl !== PLAYER) {
        const f = w.factions[ctrl];
        if (f && (f.stance[PLAYER] === 'war' || f.stance[PLAYER] === 'beef')) return no(`${f.name} would burn it down the same night.`);
        const sc = w.crews[ctrl];
        if (sc && sc.tribute !== PLAYER && sc.mood < 0) return no(`The ${sc.name} hold this corner and you are not on good terms. Parley with them, or take it off them.`);
      }
      return yes({ cash: c });
    }
    case 'upgrade_safehouse': { const s = w.safehouses[a.safehouseId]; if (s?.owner !== PLAYER) return no('Not yours.'); if (s.tier >= 3) return no('Maxed out.'); const c = SAFEHOUSE_TIERS[s.tier].rent; const r = cash(c); return r ? no(r) : yes({ cash: c }); }
    case 'start_production': {
      const s = w.safehouses[a.safehouseId]; if (s?.owner !== PLAYER) return no('Not yours.');
      if (s.productionIds.length >= s.tier) return no(`A tier ${s.tier} safehouse fits ${s.tier} production${s.tier > 1 ? 's' : ''}. Upgrade it.`);
      if (s.productionIds.some(id => w.productions[id].kind === a.kind)) return no('Already set up here.');
      const c = PRODUCTION_DEFS[a.kind].setupCost; const r = cash(c); return r ? no(r) : yes({ cash: c });
    }
    case 'restock_production': { const pr = w.productions[a.productionId]; if (!pr) return no('No such production.'); if (a.days < 1) return no('Days?'); const c = restockCost(w, pr, a.days); if (p.cash + p.dirty < c) return no(`Needs ${money(c)}.`); return yes({ cash: c }); }
    case 'upgrade_production': { const pr = w.productions[a.productionId]; if (!pr) return no('No such production.'); if (pr.level >= 3) return no('Maxed out.'); const c = Math.round(PRODUCTION_DEFS[pr.kind].setupCost * PRODUCTION_UPGRADE_MULT[pr.level]); const r = cash(c); return r ? no(r) : yes({ cash: c }); }
    case 'set_recipe': { const pr = w.productions[a.productionId]; if (!pr) return no('No such production.'); if (a.recipe && !recipesForKind(w, pr.kind).includes(a.recipe)) return no('You do not know that recipe.'); if ((pr.recipe ?? undefined) === (a.recipe ?? undefined)) return no('Already running that.'); return yes(); }
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
    case 'launder': { if (a.amount <= 0) return no('Amount?'); if (p.dirty < a.amount) return no('Not that much dirty cash.'); const cap = launderCapLeft(w); if (cap <= 0) return no('No laundering capacity left today. Start a laundering racket, or take it to a fixer.'); return yes(); }
    case 'launder_with_fixer': {
      const n = npc(a.npcId); if (!n?.alive) return no('They are gone.');
      if (n.role !== 'fixer') return no(`${n.name} does not move money.`);
      const h = hereNpc(n); if (h) return no(h);
      if (a.amount <= 0) return no('Amount?');
      if (p.dirty < a.amount) return no('Not that much dirty cash.');
      if (fixerCapLeft(w, n) <= 0) return no(`${n.name} has washed all they can for you today (${money(fixerDailyCap(n.rel.trust))}). Come back tomorrow, or trust makes the window bigger.`);
      const r = ap(FIXER.ap); return r ? no(r) : yes({ ap: FIXER.ap });
    }

    case 'run_card': {
      const c = cardById(w, a.cardId); if (!c) return no('You do not have that one.');
      if (c.freshness <= 0 || c.limit <= 0) return no('Dead. It stopped working days ago.');
      return yes();
    }
    case 'dump_cards': {
      const r = w.rackets[a.racketId];
      if (r?.owner !== PLAYER || r.kind !== 'carding') return no('Needs a carding racket of your own to move them through.');
      if (r.disrupted) return no('That racket is shut for a few days.');
      if (!liveCards(w).length) return no('Nothing worth dumping.');
      return yes();
    }
    case 'sell_dirt': {
      const sec = secrets(w).find(x => x.id === a.secretId); if (!sec) return no('You do not know that.');
      if (sec.soldTo) return no('You already sold that one. It is not worth anything twice.');
      const f = w.factions[a.factionId]; if (!f?.alive) return no('They are gone.');
      const subject = w.npcs[sec.npcId];
      if (subject?.faction === a.factionId) return no(`${f.short} are not going to pay for dirt on their own.`);
      if ((f.stance[PLAYER] ?? 'peace') === 'war') return no(`${f.short} will not sit down with you at all right now.`);
      return yes();
    }
    case 'pull_tap': {
      const n = npc(a.npcId); if (!n?.tap) return no('Nothing of yours running on them.');
      return yes();   // free: getting out is never the part you should have to think twice about
    }
    case 'scrub_trail': {
      if (!(p.cyberHeat ?? 0)) return no('Nothing on the wire to clean up. This does not touch the heat you earned in person.');
      const { points, cost } = scrubPower(w);
      if (points <= 0) return no('Nothing left to scrub today.');
      const r = ap(SCRUB.ap); if (r) return no(r);
      const c = cash(cost); if (c) return no(c);
      return yes({ ap: SCRUB.ap, cash: cost });
    }
    case 'plan_op': {
      const def = OP_DEFS[a.kind];
      // the per-target gate (wire fraud) is keyed to the mark, not to the empire
      const locked = opLocked(w, a.kind, { npcId: a.targetNpcId }); if (locked) return no(locked);
      if (a.crewIds.length < def.minCrew) return no(`Needs at least ${def.minCrew} crew.`);
      if (a.crewIds.length > def.maxCrew) return no(`Too many. Max ${def.maxCrew}.`);
      for (const id of a.crewIds) { const n = npc(id); if (!n?.crew || n.crew.status !== 'idle') return no(`${n?.name ?? 'Someone'} is not available.`); }
      if (def.cost) { const r = cash(def.cost); if (r) return no(r); }
      if (def.target === 'business') {
        const b = a.targetBusinessId ? biz(a.targetBusinessId) : undefined; if (!b) return no('Pick a target.');
        if (def.ownBusiness && b.ownedBy !== 'player') return no('Must be a place you own.');
        if (a.kind === 'insurance_fraud' && !b.insured) return no('Insure it first.');
        if (def.targetTypes && !def.targetTypes.includes(b.type)) return no('Wrong kind of target.');
        // your own place is not a target — unless the job is to defend what you run there
        if (!def.ownBusiness && !def.ownRacket && b.ownedBy === 'player') return no('That is yours.');
        if (def.ownRacket && !b.racketIds.some(id => w.rackets[id]?.owner === PLAYER)) return no('You do not run anything there.');
      }
      if (def.target === 'npc' && !a.targetNpcId) return no('Pick a target.');
      if (def.requires?.stance?.length) {
        // war work is aimed at somebody in particular, and they have to be the ones at war
        const at = a.targetFactionId ?? (a.targetNpcId ? npc(a.targetNpcId)?.faction : undefined)
          ?? (a.targetBusinessId ? biz(a.targetBusinessId)?.protection?.factionId : undefined);
        const f = at ? w.factions[at] : undefined;
        if (a.kind === 'defend_racket') {
          const r = a.targetBusinessId ? biz(a.targetBusinessId)?.racketIds.map(id => w.rackets[id]).find(x => x?.owner === PLAYER && (x.threatened ?? 0) >= w.day) : undefined;
          if (!r) return no('Nothing of yours is marked there. Dig in where they have already come once.');
        } else if (!f) return no('Pick who this is aimed at.');
        else if (!def.requires.stance.includes(f.stance[PLAYER] ?? 'peace')) return no(`${f.name} is not at ${def.requires.stance.join(' or ')} with you.`);
      }
      if (a.kind === 'takeover') { if (!a.targetBlockId) return no('Pick a block with a street crew.'); if (!crewAt(w, a.targetBlockId)) return no('No street crew holds that block.'); }
      if (a.kind === 'claim_abandoned') {
        const b = a.targetBlockId ? w.blocks[a.targetBlockId] : undefined; if (!b) return no('Pick a derelict block.');
        if (!b.abandoned) return no('There are people and businesses on that block. Take it the usual way.');
        if (!b.abandoned.known) return no('You have not found that block yet. Scout the edges first.');
        if (b.abandoned.claimedBy === PLAYER) return no('You already hold it.');
        if (b.abandoned.claimedBy) return no('Somebody else moved in there first.');
        if (a.approach === 'inside' && officialTrust(w, 'councillor') < 30) return no('The paperwork route needs a councillor who takes your calls (trust 30).');
      }
      if (def.target === 'district' && !a.targetDistrictId) return no('Pick a district to walk.');
      if (a.kind === 'kidnap') {
        const n = a.targetNpcId ? npc(a.targetNpcId) : undefined; if (!n?.alive) return no('Pick somebody.');
        if (isHeld(n)) return no('You already have them.');
        if (n.official) return no('Taking an official is how task forces get built. Not available.');
        const s = a.safehouseId ? w.safehouses[a.safehouseId] : w.safehouses[p.safehouseIds[0]];
        if (!s || s.owner !== PLAYER) return no('You need a safehouse to put them in.');
        if (roomFor(s, SAFEHOUSE_TIERS[s.tier - 1].crewBeds) <= 0) return no(`${s.name} has nowhere to put anyone else.`);
      }
      if (def.target === 'npc') { const n = npc(a.targetNpcId!); if (!n?.alive) return no('Already gone.'); if (n.official) return no('Going after an official ends careers. Not available.'); if (a.kind === 'frame' && !(n.faction && w.factions[n.faction] && (n.role === 'boss' || n.role === 'lieutenant'))) return no('A frame only sticks on a faction boss or lieutenant.'); }
      // The inside route normally means somebody at a targeted business opening a door.
      // `claim_abandoned` has its own: a councillor moving a file, checked above.
      if (a.approach === 'inside' && a.kind !== 'claim_abandoned') {
        if (def.target !== 'business') return no('An inside man needs a place to be inside of.');
        if (!insidersFor(w, a.targetBusinessId).length) return no('Nobody at the target trusts you enough (trust 35+).');
      }
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
    case 'cheat': return yes();
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
      const n = npc(a.npcId); const ap_ = a.approach ?? 'listen'; n.known = true;
      if (a.approach === 'drinks') takeCash(w, 50);
      const chance = approachChance(w, 'visit', ap_, n); const ok = rng.int(1, 100) <= chance;
      const biz = n.favouriteBusinessIds[0] ? w.businesses[n.favouriteBusinessIds[0]] : undefined;
      let gain = 0, respect = 0, extra = '';
      if (ap_ === 'drinks') { gain = ok ? 8 + Math.round(p.skills.charm / 2) : 4; }
      else if (ap_ === 'business') { respect = ok ? 6 : 3; gain = 2; if (ok) { const tip = patronTip(w, n, rng); if (tip) extra = ` ${tip}`; } }
      else { gain = ok ? 5 + Math.round(p.skills.charm / 3) : 2; if (ok && n.role === 'patron' && rng.chance(0.5)) { const tip = patronTip(w, n, rng); if (tip) extra = ` ${tip}`; } }
      if (n.traits.includes('quiet')) gain = Math.max(1, gain - 1);
      if (n.homeBlockId === p.homeBlockId) gain += 1; // home turf
      adjustRel(n, { trust: gain, respect });
      if (n.official && n.rel.trust >= 20) extra = ' They mention, unofficially, that a donation would be remembered.';
      log(w, `${resultLine('visit', ap_, ok, rng)} ${n.name}${biz ? ` at ${biz.name}` : ''}: +${gain} trust${respect ? `, +${respect} respect` : ''}.${extra}`, ok ? 'good' : 'info', { npcId: n.id, businessId: biz?.id });
      break;
    }
    case 'read': {
      const n = npc(a.npcId);
      const chance = 40 + p.skills.charm * 5 + p.skills.tech * 2 + (n.traits.includes('quiet') ? -15 : 0);
      if (rng.int(1, 100) <= chance) { n.known = true; log(w, `You size up ${n.name}: ${n.traits.join(', ')}. Nerve ${n.nerve}.${n.agenda ? ` They ${agendaText(n)}.` : ''}${n.recipe && RECIPES[n.recipe] ? ` They know ${RECIPES[n.recipe].label}; worth having in the crew.` : ''}`, 'good', { npcId: n.id }); }
      else { adjustRel(n, { trust: -2 }); log(w, `${n.name} notices you watching and clams up.`, 'info', { npcId: n.id }); }
      break;
    }
    case 'gift': {
      const n = npc(a.npcId); takeCash(w, a.amount);
      const greedy = n.traits.includes('greedy') ? 1.5 : n.traits.includes('honest') ? 0.5 : 1;
      const gain = Math.round(Math.min(30, Math.sqrt(a.amount) / 2) * greedy);
      adjustRel(n, { trust: gain, respect: Math.round(gain / 3) });
      log(w, `${n.name} takes your ${money(a.amount)}. (+${gain} trust)`, 'money', { npcId: n.id });
      if (a.amount >= 500 && caseWitnessOf(w, n.id) && (n.rel.trust >= 30 || n.traits.includes('greedy'))) silenceWitness(w, n.id, 'paid');
      break;
    }
    case 'threaten': {
      const n = npc(a.npcId); const ap_ = a.approach ?? 'stare'; n.known = true;
      const chance = approachChance(w, 'threaten', ap_, n); const ok = rng.int(1, 100) <= chance;
      if (ok) {
        const fear = (ap_ === 'crew' ? 18 : ap_ === 'family' ? 16 : 12) + Math.round(p.skills.muscle / 2) + (n.traits.includes('coward') ? 12 : 0);
        adjustRel(n, { fear, trust: ap_ === 'family' ? -15 : -8 }); p.fear = clamp(p.fear + 1);
        addHeat(w, ap_ === 'crew' ? 2 : 1, n.homeBlockId);
        if (ap_ === 'crew') spreadRep(w, n.homeBlockId, { fear: 3 });
        log(w, `${resultLine('threaten', ap_, true, rng)} ${n.name}: +${fear} fear.`, 'info', { npcId: n.id });
        if (n.rel.fear >= 40 && caseWitnessOf(w, n.id)) silenceWitness(w, n.id, 'scared');
      } else {
        adjustRel(n, { trust: -10, respect: -3, fear: 3 }); addHeat(w, ap_ === 'crew' ? 4 : 2, n.homeBlockId);
        if (ap_ === 'family' && (n.traits.includes('honest') || n.rel.trust < -30)) { addHeat(w, 6); log(w, `${n.name} went straight to the precinct. (+6 heat)`, 'bad', { npcId: n.id }); }
        else log(w, `${resultLine('threaten', ap_, false, rng)} ${n.name} is not impressed. ${n.traits.includes('hothead') ? 'They are looking for a fight now.' : 'Word gets around.'}`, 'bad', { npcId: n.id });
        if (n.traits.includes('hothead') || n.traits.includes('connected')) addGrudge(w, n, `${n.name} stared you down and you blinked.`);
        if (n.faction && w.factions[n.faction]) w.factions[n.faction].standing[PLAYER] -= 5;
      }
      break;
    }
    case 'recruit': {
      const n = npc(a.npcId); const ap_ = a.approach ?? 'promise'; n.known = true;
      const chance = approachChance(w, 'recruit', ap_, n); const ok = rng.int(1, 100) <= chance;
      if (!ok) {
        if (ap_ === 'lean') { adjustRel(n, { trust: -15, fear: 5 }); log(w, `${resultLine('recruit', ap_, false, rng)} ${n.name} wants nothing to do with you for a while.`, 'bad', { npcId: n.id }); }
        else { adjustRel(n, { trust: 2 }); log(w, `${resultLine('recruit', ap_, false, rng)} ${n.name} is not ready. (trust ${n.rel.trust})`, 'info', { npcId: n.id }); }
        break;
      }
      if (ap_ === 'cut') takeCash(w, 200);
      const base = 30 + Math.round((n.skills.muscle + n.skills.brains + n.skills.charm + n.skills.wheels + n.skills.tech) * 3);
      const cut = ap_ === 'cut' ? Math.round(base * 1.4) : ap_ === 'lean' ? Math.round(base * 0.7) : base;
      const loyalty = clamp(ap_ === 'cut' ? 60 + n.rel.trust / 3 : ap_ === 'lean' ? 20 + n.rel.fear / 4 : 40 + n.rel.trust / 2);
      n.crew = { loyalty, cut, status: 'idle', statusDays: 0, joinedDay: w.day };
      n.role = 'crew'; p.crewIds.push(n.id); p.crewEver++;
      for (const bid of n.favouriteBusinessIds) { const b = w.businesses[bid]; b.patronIds = b.patronIds.filter(id => id !== n.id); }
      log(w, `${resultLine('recruit', ap_, true, rng)} ${n.name} joins your crew at ${money(cut)}/day (loyalty ${Math.round(loyalty)}).`, 'good', { npcId: n.id });
      onJoin(w, n);
      // an owner does not leave their place behind: it comes in with them, at a partner's cut, minded by them
      for (const b of businessesOwnedBy(w, n.id)) {
        const prev = b.protection;
        if (prev?.factionId === PLAYER) continue;
        if (prev && w.factions[prev.factionId]) { const f = w.factions[prev.factionId]; f.standing[PLAYER] -= 15; f.grudges.push(`stolen:${b.id}`); log(w, `${f.name} was collecting from ${b.name}. They are not any more.`, 'warn', { factionId: f.id, businessId: b.id }); }
        b.protection = { factionId: PLAYER, rate: PARTNER_RATE, since: w.day, partner: true };
        const pr = mkRacket(w, 'protection', b);
        addInfluence(w, b.blockId, PLAYER, 10);
        log(w, `${b.name} comes with them: ${Math.round(PARTNER_RATE * 100)}% off the top, and nobody has to stand over it.`, 'good', { businessId: b.id, racketId: pr.id, npcId: n.id });
      }
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
        if (a.assignment.kind === 'lieutenant') promote(w, n, a.assignment.districtId);
      }
      break;
    }
    case 'audit': {
      const n = npc(a.npcId); const c = n.crew!; const d = c.assignment?.kind === 'lieutenant' ? w.districts[c.assignment.districtId] : undefined;
      const sharp = p.skills.brains * 8 + rng.int(0, 40) > 35;
      if (!sharp) { log(w, `You go over ${n.name}'s numbers for ${d?.name ?? 'the district'}. They look fine. Maybe they are.`, 'info', { npcId: n.id }); break; }
      if (c.skim && c.skim > 0) {
        const back = Math.round(c.skim * 0.6); p.dirty += back; c.skim = 0; c.loyalty = clamp(c.loyalty - 10);
        log(w, `The book does not add up. ${n.name} has been skimming ${d?.name ?? 'the district'}. You get ${money(back)} of it back and they know you are watching now. (−10 loyalty)`, 'bad', { npcId: n.id });
      } else { c.loyalty = clamp(c.loyalty - 2); log(w, `${n.name}'s book for ${d?.name ?? 'the district'} is clean. They noticed you checking.`, 'good', { npcId: n.id }); }
      break;
    }
    case 'bribe_official': {
      const n = npc(a.npcId); takeCash(w, a.amount);
      const o = n.official!;
      const gain = Math.round(Math.min(35, Math.sqrt(a.amount) / 3) * (0.5 + o.corruption / 100));
      adjustRel(n, { trust: gain });
      o.retainerDay = w.day; o.boughtBy = n.rel.trust >= 40 ? PLAYER : o.boughtBy;
      if (o.kind === 'captain') { const cut = Math.round(a.amount / 250); p.heat = clamp(p.heat - cut); buryEvidence(w, a.amount); log(w, `${n.name} pockets ${money(a.amount)}. Some files get lost. (-${cut} heat${(w.cases ?? []).some(c => c.status === 'open') ? ', open cases slip' : ''})`, 'money', { npcId: n.id }); }
      else if (o.kind === 'judge') log(w, `${n.name} accepts your "campaign contribution". Your people will see lighter sentences.`, 'money', { npcId: n.id });
      else log(w, `${n.name} takes ${money(a.amount)} and remembers your name. Permits will be easier.`, 'money', { npcId: n.id });
      if (n.rel.trust < 40 && rng.chance(0.15)) { addHeat(w, 6); log(w, `${n.name} took the money and also told a reporter. (+6 heat)`, 'bad'); }
      break;
    }

    case 'shakedown': {
      const b = w.businesses[a.businessId]; const owner = npc(b.ownerId); const ap_ = a.approach ?? 'lean'; owner.known = true;
      b.lastShakedownDay = w.day;
      const chance = approachChance(w, 'shakedown', ap_, owner, b); const ok = rng.int(1, 100) <= chance;
      if (ap_ === 'wreck') { b.condition = clamp(b.condition - 15); addHeat(w, 4, b.blockId); spreadRep(w, b.blockId, { fear: 4 }); adjustRel(owner, { fear: 10, trust: -15 }); addMemory(w, b.blockId, 'wreck', `Somebody smashed up ${b.name} in broad daylight.`); }
      const rival = b.protection && b.protection.factionId !== PLAYER ? w.factions[b.protection.factionId] : undefined;
      if (ok) {
        const mult = ap_ === 'wreck' ? 1.6 : ap_ === 'reason' ? 0.9 : 1.2;
        const take = Math.round(b.baseIncome * mult * (0.8 + rng.float() * 0.8));
        p.dirty += take;
        adjustRel(owner, ap_ === 'reason' ? { fear: 5, trust: 3 } : { fear: 12, trust: -8 });
        addHeat(w, ap_ === 'reason' ? 1 : 2, b.blockId); p.fear = clamp(p.fear + (ap_ === 'reason' ? 1 : 2));
        addInfluence(w, b.blockId, PLAYER, 4); if (ap_ !== 'reason') spreadRep(w, b.blockId, { fear: 3 });
        log(w, `${resultLine('shakedown', ap_, true, rng)} ${owner.name} hands over ${money(take)} at ${b.name}.`, 'money', { businessId: b.id, npcId: owner.id });
        if (rival) { rival.standing[PLAYER] -= 12; rival.grudges.push(`shakedown:${b.id}`); log(w, `${b.name} pays ${rival.name}. They will hear about this.`, 'warn', { factionId: rival.id }); }
      } else {
        adjustRel(owner, { trust: -12, respect: ap_ === 'reason' ? -6 : -3 }); addHeat(w, ap_ === 'wreck' ? 6 : 3, b.blockId);
        log(w, `${resultLine('shakedown', ap_, false, rng)} ${rival ? `"I pay ${rival.short}. Take it up with them."` : owner.traits.includes('honest') ? 'They threaten to call the cops.' : ''}`, 'bad', { businessId: b.id, npcId: owner.id });
        if (rival) rival.standing[PLAYER] -= 6;
        if (owner.traits.includes('honest') || owner.rel.trust < -30) addHeat(w, 4);
        if (ap_ !== 'reason' || owner.traits.includes('connected')) addGrudge(w, owner, `${owner.name} threw you out of ${b.name} and is telling everyone.`);
      }
      break;
    }
    case 'protect': {
      const b = w.businesses[a.businessId]; const owner = npc(b.ownerId);
      const prev = b.protection;
      if (prev && prev.factionId !== PLAYER) { const f = w.factions[prev.factionId]; f.standing[PLAYER] -= 20; f.grudges.push(`stolen:${b.id}`); log(w, `You just took ${b.name} away from ${f.name}. That is a provocation.`, 'warn', { factionId: f.id, businessId: b.id }); }
      const route = protectRoute(owner, a.rate);
      b.protection = { factionId: PLAYER, rate: a.rate, since: w.day };
      owner.faction = PLAYER;
      const r = mkRacket(w, 'protection', b);
      if (route === 'friend') {
        // nobody was leaned on, so nobody is frightened and nobody resents it
        adjustRel(owner, { trust: 5, respect: 3 });
        addInfluence(w, b.blockId, PLAYER, 10); addHeat(w, 1, b.blockId);
        log(w, `${owner.name} would rather you looked after ${b.name} than anyone else. ${Math.round(a.rate * 100)}%, between friends.`, 'good', { businessId: b.id, racketId: r.id, npcId: owner.id });
      } else {
        adjustRel(owner, { fear: 5, trust: a.rate <= 0.15 ? 3 : -5 });
        addInfluence(w, b.blockId, PLAYER, 8); addHeat(w, 1, b.blockId);
        log(w, `${b.name} now pays you ${Math.round(a.rate * 100)}%.`, 'good', { businessId: b.id, racketId: r.id });
      }
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
      const b = w.blocks[a.blockId];
      const squat = claimedByPlayer(b);
      if (!squat) takeCash(w, SAFEHOUSE_TIERS[0].rent);
      const s: Safehouse = { id: nid(w, 's'), blockId: b.id, name: `${squat ? 'Squat' : SAFEHOUSE_TIERS[0].label} on ${b.name}`, tier: 1, owner: PLAYER, stash: emptyStash(), cash: 0, productionIds: [], capacity: SAFEHOUSE_TIERS[0].capacity, hostageIds: [], squatted: squat || undefined };
      w.safehouses[s.id] = s; b.safehouseId = s.id; p.safehouseIds.push(s.id);
      addInfluence(w, b.id, PLAYER, 10);
      log(w, squat
        ? `You move into ${b.name}. It is not on anyone's books, so there is no rent and nobody to ask questions.`
        : `Rented a ${SAFEHOUSE_TIERS[0].label.toLowerCase()} on ${b.name}.`, 'good', { blockId: b.id });
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
    case 'restock_production': { const pr = w.productions[a.productionId]; const c = restockCost(w, pr, a.days); spend(w, c); pr.stock += a.days; log(w, `Stocked the ${PRODUCTION_DEFS[pr.kind].label.toLowerCase()} for ${a.days} more days (${money(c)}).`, 'money'); break; }
    case 'upgrade_production': { const pr = w.productions[a.productionId]; const def = PRODUCTION_DEFS[pr.kind]; takeCash(w, Math.round(def.setupCost * PRODUCTION_UPGRADE_MULT[pr.level])); pr.level++; log(w, `${def.label} at ${w.safehouses[pr.safehouseId].name} is level ${pr.level}: more ${PRODUCT_INFO[def.product].label.toLowerCase()}, better ${PRODUCT_INFO[def.product].label.toLowerCase()}, and a bit more noise.`, 'good', { blockId: w.safehouses[pr.safehouseId].blockId }); break; }
    case 'set_recipe': { const pr = w.productions[a.productionId]; pr.recipe = a.recipe; log(w, a.recipe ? `${PRODUCTION_DEFS[pr.kind].label} switched to ${RECIPES[a.recipe].label}.` : `${PRODUCTION_DEFS[pr.kind].label} back to the house recipe.`, 'info'); break; }
    case 'close_production': {
      const pr = w.productions[a.productionId]; const s = w.safehouses[pr.safehouseId];
      if (pr.workerId) { const n = npc(pr.workerId); if (n.crew) { n.crew.assignment = undefined; n.crew.status = 'idle'; } }
      s.productionIds = s.productionIds.filter(id => id !== pr.id); delete w.productions[pr.id];
      log(w, `Tore down the ${PRODUCTION_DEFS[pr.kind].label.toLowerCase()}.`, 'info'); break;
    }
    case 'move_stash': {
      const from = a.from === 'player' ? p : w.safehouses[a.from]; const to = a.to === 'player' ? p : w.safehouses[a.to];
      moveProduct(from, to, a.product, a.amount); break;
    }
    case 'sell_product': {
      const b = w.blocks[a.blockId];
      const price = streetPrice(w, b.id, a.product);
      const demand = b.demand[a.product] * 3; // a street session can move ~3 days of demand
      const sold = Math.min(a.amount, Math.max(1, Math.round(demand)));
      const take = Math.round(sold * price * (0.8 + p.skills.charm / 40) * sellMult(w, a.product));
      p.stash[a.product] -= sold; p.dirty += take;
      addHeat(w, PRODUCT_INFO[a.product].heat, b.id); addInfluence(w, b.id, PLAYER, 2);
      log(w, `Moved ${sold} ${PRODUCT_INFO[a.product].label.toLowerCase()} on ${b.name} for ${money(take)}.${sold < a.amount ? ' The block could not take more today.' : ''}`, 'money', { blockId: b.id });
      break;
    }
    case 'launder': {
      const cap = launderCapLeft(w); const amt = Math.min(a.amount, cap);
      p.dirty -= amt; p.cash += Math.round(amt * LAUNDER_RATE);
      p.launderedToday += amt;
      log(w, `Cleaned ${money(amt)} (${Math.round((1 - LAUNDER_RATE) * 100)}% cut).`, 'money'); break;
    }
    case 'launder_with_fixer': {
      const n = npc(a.npcId);
      const cap = fixerCapToday(w, n);
      const amt = Math.min(a.amount, fixerCapLeft(w, n), p.dirty);
      const rate = fixerRate(n.rel.trust);
      const clean = Math.round(amt * rate);
      p.dirty -= amt; p.cash += clean;
      n.fixer = { day: w.day, amount: fixerUsedToday(w, n) + amt, cap };
      // real business builds a real relationship: a full day's worth is worth the most
      const gain = Math.max(1, Math.round(FIXER.trustPerUse * (amt / Math.max(1, cap))));
      adjustRel(n, { trust: gain, respect: 1 });
      n.known = true;
      log(w, `${n.name} takes ${money(amt)} and hands back ${money(clean)} clean — ${Math.round(rate * 100)} cents on the dollar. (+${gain} trust)`, 'money', { npcId: n.id });
      break;
    }

    case 'plan_op': {
      const def = OP_DEFS[a.kind]; if (def.cost) takeCash(w, def.cost);
      const insider = a.approach === 'inside' ? insidersFor(w, a.targetBusinessId)[0] : undefined;
      const o: Op = { id: nid(w, 'o'), kind: a.kind, approach: a.approach, mode: a.mode ?? OP_DEFS[a.kind].modes?.[0]?.id, insideId: insider?.id, targetBusinessId: a.targetBusinessId, targetNpcId: a.targetNpcId, targetFactionId: a.targetFactionId, targetBlockId: a.targetBlockId, targetDistrictId: a.targetDistrictId, safehouseId: a.safehouseId ?? (a.kind === 'kidnap' ? p.safehouseIds[0] : undefined), crewIds: a.crewIds.slice(), planDays: def.planDays, daysLeft: def.planDays, status: def.planDays === 0 ? 'ready' : 'planning', createdDay: w.day };
      w.ops[o.id] = o; p.opIds.push(o.id);
      for (const id of a.crewIds) { const n = npc(id); n.crew!.assignment = { kind: 'op', opId: o.id }; n.crew!.status = 'assigned'; }
      log(w, `${def.label}${a.approach ? ` (${OP_APPROACHES[a.approach].label.toLowerCase()}${insider ? `, ${insider.name} inside` : ''})` : ''} is ${o.status === 'ready' ? 'ready to go' : `in planning (${def.planDays} days)`}.`, 'info', { opId: o.id });
      break;
    }
    case 'launch_op': { const o = w.ops[a.opId]; o.status = 'ready'; o.daysLeft = 0; o.launched = true; log(w, `${OP_DEFS[o.kind].label} goes tonight.`, 'warn', { opId: o.id }); break; }
    case 'abort_op': { const o = w.ops[a.opId]; o.status = 'aborted'; freeOpCrew(w, o); p.opIds = p.opIds.filter(id => id !== o.id); log(w, `${OP_DEFS[o.kind].label} called off.`, 'info'); break; }

    case 'parley': {
      const n = npc(a.npcId); const c = crewOfBoss(w, n.id)!; const ap_ = a.approach ?? 'tribute'; n.known = true;
      const chance = approachChance(w, 'parley', ap_, n); const ok = rng.int(1, 100) <= chance;
      const tone = parley(w, c, n, ap_, ok, rng);
      log(w, resultLine('parley', ap_, ok, rng), tone, { npcId: n.id, blockId: c.blockId });
      break;
    }
    case 'buy_item': {
      const b = w.businesses[a.businessId]; const item = ITEM_DEFS[a.itemId];
      const price = buyPrice(item);
      takeCash(w, price);                                  // clean cash, like every other purchase
      p.items = [...(p.items ?? []), item.id];
      adjustRel(npc(b.ownerId), { trust: 2, respect: 1 }); // a paying customer is a customer
      log(w, `${item.icon} ${item.label} — ${money(price)} at ${b.name}.`, 'money', { businessId: b.id });
      break;
    }
    case 'sell_item': {
      const b = w.businesses[a.businessId]; const item = ITEM_DEFS[a.itemId];
      const paid = sellPrice(w, item);
      const owned = [...(p.items ?? [])];
      owned.splice(owned.indexOf(item.id), 1);
      p.items = owned;
      // it goes out of your hands whether you were carrying it or not
      const carried = [...(p.equipped ?? [])];
      const worn = carried.indexOf(item.id);
      if (worn >= 0 && carried.filter(id => id === item.id).length > owned.filter(id => id === item.id).length) carried.splice(worn, 1);
      p.equipped = carried;
      p.dirty += paid;                                     // back-room money is dirty money
      log(w, `${b.name} takes the ${item.label.toLowerCase()} off you for ${money(paid)}. Used goods, used prices.`, 'money', { businessId: b.id });
      break;
    }
    case 'equip': {
      const item = ITEM_DEFS[a.itemId];
      const carried = [...(p.equipped ?? [])];
      if (a.on) carried.push(item.id);
      else carried.splice(carried.indexOf(item.id), 1);
      p.equipped = carried;
      break;
    }
    case 'run_card': {
      const c = cardById(w, a.cardId)!;
      runCard(w, c, a.mode, rng);
      break;
    }
    case 'dump_cards': {
      dumpCards(w);
      break;
    }
    case 'sell_dirt': {
      const sec = secrets(w).find(x => x.id === a.secretId)!;
      sellDirt(w, sec, a.factionId, rng);
      break;
    }
    case 'pull_tap': {
      endTap(w, npc(a.npcId), false, rng);
      break;
    }
    case 'scrub_trail': {
      const { cost } = scrubPower(w);
      takeCash(w, cost);
      scrubTrail(w);
      break;
    }
    case 'resolve_confrontation': {
      const c = confrontations(w).find(x => x.id === a.id)!;
      resolveConfrontation(w, c, a.approach, rng);
      break;
    }
    case 'case_joint': {
      const b = w.businesses[a.businessId];
      b.casedUntil = w.day + CASE_JOINT.days;
      // a coarse read on everyone inside: enough to pick a mark, not enough to know them
      const people = [b.ownerId, ...b.patronIds].map(id => npc(id)).filter(n => n && n.alive);
      for (const n of people) if (!n.known) n.hint = caseHint(n);
      log(w, `You spend an hour in ${b.name} looking at exits and faces. ${people.length} ${people.length === 1 ? 'person' : 'people'} read, and you know the way the place works until day ${b.casedUntil}.`, 'good', { businessId: b.id });
      break;
    }
    case 'set_note': {
      // the player's own words, kept apart from n.notes (which is the sim's flavour text);
      // an empty note clears the field rather than storing ''
      const n = npc(a.npcId); const text = a.text.trim().slice(0, PLAYER_NOTE_MAX);
      n.playerNote = text || undefined;
      break;
    }
    case 'move': {
      const r = route(w, p.currentBlockId, a.toBlockId)!;
      const from = w.blocks[p.currentBlockId]; const to = w.blocks[a.toBlockId];
      p.legwork = Math.max(0, p.legwork - r.cost);
      p.currentBlockId = a.toBlockId;
      const far = r.hops.length;
      log(w, `You walk from ${from?.name ?? 'where you were'} to ${to.name}${far > 1 ? ` (${far} blocks)` : ''}. ${r.cost} legwork, ${p.legwork} left.`, 'info', { blockId: to.id });
      break;
    }
    case 'sit_down': sitDown(w, a.factionId, a.offer, rng); break;
    case 'broker': {
      const n = npc(a.npcId); const ap_ = a.approach ?? 'split'; n.known = true;
      const chance = approachChance(w, 'broker', ap_, n, undefined, a.otherFactionId); const ok = rng.int(1, 100) <= chance;
      const tone = broker(w, n, a.otherFactionId, ap_, ok, rng);
      log(w, resultLine('broker', ap_, ok, rng), tone, { npcId: n.id, factionId: n.faction });
      break;
    }
    case 'back_candidate': { const f = w.factions[a.factionId]; takeCash(w, a.amount); backCandidate(w, f, a.npcId, a.amount); break; }
    case 'petition_seat': petition(w, rng); break;
    case 'resolve_hostage': { const n = npc(a.npcId); resolveHostage(w, n, a.mode, rng); break; }
    case 'pay_tribute': {
      const f = w.factions[a.factionId]; spend(w, a.amount); f.cash += a.amount;
      const gain = Math.round(Math.min(25, Math.sqrt(a.amount) / 4) * (f.temperament === 'greedy' ? 1.5 : 1));
      f.standing[PLAYER] = clamp(f.standing[PLAYER] + gain, -100, 100); f.stance[PLAYER] = stanceFor(f.standing[PLAYER]);
      log(w, `${f.name} accepts ${money(a.amount)}. (+${gain} standing)`, 'money', { factionId: f.id });
      break;
    }
    case 'declare': {
      const f = w.factions[a.factionId];
      if ((f.truceUntil[PLAYER] ?? 0) > w.day) { f.brokenTruces = (f.brokenTruces ?? 0) + 1; f.truceUntil[PLAYER] = 0; log(w, `You broke a truce with ${f.name}. They will never fully trust you again.`, 'warn', { factionId: f.id }); }
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
    case 'end_day': { endPartnerships(w); done(); return endDay(w); }
    case 'populate_chunk': { const added = populateChunk(w, a.chunk, rng); if (added.length) log(w, `You get to know a new part of town: ${added.length} blocks around ${w.blocks[added[0].id].name}.`, 'info', { blockId: added[0].id }); break; }
    case 'rename': p.name = a.name.trim(); break;
    case 'cheat': { cheat(w, a.what); break; }
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

/** Testing tools. Ordinary reducer work — no hidden state, no branch anywhere else in the sim reads `cheated`;
 *  it is there so a save that was messed with is never mistaken for a real playthrough. */
function cheat(w: World, what: CheatKind) {
  const p = w.player; w.cheated = true;
  const here = w.blocks[p.currentBlockId];
  switch (what) {
    case 'cash': p.cash += 10000; log(w, 'Testing: +$10,000 clean.', 'money'); break;
    case 'dirty': p.dirty += 10000; log(w, 'Testing: +$10,000 dirty.', 'money'); break;
    case 'ap': p.ap = p.apMax; log(w, 'Testing: AP refilled.', 'info'); break;
    case 'legwork': p.legwork = p.legworkMax; log(w, 'Testing: legwork refilled.', 'info'); break;
    case 'heat': p.heat = 0; for (const b of Object.values(w.blocks)) b.heat = 0; log(w, 'Testing: heat cleared.', 'good'); break;
    case 'skills': for (const k of Object.keys(p.skills) as (keyof typeof p.skills)[]) p.skills[k] = 10; p.legworkMax = legworkFor(p.skills.wheels); log(w, 'Testing: every skill at 10.', 'good'); break;
    case 'crew': {
      const pool = Object.values(w.npcs).filter(n => n.alive && !n.crew && !n.official && ['patron', 'owner'].includes(n.role)).slice(0, 3);
      for (const n of pool) {
        n.crew = { loyalty: 80, cut: 50, status: 'idle', statusDays: 0, joinedDay: w.day };
        n.role = 'crew'; n.known = true; p.crewIds.push(n.id); p.crewEver++;
      }
      log(w, `Testing: ${pool.length} people joined your crew.`, 'good');
      break;
    }
    case 'unlock': {
      p.crewEver = Math.max(p.crewEver, 10);
      for (const kind of Object.keys(OP_DEFS) as (keyof typeof OP_DEFS)[]) {
        if (Object.values(w.ops).some(o => o.kind === kind && o.status === 'done')) continue;
        const id = nid(w, 'o');
        w.ops[id] = { id, kind, crewIds: [], planDays: 0, daysLeft: 0, status: 'done', createdDay: w.day };
      }
      log(w, 'Testing: every op has a prior job behind it.', 'good');
      break;
    }
    case 'safehouse': {
      const s: Safehouse = { id: nid(w, 'sh'), blockId: here.id, name: `Test house on ${here.name}`, tier: 3, owner: PLAYER, stash: emptyStash(), cash: 0, productionIds: [], capacity: SAFEHOUSE_TIERS[2].capacity, hostageIds: [] };
      w.safehouses[s.id] = s; here.safehouseId = s.id; p.safehouseIds.push(s.id);
      log(w, `Testing: a tier 3 safehouse on ${here.name}.`, 'good', { blockId: here.id });
      break;
    }
    case 'own_block': {
      for (const id of here.businessIds) { const b = w.businesses[id]; if (b.ownedBy === 'player') continue; b.ownedBy = 'player'; b.protection = undefined; p.businessIds.push(b.id); w.npcs[b.ownerId].faction = PLAYER; }
      log(w, `Testing: every business on ${here.name} is yours.`, 'good', { blockId: here.id });
      break;
    }
    case 'turf': addInfluence(w, here.id, PLAYER, 60); log(w, `Testing: ${here.name} is your turf.`, 'good', { blockId: here.id }); break;
    case 'reveal': {
      for (const n of Object.values(w.npcs)) n.known = true;
      for (const b of Object.values(w.blocks)) if (b.abandoned) b.abandoned.known = true;
      log(w, 'Testing: everyone is known and every derelict block is on the map.', 'info');
      break;
    }
    case 'stash': for (const k of Object.keys(p.stash) as (keyof typeof p.stash)[]) p.stash[k] += 50; log(w, 'Testing: +50 of every product.', 'good'); break;
  }
}

/** A partnership lasts exactly as long as the partner does. However they leave the crew — fired, walked out,
 *  jailed for good, killed — the place goes back to being their own. One sweep covers every exit. */
function endPartnerships(w: World) {
  for (const rid of w.player.racketIds.slice()) {
    const r = w.rackets[rid]; if (!r || r.kind !== 'protection') continue;
    const b = w.businesses[r.businessId]; if (!b?.protection?.partner) continue;
    const owner = w.npcs[b.ownerId];
    if (owner?.alive && owner.crew && owner.crew.status !== 'dead') continue;
    closeRacket(w, rid);
    b.protection = undefined;
    log(w, `${b.name} is not yours any more. The partnership ended with ${owner?.name ?? 'its owner'}.`, 'warn', { businessId: b.id });
  }
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
  if (asg?.kind === 'lieutenant') onDemote(n);
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
  if (effectivePolice(w, block.id) > 60) options.push('"Cops sit on this block. Careful what you carry."');
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
  const owed = f.owed ?? 0;
  const accept = (threshold: number) => { const ok = charm + standing * 0.5 + temper + roll + (owed ? 20 : 0) > threshold; if (ok && owed) { f.owed = owed - 1; log(w, `${f.short} remember what they owe you.`, 'info', { factionId: f.id }); } return ok; };
  const lt = w.npcs[f.lieutenantIds[0]];
  const setStance = (s: number) => { f.standing[PLAYER] = Math.min(clamp(s, -100, 100), standingCap(f)); f.stance[PLAYER] = stanceFor(f.standing[PLAYER]); };
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

/**
 * What an hour in the room tells you about somebody: how they carry themselves, not their file.
 * Deliberately coarser than `read` — a direction, with no numbers and no trait names.
 */
export function caseHint(n: import('./types').Npc): string {
  const t = n.traits;
  if (t.includes('coward') || n.nerve < 30) return 'Looks like they would fold if you raised your voice.';
  if (t.includes('hothead')) return 'Wound tight. Would swing first.';
  if (t.includes('connected')) return 'People keep stopping at their table.';
  if (t.includes('honest')) return 'Straight-backed. The type who calls it in.';
  if (t.includes('greedy') || t.includes('gambler')) return 'Watches the money in the room.';
  if (n.nerve > 65) return 'Steady. Would not scare easy.';
  return 'Nothing obvious either way.';
}

function agendaText(n: import('./types').Npc): string { return n.agenda ? AGENDA_LABEL[n.agenda.kind] : ''; }
