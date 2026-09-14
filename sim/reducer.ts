import { SUPPLY_LABELS } from './automation';
import { authorities, effectivePolice, postureFor } from './authority';
import { BUSINESS_DEFS } from '@content/businesses';
import { OP_APPROACHES, OP_DEFS, PRODUCTION_DEFS, PRODUCT_INFO, RACKET_DEFS, RACKET_UPGRADE_COST, SAFEHOUSE_TIERS } from '@content/rackets';
import { insidersFor } from './select';
import { RECRUIT_LEAN_FEAR, type Stake } from '@content/standing';
import { concessionReason, doFavour, factionLeverage, familiar, familiarReason, favours, leverageOver } from './standing';
import type { Action, Affordance, CheatKind, SitDownOffer } from './actions';
import type { Rng } from './rng';
import { agendaCost, agendaReason, resolveAgenda } from './agendas';
import { resolveTalk, startConversation } from './conversation';
import { oweThem, remember } from './ledger';
import { openIntel } from './intel';
import { scoreMeeting } from './nemesis';
import { assetReason, introduce, referralReason, turnAsset, type AssetKind } from './informants';
import { DEFECT } from '@content/nemesis';
import { REFERRAL } from '@content/informants';
import { defect, defectReason } from './defect';
import { familyOf } from './connections';
import { canHost, extortReason, setupCost, tierOf } from './tiers';
import { TIERS } from '@content/businesses';
import { distanceFromStart } from './select';
import { emptyStash, stanceFor } from './generate';
import { populateChunk } from './populate';
import { PARTNER_RATE, businessesOwnedBy, fixerCapLeft, fixerCapToday, fixerDailyCap, fixerRate, fixerUsedToday, insureCost, launderCapacity, protectReason, protectRoute, repairCost, streetPrice } from './economy';
import { resolveEventOption } from './events';
import { approachChance, resultLine } from './scenes';
import { AGENDA_LABEL, addGrudge, addMemory } from './people';
import { standingCap } from './factions';
import { crewAt, crewOfBoss, fundReason, makeCrew, parley } from './crews';
import { endDay } from './tick';
import { PLAYER, type AgendaKind, type Business, type Confrontation, type Id, type Npc, type Op, type Racket, type RacketKind, type Safehouse, type TalkMove, type World } from './types';
import { onDemote, promote, promoteReason } from './lieutenants';
import { backCandidate, broker, brokerReason } from './politics';
import { buryEvidence, caseWitnessOf, openCase, silenceWitness } from './cases';
import { blockName as blockNameOf, isHere, legworkFor, npcBlockIds, npcIsHere, route, travelCost } from './travel';
import { petition, seatReason } from './commission';
import { abandonedBlocks, claimedByPlayer, makeAbandoned } from './abandoned';
import { isHeld, resolveHostage, roomFor } from './hostages';
import { PLAYER_NOTE_MAX, opCost, opLocked } from './select';
import { EQUIP_MAX, buyPrice, equipSlotsLeft, isMarket, marketStock, ownedCount, sellPrice } from './items';
import { activeConfrontation, confrontOptions, confrontations, resolveConfrontation } from './combat';
import { addCard, cardById, cyberHeat, dumpCards, endTap, learnSecret, liveCards, rollCard, runCard, scrubPower, scrubTrail, secrets, sellDirt } from './cyber';
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
/**
 * The scene action a conversation stands for. One place, used three times — gating a closing
 * move, gating the conversation itself before it opens, and running the scene when it closes —
 * so a conversation can never be a way round a shakedown's cash cost or a visit's AP.
 */
function sceneAction(c: { npcId?: Id; talk?: Confrontation['talk'] }, approach?: string): Action {
  const t = c.talk!; const npcId = c.npcId!;
  switch (t.scene) {
    case 'shakedown': return { type: 'shakedown', businessId: t.businessId!, approach };
    case 'threaten': return { type: 'threaten', npcId, approach };
    case 'recruit': return { type: 'recruit', npcId, approach };
    case 'parley': return { type: 'parley', npcId, approach };
    case 'broker': return { type: 'broker', npcId, otherFactionId: t.otherFactionId!, approach };
    default: return { type: 'visit', npcId, approach };
  }
}

/**
 * Can the player do this, and what does it cost?
 *
 * Two layers, split so one action can ask about another. `can` is the public answer and includes
 * the modal gates — a card on the table, somebody in front of you. `gate` is the action's own
 * rules with those skipped, which is what a conversation needs when it asks "could this closing
 * move actually run?": the conversation *is* the thing in front of you, so asking through `can`
 * has it refuse itself, and for an afternoon it did.
 */
export function can(w: World, a: Action): Affordance {
  const blocked = pendingBlock(w, a);
  return blocked ?? gate(w, a);
}

function pendingBlock(w: World, a: Action): Affordance | undefined {
  if (w.gameOver) return no('The game is over.');
  // bookkeeping (renaming yourself, a note to self, streaming in geometry) is not a move, so it is never blocked
  const freeAlways = ['end_day', 'resolve_event', 'rename', 'set_note', 'populate_chunk'];
  if (freeAlways.includes(a.type) || a.type === 'resolve_confrontation') return undefined;
  // Answering somebody at the door is never blocked by a pending event. Both are modal, and the
  // confrontation renders on top of the event card, so blocking it here left the player clicking
  // a button they could see and getting a refusal about a card they could not — found by the
  // soak bot spinning against it 140 times in a thirty-day war.
  if (w.pendingEvents.length) return no('Deal with what is in front of you first.');
  // somebody is standing in front of you: nothing else happens until you answer them
  const open = activeConfrontation(w);
  if (!open) return undefined;
  // a conversation names the person, not their outfit: "Jade Circle are in front of you" is a
  // baffling thing to read when you are the one who walked into somebody's shop
  return no(open.kind === 'talk'
    ? `You are in the middle of talking to ${w.npcs[open.npcId ?? '']?.name ?? 'somebody'}. Finish that first.`
    : `${w.factions[open.factionId]?.short ?? 'They'} are in front of you right now. Deal with that first.`);
}

