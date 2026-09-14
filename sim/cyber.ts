/**
 * The wire: stolen cards, taps on people, dirt worth selling, and the tech way out of heat.
 *
 * All of it is the same machinery the rest of the game runs on. A card is a tier, a balance
 * and a freshness clock that decays daily the way heat cools. Running one is a roll against
 * two thresholds. A tap is a risk that compounds per day, shaped like `holdRisk` in
 * hostages.ts — except its inputs are the *person* (how closely they watch their own affairs,
 * who checks things for them) rather than the ground they are standing on.
 *
 * There is no technique described here, in the content file, or in the UI. The fiction is a
 * skin over dice; the dice are the point.
 */
import { CARD, CARD_TIERS, DIRT, HACK, SCRUB, TAP } from '@content/cyber';
import { openCase } from './cases';
import { connectionsOf, familyOf } from './connections';
import { kitSkillBoost } from './items';
import type { Rng } from './rng';
import { PLAYER, type Card, type CardTier, type FactionId, type Id, type Npc, type Secret, type World } from './types';
import { addHeat, adjustRel, clamp, log, money, nid } from './util';
import { remember } from './ledger';

// ---------------------------------------------------------------- cards
export function cards(w: World): Card[] { return w.player.cards ?? []; }
export function liveCards(w: World): Card[] { return cards(w).filter(c => c.freshness > 0 && c.limit > 0); }
export function cardById(w: World, id: Id): Card | undefined { return cards(w).find(c => c.id === id); }

/** What a card is worth to you right now: the balance, discounted by how stale it has gone. */
export function cardValue(c: Card, cut: number): number {
  return Math.max(0, Math.round(c.limit * cut * (0.35 + (c.freshness / 100) * 0.65)));
}
/** The two ways a run can end badly, both worse on a big score and on a card already watched. */
export function runOdds(w: World, c: Card, mode: 'small' | 'big'): { take: number; dead: number; flag: number } {
  const tech = w.player.skills.tech + (kitSkillBoost(w).tech ?? 0);
  const skill = Math.max(0.45, 1 - tech * 0.045);     // a careful operator trips fewer wires
  const stale = 1 + (100 - c.freshness) / 90;
  const watched = c.flagged ? 1.8 : 1;
  const cut = mode === 'big' ? CARD.bigCut : CARD.smallCut;
  return {
    take: cardValue(c, cut),
    dead: Math.min(0.95, (mode === 'big' ? CARD.bigDead : CARD.smallDead) * stale * watched * (0.6 + skill * 0.4)),
    flag: Math.min(0.9, (mode === 'big' ? CARD.bigFlag : CARD.smallFlag) * stale * watched * skill),
  };
}

/** A pocket sometimes has one in it. Tier is weighted: black cards are rare. */
export function rollCard(w: World, rng: Rng, fromNpcId?: Id): Card {
  const tier = rng.weighted((Object.keys(CARD_TIERS) as CardTier[]).map(t => ({ item: t, w: CARD_TIERS[t].weight })));
  const def = CARD_TIERS[tier];
  return { id: nid(w, 'cc'), tier, limit: rng.int(def.limit[0], def.limit[1]), freshness: rng.int(70, 100), takenDay: w.day, fromNpcId };
}
export function addCard(w: World, c: Card) { w.player.cards = [...cards(w), c]; }
export function dropCard(w: World, id: Id) { w.player.cards = cards(w).filter(c => c.id !== id); }

/** Heat off the wire is tracked separately, because scrubbing is the only thing that can clear it. */
export function cyberHeat(w: World, amount: number, blockId?: Id) {
  w.player.cyberHeat = clamp((w.player.cyberHeat ?? 0) + amount, 0, 100);
  addHeat(w, amount, blockId);
}

