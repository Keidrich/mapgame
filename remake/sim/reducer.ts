/**
 * `can` and `dispatch`: the only door into the world.
 *
 * `can()` runs during render for every button, so it must answer for any action the UI can put
 * on screen without throwing — a throw here is a blank screen, not a disabled button. Every refusal
 * says why in words the player can act on.
 */
import { BUSINESSES, LABS, RACKETS, SAFEHOUSE_TIERS, SLOTS, SPECIALISTS } from '@r/content/world';
import { fixerCap, fixerRate, streetPrice, upgradeCost } from './economy';
import { apply } from './effects';
import { sitDown, sitDownOdds, tributeEffect } from './factions';
import { answerComplication, buildJob, caseKinds, dropJob, hireSpecialist, launchJob, present, setpieceOpen, SETPIECE_REST, specialistFee, takeJob } from './jobs';
import { openCases } from './law';
import { ITEMS } from '@r/content/kit';
import { SETPIECE_RANK, setpieceFor } from '@r/content/setpieces';
import { equip, returnKit, shopItems, unequip } from './kit';
import { hostageChoices, isHeld, resolveHostage } from './hostages';
import { LOBBY_PULL, commissionOf, lobbyCost } from './commission';
import { isCatalogue, needsMet } from './catalogue';
import { CHEATS, cheat } from './cheats';
import { REGION, arrivalIn, fareBetween, cityName_, cityOfBlock, currentCity, fare, foundCity, isOpen, openRoute, regionCity, safehouseIn } from './region';
import { PRODUCTS } from '@r/content/world';
import { freeFromAssignment, practise } from './people';
import { playScene, quote } from './scenes';
import { blockCity, crewCity, travelCost } from './select-core';
import { closedNow, isNight, nightfall } from './clock';
import { endDay, STRAIGHT } from './tick';
import type { Action, Affordance } from './actions';
import { no, yes } from './actions';
import type { Racket, World } from './types';
import { PLAYER } from './types';
import { addInfluence, clamp, controller, fullName, log, money, nid, rngOf, spend, theName } from './util';

const cost = (w: World, n: number) => (w.player.cash + w.player.dirty >= n ? undefined : `Costs ${money(n)}. You have ${money(w.player.cash + w.player.dirty)}.`);
const costClean = (w: World, n: number) => (w.player.cash >= n ? undefined : `Costs ${money(n)} clean. You have ${money(w.player.cash)} clean — launder some.`);

export function can(w: World, a: Action): Affordance {
  try { return canInner(w, a); } catch (e) { return no(`Not right now (${(e as Error).message}).`); }
}

