/** The event deck. `drawEvents` picks 0–2 cards for tonight; `resolveEventOption` applies a choice. */
import { PRODUCT_INFO } from '@content/rackets';
import type { Rng } from './rng';
import { PLAYER, type GameEvent, type World } from './types';
import { addHeat, addInfluence, adjustRel, clamp, factionOf, log, money, nid, spreadRep } from './util';

type Candidate = { w: number; make: () => GameEvent | undefined };

export function drawEvents(w: World, rng: Rng) {
  const p = w.player;
  const ev = (kind: string, title: string, text: string, options: GameEvent['options'], refs: GameEvent['refs'] = {}): GameEvent =>
    ({ id: nid(w, 'e'), day: w.day, kind, title, text, options, refs });
  const crew = p.crewIds.map(id => w.npcs[id]).filter(n => n.crew && n.crew.status !== 'dead');
  const myProtected = Object.values(w.businesses).filter(b => b.protection?.factionId === PLAYER);
  const myRackets = p.racketIds.map(id => w.rackets[id]).filter(Boolean);
  const hostile = Object.values(w.factions).filter(f => f.alive && (f.stance[PLAYER] === 'tension' || f.stance[PLAYER] === 'beef' || f.stance[PLAYER] === 'war'));
  const friendlyPatrons = Object.values(w.npcs).filter(n => n.alive && n.role === 'patron' && n.rel.trust >= 35);

  const cands: Candidate[] = [
    { w: myProtected.length ? 3 : 0, make: () => { const b = rng.pick(myProtected); const o = w.npcs[b.ownerId]; return ev('owner_favour', `${o.name} needs a favour`, `${o.name} from ${b.name} says some kids have been shaking down customers out front. "You said nothing bad would happen. So?"`, [
      { id: 'help', label: 'Send someone to sort it', detail: '+trust, +respect on the block', costAp: 1 },
      { id: 'ignore', label: 'Not my problem', detail: '−trust; the block hears about it' },
    ], { npcId: o.id, businessId: b.id }); } },
    { w: friendlyPatrons.length ? 3 : 0, make: () => { const n = rng.pick(friendlyPatrons); const b = w.blocks[n.homeBlockId]; return ev('patron_tip', `${n.name} has something`, `"There is a delivery truck that parks behind ${b.name} every night with one driver and no escort. Just saying."`, [
      { id: 'hit', label: 'Hit it tonight', detail: 'Needs an idle crew member. Hot goods, some heat.' },
      { id: 'pass', label: 'Pass', detail: 'Thanks anyway' },
    ], { npcId: n.id, blockId: b.id }); } },
    { w: hostile.length && myRackets.length ? 4 : 0, make: () => { const f = rng.pick(hostile); const r = rng.pick(myRackets); const b = w.businesses[r.businessId]; const lt = w.npcs[f.lieutenantIds[0] ?? f.bossId]; const ask = Math.round(200 + r.lastIncome * 3); return ev('rival_demand', `${f.short} want a taste`, `${lt.name} walks into ${b.name} with two guys. "${f.short} run this side of town. ${money(ask)} and we forget you are here."`, [
      { id: 'pay', label: `Pay ${money(ask)}`, detail: '+standing, they leave', costCash: ask },
      { id: 'refuse', label: 'Tell them to leave', detail: '−standing, this escalates' },
      { id: 'fight', label: 'Throw them out', detail: 'Muscle check. +fear if it works. Heat either way.' },
    ], { factionId: f.id, businessId: b.id, npcId: lt.id }); } },
    { w: crew.length ? 2 : 0, make: () => { const n = rng.pick(crew); return ev('crew_raise', `${n.name} wants more`, `"I have been putting in work. ${money(n.crew!.cut)} a day is what you pay a kid. I want ${money(Math.round(n.crew!.cut * 1.4))}."`, [
      { id: 'give', label: 'Give the raise', detail: '+loyalty, +40% cut' },
      { id: 'promise', label: 'Promise it soon', detail: 'Charm check; fails hurt loyalty' },
      { id: 'refuse', label: 'No', detail: '−loyalty' },
    ], { npcId: n.id }); } },
    { w: p.heat > 25 ? 3 : 0, make: () => { const b = p.businessIds.length ? w.businesses[rng.pick(p.businessIds)] : undefined; const ask = 300 + Math.round(p.heat * 8); return ev('cop_taste', 'A cop wants a taste', `A patrol sergeant ${b ? `stops by ${b.name}` : 'finds you'}. "Busy week for you. It could be a quiet one. ${money(ask)}."`, [
      { id: 'pay', label: `Pay ${money(ask)}`, detail: '−heat', costCash: ask },
      { id: 'refuse', label: 'Refuse', detail: '+heat' },
    ], { businessId: b?.id }); } },
    { w: crew.some(n => n.crew!.loyalty < 30) ? 4 : 0, make: () => { const n = crew.find(n => n.crew!.loyalty < 30)!; return ev('betrayal', `${n.name} is talking`, `Word is ${n.name} has been drinking with a detective and complaining about you.`, [
      { id: 'cut', label: 'Cut them loose', detail: 'They leave. Some heat.' },
      { id: 'hunt', label: 'Deal with it', detail: 'Muscle check. +fear, +heat, no more problem.' },
      { id: 'buy', label: 'Buy their loyalty', detail: '+loyalty', costCash: 1500 },
    ], { npcId: n.id }); } },
    { w: myRackets.some(r => r.kind === 'loansharking' && (r.float ?? 0) > 500) ? 3 : 0, make: () => { const r = myRackets.find(r => r.kind === 'loansharking')!; const b = w.businesses[r.businessId]; const debtor = b.patronIds.length ? w.npcs[rng.pick(b.patronIds)] : w.npcs[b.ownerId]; const owed = Math.round((r.float ?? 1000) * 0.2); return ev('debtor', `${debtor.name} cannot pay`, `${debtor.name} owes ${money(owed)} and has nothing. "Give me a week. Please."`, [
      { id: 'break', label: 'Make an example', detail: '+fear on the block, +heat, money gone' },
      { id: 'week', label: 'One more week', detail: '+trust; maybe you get paid' },
      { id: 'work', label: 'Work it off', detail: `${debtor.name} joins your crew at no wage for a while` },
    ], { npcId: debtor.id, racketId: r.id }); } },
    { w: Object.values(w.npcs).some(n => n.role === 'owner' && n.rel.trust >= 45 && w.businesses[Object.values(w.businesses).find(b => b.ownerId === n.id)?.id ?? '']?.ownedBy === 'npc') ? 2 : 0, make: () => { const o = Object.values(w.npcs).find(n => n.role === 'owner' && n.rel.trust >= 45 && Object.values(w.businesses).find(b => b.ownerId === n.id)?.ownedBy === 'npc')!; const b = Object.values(w.businesses).find(b => b.ownerId === o.id)!; const price = Math.round(b.value * 0.75); return ev('offer_sale', `${o.name} wants out`, `"I am tired. ${b.name} is yours for ${money(price)} if you want it. Keep me on and I will run it."`, [
      { id: 'buy', label: `Buy for ${money(price)}`, costCash: price },
      { id: 'decline', label: 'Not now' },
    ], { npcId: o.id, businessId: b.id }); } },
    { w: myProtected.length && Object.values(w.factions).some(f => f.alive) ? 2 : 0, make: () => { const b = rng.pick(myProtected); const o = w.npcs[b.ownerId]; const f = rng.pick(Object.values(w.factions).filter(f => f.alive)); return ev('defect', `${o.name} got a better offer`, `${o.name}: "${f.short} say they will take ten percent and actually keep the peace. Why am I paying you more?"`, [
      { id: 'match', label: 'Drop to 10%', detail: '+trust, less income' },
      { id: 'threaten', label: 'Remind them who you are', detail: '+fear, −trust' },
      { id: 'release', label: 'Let them go', detail: `${f.short} take the place` },
    ], { npcId: o.id, businessId: b.id, factionId: f.id }); } },
    { w: p.heat > 55 ? 2 : 0, make: () => ev('reporter', 'A reporter is asking questions', `A crime reporter has been talking to owners on your blocks. A story would bring the whole department down on you.`, [
      { id: 'bribe', label: 'Buy the story', detail: '−heat', costCash: 2500 },
      { id: 'scare', label: 'Scare them off', detail: 'Muscle check; +fear or +heat' },
      { id: 'ignore', label: 'Let them write', detail: '+heat' },
    ]) },
    { w: hostile.some(f => f.stance[PLAYER] === 'tension') ? 3 : 0, make: () => { const f = hostile.find(f => f.stance[PLAYER] === 'tension')!; return ev('invite', `${f.name} want to talk`, `${w.npcs[f.bossId].name} sends word: come to a sit-down, alone, tomorrow. "Before this gets stupid."`, [
      { id: 'go', label: 'Go', detail: 'Standing improves; they may ask for something', costAp: 2 },
      { id: 'ignore', label: 'Ignore it', detail: '−standing' },
    ], { factionId: f.id }); } },
    { w: 1, make: () => { const b = w.blocks[rng.pick(Object.keys(w.blocks))]; const biz = b.businessIds.length ? w.businesses[rng.pick(b.businessIds)] : undefined; if (!biz) return undefined; return ev('opportunity', 'An opening', `${w.npcs[biz.ownerId].name} at ${biz.name} is in debt to the wrong people and is desperate for a partner. A gift now would go a long way.`, [
      { id: 'gift', label: 'Send $800', detail: 'big trust boost', costCash: 800 },
      { id: 'pass', label: 'Pass' },
    ], { npcId: biz.ownerId, businessId: biz.id, blockId: b.id }); } },
  ];
  const n = rng.chance(0.75) ? (rng.chance(0.3) ? 2 : 1) : 0;
  const pool = cands.filter(c => c.w > 0);
  for (let i = 0; i < n && pool.length; i++) {
    const c = rng.weighted(pool.map(c => ({ item: c, w: c.w })));
    pool.splice(pool.indexOf(c), 1);
    const e = c.make(); if (e) w.pendingEvents.push(e);
  }
}