/** Run one. `small` is a slice nobody chases; `big` is most of what is left, once. */
export function runCard(w: World, c: Card, mode: 'small' | 'big', rng: Rng): { took: number; dead: boolean; flagged: boolean } {
  const odds = runOdds(w, c, mode);
  const took = odds.take;
  w.player.dirty += took;
  c.limit = Math.max(0, c.limit - Math.round(c.limit * (mode === 'big' ? CARD.bigCut : CARD.smallCut)));
  c.freshness = clamp(c.freshness - CARD.runWear, 0, 100);
  cyberHeat(w, CARD_TIERS[c.tier].heat, undefined);

  const flagged = rng.chance(odds.flag);
  const dead = rng.chance(odds.dead) || c.limit <= 0;
  if (flagged) {
    // a card already being watched, run again, is how a file gets opened
    if (c.flagged && rng.chance(CARD.caseChance)) {
      openCase(w, 'heist', `${CARD_TIERS[c.tier].label} run through half the district`, { npcId: c.fromNpcId }, [], rng);
    }
    c.flagged = true;
  }
  if (dead) { dropCard(w, c.id); }
  log(w, `${mode === 'big' ? 'One big run' : 'A quiet little run'} on the ${CARD_TIERS[c.tier].label}: ${money(took)}.${dead ? ' It died on the last swipe.' : flagged ? ' Somebody is looking at it now.' : ''}`, dead || flagged ? 'warn' : 'money');
  return { took, dead, flagged };
}

/** What a carding racket pays for the pile: less, guaranteed, and nobody ever traces it to you. */
export function dumpValue(w: World): number {
  return liveCards(w).reduce((sum, c) => sum + cardValue(c, CARD.dumpRate), 0);
}
export function dumpCards(w: World): number {
  const paid = dumpValue(w);
  const n = liveCards(w).length;
  w.player.cards = cards(w).filter(c => !(c.freshness > 0 && c.limit > 0));  // the dead ones were already worthless
  w.player.dirty += paid;
  log(w, `${n} card${n === 1 ? '' : 's'} gone wholesale for ${money(paid)}. No receipts, no exposure, no arguments.`, 'money');
  return paid;
}

// ---------------------------------------------------------------- taps
export function tapped(w: World): Npc[] { return Object.values(w.npcs).filter(n => n.tap && n.alive); }
export function daysTapped(w: World, n: Npc): number { return n.tap ? w.day - n.tap.since : 0; }

/**
 * The chance a tap is found today. Shaped like a hostage's risk — a base, compounding with
 * time — but the inputs are the person on the other end, not the block: how closely they read
 * their own affairs, and whether somebody checks things for them.
 */
export function tapRisk(w: World, n: Npc): number {
  if (!n.tap) return 0;
  const time = 1 + daysTapped(w, n) * TAP.dayRisk;
  const savvy = 1 + n.skills.tech * TAP.techK;
  const watched = (n.traits.includes('connected') ? TAP.connected : 1) * (n.traits.includes('quiet') ? TAP.quiet : 1);
  return Math.max(0, TAP.baseRisk * time * savvy * watched);
}

/** Start listening. */
export function startTap(w: World, n: Npc) { n.tap = { since: w.day }; n.ratted = w.day; remember(w, n, 'intel', 'You started listening to them.'); }

/** Pull the tap, however it ended. */
export function endTap(w: World, n: Npc, found: boolean, rng: Rng) {
  n.tap = undefined;
  if (!found) { log(w, `You take the tap off ${n.name} before anybody trips over it.`, 'info', { npcId: n.id }); return; }
  adjustRel(w, n, { trust: TAP.trustHit, fear: 5 }, 'backed');
  n.notes.push('Found out somebody was listening.');
  log(w, `${n.name} found the tap. Whatever you had with them is gone, and they are telling people.`, 'bad', { npcId: n.id });
  if (rng.chance(TAP.caseChance)) openCase(w, 'frame', `Interference with ${n.name}'s business`, { npcId: n.id, blockId: n.homeBlockId }, [], rng);
}

/** One day of every live tap: what it heard, and whether it was found. */
export function tickTaps(w: World, rng: Rng) {
  for (const n of tapped(w)) {
    if (rng.chance(tapRisk(w, n))) { endTap(w, n, true, rng); continue; }
    if (!rng.chance(TAP.feedChance)) continue;
    const line = feed(w, n, rng);
    if (line) log(w, `Off the tap on ${n.name}: ${line}`, 'info', { npcId: n.id });
  }
}