function canInner(w: World, a: Action): Affordance {
  const p = w.player;
  if (w.over && a.type !== 'seen_win') return no('The game is over.');
  const ap = (n: number) => (p.ap >= n ? undefined : n === 1 ? (isNight(w) ? 'No hours left tonight. Get some sleep.' : 'No hours left today. Let night fall.') : `Needs ${n} hours; you have ${p.ap}.`);
  const busy = w.events.length && a.type !== 'resolve_event' ? 'Deal with what is in front of you first.' : undefined;
  const paused = Object.values(w.jobs).find(j => j.status === 'paused');
  if (paused && a.type !== 'answer' && a.type !== 'resolve_event') return no(`${paused.title} is waiting on your call.`);
  // the clock first: a shut door says so before it says anything about money or hours
  const shut = closedNow(w, a); if (shut) return no(shut);
  switch (a.type) {
    case 'travel': {
      if (!w.blocks[a.blockId]) return no('Nowhere.');
      if (a.blockId === p.blockId) return no('You are here.');
      if (cityOfBlock(w, a.blockId) !== currentCity(w)) return no(`That is in ${cityName_(w, cityOfBlock(w, a.blockId))}. Take the train from the region map.`);
      const c = travelCost(w, a.blockId); const r = ap(c); return r ? no(r) : yes({ ap: c });
    }
    case 'travel_city': {
      const c = regionCity(w, a.cityId); if (!c) return no('Nowhere.');
      if (a.cityId === currentCity(w)) return no('You are here.');
      if (!isOpen(w, a.cityId)) return no(`Nobody in ${c.name} knows your name yet. Hold a quarter of a city on the road to it.`);
      if (busy) return no(busy);
      for (const id of a.bring ?? []) {
        const n = w.npcs[id];
        if (!n?.crew || !n.alive) return no('Not one of yours.');
        if (crewCity(w, id) !== currentCity(w)) return no(`${n.first} is not in this city.`);
        if (n.crew.status !== 'ready') return no(`${n.first} is ${n.crew.status}.`);
        if (n.crew.assignment?.kind === 'job') return no(`${n.first} is on a job here.`);
      }
      const f = fare(w, a.cityId); const e = cost(w, f) ?? ap(REGION.trainAp); return e ? no(e) : yes({ ap: REGION.trainAp, cash: f });
    }
    case 'move_crew': {
      const n = w.npcs[a.npcId]; if (!n?.crew || !n.alive) return no('Not one of yours.');
      const to = regionCity(w, a.to); if (!to?.founded) return no('Somewhere you have been.');
      if (crewCity(w, n.id) === a.to) return no(`${n.first} is already there.`);
      if (n.crew.status !== 'ready') return no(`${n.first} is ${n.crew.status}.`);
      if (n.crew.assignment?.kind === 'job') return no(`${n.first} is on a job.`);
      const f = fareBetween(w, crewCity(w, n.id), a.to); const e = cost(w, f); return e ? no(e) : yes({ cash: f });
    }
    case 'open_route': {
      // between any two of your cities, wherever you are standing: the stash goes where you go
      const from = regionCity(w, a.from), to = regionCity(w, a.to);
      if (!from?.founded || !to?.founded) return no('You have to have been to both ends.');
      if (a.from === a.to) return no('A route goes somewhere else.');
      if (!(a.product in PRODUCTS)) return no('Nothing like that.');
      if (!safehouseIn(w, a.from)) return no(`You need a back room in ${from.name} to load from.`);
      if (!safehouseIn(w, a.to)) return no(`You need a back room in ${to.name} to unload into.`);
      if ((w.routes ?? []).some(r => r.to === a.to && r.product === a.product)) return no(`Something of yours already carries ${a.product} to ${to.name}.`);
      const e = cost(w, REGION.routeSetup); return e ? no(e) : yes({ cash: REGION.routeSetup });
    }
    case 'close_route': return (w.routes ?? []).some(r => r.id === a.id) ? yes() : no('No such route.');
    case 'scene': {
      const n = w.npcs[a.npcId]; if (!n) return no('Nobody.');
      if (isHeld(w, a.npcId)) return no(n.crew ? 'They are being held. Pay, or wait.' : 'They are in a back room, and not talking.');
      const q = quote(w, a.kind, a.npcId, { businessId: a.businessId, rate: a.rate });
      if (q.disabled) return no(q.disabled);
      if (busy) return no(busy);
      const r = ap(q.ap); if (r) return no(r);
      if (q.cash) { const c = q.clean ? costClean(w, q.cash) : cost(w, q.cash); if (c) return no(c); }
      return yes({ ap: q.ap, cash: q.cash });
    }
    case 'set_rate': { const b = w.businesses[a.businessId]; if (b?.protection?.by !== PLAYER) return no('They do not pay you.'); if (a.rate < 0.05 || a.rate > 0.3) return no('Between 5% and 30%.'); return yes(); }
    case 'drop_protection': { const b = w.businesses[a.businessId]; return b?.protection?.by === PLAYER ? yes() : no('They do not pay you.'); }
    case 'start_racket': {
      const b = w.businesses[a.businessId]; if (!b) return no('Nowhere.');
      if (b.ownedBy !== PLAYER && b.protection?.by !== PLAYER) return no('You need to own the place or protect it first.');
      const def = BUSINESSES[b.type];
      if (!def.rackets.includes(a.kind)) return no(`A ${def.label.toLowerCase()} cannot run ${RACKETS[a.kind].label.toLowerCase()}.`);
      const mine = b.racketIds.filter(id => w.rackets[id]);
      if (mine.some(id => w.rackets[id].kind === a.kind)) return no('Already running here.');
      const slots = SLOTS[b.tier] + (b.ownedBy === PLAYER ? 1 : 0);
      if (mine.length >= slots) return no(`${b.name} has room for ${slots} racket${slots > 1 ? 's' : ''}${b.ownedBy === PLAYER ? '' : ' (one more if you owned it)'}.`);
      if (busy) return no(busy);
      const c = RACKETS[a.kind].setup; const r = ap(1) ?? cost(w, c); return r ? no(r) : yes({ ap: 1, cash: c });
    }
    case 'upgrade_racket': { const r = w.rackets[a.racketId]; if (r?.owner !== PLAYER) return no('Not yours.'); if (r.level >= 3) return no('As big as it gets.'); const c = upgradeCost(r); const e = cost(w, c); return e ? no(e) : yes({ cash: c }); }
    case 'close_racket': return w.rackets[a.racketId]?.owner === PLAYER ? yes() : no('Not yours.');
    case 'toggle_wash': { const r = w.rackets[a.racketId]; return r?.owner === PLAYER && RACKETS[r.kind].wash ? yes() : no('Only a laundry has a switch.'); }
    case 'assign': {
      const n = w.npcs[a.npcId]; if (!n?.crew || !n.alive) return no('Not one of yours.');
      if (n.crew.status === 'jailed' || n.crew.status === 'injured' || n.crew.status === 'held') return no(`${fullName(n)} is ${n.crew.status}.`);
      if (n.crew.status === 'travel') return no(`${fullName(n)} is on the road.`);
      if (n.crew.assignment?.kind === 'job') return no('On a job. Drop the job to free them.');
      const as = a.assignment;
      if (!as) return yes();
      // people work in the city they are in: a racket, a lab, a street or a district somewhere else needs them moved first
      const there = as.kind === 'racket' ? (w.rackets[as.racketId] ? blockCity(w, w.businesses[w.rackets[as.racketId].businessId]?.blockId) : undefined)
        : as.kind === 'lab' ? (() => { const s = p.safehouseIds.map(id => w.safehouses[id]).find(x => x?.labs.some(l => l.id === as.labId)); return s ? blockCity(w, s.blockId) : undefined; })()
        : as.kind === 'guard' ? blockCity(w, as.blockId) : as.kind === 'district' ? (w.districts[as.districtId]?.cityId || 'c0') : undefined;
      if (there && there !== crewCity(w, n.id)) return no(`${n.first} is in ${cityName_(w, crewCity(w, n.id))}. Move them to ${cityName_(w, there)} first.`);
      if (as.kind === 'racket') { const r = w.rackets[as.racketId]; if (r?.owner !== PLAYER) return no('Not your racket.'); if (r.runnerId && r.runnerId !== n.id) return no('Somebody already runs it.'); }
      if (as.kind === 'district') { if (n.crew.level < 2 || n.crew.loyalty < 55) return no('A lieutenant needs level 2 and loyalty 55.'); if (Object.values(w.npcs).some(x => x.id !== n.id && x.crew?.assignment?.kind === 'district' && x.crew.assignment.districtId === as.districtId)) return no('That district already has a lieutenant.'); }
      if (as.kind === 'lab') { const found = p.safehouseIds.some(id => w.safehouses[id]?.labs.some(l => l.id === as.labId)); if (!found) return no('Not your lab.'); }
      return yes();
    }
    case 'fire': return !w.npcs[a.npcId]?.crew ? no('Not one of yours.') : isHeld(w, a.npcId) ? no('Get them back first.') : yes();
    case 'rent_safehouse': {
      const b = w.blocks[a.blockId]; if (!b) return no('Nowhere.');
      if (b.safehouseId) return no('You already have a place here.');
      // four to a city: the cap was written for one city, and a region of them each needs a door
      if (p.safehouseIds.filter(id => w.safehouses[id] && cityOfBlock(w, w.safehouses[id].blockId) === cityOfBlock(w, b.id)).length >= 4) return no('Four places in one city is as many as anybody can keep secret.');
      const own = controller(b) === PLAYER || (b.influence[PLAYER] ?? 0) >= 10;
      if (!own) return no('You need a foothold on the block first (influence 10).');
      const c = SAFEHOUSE_TIERS[0].buy; const r = ap(1) ?? cost(w, c); return r ? no(r) : yes({ ap: 1, cash: c });
    }
    case 'upgrade_safehouse': { const s = w.safehouses[a.safehouseId]; if (!s) return no('Not yours.'); if (s.tier >= 3) return no('As big as it gets.'); const c = SAFEHOUSE_TIERS[s.tier].buy; const e = cost(w, c); return e ? no(e) : yes({ cash: c }); }
    case 'build_lab': {
      const s = w.safehouses[a.safehouseId]; if (!s) return no('Not yours.');
      if (s.labs.length >= SAFEHOUSE_TIERS[s.tier - 1].labs) return no(`A ${SAFEHOUSE_TIERS[s.tier - 1].label.toLowerCase()} has room for ${SAFEHOUSE_TIERS[s.tier - 1].labs}. Upgrade it.`);
      if (s.labs.some(l => l.kind === a.kind)) return no('Already one here.');
      const e = cost(w, LABS[a.kind].setup); return e ? no(e) : yes({ cash: LABS[a.kind].setup });
    }
    case 'upgrade_lab': { const l = w.safehouses[a.safehouseId]?.labs.find(x => x.id === a.labId); if (!l) return no('No lab.'); if (l.level >= 3) return no('As big as it gets.'); const c = Math.round(LABS[l.kind].setup * [0, 1.2, 2.5][l.level]); const e = cost(w, c); return e ? no(e) : yes({ cash: c }); }
    case 'restock_lab': { const l = w.safehouses[a.safehouseId]?.labs.find(x => x.id === a.labId); if (!l) return no('No lab.'); const c = restockCost(w, l.kind, a.days); const e = cost(w, c); return e ? no(e) : yes({ cash: c }); }
    case 'sell_street': {
      if (a.n <= 0) return no('Nothing to sell.');
      if (p.stash[a.product].n < a.n) return no(`You have ${p.stash[a.product].n}.`);
      if (a.product === 'goods') return no('Hot goods go to a fence, not a corner.');
      const r = ap(1); return r ? no(r) : yes({ ap: 1 });
    }
    case 'buy_item': {
      const d = ITEMS[a.item]; if (!d) return no('Nothing like that for sale.');
      if (!shopItems(w, a.at).includes(a.item)) return no('Not sold here.');
      if (a.at === 'fixer') {
        const f = w.fixerId ? w.npcs[w.fixerId] : undefined;
        if (!f?.alive) return no('There is no fixer any more.');
        if (!f.rel.met) return no(`Find the fixer first: ${fullName(f)}, on ${w.blocks[f.homeBlockId].name}.`);
      } else if (w.businesses[a.at].blockId !== p.blockId) return no(`You have to be there: ${w.blocks[w.businesses[a.at].blockId].name}.`);
      const e = cost(w, d.price); return e ? no(e) : yes({ cash: d.price });
    }
    case 'equip': {
      if (!p.armoury.includes(a.item)) return no('Not in the armoury.');
      if (a.to === PLAYER) return yes();
      const n = w.npcs[a.to];
      if (!n?.crew || !n.alive) return no('Not one of yours.');
      if (n.crew.status === 'jailed' || n.crew.status === 'held' || n.crew.status === 'travel') return no('They are not here to hand it to.');
      if (crewCity(w, n.id) !== currentCity(w)) return no(`${n.first} is in ${cityName_(w, crewCity(w, n.id))}; the armoury is with you.`);
      return yes();
    }
    case 'unequip': {
      const kit = a.from === PLAYER ? p.kit : w.npcs[a.from]?.crew?.kit;
      if (!kit?.[a.slot]) return no('Nothing there.');
      if (a.from !== PLAYER && (['jailed', 'held', 'travel'].includes(w.npcs[a.from].crew!.status) || crewCity(w, a.from) !== currentCity(w))) return no('They are not here to hand it back.');
      return yes();
    }
    case 'hostage': {
      const h = w.hostages[a.id]; if (!h) return no('Nobody held.');
      const c = hostageChoices(w, h).find(x => x.choice === a.choice);
      if (!c) return no('Not an option.');
      return c.disabled ? no(c.disabled) : yes(h.holder !== PLAYER ? { cash: h.ransom } : {});
    }
    case 'lobby': {
      const f = w.factions[a.factionId]; const c = f ? commissionOf(w, w.districts[f.homeDistrictId]?.cityId || 'c0') : w.commission;
      if (!c.proposal) return no('Nothing on the table yet.');
      if (!f?.alive) return no('Gone.');
      if (c.pulls[a.factionId]) return no('You have already had that conversation.');
      const boss = w.npcs[f.bossId];
      if ((boss?.rel.owes ?? 0) > 0) { const r = ap(1); return r ? no(r) : yes({ ap: 1 }); }
      const k = lobbyCost(f); const e = cost(w, k) ?? ap(1); return e ? no(e) : yes({ cash: k, ap: 1 });
    }
    case 'commission_vote': { const c = commissionOf(w, a.cityId ?? currentCity(w)); return !c.seated ? no('You have no seat at that table.') : !c.proposal ? no('Nothing on the table.') : yes(); }
    case 'fixer_wash': {
      const f = w.fixerId ? w.npcs[w.fixerId] : undefined;
      if (!f?.alive) return no('There is no fixer any more.');
      if (!f.rel.met) return no(`Find the fixer first: ${fullName(f)}, on ${w.blocks[f.homeBlockId].name}.`);
      if (a.amount <= 0) return no('Nothing to wash.');
      if (p.dirty < a.amount) return no(`You have ${money(p.dirty)} dirty.`);
      const left = fixerCap(w) - p.washedToday; if (a.amount > left) return no(`The fixer takes ${money(Math.max(0, left))} more today.`);
      return yes();
    }
    case 'take_job': {
      const j = w.jobs[a.jobId]; if (!j || j.status !== 'offer') return no('That job is gone.');
      if (a.crewIds.length < j.crewMin) return no(`Needs at least ${j.crewMin} of your people with you.`);
      if (a.crewIds.length > j.crewMax) return no(`No more than ${j.crewMax}.`);
      for (const id of a.crewIds) { const n = w.npcs[id]; if (!n?.crew || !n.alive) return no('Not one of yours.'); if (n.crew.status !== 'ready') return no(`${fullName(n)} is ${n.crew.status}.`); if (n.crew.assignment?.kind === 'job') return no(`${fullName(n)} is on another job.`); }
      for (const id of a.crewIds) if (crewCity(w, id) !== blockCity(w, j.blockId)) return no(`${w.npcs[id].first} is in ${cityName_(w, crewCity(w, id))}, and the job is in ${cityName_(w, blockCity(w, j.blockId))}.`);
      if (isCatalogue(j.kind)) { const why = needsMet(w, j.kind); if (why) return no(why); }
      if (j.targetCaseId && a.crewIds.includes(w.cases[j.targetCaseId]?.suspectId as string)) return no('Not somebody the file is about.');
      if (j.kind === 'spring_crew' || j.kind === 'prison_supply') { if (a.crewIds.includes(j.targetNpcId!)) return no('They are the one inside.'); }
      if (busy) return no(busy);
      if (j.cost) { const e = cost(w, j.cost); if (e) return no(e); return yes({ cash: j.cost }); }
      return yes();
    }
    case 'join_job': {
      // somebody went to hospital or to a cell halfway through the planning: send somebody else
      const j = w.jobs[a.jobId]; if (!j || (j.status !== 'planning' && j.status !== 'ready')) return no('Nothing being planned.');
      if (j.crewIds.length >= j.crewMax) return no(`No more than ${j.crewMax}.`);
      const n = w.npcs[a.npcId]; if (!n?.crew || !n.alive) return no('Not one of yours.');
      if (j.crewIds.includes(n.id)) return no('Already on it.');
      if (n.crew.status !== 'ready') return no(`${fullName(n)} is ${n.crew.status}.`);
      if (n.crew.assignment?.kind === 'job') return no(`${fullName(n)} is on another job.`);
      if (crewCity(w, n.id) !== blockCity(w, j.blockId)) return no(`${n.first} is in ${cityName_(w, crewCity(w, n.id))}.`);
      return busy ? no(busy) : yes();
    }
    case 'launch_job': {
      const j = w.jobs[a.jobId]; if (!j) return no('Gone.');
      if (j.status === 'planning') return no(`${j.daysLeft} more day${j.daysLeft > 1 ? 's' : ''} of planning.`);
      if (j.status !== 'ready') return no('Not ready.');
      if (!present(w, j) && j.crewIds.length === 0) return no(`That is in ${cityName_(w, cityOfBlock(w, j.blockId))}. Go there, or send somebody.`);
      if (j.crewIds.some(id => w.npcs[id]?.crew?.status !== 'ready' && w.npcs[id]?.crew?.status !== 'busy')) return no('Somebody on this job is hurt or locked up. Drop the job and take it again.');
      if (busy) return no(busy);
      const r = ap(1); return r ? no(r) : yes({ ap: 1 });
    }
    case 'answer': { const j = w.jobs[a.jobId]; return j?.status === 'paused' && j.complication?.options.some(o => o.id === a.optionId) ? yes() : no('Nothing to answer.'); }
    case 'drop_job': { const j = w.jobs[a.jobId]; return j && ['planning', 'ready', 'offer'].includes(j.status) ? yes() : no('Nothing to drop.'); }
    case 'hire_specialist': {
      const j = w.jobs[a.jobId]; if (!j || !['planning', 'ready'].includes(j.status)) return no('Take the job on first.');
      if (j.specialist) return no(`${j.specialist.name} is already on it.`);
      const fx = w.fixerId ? w.npcs[w.fixerId] : undefined;
      if (!fx?.alive || !fx.rel.met) return no('Specialists come through the fixer. Introduce yourself first.');
      if (!SPECIALISTS[a.kind]) return no('Nobody like that.');
      const c = specialistFee(j, a.kind); const e = cost(w, c); return e ? no(e) : yes({ cash: c });
    }
    case 'audit': {
      const n = w.npcs[a.npcId];
      if (!n?.crew || n.crew.assignment?.kind !== 'district') return no('Only a lieutenant keeps books worth checking.');
      if (n.crew.auditedDay !== undefined && w.day - n.crew.auditedDay < 7) return no(`You went through these books ${w.day - n.crew.auditedDay} days ago.`);
      const r = ap(1); return r ? no(r) : yes({ ap: 1 });
    }
    case 'case': {
      if (a.kind === 'setpiece') {
        const b = a.blockId ? w.blocks[a.blockId] : undefined;
        if (!b || !setpieceFor(b.landmark)) return no('Nothing there worth a set-piece.');
        if (!setpieceOpen(w, b.id)) return no(`It was hit on day ${b.hitDay}. Nobody gets near it again until day ${(b.hitDay ?? 0) + SETPIECE_REST}.`);
        if (p.fear + p.respect < SETPIECE_RANK) return no(`Nobody brings a job like this to somebody the street does not know yet (fear + respect ${SETPIECE_RANK}).`);
        if (Object.values(w.jobs).some(j => j.kind === 'setpiece' && ['offer', 'planning', 'ready'].includes(j.status))) return no('One of these at a time.');
        if (busy) return no(busy);
        const r = ap(1); return r ? no(r) : yes({ ap: 1 });
      }
      if (a.npcId && isHeld(w, a.npcId)) return no('They are in somebody\'s back room.');
      // one target at a time: a place, a person, a file, or a block (which also stands for its
      // district and for the jobs you set up from wherever you are)
      const target = a.businessId ? { businessId: a.businessId } : a.npcId ? { npcId: a.npcId } : a.caseId ? { caseId: a.caseId } : a.blockId ? { blockId: a.blockId } : undefined;
      if (!target) return no('Nothing to case.');
      const kinds = caseKinds(w, target);
      if (!kinds.includes(a.kind)) return no(a.businessId && w.businesses[a.businessId]?.ownedBy === PLAYER ? 'It is yours.' : 'Not a job that fits.');
      if (isCatalogue(a.kind)) { const why = needsMet(w, a.kind); if (why) return no(why); }
      if (Object.values(w.jobs).some(j => ['offer', 'planning', 'ready'].includes(j.status) && j.kind === a.kind && (j.targetBusinessId === a.businessId && a.businessId || j.targetNpcId === a.npcId && a.npcId || j.targetCaseId === a.caseId && a.caseId || (a.blockId && !a.businessId && !a.npcId && !a.caseId && j.blockId === a.blockId)))) return no('Already on your board.');
      if (busy) return no(busy);
      const r = ap(1); return r ? no(r) : yes({ ap: 1 });
    }
    case 'tribute': { const f = w.factions[a.factionId]; if (!f?.alive) return no('Gone.'); const e = cost(w, a.amount); return e ? no(e) : a.amount < 200 ? no('An insult.') : yes({ cash: a.amount }); }
    case 'sit_down': {
      const f = w.factions[a.factionId]; if (!f?.alive) return no('Gone.');
      if (a.offer === 'alliance' && f.standing < 25) return no('They would need to like you first (standing 25).');
      if (a.offer === 'split' && !Object.values(w.blocks).some(b => (b.influence[PLAYER] ?? 0) > 5 && (b.influence[f.id] ?? 0) > 5)) return no('There is no block you both want.');
      if (busy) return no(busy);
      const o = sitDownOdds(w, f, a.offer);
      const r = ap(2) ?? cost(w, o.cost); return r ? no(r) : yes({ ap: 2, cash: o.cost });
    }
    case 'declare_war': { const f = w.factions[a.factionId]; return f?.alive ? (f.standing <= -56 ? no('You are already at war.') : yes()) : no('Gone.'); }
    case 'drop_payroll': return w.npcs[a.npcId]?.payroll ? yes() : no('Not on your payroll.');
    case 'lawyer': return a.on ? (p.lawyer ? no('You have one.') : cost(w, 500) ? no(cost(w, 500)!) : yes({ cash: 500 })) : (p.lawyer ? yes() : no('You have none.'));
    case 'lay_low': { if (a.days < 1 || a.days > 7) return no('One to seven days.'); if (busy) return no(busy); return yes(); }
    case 'resolve_event': {
      const e = w.events.find(x => x.id === a.eventId); if (!e) return no('Gone.');
      const o = e.options.find(x => x.id === a.optionId); if (!o) return no('No such choice.');
      return o.disabled ? no(o.disabled) : yes();
    }
    case 'retire': return p.straightDays >= STRAIGHT.days ? yes() : no(`Getting out needs ${money(STRAIGHT.clean)} clean, heat under ${STRAIGHT.heat} and no open files, held for ${STRAIGHT.days} days (${p.straightDays} so far).`);
    case 'nightfall': return busy ? no(busy) : yes();
    case 'end_day': return busy ? no(busy) : yes();
    case 'seen_win': return yes();
    case 'cheat': return CHEATS.some(c => c.kind === a.what) ? yes() : no('No such tool.');
  }
}