export function resolveEventOption(w: World, e: GameEvent, opt: string, rng: Rng) {
  const p = w.player;
  const n = e.refs.npcId ? w.npcs[e.refs.npcId] : undefined;
  const biz = e.refs.businessId ? w.businesses[e.refs.businessId] : undefined;
  const f = e.refs.factionId ? w.factions[e.refs.factionId] : undefined;
  const muscleCheck = () => p.skills.muscle * 5 + p.crewIds.length * 5 + p.fear * 0.3 + rng.int(0, 30) > 45;
  const charmCheck = () => p.skills.charm * 5 + p.respect * 0.3 + rng.int(0, 30) > 40;
  const key = `${e.kind}:${opt}`;
  switch (key) {
    case 'owner_favour:help': if (n && biz) { adjustRel(n, { trust: 15, respect: 10 }); spreadRep(w, biz.blockId, { respect: 4, trust: 2 }); addInfluence(w, biz.blockId, PLAYER, 5); log(w, `You sort out ${n.name}'s problem. The block notices.`, 'good', e.refs); } break;
    case 'owner_favour:ignore': if (n && biz) { adjustRel(n, { trust: -20 }); spreadRep(w, biz.blockId, { respect: -3 }); log(w, `${n.name} stops paying with a smile.`, 'bad', e.refs); } break;
    case 'patron_tip:hit': { const idle = p.crewIds.map(id => w.npcs[id]).find(c => c.crew?.status === 'idle'); if (!idle) { log(w, 'Nobody free to do it. The truck leaves.', 'warn'); break; } if (idle.skills.wheels + idle.skills.muscle + rng.int(0, 10) > 9) { const units = rng.int(6, 14); p.stash.hot_goods += units; addHeat(w, 5, e.refs.blockId); if (n) adjustRel(n, { trust: 5, respect: 5 }); log(w, `${idle.name} takes the truck. ${units} crates of hot goods.`, 'good', e.refs); } else { idle.crew!.status = 'injured'; idle.crew!.statusDays = 3; addHeat(w, 8, e.refs.blockId); log(w, `The driver had a gun. ${idle.name} is hurt and the truck is gone.`, 'bad', e.refs); } break; }
    case 'rival_demand:pay': if (f) { f.cash += e.options[0].costCash ?? 0; f.standing[PLAYER] = clamp(f.standing[PLAYER] + 10, -100, 100); log(w, `${f.short} take the money and leave. For now.`, 'money', e.refs); } break;
    case 'rival_demand:refuse': if (f) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 12, -100, 100); p.respect = clamp(p.respect + 2); log(w, `${n?.name ?? 'The lieutenant'} nods slowly. "Your funeral."`, 'warn', e.refs); } break;
    case 'rival_demand:fight': if (f) { if (muscleCheck()) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 20, -100, 100); f.soldiers = Math.max(0, f.soldiers - 1); p.fear = clamp(p.fear + 6); p.respect = clamp(p.respect + 4); if (biz) spreadRep(w, biz.blockId, { fear: 6, respect: 3 }); addHeat(w, 4, biz?.blockId); log(w, `You throw ${n?.name} through the front window. The block is impressed and ${f.short} are furious.`, 'good', e.refs); } else { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 15, -100, 100); const c = p.crewIds.map(id => w.npcs[id]).find(c => c.crew?.status === 'idle' || c.crew?.status === 'assigned'); if (c) { c.crew!.status = 'injured'; c.crew!.statusDays = 4; c.crew!.assignment = undefined; } addHeat(w, 6, biz?.blockId); log(w, `It goes badly. ${c ? `${c.name} is hurt.` : ''} They take the cash box anyway.`, 'bad', e.refs); p.dirty = Math.max(0, p.dirty - 500); } } break;
    case 'crew_raise:give': if (n?.crew) { n.crew.cut = Math.round(n.crew.cut * 1.4); n.crew.loyalty = clamp(n.crew.loyalty + 15); log(w, `${n.name} gets the raise.`, 'info', e.refs); } break;
    case 'crew_raise:promise': if (n?.crew) { if (charmCheck()) { n.crew.loyalty = clamp(n.crew.loyalty + 5); log(w, `${n.name} buys it. For now.`, 'info', e.refs); } else { n.crew.loyalty = clamp(n.crew.loyalty - 15); log(w, `${n.name} has heard that before. (−15 loyalty)`, 'bad', e.refs); } } break;
    case 'crew_raise:refuse': if (n?.crew) { n.crew.loyalty = clamp(n.crew.loyalty - 12); log(w, `${n.name} says nothing. (−12 loyalty)`, 'warn', e.refs); } break;
    case 'cop_taste:pay': p.heat = clamp(p.heat - 12); log(w, 'The sergeant is suddenly very busy elsewhere. (−12 heat)', 'money', e.refs); break;
    case 'cop_taste:refuse': addHeat(w, 8); log(w, 'The sergeant makes a note. (+8 heat)', 'bad', e.refs); break;
    case 'betrayal:cut': if (n?.crew) { p.crewIds = p.crewIds.filter(id => id !== n.id); n.crew = undefined; n.role = 'patron'; n.rel.trust = -60; addHeat(w, 6); log(w, `${n.name} is out. They know things. (+6 heat)`, 'warn', e.refs); } break;
    case 'betrayal:hunt': if (n?.crew) { p.crewIds = p.crewIds.filter(id => id !== n.id); if (muscleCheck()) { n.alive = false; n.crew.status = 'dead'; p.fear = clamp(p.fear + 8); addHeat(w, 8); for (const c of p.crewIds.map(id => w.npcs[id])) if (c.crew) c.crew.loyalty = clamp(c.crew.loyalty + 5); log(w, `${n.name} is not talking to anyone any more. Your crew got the message. (+8 heat)`, 'warn', e.refs); } else { n.crew = undefined; n.role = 'patron'; n.rel.trust = -90; addHeat(w, 15); log(w, `${n.name} got away and went straight to the precinct. (+15 heat)`, 'bad', e.refs); } } break;
    case 'betrayal:buy': if (n?.crew) { n.crew.loyalty = clamp(n.crew.loyalty + 30); log(w, `${n.name} takes the envelope and shuts up.`, 'money', e.refs); } break;
    case 'debtor:break': if (n) { adjustRel(n, { fear: 40, trust: -40 }); spreadRep(w, n.homeBlockId, { fear: 8 }); addHeat(w, 6, n.homeBlockId); p.fear = clamp(p.fear + 4); log(w, `${n.name} will walk with a limp. The block is quieter now. (+8 fear nearby)`, 'warn', e.refs); } break;
    case 'debtor:week': if (n) { adjustRel(n, { trust: 15, respect: 5 }); if (rng.chance(0.5)) { const r = e.refs.racketId ? w.rackets[e.refs.racketId] : undefined; const owed = Math.round((r?.float ?? 1000) * 0.2); p.dirty += owed; log(w, `${n.name} pays up a week later, with thanks. (+${money(owed)})`, 'money', e.refs); } else log(w, `${n.name} is grateful. The money never shows.`, 'info', e.refs); } break;
    case 'debtor:work': if (n && !n.crew) { n.crew = { loyalty: 35, cut: 0, status: 'idle', statusDays: 0, joinedDay: w.day }; n.role = 'crew'; p.crewIds.push(n.id); for (const bid of n.favouriteBusinessIds) w.businesses[bid].patronIds = w.businesses[bid].patronIds.filter(id => id !== n.id); log(w, `${n.name} works for you now. Free labour, low loyalty.`, 'info', e.refs); } break;
    case 'offer_sale:buy': if (n && biz) { biz.ownedBy = 'player'; p.businessIds.push(biz.id); if (biz.protection && biz.protection.factionId !== PLAYER) { w.factions[biz.protection.factionId].standing[PLAYER] -= 8; } biz.protection = undefined; n.faction = PLAYER; adjustRel(n, { trust: 10 }); addInfluence(w, biz.blockId, PLAYER, 12); log(w, `${biz.name} is yours.`, 'good', e.refs); } break;
    case 'defect:match': if (n && biz?.protection) { biz.protection.rate = 0.1; adjustRel(n, { trust: 10 }); log(w, `${n.name} stays at 10%.`, 'info', e.refs); } break;
    case 'defect:threaten': if (n) { adjustRel(n, { fear: 20, trust: -15 }); log(w, `${n.name} goes pale and keeps paying.`, 'warn', e.refs); } break;
    case 'defect:release': if (n && biz && f) { const rid = biz.racketIds.find(id => w.rackets[id].kind === 'protection' && w.rackets[id].owner === PLAYER); if (rid) { biz.racketIds = biz.racketIds.filter(id => id !== rid); p.racketIds = p.racketIds.filter(id => id !== rid); delete w.rackets[rid]; } biz.protection = { factionId: f.id, rate: 0.1, since: w.day }; n.faction = f.id; f.standing[PLAYER] = clamp(f.standing[PLAYER] + 5, -100, 100); addInfluence(w, biz.blockId, PLAYER, -8); log(w, `${f.short} take over ${biz.name}.`, 'info', e.refs); } break;
    case 'reporter:bribe': p.heat = clamp(p.heat - 15); log(w, 'The story runs about somebody else. (−15 heat)', 'money'); break;
    case 'reporter:scare': if (muscleCheck()) { p.heat = clamp(p.heat - 8); p.fear = clamp(p.fear + 3); log(w, 'The reporter takes a job in another city. (−8 heat)', 'warn'); } else { addHeat(w, 15); log(w, 'The reporter wrote about the threat. Front page. (+15 heat)', 'bad'); } break;
    case 'reporter:ignore': addHeat(w, 10); log(w, 'The story runs. (+10 heat)', 'bad'); break;
    case 'invite:go': if (f) { f.standing[PLAYER] = clamp(f.standing[PLAYER] + 18, -100, 100); if (f.temperament === 'greedy' && p.cash > 1000) { const ask = Math.min(p.cash, 1000); p.cash -= ask; f.cash += ask; log(w, `${w.npcs[f.bossId].name} hears you out. Peace, for ${money(ask)} "for the trouble".`, 'info', e.refs); } else log(w, `${w.npcs[f.bossId].name} hears you out. Things cool down.`, 'good', e.refs); if (f.stance[PLAYER] === 'tension' && f.standing[PLAYER] >= -15) f.stance[PLAYER] = 'peace'; } break;
    case 'invite:ignore': if (f) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 15, -100, 100); log(w, `${f.name} take the silence as an answer.`, 'warn', e.refs); } break;
    case 'opportunity:gift': if (n) { adjustRel(n, { trust: 35, respect: 10 }); log(w, `${n.name} will not forget this.`, 'good', e.refs); } break;
    default: break;
  }
  void PRODUCT_INFO; void factionOf;
}