function gate(w: World, a: Action): Affordance {
  const p = w.player;
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
    case 'parley': { const n = npc(a.npcId); if (!n?.alive) return no('They are gone.'); const c0 = crewOfBoss(w, n.id); if (!c0) return no('They do not run a crew.'); if (!isHere(w, c0.blockId)) return no(`The ${c0.name} hold ${blockNameOf(w, c0.blockId)}. Walk over first${travelCost(w, c0.blockId) !== undefined ? ` (${travelCost(w, c0.blockId)} legwork)` : ''}.`); const r = ap(1); if (r) return no(r); if (a.approach === 'join' && bedsLeft(w) <= 0) return no('No room in your safehouses for their boss.'); if (a.approach === 'fund') { const why = fundReason(w, c0); if (why) return no(why); } return yes({ ap: 1 }); }
    case 'broker': { const n = npc(a.npcId); if (!n?.alive) return no('They are gone.'); const why = brokerReason(w, n, a.otherFactionId); if (why) return no(why); const r = ap(2); if (r) return no(r); if (a.approach === 'split') { const c = cash(4000); if (c) return no(c); } return yes({ ap: 2, cash: a.approach === 'split' ? 4000 : 0 }); }
    case 'resolve_confrontation': {
      const c = confrontations(w).find(x => x.id === a.id); if (!c) return no('That is over.');
      const opt = confrontOptions(w, c).find(o => o.id === a.approach);
      if (opt?.disabled) return no(opt.disabled);
      // A closing move runs the scene it came from, so it has to satisfy that scene's own gate —
      // otherwise a conversation would be a way round the AP and cash checks on a shakedown.
      if (c.kind === 'talk' && typeof a.approach === 'string' && a.approach.startsWith('approach:')) {
        return gate(w, sceneAction(c, a.approach.slice('approach:'.length)));
      }
      return yes();
    }
    case 'talk': {
      const n = npc(a.npcId); if (!n?.alive) return no('They are gone.');
      if (activeConfrontation(w)) return no('You are already in the middle of something.');
      // Opening a conversation is free; the AP goes on whatever you close it with. But there is
      // no point opening one you could not possibly close, so the scene's own gate is checked
      // here too — a player out of AP is told that at the door, not three moves in. Its *cost*
      // is deliberately dropped: inheriting it charged the AP twice, once at the door and again
      // on the way out.
      const why = gate(w, sceneAction({ npcId: a.npcId, talk: { scene: a.scene, businessId: a.businessId, otherFactionId: a.otherFactionId, beat: 0, bonus: 0, used: [] } }));
      return why.ok ? yes() : why;
    }
    case 'resolve_agenda': {
      const n = npc(a.npcId); if (!n?.alive) return no('They are gone.');
      const why = agendaReason(w, n, a.mode); if (why) return no(why);
      const h = hereNpc(n); if (h) return no(h);
      const r = ap(1); if (r) return no(r);
      const cost = agendaCost(w, n, a.mode);
      if (cost) { const c2 = cash(cost); if (c2) return no(c2); }
      return yes({ ap: 1, cash: cost });
    }
    case 'defect': {
      const n = npc(a.npcId); if (!n?.alive) return no('They are gone.');
      const why = defectReason(w, n); if (why) return no(why);
      const h = hereNpc(n); if (h) return no(h);
      if (bedsLeft(w) <= 0) return no('No room. Rent or upgrade a safehouse.');
      const r = ap(DEFECT.ap); return r ? no(r) : yes({ ap: DEFECT.ap });
    }
    case 'turn_asset': {
      const n = npc(a.npcId); if (!n?.alive) return no('They are gone.');
      const why = assetReason(w, n, a.kind); if (why) return no(why);
      const h = hereNpc(n); if (h) return no(h);
      const r = ap(1); return r ? no(r) : yes({ ap: 1 });
    }
    case 'introduce': {
      const n = npc(a.npcId); if (!n?.alive) return no('They are gone.');
      const why = referralReason(w, n, a.toNpcId); if (why) return no(why);
      const h = hereNpc(n); if (h) return no(h);
      const r = ap(REFERRAL.ap); return r ? no(r) : yes({ ap: REFERRAL.ap });
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
      // `can` and `dispatch` have to read the same approach or the gate is decorative: the
      // reducer defaults an absent approach to 'promise', and for a while this did not, so the
      // concession check below was skipped by every caller that left it off.
      const ap_ = a.approach ?? 'promise';
      // Walking away from your own life to work for somebody is the biggest concession in the
      // game, and it used to be buyable with a stack of pleasant visits. Three routes now, and
      // each wants its own thing: a wage is a transaction, coercion wants real fear behind it,
      // and a straight pitch — trust and charm and nothing else — wants a reason they would say
      // yes. Nobody joins a stranger, so the familiarity floor sits under all three.
      //
      // These come before the walk-over check on purpose. "Cross town, then be told they were
      // never going to say yes" is a bad answer for a player and a worse one for the bot, which
      // read the location refusal as a maybe and spent whole days walking to people it could
      // not recruit. A refusal the player cannot fix by moving should not be hidden behind one
      // they can.
      const stranger = familiarReason(w, n); if (stranger) return no(stranger);
      if (ap_ === 'lean' && n.traits.includes('loyal')) return no('Loyal people do not fold.');
      if (ap_ === 'lean' && n.rel.fear < RECRUIT_LEAN_FEAR) return no(`${n.name} is wary of you, not frightened of you. Show them something first.`);
      if (ap_ === 'promise') { const why = concessionReason(w, n, 'a place in your crew'); if (why) return no(why); }
      const h = hereNpc(n); if (h) return no(h);
      const r = ap(1); if (r) return no(r);
      if (bedsLeft(w) <= 0) return no('No room. Rent or upgrade a safehouse.');
      if (ap_ === 'cut' && p.cash < 200) return no('Needs $200 up front.');
      return yes({ ap: 1, cash: ap_ === 'cut' ? 200 : 0 });
    }
    case 'fire': { const n = npc(a.npcId); if (!n?.crew) return no('Not your crew.'); return yes(); }
    case 'assign': {
      const n = npc(a.npcId); if (!n?.crew) return no('Not your crew.');
      if (n.crew.status === 'dead') return no('Dead.'); if (n.crew.status === 'jailed') return no('In jail.'); if (n.crew.status === 'injured') return no('Injured. Give them a few days.');
      if (!a.assignment) return yes();
      if (a.assignment.kind === 'racket') { const r = w.rackets[a.assignment.racketId]; if (!r || r.owner !== PLAYER) return no('Not your racket.'); if (r.runnerId && r.runnerId !== n.id) return no('Someone already runs it.'); }
      if (a.assignment.kind === 'production') { const pr = w.productions[a.assignment.productionId]; if (!pr) return no('No such production.'); if (pr.workerId && pr.workerId !== n.id) return no('Someone already works it.'); }
      if (a.assignment.kind === 'op') { const o = w.ops[a.assignment.opId]; if (!o || o.status !== 'planning') return no('That op is not being planned.'); }
      if (a.assignment.kind === 'foreman') {
        const pr = w.productions[a.assignment.productionId];
        if (!pr || !p.safehouseIds.includes(pr.safehouseId)) return no('Not a production of yours.');
        const other = p.crewIds.map(id => w.npcs[id]).find(x => x.id !== n.id && x.crew?.assignment?.kind === 'foreman' && x.crew.assignment.productionId === pr.id);
        if (other) return no(`${other.name} already runs that one.`);
      }
      if (a.assignment.kind === 'lieutenant') { const why = promoteReason(w, n, a.assignment.districtId); if (why) return no(why); const r = ap(LIEUTENANT.ap); return r ? no(r) : yes({ ap: LIEUTENANT.ap }); }
      return yes();
    }
    case 'set_supply': { const r = w.rackets[a.racketId]; if (r?.owner !== PLAYER) return no('Not your racket.'); return yes(); }
    case 'audit': { const n = npc(a.npcId); if (!n?.crew) return no('Not your crew.'); if (n.crew.assignment?.kind !== 'lieutenant') return no('Only lieutenants keep a book.'); const r = ap(1); return r ? no(r) : yes({ ap: 1 }); }
    case 'bribe_official': { const n = npc(a.npcId); if (!n?.official) return no('Not an official.'); if (a.amount < 500) return no('Officials do not get out of bed for less than $500.'); const r = cash(a.amount); return r ? no(r) : yes({ cash: a.amount }); }

    case 'shakedown': {
      const b = biz(a.businessId); if (!b) return no('No such place.');
      if (b.ownedBy === 'player') return no('You own it. Shake yourself down?');
      const why0 = extortReason(b); if (why0) return no(why0);
      const h = hereBiz(b); if (h) return no(h);
      if (b.lastShakedownDay !== undefined && w.day - b.lastShakedownDay < 3) return no('You were just here. Give it a few days.');
      if (a.approach === 'wreck' && activeCrewCount(w) === 0) return no('Needs crew to wreck the place.');
      const r = ap(1); return r ? no(r) : yes({ ap: 1 });
    }
    case 'protect': {
      const b = biz(a.businessId); if (!b) return no('No such place.');
      if (b.ownedBy === 'player') return no('You own it already.');
      const why0 = extortReason(b); if (why0) return no(why0);
      if (b.protection?.factionId === PLAYER) return no('Already paying you.');
      if (a.rate < 0.05 || a.rate > 0.4) return no('Rate must be 5–40%.');
      const r = ap(1); if (r) return no(r);
      const owner = npc(b.ownerId);
      const why = protectReason(w, owner, a.rate); if (why) return no(why);
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
      // A friendly price is a concession, so it wants the same thing every other concession
      // wants: trust plus a reason. Being liked gets you the asking price, same as a stranger.
      const friendly = owner.rel.trust >= 30 && familiar(w, owner) && (favours(owner) > 0 || !!leverageOver(w, owner));
      const need = b.value * (friendly ? 0.9 : owner.rel.fear >= 60 ? 0.8 : 1.15) * (officialTrust(w, 'councillor') >= 40 ? 0.85 : 1);
      if (a.offer < need) return no(`Not enough. ${owner.name} wants about ${money(need)}${friendly ? '' : owner.rel.trust >= 30 ? ' (less if you had done them a turn, or held something over them)' : ' (less if they trusted you)'}.`);
      return yes({ cash: a.offer });
    }
    case 'sell_business': { const b = biz(a.businessId); if (b?.ownedBy !== 'player') return no('Not yours.'); return yes(); }
    case 'insure': { const b = biz(a.businessId); if (b?.ownedBy !== 'player') return no('Not yours.'); if (b.insured) return no('Already insured.'); const c = insureCost(b); const r = cash(c); return r ? no(r) : yes({ cash: c }); }
    case 'repair': { const b = biz(a.businessId); if (b?.ownedBy !== 'player') return no('Not yours.'); if (b.condition >= 95) return no('Nothing to fix.'); const c = repairCost(b); const r = cash(c); return r ? no(r) : yes({ cash: c }); }

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
      // The type's own list and the tier's, intersected. A bar is still a bar; what changed is
      // that an established place will not run a corner operation out of the front of house, and
      // an institution runs nothing at all.
      if (!canHost(b, a.kind)) return no(BUSINESS_DEFS[b.type].rackets.includes(a.kind)
        ? `${TIERS[tierOf(b)].label.toLowerCase()} places like ${b.name} do not run ${def.label.toLowerCase()} out of the front.`
        : `A ${BUSINESS_DEFS[b.type].label.toLowerCase()} cannot host ${def.label.toLowerCase()}.`);
      if (b.racketIds.some(id => w.rackets[id].kind === a.kind)) return no('Already running here.');
      if (b.ownedBy !== 'player' && b.protection?.factionId !== PLAYER) return no('You need to own the place or have it under your protection.');
      if (a.kind === 'dealing' && !a.product) return no('Pick a product to move.');
      // setting up inside an established place costs what everything there costs
      const cost = setupCost(b, a.kind);
      const r = cash(cost); if (r) return no(r);
      const r2 = ap(1); if (r2) return no(r2);
      return yes({ cash: cost, ap: 1 });
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
      const locked = opLocked(w, a.kind, { npcId: a.targetNpcId, businessId: a.targetBusinessId, caseId: a.targetCaseId, blockId: a.targetBlockId }); if (locked) return no(locked);
      if (a.crewIds.length < def.minCrew) return no(`Needs at least ${def.minCrew} crew.`);
      if (a.crewIds.length > def.maxCrew) return no(`Too many. Max ${def.maxCrew}.`);
      for (const id of a.crewIds) { const n = npc(id); if (!n?.crew || n.crew.status !== 'idle') return no(`${n?.name ?? 'Someone'} is not available.`); }
      // law-facing work costs what the posture says it costs, so the planner's quote and the
      // charge come from one function and cannot drift apart
      const price = opCost(w, a.kind, { npcId: a.targetNpcId, caseId: a.targetCaseId });
      if (price) { const r = cash(price); if (r) return no(r); }
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
      if (def.target === 'case' && !a.targetCaseId) return no('Pick a file.');
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
      if (def.target === 'npc') {
        const n = npc(a.targetNpcId!); if (!n?.alive) return no('Already gone.');
        // Violence against an official is still off the table. Sitting down with one and paying
        // for their attention is the entire point of an officialTarget op, so it is exempt —
        // the gate is about what you do to them, not about whether they may be a target at all.
        if (n.official && !def.requires?.officialTarget) return no('Going after an official ends careers. Not available.');
        if (a.kind === 'frame' && !(n.faction && w.factions[n.faction] && (n.role === 'boss' || n.role === 'lieutenant'))) return no('A frame only sticks on a faction boss or lieutenant.');
      }
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
  if (check.cost?.ap) w.player.ap -= check.cost.ap;
  const { rng, done } = rngOf(w);
  const next = apply(w, a, rng, done);
  if (next) return next;          // end_day replaces the world and has already written the rng back
  done();
  return w;
}