/** What a day of listening is worth hearing. Live, ordinary detail about their business. */
function feed(w: World, n: Npc, rng: Rng): string | undefined {
  const bits: string[] = [];
  if (n.agenda && !n.agenda.done) bits.push(`they are ${Math.round(n.agenda.progress)}% of the way through whatever they are chasing — ${AGENDA_WORDS[n.agenda.kind]}`);
  const fam = familyOf(w, n)[0];
  if (fam) bits.push(`${fam.name} came up again; they talk most days`);
  const block = w.blocks[n.homeBlockId];
  if (block) bits.push(`they have been on ${block.name} every day this week`);
  if (n.recipe) bits.push('they know how to make something, and they are careful who hears about it');
  if (n.faction && w.factions[n.faction]) bits.push(`${w.factions[n.faction].short} called twice`);
  return bits.length ? rng.pick(bits) : undefined;
}
const AGENDA_WORDS: Record<string, string> = {
  debt: 'money they owe', leave: 'getting out', revenge: 'getting even', ambition: 'moving up', family: 'keeping somebody safe',
};

// ---------------------------------------------------------------- secrets
export function secrets(w: World): Secret[] { return w.player.secrets ?? []; }
export function secretsAbout(w: World, npcId: Id): Secret[] { return secrets(w).filter(s => s.npcId === npcId); }
export function unsoldSecrets(w: World): Secret[] { return secrets(w).filter(s => !s.soldTo); }

/** What one good look turns up: whatever they are sitting on, or who they really answer to. */
export function learnSecret(w: World, n: Npc, rng: Rng): Secret | undefined {
  const options: Omit<Secret, 'id' | 'day'>[] = [];
  if (n.agenda && !n.agenda.done) options.push({ npcId: n.id, kind: 'agenda', text: `${n.name} is ${AGENDA_WORDS[n.agenda.kind]} — ${Math.round(n.agenda.progress)}% of the way there, and nobody around them knows.` });
  const ties = connectionsOf(w, n);
  if (ties.length) { const t = rng.pick(ties); options.push({ npcId: n.id, kind: 'connection', text: `${n.name} and ${t.npc.name} are ${t.label}. Nothing in either of their names says so.` }); }
  if (n.recipe) options.push({ npcId: n.id, kind: 'agenda', text: `${n.name} knows a trade worth money and has told nobody who could use it.` });
  if (!options.length) return undefined;
  const pick = rng.pick(options);
  const s: Secret = { ...pick, id: nid(w, 'sc'), day: w.day };
  w.player.secrets = [...secrets(w), s];
  n.ratted = w.day;
  return s;
}

/** What a rival will pay for it: who it is about, and how badly they want that person's people hurt. */
export function dirtPrice(w: World, s: Secret, factionId: FactionId): number {
  const n = w.npcs[s.npcId];
  const buyer = w.factions[factionId];
  if (!n || !buyer) return 0;
  const theirs = n.faction ? w.factions[n.faction] : undefined;
  const rank = theirs?.bossId === n.id ? DIRT.bossMult : theirs?.lieutenantIds.includes(n.id) ? DIRT.lieutenantMult : 1;
  // a rival pays more for dirt on somebody they are already against
  const rivalry = theirs && theirs.id !== buyer.id
    ? (buyer.stance[theirs.id] === 'war' ? 2 : buyer.stance[theirs.id] === 'beef' ? 1.5 : 1)
    : 0.8;
  const charm = 0.85 + w.player.skills.charm / 30;
  return Math.max(200, Math.round(DIRT.base * rank * rivalry * charm));
}