export function restockCost(w: World, kind: keyof typeof LABS, days: number) {
  const smuggling = w.player.racketIds.some(id => w.rackets[id]?.kind === 'smuggling' && w.rackets[id].down === 0);
  return Math.round(LABS[kind].supplyCost * days * (smuggling ? 0.6 : 1));
}

/** Apply an action to a copy of the world. Refused actions return the world unchanged. */
export function dispatch(world: World, a: Action): World {
  const ok = can(world, a);
  if (!ok.ok) return world;
  const w: World = structuredClone(world);
  const rng = rngOf(w);
  const p = w.player;
  if (ok.ap) p.ap -= ok.ap;
  switch (a.type) {
    case 'travel': p.blockId = a.blockId; log(w, `You go to ${w.blocks[a.blockId].name}${ok.ap ? ' (a cab)' : ''}.`, 'info', { blockId: a.blockId }); break;
    case 'travel_city': {
      const c = regionCity(w, a.cityId)!;
      spend(w, fare(w, a.cityId));
      const first = !c.founded;
      const at = foundCity(w, a.cityId) ?? arrivalIn(w, a.cityId);
      p.blockId = at;
      // whoever you brought comes with you, off whatever they were doing where they were
      for (const id of a.bring ?? []) { const n = w.npcs[id]; freeFromAssignment(w, n); n.crew!.cityId = a.cityId; }
      log(w, first ? `You get off the train in ${c.name} with everything you own and everybody who works for you. Nobody here has heard of you yet. ${c.blurb}` : `Back in ${c.name}.`, 'info', { blockId: at });
      break;
    }
    case 'move_crew': {
      const n = w.npcs[a.npcId]; const from = crewCity(w, n.id);
      spend(w, fareBetween(w, from, a.to)); freeFromAssignment(w, n);
      n.crew!.cityId = a.to; n.crew!.status = 'travel'; n.crew!.statusDays = 1;
      log(w, `${fullName(n)} takes the train from ${cityName_(w, from)} to ${cityName_(w, a.to)}. There tomorrow.`, 'info', { npcId: n.id });
      break;
    }
    case 'open_route': { spend(w, REGION.routeSetup); openRoute(w, a.from, a.to, a.product); break; }
    case 'close_route': { w.routes = (w.routes ?? []).filter(r => r.id !== a.id); log(w, 'You close the route.', 'info'); break; }
    case 'scene': playScene(w, a.kind, a.npcId, rng, { businessId: a.businessId, rate: a.rate }); break;
    case 'set_rate': w.businesses[a.businessId].protection!.rate = a.rate; break;
    case 'drop_protection': { const b = w.businesses[a.businessId]; b.protection = undefined; const o = w.npcs[b.ownerId]; if (o) o.rel.trust = clamp(o.rel.trust + 10, -100, 100); log(w, `You let ${b.name} go.`, 'info'); break; }
    case 'start_racket': {
      const b = w.businesses[a.businessId]; spend(w, RACKETS[a.kind].setup);
      const id = nid(w, 'r');
      w.rackets[id] = { id, kind: a.kind, businessId: b.id, owner: PLAYER, level: 1, started: w.day, lastIncome: 0, down: 0, on: RACKETS[a.kind].wash ? true : undefined };
      b.racketIds.push(id); p.racketIds.push(id);
      addInfluence(w, b.blockId, PLAYER, 4);
      practise(w, RACKETS[a.kind].skill, 4);
      log(w, `${RACKETS[a.kind].label} opens at ${b.name}.${RACKETS[a.kind].wash ? ' It washes your dirty money every night while it is switched on.' : ''}`, 'good', { businessId: b.id });
      break;
    }
    case 'upgrade_racket': { const r = w.rackets[a.racketId]; spend(w, upgradeCost(r)); r.level = (r.level + 1) as Racket['level']; log(w, `${RACKETS[r.kind].label} at ${w.businesses[r.businessId].name} is level ${r.level}.`, 'good'); break; }
    case 'close_racket': { const r = w.rackets[a.racketId]; const b = w.businesses[r.businessId]; if (r.runnerId && w.npcs[r.runnerId]?.crew) w.npcs[r.runnerId].crew!.assignment = undefined; b.racketIds = b.racketIds.filter(x => x !== r.id); p.racketIds = p.racketIds.filter(x => x !== r.id); delete w.rackets[r.id]; log(w, `Closed the ${RACKETS[r.kind].label.toLowerCase()} at ${b.name}.`, 'info'); break; }
    case 'toggle_wash': { const r = w.rackets[a.racketId]; r.on = r.on === false; log(w, `The laundry at ${w.businesses[r.businessId].name} is ${r.on ? 'running' : 'switched off'}.`, 'info'); break; }
    case 'assign': {
      const n = w.npcs[a.npcId];
      freeFromAssignment(w, n);
      const as = a.assignment;
      if (as?.kind === 'racket') w.rackets[as.racketId].runnerId = n.id;
      if (as?.kind === 'lab') for (const sid of p.safehouseIds) for (const l of w.safehouses[sid].labs) if (l.id === as.labId) { if (l.workerId && w.npcs[l.workerId]?.crew) w.npcs[l.workerId].crew!.assignment = undefined; l.workerId = n.id; }
      n.crew!.assignment = as ?? undefined;
      if (as?.kind === 'district') log(w, `${fullName(n)} runs ${w.districts[as.districtId].name} for you now.`, 'good', { npcId: n.id });
      break;
    }
    case 'fire': { const n = w.npcs[a.npcId]; freeFromAssignment(w, n); returnKit(w, n.id); n.crew = undefined; n.faction = undefined; n.role = 'patron'; n.rel.trust = clamp(n.rel.trust - 20, -100, 100); p.crewIds = p.crewIds.filter(x => x !== n.id); log(w, `${fullName(n)} is out.`, 'info', { npcId: n.id }); break; }
    case 'rent_safehouse': {
      const b = w.blocks[a.blockId]; spend(w, SAFEHOUSE_TIERS[0].buy);
      const id = nid(w, 's');
      w.safehouses[id] = { id, blockId: b.id, name: `${SAFEHOUSE_TIERS[0].label} on ${b.name}`, tier: 1, labs: [] };
      b.safehouseId = id; p.safehouseIds.push(id);
      addInfluence(w, b.id, PLAYER, 4);
      log(w, `A ${SAFEHOUSE_TIERS[0].label.toLowerCase()} on ${b.name} is yours: three more beds, room for stock and a lab.`, 'good', { blockId: b.id });
      break;
    }
    case 'upgrade_safehouse': { const s = w.safehouses[a.safehouseId]; spend(w, SAFEHOUSE_TIERS[s.tier].buy); s.tier = (s.tier + 1) as 1 | 2 | 3; s.name = `${SAFEHOUSE_TIERS[s.tier - 1].label} on ${w.blocks[s.blockId].name}`; log(w, `${s.name}: more room, more beds.`, 'good'); break; }
    case 'build_lab': { const s = w.safehouses[a.safehouseId]; spend(w, LABS[a.kind].setup); s.labs.push({ id: nid(w, 'l'), kind: a.kind, level: 1, supplies: 3, lastOutput: 0, down: 0 }); log(w, `A ${LABS[a.kind].label.toLowerCase()} at ${s.name}, with three days of supplies.`, 'good'); break; }
    case 'upgrade_lab': { const l = w.safehouses[a.safehouseId].labs.find(x => x.id === a.labId)!; spend(w, Math.round(LABS[l.kind].setup * [0, 1.2, 2.5][l.level])); l.level = (l.level + 1) as 1 | 2 | 3; log(w, `The ${LABS[l.kind].label.toLowerCase()} is level ${l.level}.`, 'good'); break; }
    case 'restock_lab': { const l = w.safehouses[a.safehouseId].labs.find(x => x.id === a.labId)!; spend(w, restockCost(w, l.kind, a.days)); l.supplies += a.days; break; }
    case 'sell_street': {
      const price = streetPrice(w, a.product, p.blockId);
      const n = Math.min(a.n, 6 + p.skills.charm);
      p.stash[a.product].n -= n; p.dirty += n * price;
      w.player.heat = clamp(p.heat + n * 0.4); w.blocks[p.blockId].heat = clamp(w.blocks[p.blockId].heat + n * 0.6);
      practise(w, 'charm', 2);
      log(w, `You sell ${n} ${a.product} on ${w.blocks[p.blockId].name} for ${money(n * price)}.${n < a.n ? ' That is all one pair of hands can move in a day.' : ''}`, 'money');
      break;
    }
    case 'buy_item': {
      const d = ITEMS[a.item]; spend(w, d.price); p.armoury.push(a.item);
      // the first of anything goes straight on the boss if the boss has nothing in that slot
      if (!p.kit[d.slot]) equip(w, a.item, PLAYER);
      log(w, `${d.label}, ${money(d.price)}${a.at === 'fixer' ? ' from the fixer' : ` at ${w.businesses[a.at].name}`}.`, 'good');
      break;
    }
    case 'equip': equip(w, a.item, a.to); break;
    case 'unequip': unequip(w, a.from, a.slot); break;
    case 'hostage': resolveHostage(w, w.hostages[a.id], a.choice); break;
    case 'lobby': {
      const f = w.factions[a.factionId]; const boss = w.npcs[f.bossId];
      if ((boss?.rel.owes ?? 0) > 0) { boss.rel.owes--; log(w, `You call in what ${fullName(boss)} owes you: ${f.short} votes your way.`, 'info'); }
      else { spend(w, lobbyCost(f)); f.cash += lobbyCost(f); log(w, `An envelope to ${theName(f)} before the meeting.`, 'info'); }
      commissionOf(w, w.districts[f.homeDistrictId]?.cityId || 'c0').pulls[a.factionId] = a.side === 'yes' ? LOBBY_PULL : -LOBBY_PULL;
      break;
    }
    case 'commission_vote': commissionOf(w, a.cityId ?? currentCity(w)).vote = a.vote; log(w, `You will vote ${a.vote} at the table.`, 'info'); break;
    case 'fixer_wash': { const clean = Math.round(a.amount * fixerRate(w)); p.dirty -= a.amount; p.cash += clean; p.washedToday += a.amount; log(w, `The fixer turns ${money(a.amount)} dirty into ${money(clean)} clean.`, 'money'); break; }
    case 'take_job': { const j = w.jobs[a.jobId]; if (j.cost) spend(w, j.cost); takeJob(w, j, a.crewIds); break; }
    case 'join_job': { const j = w.jobs[a.jobId]; const n = w.npcs[a.npcId]; freeFromAssignment(w, n); j.crewIds.push(n.id); n.crew!.assignment = { kind: 'job', jobId: j.id }; log(w, `${fullName(n)} joins ${j.title.toLowerCase()}.`, 'info', { npcId: n.id }); break; }
    case 'launch_job': launchJob(w, w.jobs[a.jobId], a.approach, rng); break;
    case 'answer': answerComplication(w, w.jobs[a.jobId], a.optionId, rng); break;
    case 'drop_job': dropJob(w, w.jobs[a.jobId]); break;
    case 'hire_specialist': { const j = w.jobs[a.jobId]; spend(w, specialistFee(j, a.kind)); hireSpecialist(w, j, a.kind, rng); break; }
    case 'audit': {
      const n = w.npcs[a.npcId]; const c = n.crew!;
      c.auditedDay = w.day; practise(w, 'brains', 4);
      const skimmed = c.skimmed ?? 0;
      if (skimmed > 0 && rng.float() * 100 < auditOdds(w, n)) {
        const back = Math.round(skimmed * 0.7);
        p.dirty += back; c.skimmed = 0; c.caughtDay = w.day; c.loyalty = clamp(c.loyalty - 10);
        log(w, `The books do not add up. ${fullName(n)} has had ${money(skimmed)} out of the district; you get ${money(back)} of it back, and ${n.pronoun === 'they' ? 'they know' : `${n.pronoun} knows`} you are watching.`, 'money', { npcId: n.id });
      } else {
        c.loyalty = clamp(c.loyalty - 4);
        log(w, skimmed > 0 ? `You go through ${fullName(n)}'s books and find nothing wrong. Nothing you can prove.` : `The books are clean. ${fullName(n)} noticed you checking.`, 'info', { npcId: n.id });
      }
      break;
    }
    case 'case': {
      if (a.kind === 'setpiece') {
        const j = buildJob(w, rng, { kind: 'setpiece', blockId: a.blockId! });
        if (j) { j.expires = w.day + 10; j.intel = 1; practise(w, 'brains', 3); log(w, `You spend a day around ${w.blocks[a.blockId!].landmark}. ${j.title} is on your board.`, 'info'); }
        break;
      }
      const b = a.businessId ? w.businesses[a.businessId] : undefined; const n = a.npcId ? w.npcs[a.npcId] : undefined;
      const blockId = b?.blockId ?? n?.homeBlockId ?? a.blockId ?? p.blockId;
      const holder = controller(w.blocks[blockId]);
      const faction = b ? (b.protection?.by !== PLAYER ? b.protection?.by : undefined) : n ? (n.faction !== PLAYER ? n.faction : undefined) : holder && holder !== PLAYER && w.factions[holder] && w.factions[holder].standing <= -40 ? holder : undefined;
      const j = buildJob(w, rng, { kind: a.kind, blockId, businessId: a.businessId, npcId: a.npcId, caseId: a.caseId, faction });
      if (j) { j.expires = w.day + 7; j.intel = 1; practise(w, 'brains', 3); log(w, `You look into it: ${j.title} is on your board.`, 'info'); }
      break;
    }
    case 'tribute': { const f = w.factions[a.factionId]; spend(w, a.amount); const s = tributeEffect(f, a.amount); f.standing = clamp(f.standing + s, -100, 100); f.cash += a.amount; log(w, `You send the ${f.short} ${money(a.amount)}. Standing +${s}.`, 'info'); break; }
    case 'sit_down': { const f = w.factions[a.factionId]; spend(w, sitDownOdds(w, f, a.offer).cost); sitDown(w, f, a.offer, rng); break; }
    case 'declare_war': { const f = w.factions[a.factionId]; f.standing = -70; f.truceUntil = undefined; p.respect = clamp(p.respect + 5); p.fear = clamp(p.fear + 5); log(w, `You declare war on ${theName(f)}.`, 'war'); break; }
    case 'drop_payroll': { const n = w.npcs[a.npcId]; n.payroll = undefined; log(w, `${fullName(n)} is off the payroll.`, 'info'); break; }
    case 'lawyer': if (a.on) { spend(w, 500); p.lawyer = true; log(w, 'You retain a lawyer: 500 now, 150 a day.', 'law'); } else { p.lawyer = false; log(w, 'You let the lawyer go.', 'law'); } break;
    case 'lay_low': {
      p.lowDays = a.days;
      log(w, `You go under for ${a.days} day${a.days > 1 ? 's' : ''}.`, 'info');
      for (let d = 0; d < a.days && !w.over; d++) {
        // while you are gone, what comes up is answered the careful way
        while (w.events.length) { const e = w.events[0]; const o = [...e.options].reverse().find(x => !x.disabled) ?? e.options[e.options.length - 1]; apply(w, o.effects, rng); w.events.shift(); }
        for (const j of Object.values(w.jobs)) if (j.status === 'paused') { const o = j.complication!.options.find(x => x.safe) ?? j.complication!.options[0]; answerComplication(w, j, o.id, rng); }
        endDay(w, rng);
      }
      break;
    }
    case 'resolve_event': {
      const e = w.events.find(x => x.id === a.eventId)!; const o = e.options.find(x => x.id === a.optionId)!;
      apply(w, o.effects, rng);
      w.events = w.events.filter(x => x.id !== e.id);
      break;
    }
    case 'retire': { w.retired = true; w.over = { ending: 'straight', day: w.day, text: `You walk away with ${money(p.cash)} clean and nobody looking for you. In ${w.city.name} they still tell stories.` }; break; }
    case 'nightfall': nightfall(w, rng); break;
    // in daylight, sleeping skips the night: no encounter, no night hours, straight to morning
    case 'end_day': if (!isNight(w)) w.phase = 'night'; endDay(w, rng); break;
    case 'seen_win': w.wonSeen = true; break;
    case 'cheat': cheat(w, a.what, rng); break;
  }
  w.rng = rng.state;
  return w;
}

export { openCases };

/** The chance an audit finds a lieutenant's hand in the till, shown on the button. */
export function auditOdds(w: World, n: { skills: { brains: number }; traits: string[] }): number {
  return clamp(Math.round(50 + (w.player.skills.brains - n.skills.brains) * 8 - (n.traits.includes('sly') ? 15 : 0)), 10, 95);
}