/**
 * What an action actually does, on an already-cloned world with the costs already charged.
 *
 * Split out of `dispatch` so one action can run another on the *same* world — which is what a
 * conversation needs: its closing move is one of the scene's own approaches, and that scene has
 * to run here rather than being re-dispatched into a fresh clone. `bonus` is what the openers in
 * that conversation bought, and it rides on the closing approach's odds and nowhere else.
 *
 * Returns a world only for `end_day`, which replaces it wholesale.
 */
function apply(w: World, a: Action, rng: Rng, done: () => void, bonus = 0): World | undefined {
  const p = w.player;
  const npc = (id: Id) => w.npcs[id];

  switch (a.type) {
    case 'visit': {
      const n = npc(a.npcId); const ap_ = a.approach ?? 'listen'; n.known = true;
      if (a.approach === 'drinks') takeCash(w, 50);
      const chance = approachChance(w, 'visit', ap_, n, undefined, undefined, bonus); const ok = rng.int(1, 100) <= chance;
      const biz = n.favouriteBusinessIds[0] ? w.businesses[n.favouriteBusinessIds[0]] : undefined;
      let gain = 0, respect = 0, extra = '';
      if (ap_ === 'drinks') { gain = ok ? 8 + Math.round(p.skills.charm / 2) : 4; }
      else if (ap_ === 'business') { respect = ok ? 6 : 3; gain = 2; if (ok) { const tip = patronTip(w, n, rng); if (tip) { extra = ` ${tip}`; oweThem(w, n, 'They told you something they did not have to.'); } } }
      else { gain = ok ? 5 + Math.round(p.skills.charm / 3) : 2; if (ok && n.role === 'patron' && rng.chance(0.5)) { const tip = patronTip(w, n, rng); if (tip) extra = ` ${tip}`; } }
      if (n.traits.includes('quiet')) gain = Math.max(1, gain - 1);
      if (n.homeBlockId === p.homeBlockId) gain += 1; // home turf
      adjustRel(w, n, { trust: gain, respect });
      if (n.official && n.rel.trust >= 20) extra = ' They mention, unofficially, that a donation would be remembered.';
      log(w, `${resultLine('visit', ap_, ok, rng)} ${n.name}${biz ? ` at ${biz.name}` : ''}: +${gain} trust${respect ? `, +${respect} respect` : ''}.${extra}`, ok ? 'good' : 'info', { npcId: n.id, businessId: biz?.id });
      break;
    }
    case 'read': {
      const n = npc(a.npcId);
      const chance = 40 + p.skills.charm * 5 + p.skills.tech * 2 + (n.traits.includes('quiet') ? -15 : 0);
      if (rng.int(1, 100) <= chance) { n.known = true; remember(w, n, 'read', `You sized them up: ${n.traits.join(', ') || 'nothing much showing'}, nerve ${n.nerve}.`); log(w, `You size up ${n.name}: ${n.traits.join(', ')}. Nerve ${n.nerve}.${n.agenda ? ` They ${agendaText(n)}.` : ''}${n.recipe && RECIPES[n.recipe] ? ` They know ${RECIPES[n.recipe].label}; worth having in the crew.` : ''}`, 'good', { npcId: n.id }); }
      else { adjustRel(w, n, { trust: -2 }); log(w, `${n.name} notices you watching and clams up.`, 'info', { npcId: n.id }); }
      break;
    }
    case 'gift': {
      const n = npc(a.npcId); takeCash(w, a.amount);
      const greedy = n.traits.includes('greedy') ? 1.5 : n.traits.includes('honest') ? 0.5 : 1;
      const gain = Math.round(Math.min(30, Math.sqrt(a.amount) / 2) * greedy);
      adjustRel(w, n, { trust: gain, respect: Math.round(gain / 3) });
      remember(w, n, 'deal', `You gave them ${money(a.amount)}.`);
      log(w, `${n.name} takes your ${money(a.amount)}. (+${gain} trust)`, 'money', { npcId: n.id });
      if (a.amount >= 500 && caseWitnessOf(w, n.id) && (n.rel.trust >= 30 || n.traits.includes('greedy'))) silenceWitness(w, n.id, 'paid');
      break;
    }
    case 'threaten': {
      const n = npc(a.npcId); const ap_ = a.approach ?? 'stare'; n.known = true;
      const chance = approachChance(w, 'threaten', ap_, n, undefined, undefined, bonus); const ok = rng.int(1, 100) <= chance;
      if (ok) {
        // What the threat actually put on the table is what decides how far it can go. A stare
        // costs you nothing and is worth accordingly little; bringing four people to somebody's
        // door, or saying their daughter's name, is a real show and reaches further. Neither is
        // a demonstrated act, so neither can take anybody past `backed`'s ceiling — for that you
        // have to break something. The raw numbers below are unchanged from the flat version;
        // `STAKES` does the shaping now, so the two are directly comparable.
        const stake: Stake = ap_ === 'stare' ? 'words' : 'backed';
        const asked = (ap_ === 'crew' ? 18 : ap_ === 'family' ? 16 : 12) + Math.round(p.skills.muscle / 2) + (n.traits.includes('coward') ? 12 : 0);
        const before = n.rel.fear;
        adjustRel(w, n, { fear: asked, trust: ap_ === 'family' ? -15 : -8 }, stake); p.fear = clamp(p.fear + 1);
        const fear = Math.round(n.rel.fear - before);
        remember(w, n, 'threat', ap_ === 'crew' ? 'You brought people to their door.' : ap_ === 'family' ? 'You said their family out loud.' : 'You leaned on them, quietly.');
        addHeat(w, ap_ === 'crew' ? 2 : 1, n.homeBlockId);
        if (ap_ === 'crew') spreadRep(w, n.homeBlockId, { fear: 3 }, 1, 'backed');
        log(w, `${resultLine('threaten', ap_, true, rng)} ${n.name}: +${fear} fear.`, 'info', { npcId: n.id });
        if (n.rel.fear >= 40 && caseWitnessOf(w, n.id)) silenceWitness(w, n.id, 'scared');
      } else {
        adjustRel(w, n, { trust: -10, respect: -3, fear: 3 }); addHeat(w, ap_ === 'crew' ? 4 : 2, n.homeBlockId);
        if (ap_ === 'family' && (n.traits.includes('honest') || n.rel.trust < -30)) { addHeat(w, 6); log(w, `${n.name} went straight to the precinct. (+6 heat)`, 'bad', { npcId: n.id }); }
        else log(w, `${resultLine('threaten', ap_, false, rng)} ${n.name} is not impressed. ${n.traits.includes('hothead') ? 'They are looking for a fight now.' : 'Word gets around.'}`, 'bad', { npcId: n.id });
        if (n.traits.includes('hothead') || n.traits.includes('connected')) addGrudge(w, n, `${n.name} stared you down and you blinked.`);
        if (n.faction && w.factions[n.faction]) w.factions[n.faction].standing[PLAYER] -= 5;
      }
      break;
    }
    case 'recruit': {
      const n = npc(a.npcId); const ap_ = a.approach ?? 'promise'; n.known = true;
      const chance = approachChance(w, 'recruit', ap_, n, undefined, undefined, bonus); const ok = rng.int(1, 100) <= chance;
      if (!ok) {
        if (ap_ === 'lean') { adjustRel(w, n, { trust: -15, fear: 5 }); log(w, `${resultLine('recruit', ap_, false, rng)} ${n.name} wants nothing to do with you for a while.`, 'bad', { npcId: n.id }); }
        else { adjustRel(w, n, { trust: 2 }); log(w, `${resultLine('recruit', ap_, false, rng)} ${n.name} is not ready. (trust ${n.rel.trust})`, 'info', { npcId: n.id }); }
        break;
      }
      if (ap_ === 'cut') takeCash(w, 200);
      const base = 30 + Math.round((n.skills.muscle + n.skills.brains + n.skills.charm + n.skills.wheels + n.skills.tech) * 3);
      const cut = ap_ === 'cut' ? Math.round(base * 1.4) : ap_ === 'lean' ? Math.round(base * 0.7) : base;
      const loyalty = clamp(ap_ === 'cut' ? 60 + n.rel.trust / 3 : ap_ === 'lean' ? 20 + n.rel.fear / 4 : 40 + n.rel.trust / 2);
      n.crew = { loyalty, cut, status: 'idle', statusDays: 0, joinedDay: w.day };
      n.role = 'crew'; p.crewIds.push(n.id); p.crewEver++;
      for (const bid of n.favouriteBusinessIds) { const b = w.businesses[bid]; b.patronIds = b.patronIds.filter(id => id !== n.id); }
      remember(w, n, 'deal', `They came to work for you at ${money(cut)}/day.`);
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
      n.role = 'patron'; n.crew = undefined; adjustRel(w, n, { trust: angry ? -40 : -10 });
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
        // a foreman is the worker too — nobody runs a still from a desk
        if (a.assignment.kind === 'foreman') { const pr = w.productions[a.assignment.productionId]; if (pr && !pr.workerId) pr.workerId = n.id; }
        if (a.assignment.kind === 'lieutenant') promote(w, n, a.assignment.districtId);
      }
      break;
    }
    case 'set_supply': { const r = w.rackets[a.racketId]; r.supply = a.rule; log(w, `${RACKET_DEFS[r.kind].label} now draws stock: ${SUPPLY_LABELS[a.rule].label.toLowerCase()}.`, 'info', { racketId: r.id }); break; }
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
      // A bribe is reciprocity, not politeness. An official's whole relationship with you is
      // transactional, so paying one is a real thing done for them and lifts the ordinary trust
      // ceiling the way a settled favour does. Without this the ceiling sat at 45 and the
      // thresholds above it — `boughtBy` at 45, a judge at 40 — became unreachable by the only
      // mechanism that is supposed to reach them, which is the money.
      doFavour(w, n, 'paid them');
      adjustRel(w, n, { trust: gain });
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
      const chance = approachChance(w, 'shakedown', ap_, owner, b, undefined, bonus); const ok = rng.int(1, 100) <= chance;
      if (ap_ === 'wreck') { b.condition = clamp(b.condition - 15); addHeat(w, 4, b.blockId); spreadRep(w, b.blockId, { fear: 4 }, 1, 'property'); adjustRel(w, owner, { fear: 10, trust: -15 }, 'property'); remember(w, owner, 'harm', `You had ${b.name} smashed up in front of them.`); addMemory(w, b.blockId, 'wreck', `Somebody smashed up ${b.name} in broad daylight.`, { npcId: owner.id, businessId: b.id }); }
      const rival = b.protection && b.protection.factionId !== PLAYER ? w.factions[b.protection.factionId] : undefined;
      if (ok) {
        const mult = ap_ === 'wreck' ? 1.6 : ap_ === 'reason' ? 0.9 : 1.2;
        const take = Math.round(b.baseIncome * mult * (0.8 + rng.float() * 0.8));
        p.dirty += take;
        adjustRel(w, owner, ap_ === 'reason' ? { fear: 5, trust: 3 } : { fear: 12, trust: -8 }, ap_ === 'reason' ? 'words' : 'backed');
        addHeat(w, ap_ === 'reason' ? 1 : 2, b.blockId); p.fear = clamp(p.fear + (ap_ === 'reason' ? 1 : 2));
        addInfluence(w, b.blockId, PLAYER, 4); if (ap_ !== 'reason') spreadRep(w, b.blockId, { fear: 3 });
        log(w, `${resultLine('shakedown', ap_, true, rng)} ${owner.name} hands over ${money(take)} at ${b.name}.`, 'money', { businessId: b.id, npcId: owner.id });
        if (rival) { rival.standing[PLAYER] -= 12; rival.grudges.push(`shakedown:${b.id}`); log(w, `${b.name} pays ${rival.name}. They will hear about this.`, 'warn', { factionId: rival.id }); }
      } else {
        adjustRel(w, owner, { trust: -12, respect: ap_ === 'reason' ? -6 : -3 }); addHeat(w, ap_ === 'wreck' ? 6 : 3, b.blockId);
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
      const route = protectRoute(w, owner, a.rate);
      b.protection = { factionId: PLAYER, rate: a.rate, since: w.day };
      owner.faction = PLAYER;
      const r = mkRacket(w, 'protection', b);
      if (route === 'friend') {
        // nobody was leaned on, so nobody is frightened and nobody resents it
        adjustRel(w, owner, { trust: 5, respect: 3 });
        remember(w, owner, 'deal', `They asked you to look after ${b.name}. ${Math.round(a.rate * 100)}%, between friends.`);
        addInfluence(w, b.blockId, PLAYER, 10); addHeat(w, 1, b.blockId);
        log(w, `${owner.name} would rather you looked after ${b.name} than anyone else. ${Math.round(a.rate * 100)}%, between friends.`, 'good', { businessId: b.id, racketId: r.id, npcId: owner.id });
      } else {
        adjustRel(w, owner, { fear: 5, trust: a.rate <= 0.15 ? 3 : -5 });
        remember(w, owner, a.rate <= 0.15 ? 'deal' : 'threat', `${b.name} started paying you ${Math.round(a.rate * 100)}%.`);
        addInfluence(w, b.blockId, PLAYER, 8); addHeat(w, 1, b.blockId);
        log(w, `${b.name} now pays you ${Math.round(a.rate * 100)}%.`, 'good', { businessId: b.id, racketId: r.id });
      }
      break;
    }
    case 'buy_business': {
      const b = w.businesses[a.businessId]; const owner = npc(b.ownerId); takeCash(w, a.offer);
      b.ownedBy = 'player'; p.businessIds.push(b.id);
      if (b.protection) {
        const pf = b.protection.factionId;
        // A street crew can hold protection too — `tickCrews` gives a strong one a place to
        // collect from — and they are not in `w.factions`. Reading them as one threw.
        if (pf !== PLAYER) {
          const f = w.factions[pf]; const gang = w.crews[pf];
          if (f) { f.standing[PLAYER] -= 10; log(w, `${f.name} was collecting from ${b.name}. Not any more.`, 'warn', { factionId: pf }); }
          else if (gang) { gang.mood -= 20; log(w, `The ${gang.name} were collecting from ${b.name}. Not any more, and they know whose name is on it.`, 'warn', { blockId: b.blockId }); }
        }
        for (const rid of b.racketIds) if (w.rackets[rid]?.kind === 'protection') { delete w.rackets[rid]; p.racketIds = p.racketIds.filter(id => id !== rid); }
        b.racketIds = b.racketIds.filter(id => w.rackets[id]); b.protection = undefined;
      }
      adjustRel(w, owner, { trust: 10, respect: 8 }); owner.faction = PLAYER;
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
    case 'insure': { const b = w.businesses[a.businessId]; takeCash(w, insureCost(b)); b.insured = true; log(w, `${b.name} is insured.`, 'info', { businessId: b.id }); break; }
    case 'repair': { const b = w.businesses[a.businessId]; takeCash(w, repairCost(b)); b.condition = 100; b.flags = b.flags.filter(f => f !== 'torched'); log(w, `${b.name} repaired.`, 'info', { businessId: b.id }); break; }

    case 'start_racket': {
      const b = w.businesses[a.businessId]; takeCash(w, setupCost(b, a.kind));
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
      adjustRel(w, n, { trust: gain, respect: 1 });
      n.known = true;
      log(w, `${n.name} takes ${money(amt)} and hands back ${money(clean)} clean — ${Math.round(rate * 100)} cents on the dollar. (+${gain} trust)`, 'money', { npcId: n.id });
      break;
    }

    case 'plan_op': {
      const def = OP_DEFS[a.kind]; const price = opCost(w, a.kind, { npcId: a.targetNpcId, caseId: a.targetCaseId }); if (price) takeCash(w, price);
      const insider = a.approach === 'inside' ? insidersFor(w, a.targetBusinessId)[0] : undefined;
      const o: Op = { id: nid(w, 'o'), kind: a.kind, approach: a.approach, mode: a.mode ?? OP_DEFS[a.kind].modes?.[0]?.id, insideId: insider?.id, targetBusinessId: a.targetBusinessId, targetNpcId: a.targetNpcId, targetFactionId: a.targetFactionId, targetBlockId: a.targetBlockId, targetDistrictId: a.targetDistrictId, targetCaseId: a.targetCaseId, safehouseId: a.safehouseId ?? (a.kind === 'kidnap' ? p.safehouseIds[0] : undefined), crewIds: a.crewIds.slice(), planDays: def.planDays, daysLeft: def.planDays, status: def.planDays === 0 ? 'ready' : 'planning', createdDay: w.day };
      w.ops[o.id] = o; p.opIds.push(o.id);
      for (const id of a.crewIds) { const n = npc(id); n.crew!.assignment = { kind: 'op', opId: o.id }; n.crew!.status = 'assigned'; }
      log(w, `${def.label}${a.approach ? ` (${OP_APPROACHES[a.approach].label.toLowerCase()}${insider ? `, ${insider.name} inside` : ''})` : ''} is ${o.status === 'ready' ? 'ready to go' : `in planning (${def.planDays} days)`}.`, 'info', { opId: o.id });
      break;
    }
    case 'launch_op': { const o = w.ops[a.opId]; o.status = 'ready'; o.daysLeft = 0; o.launched = true; log(w, `${OP_DEFS[o.kind].label} goes tonight.`, 'warn', { opId: o.id }); break; }
    case 'abort_op': { const o = w.ops[a.opId]; o.status = 'aborted'; freeOpCrew(w, o); p.opIds = p.opIds.filter(id => id !== o.id); log(w, `${OP_DEFS[o.kind].label} called off.`, 'info'); break; }

    case 'parley': {
      const n = npc(a.npcId); const c = crewOfBoss(w, n.id)!; const ap_ = a.approach ?? 'tribute'; n.known = true;
      const chance = approachChance(w, 'parley', ap_, n, undefined, undefined, bonus); const ok = rng.int(1, 100) <= chance;
      const tone = parley(w, c, n, ap_, ok, rng);
      log(w, resultLine('parley', ap_, ok, rng), tone, { npcId: n.id, blockId: c.blockId });
      break;
    }
    case 'buy_item': {
      const b = w.businesses[a.businessId]; const item = ITEM_DEFS[a.itemId];
      const price = buyPrice(item);
      takeCash(w, price);                                  // clean cash, like every other purchase
      p.items = [...(p.items ?? []), item.id];
      adjustRel(w, npc(b.ownerId), { trust: 2, respect: 1 }); // a paying customer is a customer
      log(w, `${item.label} — ${money(price)} at ${b.name}.`, 'money', { businessId: b.id });
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
      // A conversation is driven here rather than inside `resolveConfrontation`, because a
      // closing move has to run a real scene and running actions is reducer work. Openers leave
      // the entry queued and the player answers again; closers drop it and, if it was one of the
      // scene's own approaches, the scene runs with whatever the openers bought on its odds.
      if (c.kind === 'talk') {
        const res = resolveTalk(w, c, a.approach as TalkMove | 'absent', rng);
        if (res.closed) w.confrontations = confrontations(w).filter(x => x.id !== c.id);
        if (res.approach) {
          // No cost charged here: `can` for this very action already reported the closing scene's
          // cost, and `dispatch` deducted it on the way in. Charging again took the AP twice.
          const act = sceneAction(c, res.approach);
          const g = gate(w, act);
          if (g.ok) apply(w, act, rng, done, res.bonus ?? 0);
          else log(w, g.reason, 'warn');
        }
        break;
      }
      resolveConfrontation(w, c, a.approach, rng);
      break;
    }
    case 'talk': { startConversation(w, a.scene, a.npcId, a.businessId, a.otherFactionId); break; }
    case 'resolve_agenda': {
      const n = npc(a.npcId);
      const cost = agendaCost(w, n, a.mode);
      if (cost) takeCash(w, cost);
      resolveAgenda(w, n, a.mode, rng);
      break;
    }
    case 'defect': { defect(w, npc(a.npcId)); break; }
    case 'turn_asset': { turnAsset(w, npc(a.npcId), a.kind as AssetKind); break; }
    case 'introduce': { introduce(w, npc(a.npcId), npc(a.toNpcId)); break; }
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
      // you are standing in it. Walking onto a derelict block is finding it, and anything you
      // walked through to get here counts too — you do not need a scouting op to see a ruin.
      for (const id of [a.toBlockId, ...r.hops]) {
        const blk = w.blocks[id];
        if (blk?.abandoned && !blk.abandoned.known) {
          blk.abandoned.known = true;
          log(w, `${blk.name} is derelict — boarded up, nobody collecting anything. Nobody would notice if it were yours.`, 'info', { blockId: blk.id });
        }
      }
      const far = r.hops.length;
      log(w, `You walk from ${from?.name ?? 'where you were'} to ${to.name}${far > 1 ? ` (${far} blocks)` : ''}. ${r.cost} legwork, ${p.legwork} left.`, 'info', { blockId: to.id });
      break;
    }
    case 'sit_down': sitDown(w, a.factionId, a.offer, rng); break;
    case 'broker': {
      const n = npc(a.npcId); const ap_ = a.approach ?? 'split'; n.known = true;
      const chance = approachChance(w, 'broker', ap_, n, undefined, a.otherFactionId, bonus); const ok = rng.int(1, 100) <= chance;
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
    case 'cheat': { cheat(w, a.what, a.amount, rng); break; }
  }
  return undefined;
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
/**
 * The admin panel. Every entry sets a system up so it can actually be exercised — by a person
 * poking at the build, or by the soak bot, which otherwise cannot reach half the game: it never
 * escalates an Authority, never gets to tier 2, never has a card in its pocket.
 *
 * `amount` overrides the default where a number makes sense. Everything here stamps
 * `w.cheated`, so a cheated run can never be mistaken for a real economy curve.
 */
function cheat(w: World, what: CheatKind, amount?: number, rng?: import('./rng').Rng) {
  const p = w.player; w.cheated = true;
  const here = w.blocks[p.currentBlockId];
  switch (what) {
    case 'cash': { const n = amount ?? 10000; p.cash += n; log(w, `Testing: +${money(n)} clean.`, 'money'); break; }
    case 'dirty': { const n = amount ?? 10000; p.dirty += n; log(w, `Testing: +${money(n)} dirty.`, 'money'); break; }
    case 'ap': {
      // With an amount it lengthens the day rather than refilling it. The soak needs that: each
      // pass adds something the bot has to spend AP on, and a fixed eight-hour day means every
      // new system quietly costs op coverage. Boosted scenarios buy a longer day instead.
      if (amount) { p.apMax = Math.max(p.apMax, amount); log(w, `Testing: days are ${p.apMax} AP long now.`, 'info'); }
      p.ap = p.apMax;
      if (!amount) log(w, 'Testing: AP refilled.', 'info');
      break;
    }
    case 'legwork': p.legwork = p.legworkMax; log(w, 'Testing: legwork refilled.', 'info'); break;
    case 'heat': p.heat = 0; for (const b of Object.values(w.blocks)) b.heat = 0; log(w, 'Testing: heat cleared.', 'good'); break;
    case 'skills': { const n = Math.max(0, Math.min(10, amount ?? 10)); for (const k of Object.keys(p.skills) as (keyof typeof p.skills)[]) p.skills[k] = n; p.legworkMax = legworkFor(p.skills.wheels); p.legwork = p.legworkMax; log(w, `Testing: every skill at ${n}.`, 'good'); break; }
    case 'crew': {
      const pool = Object.values(w.npcs).filter(n => n.alive && !n.crew && !n.official && ['patron', 'owner'].includes(n.role)).slice(0, Math.max(1, amount ?? 3));
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
      // Plenty of generated cities have no derelict ground at all — `abandonChance` is zero in
      // half the district kinds — and then revealing it reveals nothing, which left every op that
      // needs a derelict target permanently unreachable in a soak. So make some if there is none:
      // the same `makeAbandoned` generation uses, on blocks with nothing on them.
      if (!abandonedBlocks(w).length) {
        const r = rng ?? (() => { const { rng: made, done } = rngOf(w); done(); return made; })();
        // Generation only ever empties a block the map had nothing on, so a populated city can
        // easily have none at all; clear the two quietest blocks out the same way a bust-out
        // clears one place, then hand them to `makeAbandoned` exactly as generation would.
        const quiet = Object.values(w.blocks)
          .filter(b => b.id !== p.currentBlockId && !b.safehouseId && !b.tags.length)
          .sort((a, b) => a.businessIds.length - b.businessIds.length || a.police - b.police)
          .slice(0, 2);
        for (const b of quiet) {
          for (const id of [...b.businessIds]) shutBusiness(w, w.businesses[id], 'cleared_out');
          makeAbandoned(b, r, { police: b.police, population: b.population });
        }
      }
      for (const b of Object.values(w.blocks)) if (b.abandoned) b.abandoned.known = true;
      log(w, 'Testing: everyone is known and every derelict block is on the map.', 'info');
      break;
    }
    case 'crews': {
      // Whether a corner has a crew is a dice roll at generation and on plenty of seeds the
      // answer is nowhere — which leaves the whole street-crew layer, payroll, folding them in
      // and staking them, with no way to be reached at all.
      const r = rng ?? (() => { const { rng: made, done } = rngOf(w); done(); return made; })();
      const want = Math.max(1, amount ?? 2);
      let made = 0;
      for (const b of Object.values(w.blocks).sort((a, z) => (travelCost(w, a.id) ?? 9) - (travelCost(w, z.id) ?? 9))) {
        if (made >= want) break;
        if (!b.businessIds.length || b.id === p.currentBlockId || crewAt(w, b.id)) continue;
        if (Object.entries(b.influence).some(([k, v]) => k !== PLAYER && v >= 30)) continue;
        makeCrew(w, b, r, (pre: string) => nid(w, pre));
        made++;
      }
      log(w, `Testing: ${made} street crew${made === 1 ? '' : 's'} on the corners near you.`, 'info');
      break;
    }
    case 'stash': { const n = amount ?? 50; for (const k of Object.keys(p.stash) as (keyof typeof p.stash)[]) p.stash[k] += n; log(w, `Testing: +${n} of every product.`, 'good'); break; }

    // ---- set up one system so it can be exercised ----
    case 'kit': {
      const want = ['pistol', 'lockpicks', 'sedan'].filter(id => ITEM_DEFS[id]);
      p.items = [...new Set([...(p.items ?? []), ...want])];
      p.equipped = want.slice(0, EQUIP_MAX);
      log(w, `Testing: carrying ${p.equipped.map(id => ITEM_DEFS[id].label).join(', ')}.`, 'good');
      break;
    }
    case 'rackets': {
      // a racket of each kind the later ops ask about, on whatever you already hold
      const mine = p.businessIds.map(id => w.businesses[id]).filter(Boolean);
      const spots = mine.length ? mine : here.businessIds.map(id => w.businesses[id]).filter(Boolean);
      const kinds: RacketKind[] = ['protection', 'numbers', 'laundering', 'fencing', 'carding'];
      let made = 0;
      for (const k of kinds) {
        const b = spots.find(x => !x.racketIds.some(id => w.rackets[id]?.kind === k));
        if (!b) continue;
        if (b.ownedBy !== 'player') { b.ownedBy = 'player'; p.businessIds.push(b.id); }
        mkRacket(w, k, b); made++;
      }
      log(w, `Testing: ${made} racket${made === 1 ? '' : 's'} running, including one that moves cards.`, 'good');
      break;
    }
    case 'war': {
      const f = Object.values(w.factions).filter(x => x.alive).slice(0, Math.max(1, amount ?? 1));
      for (const x of f) { x.stance[PLAYER] = 'war'; x.standing[PLAYER] = -90; x.truceUntil[PLAYER] = 0; x.soldiers = Math.max(x.soldiers, 6); }
      log(w, `Testing: ${f.map(x => x.short).join(', ')} at war with you.`, 'bad');
      break;
    }
    case 'attention': {
      const at = Math.max(0, Math.min(100, amount ?? 90));
      for (const a of authorities(w)) { a.attention = at; a.posture = postureFor(at); a.postureSince = w.day; }
      p.heat = Math.max(p.heat, Math.min(95, at));
      log(w, `Testing: every precinct and city hall at attention ${at}.`, 'bad');
      break;
    }
    case 'jail_crew': {
      const free = p.crewIds.map(id => w.npcs[id]).filter(n => n?.crew && n.crew.status !== 'dead' && n.crew.status !== 'jailed');
      const n = free[0];
      if (!n?.crew) { log(w, 'Testing: nobody in your crew to put inside.', 'warn'); break; }
      n.crew.status = 'jailed'; n.crew.statusDays = amount ?? 25; n.crew.assignment = undefined;
      log(w, `Testing: ${n.name} is inside for ${n.crew.statusDays} days.`, 'bad', { npcId: n.id });
      break;
    }
    case 'open_case': {
      if (rng) openCase(w, 'heist', `the ${here.name} job`, { blockId: here.id }, p.crewIds.slice(0, 2), rng, amount ?? 35);
      break;
    }
    case 'cards': {
      if (rng) for (let i = 0; i < (amount ?? 5); i++) addCard(w, rollCard(w, rng));
      const mark = Object.values(w.npcs).find(n => n.alive && !n.crew && n.agenda && !n.agenda.done);
      if (mark && rng) learnSecret(w, mark, rng);
      cyberHeat(w, 25);
      log(w, `Testing: ${(p.cards ?? []).length} cards in your pocket, something worth selling, and wire heat to clean up.`, 'money');
      break;
    }
    case 'nemesis': {
      // Drives the real scoring path rather than writing a Nemesis by hand: what it fabricates is
      // the *history* — a run of meetings the player lost — and the milestones, the traits and the
      // name all come out of the same code a sixty-day war run reaches on its own. A sixteen-day
      // `everything` run cannot get there honestly, because the bot mostly wins.
      let done = 0;
      for (const f of Object.values(w.factions)) {
        const lt = f.lieutenantIds.map(id => w.npcs[id]).find(n => n?.alive);
        if (!lt) continue;
        for (let i = 0; i < (amount ?? 6); i++) scoreMeeting(w, lt, true, 'violence', `They had the better of you again.`);
        done++;
      }
      log(w, `[admin] ${done} lieutenant${done === 1 ? '' : 's'} have been getting the better of you for weeks.`, 'warn');
      break;
    }
    case 'agendas': {
      // The agenda moves are only reachable against somebody who has an agenda you know about,
      // and generation is thin on those near the start: seed 7 produces no `leave` agenda within
      // two blocks at all, so the dark half of that move had zero coverage in a sixty-day sweep
      // however the bot was taught. This hands out one of each kind and sizes everybody up.
      const kinds: AgendaKind[] = ['debt', 'leave', 'revenge', 'ambition', 'family'];
      const near = Object.values(w.npcs).filter(x => x.alive && !x.crew && !x.official && distanceFromStart(w, x.homeBlockId) <= 2);
      let i = 0;
      for (const x of near.slice(0, amount ?? 12)) {
        const kind = kinds[i++ % kinds.length];
        // `family` is only ever real: it needs somebody in the web to be frightened for
        const kin = familyOf(w, x)[0];
        if (kind === 'family' && !kin) continue;
        x.agenda = { kind, progress: 40, rate: 3, target: kind === 'family' ? kin.id : Object.keys(w.factions)[0] };
        x.known = true;
      }
      log(w, `[admin] ${Math.min(near.length, amount ?? 12)} people nearby now want something, and you know what.`, 'warn');
      break;
    }
    case 'ratted': {
      let n = 0;
      for (const x of Object.values(w.npcs)) if (x.alive && !x.crew && (x.role === 'owner' || x.role === 'boss' || x.role === 'lieutenant')) { x.ratted = w.day; n++; }
      // …and open what that is worth wherever it is worth something. An institution pays out only
      // through somebody inside it, and there are five of them now: leaving this at "ratted" meant
      // the offshore lane and the consignment window had no coverage at all in a sixteen-day run,
      // because the bot has to find a rare building *and* get inside it first.
      let opened = 0;
      for (const x of Object.values(w.npcs)) {
        if (!x.alive || x.crew || x.intel || !x.ratted) continue;
        if (rng && openIntel(w, x, rng)) opened++;
      }
      log(w, `Testing: you have been inside ${n} businesses${opened ? `, and ${opened} of them were worth something standing` : ''}.`, 'info');
      break;
    }
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

/**
 * A business stops being a business, permanently. Only a bust-out does this.
 *
 * The record stays in `w.businesses` on purpose — log lines, ledgers and case files all point at
 * it by id and would otherwise resolve to nothing — but it comes off its block, off the player's
 * books, and out of everybody's habits, so nothing lists it as somewhere you can walk into again.
 * Every read that enumerates the city filters on `shut`; going through this one function is what
 * keeps those two halves in step.
 */
export function shutBusiness(w: World, b: Business, why: string) {
  for (const rid of [...b.racketIds]) closeRacket(w, rid);
  b.shut = w.day; b.flags.push(why);
  b.baseIncome = 0; b.value = 0; b.condition = 0; b.insured = false; b.protection = undefined;
  b.ownedBy = 'npc';
  w.player.businessIds = w.player.businessIds.filter(id => id !== b.id);
  w.blocks[b.blockId].businessIds = w.blocks[b.blockId].businessIds.filter(id => id !== b.id);
  // nobody drinks in a building with the shutters down: the regulars stop being regulars, which
  // is also what stops `npcLocation` putting somebody behind a counter that is not there
  for (const id of b.patronIds) { const n = w.npcs[id]; if (n) n.favouriteBusinessIds = n.favouriteBusinessIds.filter(x => x !== b.id); }
  b.patronIds = [];
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
  // A faction whose last lieutenant is dead or in a cell still holds blocks, so `lieutenantIds[0]`
  // is routinely undefined by the middle of a war — and this used to read `.name` off it and take
  // the whole dispatch down. Name the collector when there is one; otherwise it is just the crew.
  if (ctrl && ctrl[0] !== PLAYER && w.factions[ctrl[0]]) {
    const f = w.factions[ctrl[0]];
    const lt = f.lieutenantIds.map(id => w.npcs[id]).find(x => x?.alive);
    options.push(`"${f.short} collect on this block every week.${lt ? ` ${lt.name} handles it.` : ''}"`);
  }
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
  // The lieutenant across the table is a person with a page, not a name in a log line. A
  // sit-down goes on it the same way a fight at your door does, and it is scored the same way —
  // at `backed`, because talking over somebody is not the same as beating them.
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
      // An alliance is the biggest concession an outfit makes, and standing alone is the faction
      // version of "we have been getting along" — the exact thing the rest of this pass stopped
      // being sufficient. They need a reason: a favour owed, ground you already hold, or
      // something on their boss.
      const lev = factionLeverage(w, f);
      if (standing >= 40 && lev && accept(35)) { setStance(Math.max(standing, 70)); log(w, `${w.npcs[f.bossId].name} embraces you. ${lev.why} ${f.name} and your outfit are allies now.`, 'good', { factionId: f.id }); }
      else { setStance(standing - 4); log(w, standing < 40 ? `${lt.name}: "Allies? We barely know you." (needs standing ≥ 40)` : !lev ? `${lt.name}: "On what? Goodwill?" They want a reason — a favour owed, a block of theirs you already hold, or something on ${w.npcs[f.bossId].name}.` : `${lt.name} hears you out and says no. Not today.`, 'bad', { factionId: f.id }); }
      break;
    }
    case 'demand_block': {
      const b = w.blocks[offer.blockId];
      // Standing over the table is not enough on its own either: you need a hold on them as
      // well as the numbers, or they take their chances.
      const strength = p.crewIds.length * 6 + p.fear + p.respect * 0.5;
      if (strength > f.soldiers * 6 + 20 && factionLeverage(w, f) && accept(25)) { addInfluence(w, b.id, f.id, -50); addInfluence(w, b.id, PLAYER, 45); setStance(standing - 10); log(w, `${f.name} backs off ${b.name} rather than fight you for it. They will not forget.`, 'good', { factionId: f.id, blockId: b.id }); }
      else { setStance(standing - 15); log(w, `${lt.name} laughs. "${b.name}? Try and take it." (-15 standing)`, 'bad', { factionId: f.id }); }
      break;
    }
  }
  // who came out of the room ahead, by whether their faction ended up thinking better of you
  if (lt) scoreMeeting(w, lt, f.standing[PLAYER] <= standing, 'backed', `You sat down with them about ${offer.kind.replace('_', ' ')}.`);
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
