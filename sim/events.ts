/** The event deck. `drawEvents` picks 0–2 cards for tonight; `resolveEventOption` applies a choice. */
import { PRODUCT_INFO, RACKET_DEFS } from '@content/rackets';
import type { Rng } from './rng';
import { PLAYER, type GameEvent, type World } from './types';
import { addHeat, addInfluence, adjustRel, bleedRel, clamp, factionOf, log, money, nid, spreadRep } from './util';
import { doFavour } from './standing';
import { LIEUTENANT } from '@content/rackets';
import { flipLieutenant, lieutenants } from './lieutenants';
import { productionCandidates, resolveProductionEvent } from './production';
import { backCandidate } from './politics';
import { resolveMeeting } from './commission';
import { authorities, postureFor } from './authority';
import { intelCandidates, openIntel, routeHolders } from './intel';
import { openCases } from './cases';
import { cardValue, cyberHeat, dropCard, endTap, learnSecret, liveCards, runCard } from './cyber';
import { CARD_TIERS } from '@content/cyber';
import { equippedItems, isMarket, marketStock } from './items';
import { POLICE_NOTICE, RACKET_WATCHABLE_AFTER, CARD_STALE_AT } from '@content/events';

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

  // ---- what the police could plausibly have noticed ----
  // Police-attention events weight on actual police attention: heat, an Authority that has
  // climbed off `routine`, or an open file. Never on merely existing.
  const watchers = authorities(w);
  const escalated = watchers.filter(a => a.posture !== 'routine');
  const policeInterest = p.heat >= POLICE_NOTICE || escalated.length > 0 || openCases(w).length > 0;
  /** Rackets old enough for somebody to have sat on them for two nights. */
  const watchedRackets = myRackets.filter(r => w.day - r.startedDay >= RACKET_WATCHABLE_AFTER);
  /** An officer who could be the one asking: somebody attached to a building. */
  const namedOfficers = Object.values(w.npcs).filter(x => x.alive && x.official?.authorityId);

  // ---- the systems that had no day-to-day presence at all ----
  const known = Object.values(w.npcs).filter(x => x.alive && x.known && !x.crew);
  const withTies = known.filter(x => (x.connections ?? []).length > 0);
  const wronged = Object.values(w.npcs).filter(x => x.alive && !x.crew && (x.rel.trust <= -35 || x.grudge) && (x.connections ?? []).length > 0);
  const tapped = Object.values(w.npcs).filter(x => x.alive && x.tap);
  const staleCards = liveCards(w).filter(c => c.freshness <= CARD_STALE_AT);
  const carried = equippedItems(w);
  const markets = Object.values(w.businesses).filter(b => isMarket(b));
  const myBlocks = Object.values(w.blocks).filter(b => (b.influence[PLAYER] ?? 0) >= 30);
  const claimed = Object.values(w.blocks).filter(b => b.abandoned?.claimedBy === PLAYER);
  const nearbyCrews = Object.values(w.crews ?? {}).filter(c => {
    const b = w.blocks[c.blockId];
    return b && (b.neighborIds.some(id => (w.blocks[id]?.influence[PLAYER] ?? 0) >= 20) || (b.influence[PLAYER] ?? 0) > 0);
  });
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
    // A detective cannot have been watching a racket that opened this morning, and nobody is
    // watching a player nobody has noticed. This used to weight purely on owning a racket, which
    // put a plainclothes cop outside your first protection job on day one.
    { w: watchedRackets.length && policeInterest ? 3 : 0, make: () => { const r = rng.pick(watchedRackets); const b = w.businesses[r.businessId]; const ask = 400 + Math.round(r.lastIncome * 2); return ev('cops_sniffing', 'A detective is asking around', `A plainclothes cop has been sitting across from ${b.name} two nights running, watching the ${RACKET_DEFS[r.kind].label.toLowerCase()}.`, [
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
    { w: Object.values(w.npcs).some(n => n.role === 'owner' && n.rel.trust >= 40 && w.businesses[Object.values(w.businesses).find(b => b.ownerId === n.id && !b.shut)?.id ?? '']?.ownedBy === 'npc') ? 2 : 0, make: () => { const o = Object.values(w.npcs).find(n => n.role === 'owner' && n.rel.trust >= 40 && Object.values(w.businesses).find(b => b.ownerId === n.id && !b.shut)?.ownedBy === 'npc')!; const b = Object.values(w.businesses).find(b => b.ownerId === o.id && !b.shut)!; const price = Math.round(b.value * 0.75); return ev('offer_sale', `${o.name} wants out`, `"I am tired. ${b.name} is yours for ${money(price)} if you want it. Keep me on and I will run it."`, [
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

    // ================= systems that only existed when the player went looking for them =========
    // Every one of these weights on the state it is about, the way `whale` weights on owning a
    // bookmaking racket. Nothing here fires for a player who has nothing to do with it.

    // ---- the family and friend web ----
    { w: wronged.length ? 3 : 0, make: () => {
      const mark = rng.pick(wronged);
      const tie = rng.pick(mark.connections);
      const rel = w.npcs[tie.npcId]; if (!rel) return undefined;
      const place = rel.favouriteBusinessIds[0] ? w.businesses[rel.favouriteBusinessIds[0]] : undefined;
      return ev('kin_turns_up', `${rel.name} is asking after you`, `${rel.name} is ${mark.name}'s ${tie.kind === 'family' ? 'family' : 'oldest friend'}, and has been standing outside ${place?.name ?? 'a place of yours'} for an hour. Not doing anything. Just standing.`, [
        { id: 'talk', label: 'Go and talk to them', detail: 'Charm check. Settle it, or make it worse', costAp: 1 },
        { id: 'pay', label: 'Send them money', detail: 'Buys quiet from them and their people', costCash: 600 },
        { id: 'lean', label: 'Have somebody move them on', detail: '+fear, and the whole family hears' },
      ], { npcId: rel.id, businessId: place?.id, blockId: rel.homeBlockId });
    } },
    { w: withTies.length >= 2 ? 2 : 0, make: () => {
      const a = rng.pick(withTies);
      const tie = rng.pick(a.connections);
      const b = w.npcs[tie.npcId]; if (!b) return undefined;
      return ev('word_travels', `${b.name} already knows`, `You have never said a word to ${b.name}, but they know your name, what you did on ${w.blocks[a.homeBlockId]?.name ?? 'the block'}, and who you did it to. ${a.name} talks to them most days.`, [
        { id: 'use', label: 'Lean on the reputation', detail: '+fear with them and their people' },
        { id: 'correct', label: 'Set the story straight', detail: 'Charm check: +trust, or they believe the worse version', costAp: 1 },
        { id: 'nothing', label: 'Say nothing', detail: 'Let the story do what it does' },
      ], { npcId: b.id, blockId: b.homeBlockId });
    } },

    // ---- the law, before the posture moves ----
    { w: namedOfficers.length && (p.heat >= POLICE_NOTICE / 2 || escalated.length) ? 3 : 0, make: () => {
      const officer = rng.pick(namedOfficers);
      const a = w.authorities?.[officer.official!.authorityId!];
      const where = myBlocks.length ? rng.pick(myBlocks) : w.blocks[p.currentBlockId];
      return ev('quiet_asking', `Somebody at ${a?.name ?? 'the precinct'} is asking`, `${officer.name} has been on ${where?.name ?? 'your blocks'} twice this week, not in uniform, asking owners questions about you. Nothing official. Not yet.`, [
        { id: 'meet', label: `Sit down with ${officer.name}`, detail: 'Charm check. Slows them, or confirms what they thought', costAp: 1 },
        { id: 'pay', label: 'Put something in their hand', detail: 'Buys attention down; costs real money', costCash: 2000 },
        { id: 'quiet', label: 'Go quiet on those blocks', detail: 'Rackets there earn less for two days; attention cools' },
        { id: 'ignore', label: 'Let them ask', detail: 'They find something, or they do not' },
      ], { npcId: officer.id, blockId: where?.id });
    } },

    // ---- the wire ----
    { w: tapped.length ? 3 : 0, make: () => {
      const mark = rng.pick(tapped);
      return ev('tap_feed', `The tap on ${mark.name} caught something`, `Nothing you went looking for. ${mark.name} spent twenty minutes on a call about money that is moving somewhere it should not be, and said a name twice.`, [
        { id: 'act', label: 'Act on it tonight', detail: 'Money now, and a little wire heat' },
        { id: 'keep', label: 'Sit on it', detail: 'Worth more later, if the tap survives' },
        { id: 'pull', label: 'Take the tap off while you are ahead', detail: 'No more risk from this one' },
      ], { npcId: mark.id, blockId: mark.homeBlockId });
    } },
    { w: staleCards.length ? 3 : 0, make: () => {
      const card = rng.pick(staleCards);
      const worth = cardValue(card, 0.7);
      return ev('card_expiring', 'One of the cards is nearly cold', `The ${CARD_TIERS[card.tier].label} in your pocket is at ${Math.round(card.freshness)} and falling. Tomorrow it is worth noticeably less; in three days it is paper.`, [
        { id: 'burn', label: `Run it hard tonight (${money(worth)})`, detail: 'Most of what is left, and it probably dies' },
        { id: 'quiet', label: 'One small run', detail: 'Less money, it might last another day' },
        { id: 'drop', label: 'Throw it away', detail: 'No money, no exposure' },
      ], {});
    } },

    // ---- kit ----
    { w: markets.length && p.cash > 600 ? 2 : 0, make: () => {
      const shop = rng.pick(markets);
      const stock = marketStock(shop).filter(i => !(p.items ?? []).includes(i.id));
      if (!stock.length) return undefined;
      const item = rng.pick(stock);
      const price = Math.round(item.cost * 0.6);
      return ev('kit_offer', `A one-time price on ${item.label}`, `Somebody at ${shop.name} has a ${item.label.toLowerCase()} they want gone by the weekend. ${money(price)}, which is well under what it is worth, and the offer is tonight only.`, [
        { id: 'buy', label: `Take it (${money(price)})`, detail: 'Yours, at a price you will not see again', costCash: price },
        { id: 'pass', label: 'Pass', detail: 'Nothing gained, nothing spent' },
      ], { businessId: shop.id });
    } },
    { w: carried.length && hostile.length ? 2 : 0, make: () => {
      const item = rng.pick(carried);
      const f = rng.pick(hostile);
      return ev('kit_noticed', 'Somebody noticed what you carry', `Word got to ${f.short} about the ${item.label.toLowerCase()} you have been walking around with. ${w.npcs[f.bossId]?.name ?? 'Their boss'} apparently found it funny. Their soldiers did not.`, [
        { id: 'flaunt', label: 'Let them talk', detail: '+fear, +standing loss with them' },
        { id: 'stash', label: 'Leave it at home a while', detail: 'Unequip it; they lose interest' },
      ], { factionId: f.id });
    } },

    // ---- street crews and ground you have claimed ----
    { w: nearbyCrews.length ? 3 : 0, make: () => {
      const c = rng.pick(nearbyCrews);
      const boss = w.npcs[c.bossId]; if (!boss) return undefined;
      const b = w.blocks[c.blockId];
      return ev('crew_peace', `The ${c.name} want an arrangement`, `${boss.name} sends a kid with a message rather than coming himself. "We are on ${b?.name ?? 'this block'}, you are all round it. We do not want a thing. Say a number."`, [
        { id: 'tribute', label: 'Take a cut and leave them be', detail: 'Small daily income; they stay' },
        { id: 'absorb', label: 'Offer to take them in', detail: 'Charm check: their block becomes yours' },
        { id: 'refuse', label: 'Tell them no', detail: 'They dig in; the block gets harder' },
      ], { npcId: boss.id, blockId: c.blockId });
    } },
    { w: claimed.length ? 2 : 0, make: () => {
      const b = rng.pick(claimed);
      return ev('claim_questions', `Somebody is asking about ${b.name}`, `A man with a clipboard has been walking ${b.name}, taking notes on the building you took. Nobody collects rent on a place that is not on anyone's books, which cuts both ways.`, [
        { id: 'pay', label: 'Make the paperwork go away', detail: 'Costs money; the claim is solid', costCash: 1800 },
        { id: 'scare', label: 'Have a word with him', detail: 'Muscle check: he stops, or he files something' },
        { id: 'abandon', label: 'Walk away from it', detail: 'You lose the block, and the attention with it' },
      ], { blockId: b.id });
    } },

    // ---- what the bank and the depot are worth on an ordinary day ----
    { w: intelCandidates(w).length ? 3 : 0, make: () => {
      const { npc: n, biz, kind } = rng.pick(intelCandidates(w));
      return ev('intel_offer', `${n.name} has had enough of ${biz.name}`, kind === 'skim'
        ? `You have been inside ${n.name}'s affairs, and they work at ${biz.name}. Over a drink it turns out they have thought about moving a little, often, for a long time. They have just never had anyone to move it to.`
        : `${n.name} drives out of ${biz.name} three mornings a week and is very tired of it. They will tell you which morning, which road, and which two men — for a price, and not in writing.`, [
        { id: 'take', label: kind === 'skim' ? 'Set up the skim' : 'Buy the route', detail: kind === 'skim' ? 'A small drip, every day, until somebody notices' : 'The next armoured job goes far better', costCash: kind === 'skim' ? 800 : 1500 },
        { id: 'pass', label: 'Not worth the exposure' },
      ], { npcId: n.id, businessId: biz.id });
    } },
    { w: routeHolders(w).length ? 2 : 0, make: () => {
      const n = rng.pick(routeHolders(w));
      const biz = w.businesses[n.intel!.businessId];
      return ev('route_update', 'The rota moved', `Word from ${n.name}: the schedule out of ${biz?.name ?? 'the depot'} shifts next week. What you have is good until then, and then it is not.`, [
        { id: 'press', label: 'Get the new one now', detail: 'Costs money; the route stays current', costCash: 1200 },
        { id: 'use', label: 'Use what you have while it lasts', detail: 'Nothing spent; the clock keeps running' },
      ], { npcId: n.id, businessId: biz?.id });
    } },

    { w: 1, make: () => { const b = w.blocks[rng.pick(Object.keys(w.blocks))]; const biz = b.businessIds.length ? w.businesses[rng.pick(b.businessIds)] : undefined; if (!biz) return undefined; return ev('opportunity', 'An opening', `${w.npcs[biz.ownerId].name} at ${biz.name} is in debt to the wrong people and is desperate for a partner. A gift now would go a long way.`, [
      { id: 'gift', label: 'Send $800', detail: 'big trust boost', costCash: 800 },
      { id: 'pass', label: 'Pass' },
    ], { npcId: biz.ownerId, businessId: biz.id, blockId: b.id }); } },
  ];
  cands.push(...productionCandidates(w, rng, ev));
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
  if (resolveProductionEvent(w, e, opt, rng)) return;
  if (e.kind === 'commission') { resolveMeeting(w, opt, rng); return; }
  switch (key) {
    // ---- the family and friend web ----
    case 'kin_turns_up:talk': if (n) { if (charmCheck()) { doFavour(w, n, 'heard them out'); adjustRel(w, n, { trust: 20, fear: -5 }); for (const t of n.connections ?? []) { const rel = w.npcs[t.npcId]; if (rel) bleedRel(w, rel, { trust: 6 }); } log(w, `${n.name} says their piece and you let them. They go home, and they tell their people you listened.`, 'good', e.refs); } else { adjustRel(w, n, { trust: -20, fear: 10 }); spreadRep(w, n.homeBlockId, { fear: 3 }); log(w, `It does not go well. ${n.name} leaves angrier than they arrived, and they are not quiet about it.`, 'bad', e.refs); } } break;
    case 'kin_turns_up:pay': if (n) { doFavour(w, n, 'paid what they were owed'); adjustRel(w, n, { trust: 14 }); for (const t of n.connections ?? []) { const rel = w.npcs[t.npcId]; if (rel) bleedRel(w, rel, { trust: 4 }); } log(w, `${n.name} takes it without a word. The standing outside stops.`, 'money', e.refs); } break;
    case 'kin_turns_up:lean': if (n) { adjustRel(w, n, { fear: 25, trust: -30 }, 'violence'); spreadRep(w, n.homeBlockId, { fear: 6, trust: -3 }, 1, 'violence'); for (const t of n.connections ?? []) { const rel = w.npcs[t.npcId]; if (rel) adjustRel(w, rel, { trust: -12, fear: 8 }, 'backed'); } p.fear = clamp(p.fear + 3); log(w, `${n.name} is moved along. Everyone they are related to hears about it by the evening.`, 'warn', e.refs); } break;
    case 'word_travels:use': if (n) { adjustRel(w, n, { fear: 15, trust: -5 }); spreadRep(w, n.homeBlockId, { fear: 4 }); log(w, `You do not correct the story. ${n.name} treats you exactly the way the story says to.`, 'info', e.refs); } break;
    case 'word_travels:correct': if (n) { if (charmCheck()) { adjustRel(w, n, { trust: 18, respect: 8 }); log(w, `${n.name} hears you out and decides the version they had was somebody else's.`, 'good', e.refs); } else { adjustRel(w, n, { trust: -12, fear: 8 }); log(w, `${n.name} nods politely and believes the worse version anyway.`, 'bad', e.refs); } } break;
    case 'word_travels:nothing': log(w, 'The story goes on being told without you in the room.', 'info', e.refs); break;

    // ---- the law, before the posture moves ----
    case 'quiet_asking:meet': if (n) { if (charmCheck()) { adjustRel(w, n, { trust: 12 }); const a = w.authorities?.[n.official?.authorityId ?? '']; if (a) { a.attention = clamp(a.attention - 12, 0, 100); a.posture = postureFor(a.attention); } log(w, `${n.name} has a drink with you and decides you are not the interesting one. (attention −12)`, 'good', e.refs); } else { addHeat(w, 6); const a = w.authorities?.[n.official?.authorityId ?? '']; if (a) { a.attention = clamp(a.attention + 8, 0, 100); a.posture = postureFor(a.attention); } log(w, `${n.name} asks three questions you answer badly. (+6 heat, attention +8)`, 'bad', e.refs); } } break;
    case 'quiet_asking:pay': if (n) { adjustRel(w, n, { trust: 10 }); const a = w.authorities?.[n.official?.authorityId ?? '']; if (a) { a.attention = clamp(a.attention - 20, 0, 100); a.posture = postureFor(a.attention); } log(w, `${n.name} puts it in a pocket without looking at it. They ask their questions somewhere else now. (attention −20)`, 'money', e.refs); } break;
    case 'quiet_asking:quiet': { for (const id of p.racketIds) { const r = w.rackets[id]; if (r && e.refs.blockId && w.businesses[r.businessId]?.blockId === e.refs.blockId) r.disrupted = Math.max(r.disrupted, 2); } p.heat = clamp(p.heat - 8); for (const a of Object.values(w.authorities ?? {})) { a.attention = clamp(a.attention - 6, 0, 100); a.posture = postureFor(a.attention); } log(w, 'Everything on those blocks goes quiet for a couple of days. So does the asking. (−8 heat)', 'info', e.refs); break; }
    case 'quiet_asking:ignore': { if (rng.chance(0.5)) { addHeat(w, 10); for (const a of Object.values(w.authorities ?? {})) { a.attention = clamp(a.attention + 14, 0, 100); a.posture = postureFor(a.attention); } log(w, 'They found somebody who would talk. (+10 heat, and the building is paying attention now)', 'bad', e.refs); } else log(w, 'Nobody tells them anything. The asking stops on its own.', 'good', e.refs); break; }

    // ---- the wire ----
    case 'tap_feed:act': if (n) { const take = 900 + Math.round(p.skills.tech * 140) + rng.int(0, 600); p.dirty += take; cyberHeat(w, 4, n.homeBlockId); log(w, `You get there first. ${money(take)}, and nobody has worked out how you knew.`, 'money', e.refs); } break;
    case 'tap_feed:keep': if (n) { learnSecret(w, n, rng); log(w, `You let it run. Whatever that call was about, you now know enough about ${n.name} to sell it.`, 'good', e.refs); } break;
    case 'tap_feed:pull': if (n) { endTap(w, n, false, rng); } break;
    case 'card_expiring:burn': { const card = liveCards(w).sort((a, b) => a.freshness - b.freshness)[0]; if (card) runCard(w, card, 'big', rng); break; }
    case 'card_expiring:quiet': { const card = liveCards(w).sort((a, b) => a.freshness - b.freshness)[0]; if (card) runCard(w, card, 'small', rng); break; }
    case 'card_expiring:drop': { const card = liveCards(w).sort((a, b) => a.freshness - b.freshness)[0]; if (card) { dropCard(w, card.id); log(w, 'It goes in a drain on the way home. Nothing gained and nothing to find.', 'info', e.refs); } break; }

    // ---- kit ----
    case 'kit_offer:buy': { const shop = biz; const stock = shop ? marketStock(shop).filter(i => !(p.items ?? []).includes(i.id)) : []; const item = stock[0]; if (item) { p.items = [...(p.items ?? []), item.id]; log(w, `The ${item.label.toLowerCase()} is yours, well under what anybody else would pay.`, 'money', e.refs); } break; }
    case 'kit_offer:pass': log(w, 'You leave it. It will be gone by Monday.', 'info', e.refs); break;
    case 'kit_noticed:flaunt': if (f) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 6, -100, 100); p.fear = clamp(p.fear + 5); spreadRep(w, p.currentBlockId, { fear: 5 }); log(w, `You carry it anyway, openly. ${f.short} stop finding it funny.`, 'warn', e.refs); } break;
    case 'kit_noticed:stash': { const item = equippedItems(w)[0]; if (item) { p.equipped = (p.equipped ?? []).filter(id => id !== item.id); log(w, `The ${item.label.toLowerCase()} stays at home for a while. The talk dies down.`, 'info', e.refs); } break; }

    // ---- street crews and claimed ground ----
    case 'crew_peace:tribute': { const c = Object.values(w.crews ?? {}).find(x => x.bossId === e.refs.npcId); if (c) { c.mood = clamp(c.mood + 30); if (n) adjustRel(w, n, { trust: 15 }); if (e.refs.blockId) addInfluence(w, e.refs.blockId, PLAYER, 8); p.dirty += 200; log(w, `${n?.name ?? 'They'} agree a number. Small money, and one less block to worry about.`, 'money', e.refs); } break; }
    case 'crew_peace:absorb': { const c = Object.values(w.crews ?? {}).find(x => x.bossId === e.refs.npcId); if (c && n) { if (charmCheck()) { if (e.refs.blockId) addInfluence(w, e.refs.blockId, PLAYER, 35); c.mood = clamp(c.mood + 50); adjustRel(w, n, { trust: 25, respect: 15 }); log(w, `The ${c.name} work for you now, more or less. ${w.blocks[c.blockId]?.name ?? 'The block'} comes with them.`, 'good', e.refs); } else { c.mood = clamp(c.mood - 30); adjustRel(w, n, { trust: -20 }); log(w, `${n.name} hears the offer as an insult. That block just got harder.`, 'bad', e.refs); } } break; }
    case 'crew_peace:refuse': { const c = Object.values(w.crews ?? {}).find(x => x.bossId === e.refs.npcId); if (c) { c.strength = Math.min(10, c.strength + 1); c.mood = clamp(c.mood - 25); log(w, `The ${c.name} were expecting a number. They dig in instead.`, 'warn', e.refs); } break; }
    case 'claim_questions:pay': if (e.refs.blockId) { const b = w.blocks[e.refs.blockId]; if (b?.abandoned) { addInfluence(w, b.id, PLAYER, 10); log(w, `A file is closed somewhere and ${b.name} stops being interesting. It is properly yours now.`, 'money', e.refs); } } break;
    case 'claim_questions:scare': if (e.refs.blockId) { const b = w.blocks[e.refs.blockId]; if (muscleCheck()) { p.fear = clamp(p.fear + 3); log(w, `The clipboard goes away and does not come back.`, 'good', e.refs); } else { addHeat(w, 8, b?.id); log(w, `He files something. Somebody at the city now has ${b?.name ?? 'that block'} on a list. (+8 heat)`, 'bad', e.refs); } } break;
    case 'claim_questions:abandon': if (e.refs.blockId) { const b = w.blocks[e.refs.blockId]; if (b?.abandoned) { b.abandoned.claimedBy = undefined; delete b.influence[PLAYER]; b.heldSince = undefined; log(w, `You let ${b.name} go. Whoever wants it can have the paperwork too.`, 'info', e.refs); } } break;

    case 'intel_offer:take': if (n) { openIntel(w, n, rng); adjustRel(w, n, { trust: 10 }); } break;
    case 'intel_offer:pass': log(w, 'You let it go. Some money is not worth the person who brings it.', 'info', e.refs); break;
    case 'route_update:press': if (n?.intel) { n.intel.since = w.day; adjustRel(w, n, { trust: 5 }); log(w, `The new rota, before it is the rota. ${n.name} is getting comfortable with this.`, 'money', e.refs); } break;
    case 'route_update:use': log(w, 'You run with what you have. It will keep for a while.', 'info', e.refs); break;
    case 'owner_favour:help': if (n && biz) { doFavour(w, n, 'sorted their problem'); adjustRel(w, n, { trust: 15, respect: 10 }); spreadRep(w, biz.blockId, { respect: 4, trust: 2 }); addInfluence(w, biz.blockId, PLAYER, 5); log(w, `You sort out ${n.name}'s problem. The block notices.`, 'good', e.refs); } break;
    case 'owner_favour:ignore': if (n && biz) { adjustRel(w, n, { trust: -20 }); spreadRep(w, biz.blockId, { respect: -3 }); log(w, `${n.name} stops paying with a smile.`, 'bad', e.refs); } break;
    case 'patron_tip:hit': { const idle = p.crewIds.map(id => w.npcs[id]).find(c => c.crew?.status === 'idle'); if (!idle) { log(w, 'Nobody free to do it. The truck leaves.', 'warn'); break; } if (idle.skills.wheels + idle.skills.muscle + rng.int(0, 10) > 9) { const units = rng.int(6, 14); p.stash.hot_goods += units; addHeat(w, 5, e.refs.blockId); if (n) adjustRel(w, n, { trust: 5, respect: 5 }); log(w, `${idle.name} takes the truck. ${units} crates of hot goods.`, 'good', e.refs); } else { idle.crew!.status = 'injured'; idle.crew!.statusDays = 3; addHeat(w, 8, e.refs.blockId); log(w, `The driver had a gun. ${idle.name} is hurt and the truck is gone.`, 'bad', e.refs); } break; }
    case 'rival_demand:pay': if (f) { f.cash += e.options[0].costCash ?? 0; f.standing[PLAYER] = clamp(f.standing[PLAYER] + 10, -100, 100); log(w, `${f.short} take the money and leave. For now.`, 'money', e.refs); } break;
    case 'rival_demand:refuse': if (f) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 12, -100, 100); p.respect = clamp(p.respect + 2); log(w, `${n?.name ?? 'The lieutenant'} nods slowly. "Your funeral."`, 'warn', e.refs); } break;
    case 'rival_demand:fight': if (f) { if (muscleCheck()) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 20, -100, 100); f.soldiers = Math.max(0, f.soldiers - 1); p.fear = clamp(p.fear + 6); p.respect = clamp(p.respect + 4); if (biz) spreadRep(w, biz.blockId, { fear: 6, respect: 3 }, 1, 'violence'); addHeat(w, 4, biz?.blockId); log(w, `You throw ${n?.name} through the front window. The block is impressed and ${f.short} are furious.`, 'good', e.refs); } else { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 15, -100, 100); const c = p.crewIds.map(id => w.npcs[id]).find(c => c.crew?.status === 'idle' || c.crew?.status === 'assigned'); if (c) { c.crew!.status = 'injured'; c.crew!.statusDays = 4; c.crew!.assignment = undefined; } addHeat(w, 6, biz?.blockId); log(w, `It goes badly. ${c ? `${c.name} is hurt.` : ''} They take the cash box anyway.`, 'bad', e.refs); p.dirty = Math.max(0, p.dirty - 500); } } break;
    case 'crew_raise:give': if (n?.crew) { n.crew.cut = Math.round(n.crew.cut * 1.4); n.crew.loyalty = clamp(n.crew.loyalty + 15); log(w, `${n.name} gets the raise.`, 'info', e.refs); } break;
    case 'crew_raise:promise': if (n?.crew) { if (charmCheck()) { n.crew.loyalty = clamp(n.crew.loyalty + 5); log(w, `${n.name} buys it. For now.`, 'info', e.refs); } else { n.crew.loyalty = clamp(n.crew.loyalty - 15); log(w, `${n.name} has heard that before. (−15 loyalty)`, 'bad', e.refs); } } break;
    case 'crew_raise:refuse': if (n?.crew) { n.crew.loyalty = clamp(n.crew.loyalty - 12); log(w, `${n.name} says nothing. (−12 loyalty)`, 'warn', e.refs); } break;
    case 'cop_taste:pay': p.heat = clamp(p.heat - 12); log(w, 'The sergeant is suddenly very busy elsewhere. (−12 heat)', 'money', e.refs); break;
    case 'cop_taste:refuse': addHeat(w, 8); log(w, 'The sergeant makes a note. (+8 heat)', 'bad', e.refs); break;
    case 'betrayal:cut': if (n?.crew) { p.crewIds = p.crewIds.filter(id => id !== n.id); n.crew = undefined; n.role = 'patron'; n.rel.trust = -60; addHeat(w, 6); log(w, `${n.name} is out. They know things. (+6 heat)`, 'warn', e.refs); } break;
    case 'betrayal:hunt': if (n?.crew) { p.crewIds = p.crewIds.filter(id => id !== n.id); if (muscleCheck()) { n.alive = false; n.crew.status = 'dead'; p.fear = clamp(p.fear + 8); addHeat(w, 8); for (const c of p.crewIds.map(id => w.npcs[id])) if (c.crew) c.crew.loyalty = clamp(c.crew.loyalty + 5); log(w, `${n.name} is not talking to anyone any more. Your crew got the message. (+8 heat)`, 'warn', e.refs); } else { n.crew = undefined; n.role = 'patron'; n.rel.trust = -90; addHeat(w, 15); log(w, `${n.name} got away and went straight to the precinct. (+15 heat)`, 'bad', e.refs); } } break;
    case 'betrayal:buy': if (n?.crew) { n.crew.loyalty = clamp(n.crew.loyalty + 30); log(w, `${n.name} takes the envelope and shuts up.`, 'money', e.refs); } break;
    case 'debtor:break': if (n) { adjustRel(w, n, { fear: 40, trust: -40 }, 'violence'); spreadRep(w, n.homeBlockId, { fear: 8 }, 2, 'violence'); addHeat(w, 6, n.homeBlockId); p.fear = clamp(p.fear + 4); log(w, `${n.name} will walk with a limp. The block is quieter now. (+8 fear nearby)`, 'warn', e.refs); } break;
    case 'debtor:week': if (n) { doFavour(w, n, 'gave them a week'); adjustRel(w, n, { trust: 15, respect: 5 }); if (rng.chance(0.5)) { const r = e.refs.racketId ? w.rackets[e.refs.racketId] : undefined; const owed = Math.round((r?.float ?? 1000) * 0.2); p.dirty += owed; log(w, `${n.name} pays up a week later, with thanks. (+${money(owed)})`, 'money', e.refs); } else log(w, `${n.name} is grateful. The money never shows.`, 'info', e.refs); } break;
    case 'debtor:work': if (n && !n.crew) { n.crew = { loyalty: 35, cut: 0, status: 'idle', statusDays: 0, joinedDay: w.day }; n.role = 'crew'; p.crewIds.push(n.id); for (const bid of n.favouriteBusinessIds) w.businesses[bid].patronIds = w.businesses[bid].patronIds.filter(id => id !== n.id); log(w, `${n.name} works for you now. Free labour, low loyalty.`, 'info', e.refs); } break;
    case 'offer_sale:buy': if (n && biz) { biz.ownedBy = 'player'; p.businessIds.push(biz.id); if (biz.protection && biz.protection.factionId !== PLAYER) { w.factions[biz.protection.factionId].standing[PLAYER] -= 8; } biz.protection = undefined; n.faction = PLAYER; adjustRel(w, n, { trust: 10 }); addInfluence(w, biz.blockId, PLAYER, 12); log(w, `${biz.name} is yours.`, 'good', e.refs); } break;
    case 'defect:match': if (n && biz?.protection) { biz.protection.rate = 0.1; adjustRel(w, n, { trust: 10 }); log(w, `${n.name} stays at 10%.`, 'info', e.refs); } break;
    case 'defect:threaten': if (n) { adjustRel(w, n, { fear: 20, trust: -15 }, 'backed'); log(w, `${n.name} goes pale and keeps paying.`, 'warn', e.refs); } break;
    case 'defect:release': if (n && biz && f) { const rid = biz.racketIds.find(id => w.rackets[id].kind === 'protection' && w.rackets[id].owner === PLAYER); if (rid) { biz.racketIds = biz.racketIds.filter(id => id !== rid); p.racketIds = p.racketIds.filter(id => id !== rid); delete w.rackets[rid]; } biz.protection = { factionId: f.id, rate: 0.1, since: w.day }; n.faction = f.id; f.standing[PLAYER] = clamp(f.standing[PLAYER] + 5, -100, 100); addInfluence(w, biz.blockId, PLAYER, -8); log(w, `${f.short} take over ${biz.name}.`, 'info', e.refs); } break;
    case 'reporter:bribe': p.heat = clamp(p.heat - 15); log(w, 'The story runs about somebody else. (−15 heat)', 'money'); break;
    case 'reporter:scare': if (muscleCheck()) { p.heat = clamp(p.heat - 8); p.fear = clamp(p.fear + 3); log(w, 'The reporter takes a job in another city. (−8 heat)', 'warn'); } else { addHeat(w, 15); log(w, 'The reporter wrote about the threat. Front page. (+15 heat)', 'bad'); } break;
    case 'reporter:ignore': addHeat(w, 10); log(w, 'The story runs. (+10 heat)', 'bad'); break;
    case 'invite:go': if (f) { f.standing[PLAYER] = clamp(f.standing[PLAYER] + 18, -100, 100); if (f.temperament === 'greedy' && p.cash > 1000) { const ask = Math.min(p.cash, 1000); p.cash -= ask; f.cash += ask; log(w, `${w.npcs[f.bossId].name} hears you out. Peace, for ${money(ask)} "for the trouble".`, 'info', e.refs); } else log(w, `${w.npcs[f.bossId].name} hears you out. Things cool down.`, 'good', e.refs); if (f.stance[PLAYER] === 'tension' && f.standing[PLAYER] >= -15) f.stance[PLAYER] = 'peace'; } break;
    case 'invite:ignore': if (f) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 15, -100, 100); log(w, `${f.name} take the silence as an answer.`, 'warn', e.refs); } break;
    case 'opportunity:gift': if (n) { adjustRel(w, n, { trust: 35, respect: 10 }); log(w, `${n.name} will not forget this.`, 'good', e.refs); } break;
    case 'agenda_debt:lend': if (n) { doFavour(w, n, 'covered their debt'); adjustRel(w, n, { trust: 30, respect: 10 }); if (n.agenda) { n.agenda.progress = 10; n.agenda.milestone50 = false; } n.notes.push('Owes you $1,500.'); log(w, `${n.name} takes the money with both hands. They owe you now.`, 'good', e.refs); } break;
    case 'agenda_debt:buy': if (n && biz) { if (n.rel.trust >= 25 && p.cash >= biz.value * 0.5) { p.cash -= Math.round(biz.value * 0.5); biz.ownedBy = 'player'; p.businessIds.push(biz.id); biz.protection = undefined; n.faction = PLAYER; if (n.agenda) n.agenda.done = true; addInfluence(w, biz.blockId, PLAYER, 12); log(w, `${biz.name} is yours for ${money(Math.round(biz.value * 0.5))}. ${n.name} stays on, grateful.`, 'good', e.refs); } else log(w, `${n.name}: "Half? I'm desperate, not stupid." (needs trust 25 and ${money(Math.round(biz.value * 0.5))})`, 'bad', e.refs); } break;
    case 'agenda_debt:no': if (n) { adjustRel(w, n, { trust: -15 }); log(w, `${n.name} nods like they expected it.`, 'info', e.refs); } break;
    case 'agenda_leave:buy': if (n && biz) { biz.ownedBy = 'player'; p.businessIds.push(biz.id); biz.protection = undefined; n.faction = PLAYER; addInfluence(w, biz.blockId, PLAYER, 12); log(w, `${biz.name} is yours. ${n.name} shakes your hand and is gone by morning.`, 'good', e.refs); } break;
    case 'agenda_leave:pass': if (n && biz && f && f.alive) { biz.protection = { factionId: f.id, rate: 0.2, since: w.day }; log(w, `${f.short} bought ${biz.name} out from under everyone.`, 'info', e.refs); } break;
    case 'agenda_revenge:take': if (f && f.alive) { const take = 2000 + rng.int(0, 3000); p.dirty += take; f.cash -= take; f.standing[PLAYER] = clamp(f.standing[PLAYER] - 25, -100, 100); f.grudges.push('tipped raid'); addHeat(w, 8); if (n) adjustRel(w, n, { trust: 10, respect: 15 }); log(w, `Your crew hits ${f.short}'s stash on ${n?.name ?? 'the tip'}'s word: ${money(take)}. They will want to know who talked.`, 'money', e.refs); } break;
    case 'agenda_revenge:pass': break;
    case 'agenda_ambition:take': if (n && !n.crew) { const cut = 30 + Math.round((n.skills.muscle + n.skills.brains + n.skills.charm + n.skills.wheels + n.skills.tech) * 3); n.crew = { loyalty: 70, cut, status: 'idle', statusDays: 0, joinedDay: w.day }; n.role = 'crew'; p.crewIds.push(n.id); for (const bid of n.favouriteBusinessIds) { const b = w.businesses[bid]; if (b) b.patronIds = b.patronIds.filter(id => id !== n.id); } if (n.agenda) n.agenda.done = true; log(w, `${n.name} joins your crew at ${money(cut)}/day, loyal from day one.`, 'good', e.refs); } break;
    case 'agenda_ambition:later': if (n) { adjustRel(w, n, { trust: -5 }); } break;
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
    case 'lt_offer:lean': if (n?.crew) { if (muscleCheck()) { n.crew.loyalty = clamp(n.crew.loyalty - 10); adjustRel(w, n, { fear: 25 }, 'backed'); log(w, `${n.name} gets the message and stays. They will not forget how you said it. (−10 loyalty, +fear)`, 'warn', e.refs); } else if (f) { flipLieutenant(w, n, f); } } break;
    case 'succession:a': case 'succession:b': { if (f?.crisis) { const id = f.crisis.candidateIds[opt === 'a' ? 0 : 1]; if (id) backCandidate(w, f, id, 1500); } break; }
    case 'succession:out': log(w, 'You keep your money and your name out of it.', 'info', e.refs); break;
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
