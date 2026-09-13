/** The event deck. `drawEvents` picks 0–2 cards for tonight; `resolveEventOption` applies a choice. */
import { PRODUCT_INFO, RACKET_DEFS } from '@content/rackets';
import type { Rng } from './rng';
import { PLAYER, type GameEvent, type World } from './types';
import { addHeat, addInfluence, adjustRel, clamp, factionOf, log, money, nid, spreadRep } from './util';
import { LIEUTENANT } from '@content/rackets';
import { flipLieutenant, lieutenants } from './lieutenants';

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

  const runners = myRackets.filter(r => r.runnerId && w.npcs[r.runnerId]?.crew);
  const skimmers = lieutenants(w).filter(n => (n.crew?.skim ?? 0) >= LIEUTENANT.skimEventAt);
  const cands: Candidate[] = [
    { w: skimmers.length ? 3 : 0, make: () => { const n = rng.pick(skimmers); const a = n.crew!.assignment as { kind: 'lieutenant'; districtId: string }; const d = w.districts[a.districtId]; return ev('lt_skim', `The ${d?.name ?? 'district'} book feels light`, `${n.name} runs ${d?.name ?? 'the district'} for you and the numbers have been soft for a while. Could be a slow month. Could be ${n.name}.`, [
      { id: 'audit', label: 'Go over the books', detail: 'Brains check. Find it and you get some back.' },
      { id: 'confront', label: 'Ask them straight', detail: 'Muscle check. They cough it all up, or they run with it.' },
      { id: 'slide', label: 'Let it slide', detail: 'Money gone; they feel looked after' },
      { id: 'demote', label: 'Take the district back', detail: 'They keep what they took. −loyalty' },
    ], { npcId: n.id, blockId: d?.blockIds[0] }); } },
    { w: runners.some(r => (w.npcs[r.runnerId!].crew?.loyalty ?? 100) < 50) ? 3 : 0, make: () => { const r = runners.find(r => (w.npcs[r.runnerId!].crew?.loyalty ?? 100) < 50)!; const n = w.npcs[r.runnerId!]; const b = w.businesses[r.businessId]; const skim = Math.max(80, Math.round(r.lastIncome * 0.3)); return ev('skimming', `${n.name} is skimming`, `The ${RACKET_DEFS[r.kind].label.toLowerCase()} at ${b.name} is light again. ${n.name} runs it. About ${money(skim)} a day is walking out the door.`, [
      { id: 'confront', label: 'Confront them', detail: 'Muscle check. They stop, or they run with the cash.' },
      { id: 'slide', label: 'Let it slide', detail: 'Costs you money; they feel looked after' },
      { id: 'replace', label: 'Pull them off it', detail: 'Racket runs unmanned; −loyalty' },
    ], { npcId: n.id, racketId: r.id, businessId: b.id }); } },
    { w: myRackets.length ? 3 : 0, make: () => { const r = rng.pick(myRackets); const b = w.businesses[r.businessId]; const ask = 400 + Math.round(r.lastIncome * 2); return ev('cops_sniffing', 'A detective is asking around', `A plainclothes cop has been sitting across from ${b.name} two nights running, watching the ${RACKET_DEFS[r.kind].label.toLowerCase()}.`, [
      { id: 'pay', label: `Pay him off (${money(ask)})`, detail: '−heat, he goes away', costCash: ask },
      { id: 'move', label: 'Go dark for two days', detail: 'No income for 2 days; block heat drops' },
      { id: 'ride', label: 'Ride it out', detail: 'Half the time nothing happens. The other half is a raid.' },
    ], { racketId: r.id, businessId: b.id }); } },
    { w: myRackets.some(r => r.kind === 'bookmaking' || r.kind === 'gambling_den') ? 2 : 0, make: () => { const r = myRackets.find(r => r.kind === 'bookmaking' || r.kind === 'gambling_den')!; const b = w.businesses[r.businessId]; const stake = 1500 + rng.int(0, 3000); return ev('whale', 'A high roller wants credit', `A man in a good coat has been losing big at ${b.name} and wants ${money(stake)} on credit to keep going. The house usually wins. Usually.`, [
      { id: 'extend', label: 'Extend credit', detail: `Win ${money(Math.round(stake * 1.5))}, or chase a debt` },
      { id: 'refuse', label: 'Cash only', detail: 'He walks; nothing gained' },
    ], { racketId: r.id, businessId: b.id }); } },
    { w: crew.length >= 3 ? 2 : 0, make: () => { const [a, b] = rng.shuffle(crew).slice(0, 2); return ev('crew_beef', `${a.name} and ${b.name} are at each other`, `It started over money and now it is about respect. Somebody is going to get hurt unless you settle it.`, [
      { id: 'a', label: `Back ${a.name}`, detail: `${a.name} +loyalty, ${b.name} −loyalty` },
      { id: 'b', label: `Back ${b.name}`, detail: `${b.name} +loyalty, ${a.name} −loyalty` },
      { id: 'heads', label: 'Knock heads together', detail: 'Muscle check: both fall in line, or both resent you' },
    ], { npcId: a.id, racketId: undefined, blockId: b.homeBlockId }); } },
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
  const brainsCheck = () => p.skills.brains * 8 + rng.int(0, 40) > 35;
  const demote = (m: import('./types').Npc) => { const c = m.crew; if (!c) return; if (c.baseCut !== undefined) { c.cut = c.baseCut; c.baseCut = undefined; } c.assignment = undefined; c.status = 'idle'; };
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
    case 'agenda_debt:lend': if (n) { adjustRel(n, { trust: 30, respect: 10 }); if (n.agenda) { n.agenda.progress = 10; n.agenda.milestone50 = false; } n.notes.push('Owes you $1,500.'); log(w, `${n.name} takes the money with both hands. They owe you now.`, 'good', e.refs); } break;
    case 'agenda_debt:buy': if (n && biz) { if (n.rel.trust >= 25 && p.cash >= biz.value * 0.5) { p.cash -= Math.round(biz.value * 0.5); biz.ownedBy = 'player'; p.businessIds.push(biz.id); biz.protection = undefined; n.faction = PLAYER; if (n.agenda) n.agenda.done = true; addInfluence(w, biz.blockId, PLAYER, 12); log(w, `${biz.name} is yours for ${money(Math.round(biz.value * 0.5))}. ${n.name} stays on, grateful.`, 'good', e.refs); } else log(w, `${n.name}: "Half? I'm desperate, not stupid." (needs trust 25 and ${money(Math.round(biz.value * 0.5))})`, 'bad', e.refs); } break;
    case 'agenda_debt:no': if (n) { adjustRel(n, { trust: -15 }); log(w, `${n.name} nods like they expected it.`, 'info', e.refs); } break;
    case 'agenda_leave:buy': if (n && biz) { biz.ownedBy = 'player'; p.businessIds.push(biz.id); biz.protection = undefined; n.faction = PLAYER; addInfluence(w, biz.blockId, PLAYER, 12); log(w, `${biz.name} is yours. ${n.name} shakes your hand and is gone by morning.`, 'good', e.refs); } break;
    case 'agenda_leave:pass': if (n && biz && f && f.alive) { biz.protection = { factionId: f.id, rate: 0.2, since: w.day }; log(w, `${f.short} bought ${biz.name} out from under everyone.`, 'info', e.refs); } break;
    case 'agenda_revenge:take': if (f && f.alive) { const take = 2000 + rng.int(0, 3000); p.dirty += take; f.cash -= take; f.standing[PLAYER] = clamp(f.standing[PLAYER] - 25, -100, 100); f.grudges.push('tipped raid'); addHeat(w, 8); if (n) adjustRel(n, { trust: 10, respect: 15 }); log(w, `Your crew hits ${f.short}'s stash on ${n?.name ?? 'the tip'}'s word: ${money(take)}. They will want to know who talked.`, 'money', e.refs); } break;
    case 'agenda_revenge:pass': break;
    case 'agenda_ambition:take': if (n && !n.crew) { const cut = 30 + Math.round((n.skills.muscle + n.skills.brains + n.skills.charm + n.skills.wheels + n.skills.tech) * 3); n.crew = { loyalty: 70, cut, status: 'idle', statusDays: 0, joinedDay: w.day }; n.role = 'crew'; p.crewIds.push(n.id); for (const bid of n.favouriteBusinessIds) { const b = w.businesses[bid]; if (b) b.patronIds = b.patronIds.filter(id => id !== n.id); } if (n.agenda) n.agenda.done = true; log(w, `${n.name} joins your crew at ${money(cut)}/day, loyal from day one.`, 'good', e.refs); } break;
    case 'agenda_ambition:later': if (n) { adjustRel(n, { trust: -5 }); } break;
    case 'skimming:confront': if (n?.crew) { const r = e.refs.racketId ? w.rackets[e.refs.racketId] : undefined; if (muscleCheck()) { n.crew.loyalty = clamp(n.crew.loyalty + 5); log(w, `${n.name} swears it will not happen again. It probably will not.`, 'good', e.refs); } else { p.crewIds = p.crewIds.filter(id => id !== n.id); if (r && r.runnerId === n.id) r.runnerId = undefined; n.crew = undefined; n.role = 'patron'; n.rel.trust = -40; const lost = Math.round((r?.lastIncome ?? 200) * 3); p.dirty = Math.max(0, p.dirty - lost); log(w, `${n.name} ran with the cash box. ${money(lost)} gone.`, 'bad', e.refs); } } break;
    case 'skimming:slide': if (n?.crew) { n.crew.loyalty = clamp(n.crew.loyalty + 12); const r = e.refs.racketId ? w.rackets[e.refs.racketId] : undefined; p.dirty = Math.max(0, p.dirty - Math.round((r?.lastIncome ?? 200) * 2)); log(w, `${n.name} keeps skimming and starts to like you for it. (+12 loyalty)`, 'info', e.refs); } break;
    case 'skimming:replace': if (n?.crew) { const r = e.refs.racketId ? w.rackets[e.refs.racketId] : undefined; if (r && r.runnerId === n.id) r.runnerId = undefined; n.crew.assignment = undefined; if (n.crew.status === 'assigned') n.crew.status = 'idle'; n.crew.loyalty = clamp(n.crew.loyalty - 10); log(w, `${n.name} is off the racket and sulking. Assign someone else.`, 'warn', e.refs); } break;
    case 'cops_sniffing:pay': { const r = e.refs.racketId ? w.rackets[e.refs.racketId] : undefined; p.heat = clamp(p.heat - 6); if (r) w.blocks[w.businesses[r.businessId].blockId].heat = clamp(w.blocks[w.businesses[r.businessId].blockId].heat - 15); log(w, 'The detective finds somewhere else to sit. (−6 heat)', 'money', e.refs); break; }
    case 'cops_sniffing:move': { const r = e.refs.racketId ? w.rackets[e.refs.racketId] : undefined; if (r) { r.disrupted = Math.max(r.disrupted, 2); const blk = w.blocks[w.businesses[r.businessId].blockId]; blk.heat = clamp(blk.heat - 20); } log(w, 'Lights off for two nights. He gets bored.', 'info', e.refs); break; }
    case 'cops_sniffing:ride': { const r = e.refs.racketId ? w.rackets[e.refs.racketId] : undefined; if (rng.chance(0.5)) log(w, 'He watches, writes nothing down, and leaves.', 'good', e.refs); else if (r) { r.disrupted = 4; const fine = 600 + Math.round(r.lastIncome * 3); p.cash -= fine; if (r.runnerId && w.npcs[r.runnerId].crew) { const c = w.npcs[r.runnerId]; c.crew!.status = 'jailed'; c.crew!.statusDays = p.lawyer ? 4 : 9; c.crew!.assignment = undefined; r.runnerId = undefined; } addHeat(w, 6); log(w, `RAID. ${money(fine)} in fines, the racket dark for 4 days${r.runnerId ? '' : ', your runner in a cell'}.`, 'bad', e.refs); } break; }
    case 'whale:extend': { const r = e.refs.racketId ? w.rackets[e.refs.racketId] : undefined; const stake = 1500 + rng.int(0, 3000); if (rng.chance(0.55)) { const win = Math.round(stake * 1.5); p.dirty += win; log(w, `The house wins. ${money(win)} in the box.`, 'money', e.refs); } else { const b = r ? w.businesses[r.businessId] : undefined; const debtor = b && b.patronIds.length ? w.npcs[rng.pick(b.patronIds)] : undefined; log(w, `He wins, then he vanishes owing ${money(stake)}.${debtor ? ` ${debtor.name} says they know where he drinks.` : ''}`, 'bad', e.refs); p.respect = clamp(p.respect - 2); } break; }
    case 'whale:refuse': log(w, 'He leaves, cursing. The regulars nod: this is a serious house.', 'info', e.refs); break;
    case 'crew_beef:a': case 'crew_beef:b': { const pair = crewPair(w, e); if (!pair) break; const [win, lose] = opt === 'a' ? pair : [pair[1], pair[0]]; if (win.crew) win.crew.loyalty = clamp(win.crew.loyalty + 12); if (lose.crew) lose.crew.loyalty = clamp(lose.crew.loyalty - 12); log(w, `${win.name} walks taller. ${lose.name} does not forget.`, 'info', e.refs); break; }
    case 'crew_beef:heads': { const pair = crewPair(w, e); if (!pair) break; const ok = muscleCheck(); for (const c of pair) if (c.crew) c.crew.loyalty = clamp(c.crew.loyalty + (ok ? 8 : -8)); log(w, ok ? 'Two bruised egos and a quiet crew. (+8 loyalty both)' : 'They both think you picked the other side. (−8 loyalty both)', ok ? 'good' : 'bad', e.refs); break; }
    case 'lt_skim:audit': if (n?.crew) { const skim = n.crew.skim ?? 0; if (brainsCheck()) { const back = Math.round(skim * 0.6); p.dirty += back; n.crew.skim = 0; n.crew.loyalty = clamp(n.crew.loyalty - 10); log(w, `It is ${n.name}. About ${money(skim)} over the last while. You get ${money(back)} back and they know you are watching. (−10 loyalty)`, 'bad', e.refs); } else { n.crew.loyalty = clamp(n.crew.loyalty - 3); log(w, `You cannot make the numbers say anything. ${n.name} watches you try.`, 'info', e.refs); } } break;
    case 'lt_skim:confront': if (n?.crew) { const skim = n.crew.skim ?? 0; if (muscleCheck()) { p.dirty += skim; n.crew.skim = 0; n.crew.loyalty = clamp(n.crew.loyalty - 20); log(w, `${n.name} goes white and brings back ${money(skim)} in a shoebox. (−20 loyalty)`, 'good', e.refs); } else { p.crewIds = p.crewIds.filter(id => id !== n.id); n.crew = undefined; n.role = 'patron'; n.rel.trust = -60; n.grudge = { since: w.day, reason: 'you accused them', spread: 0 }; log(w, `${n.name} laughs, and is gone by morning with ${money(skim)} and the district's book.`, 'bad', e.refs); } } break;
    case 'lt_skim:slide': if (n?.crew) { n.crew.skim = 0; n.crew.loyalty = clamp(n.crew.loyalty + 10); log(w, `You say nothing. ${n.name} starts bringing the full count. (+10 loyalty)`, 'info', e.refs); } break;
    case 'lt_skim:demote': if (n?.crew) { n.crew.skim = 0; demote(n); n.crew.loyalty = clamp(n.crew.loyalty - 15); log(w, `${n.name} hands the book back without a word. (−15 loyalty)`, 'warn', e.refs); } break;
    case 'lt_offer:raise': if (n?.crew) { n.crew.cut = Math.round(n.crew.cut * 1.4); n.crew.baseCut = n.crew.baseCut !== undefined ? Math.round(n.crew.baseCut * 1.4) : n.crew.baseCut; n.crew.loyalty = clamp(n.crew.loyalty + 20); if (f) f.standing[PLAYER] = clamp(f.standing[PLAYER] - 5, -100, 100); log(w, `${n.name} stays, at ${money(n.crew.cut)}/day. ${f?.short ?? 'They'} know they were turned down. (+20 loyalty)`, 'money', e.refs); } break;
    case 'lt_offer:lean': if (n?.crew) { if (muscleCheck()) { n.crew.loyalty = clamp(n.crew.loyalty - 10); adjustRel(n, { fear: 25 }); log(w, `${n.name} gets the message and stays. They will not forget how you said it. (−10 loyalty, +fear)`, 'warn', e.refs); } else if (f) { flipLieutenant(w, n, f); } } break;
    case 'lt_offer:letgo': if (n?.crew && f) { flipLieutenant(w, n, f, true); } break;
    default: break;
  }
  void PRODUCT_INFO; void factionOf;
}

/** The two crew members named in a crew_beef event (first from refs, second from the title). */
function crewPair(w: World, e: GameEvent): [import('./types').Npc, import('./types').Npc] | undefined {
  const a = e.refs.npcId ? w.npcs[e.refs.npcId] : undefined; if (!a) return undefined;
  const other = w.player.crewIds.map(id => w.npcs[id]).find(c => c.id !== a.id && e.title.includes(c.name));
  return other ? [a, other] : undefined;
}