/** Sell it. The buyer thinks better of you; sometimes the subject's people hear where it came from. */
export function sellDirt(w: World, s: Secret, factionId: FactionId, rng: Rng): number {
  const paid = dirtPrice(w, s, factionId);
  const buyer = w.factions[factionId];
  const n = w.npcs[s.npcId];
  s.soldTo = factionId;
  w.player.dirty += paid;
  if (buyer) buyer.standing[PLAYER] = clamp((buyer.standing[PLAYER] ?? 0) + DIRT.standingGain, -100, 100);
  log(w, `${buyer?.short ?? 'They'} paid ${money(paid)} for what you know about ${n?.name ?? 'somebody'}. They did not ask how you came by it.`, 'money', { factionId, npcId: s.npcId });
  const theirs = n?.faction ? w.factions[n.faction] : undefined;
  if (theirs && theirs.id !== factionId && rng.chance(DIRT.blowback)) {
    theirs.standing[PLAYER] = clamp(theirs.standing[PLAYER] + DIRT.blowbackStanding, -100, 100);
    theirs.grudges.push(`sold_dirt:${s.npcId}`);
    log(w, `${theirs.short} worked out who sold it. That will be remembered.`, 'bad', { factionId: theirs.id });
  }
  if (n) adjustRel(w, n, { trust: -15 });
  return paid;
}

// ---------------------------------------------------------------- scrubbing
/** How much wire-heat one pass can shift, and what it costs. Tech and brains buy both. */
export function scrubPower(w: World): { points: number; cost: number } {
  const tech = w.player.skills.tech + (kitSkillBoost(w).tech ?? 0);
  const brains = w.player.skills.brains + (kitSkillBoost(w).brains ?? 0);
  const k = 1 + (tech + brains) * SCRUB.skillK;
  const points = Math.min(Math.round(SCRUB.basePoints * k), Math.round(w.player.cyberHeat ?? 0));
  return { points: Math.max(0, points), cost: Math.max(0, Math.round(points * SCRUB.costPerPoint / k)) };
}
export function scrubTrail(w: World): number {
  const { points } = scrubPower(w);
  w.player.cyberHeat = clamp((w.player.cyberHeat ?? 0) - points, 0, 100);
  w.player.heat = clamp(w.player.heat - points);
  log(w, `Paper goes in a furnace, a name comes off two lists, and a man who files things is looked after. Heat −${points}.`, 'good');
  return points;
}

// ---------------------------------------------------------------- the wire crew
/** Crew on the wire work the pile themselves, once there is a pile worth working. */
export function tickHackCrew(w: World, rng: Rng) {
  const hands = w.player.crewIds.map(id => w.npcs[id]).filter(n => n?.crew?.assignment?.kind === 'hack' && n.crew.status === 'assigned');
  if (!hands.length) return;
  for (const n of hands) {
    const live = liveCards(w);
    if (live.length < HACK.minCards) continue;   // not worth a day of anybody's time
    const runs = Math.max(1, Math.round(HACK.perDay * (0.4 + n.skills[HACK.skill] / 10)));
    let took = 0;
    for (let i = 0; i < runs; i++) {
      const pool = liveCards(w); if (!pool.length) break;
      const card = pool.sort((a, b) => b.freshness - a.freshness)[0];   // freshest first, like anyone would
      const before = w.player.dirty;
      runCard(w, card, 'small', rng);
      took += w.player.dirty - before;
    }
    // their cut comes off the top: this is their day's work, not yours
    const keep = Math.round(took * HACK.rate);
    w.player.dirty -= took - keep;
    cyberHeat(w, HACK.heat);
    if (took) log(w, `${n.name} worked the cards all day: ${money(keep)} in, and nothing in your handwriting.`, 'money', { npcId: n.id });
  }
}

/** Freshness falls every day, whoever is holding it. */
export function tickCards(w: World) {
  for (const c of cards(w)) c.freshness = clamp(c.freshness - CARD.decayPerDay, 0, 100);
  const dead = cards(w).filter(c => c.freshness <= 0 || c.limit <= 0);
  if (dead.length) {
    w.player.cards = cards(w).filter(c => c.freshness > 0 && c.limit > 0);
    log(w, `${dead.length} card${dead.length === 1 ? '' : 's'} went cold in your pocket. They stop working long before anybody tells you.`, 'info');
  }
}
