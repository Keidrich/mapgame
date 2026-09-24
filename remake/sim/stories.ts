/**
 * Stories (`content/stories.ts`): the detective with a file on you, and the heir with a grudge.
 * Each is one record in `World.stories`, moved on a little every night by `tickStories` and at
 * its turning points by a card (`events.ts`, the `det_` and `heir_` templates, schedule-only).
 *
 * The people are real NPCs, so they can be found, met, leaned on and killed like anybody else. The
 * detective is made here, from his own rng stream (so the rest of the city does not move); the
 * heir is somebody already in the outfit.
 */
import { NAME_GROUP_IDS, nickname, personName } from '@r/content/names';
import { DETECTIVE, HEIR } from '@r/content/stories';
import { half } from './clock';
import { fightOdds, soldiersOn } from './fights';
import { skillOf } from './kit';
import { openCase } from './law';
import { cityOfBlock } from './region';
import { kill } from './people';
import { Rng } from './rng';
import type { Id, Npc, World } from './types';
import { PLAYER } from './types';
import { addHeat, clamp, fullName, log, money, nid, theName } from './util';

export type StoryStatus = 'active' | 'bought' | 'gone' | 'dead' | 'partner' | 'broken';
export interface Detective { npcId: Id; cityId: string; file: number; since: number; status: StoryStatus; dirt?: boolean; honest: boolean; done: number[]; boughtUntil?: number }
export interface Heir { npcId: Id; factionId: Id; grudge: number; since: number; status: StoryStatus; nextBeat: number; beats: number }

export const detective = (w: World) => w.stories?.detective;
export const heir = (w: World) => w.stories?.heir;
const stories = (w: World) => (w.stories ??= {});

// -------------------------------------------------------------------------------------- detective
/** A detective of his own: made from his own stream, living in the city you are in. */
function makeDetective(w: World): Detective {
  const rng = new Rng(w.seed ^ 0xde7ec7);
  const city = cityOfBlock(w, w.player.blockId);
  const blocks = Object.values(w.blocks).filter(b => cityOfBlock(w, b.id) === city && b.businessIds.length);
  const b = rng.pick(blocks.length ? blocks : Object.values(w.blocks));
  const pn = personName(rng, rng.pick(NAME_GROUP_IDS));
  const id = nid(w, 'n');
  const honest = rng.chance(DETECTIVE.honest);
  const n: Npc = {
    id, first: pn.first, last: pn.last, nick: rng.chance(0.4) ? nickname(rng) : undefined, pronoun: pn.pronoun, age: rng.int(38, 58), face: rng.int(1, 2 ** 30),
    role: 'patron', homeBlockId: b.id, skills: { muscle: rng.int(4, 7), brains: rng.int(6, 9), charm: rng.int(3, 6), wheels: 5, tech: 4 },
    traits: honest ? ['honest', 'tough'] : ['greedy', 'tough'], nerve: rng.int(65, 90), wealth: 40, rel: { trust: -10, fear: 0, respect: 0, owes: 0 }, memory: [], ties: [], known: true, alive: true,
    nemesis: 'detective',
  };
  w.npcs[id] = n;
  return { npcId: id, cityId: city, file: 10, since: w.day, status: 'active', honest, done: [] };
}

/** The file grows every night he is on you. Returns the threshold crossed tonight, if any. */
function tickDetective(w: World, d: Detective) {
  const n = w.npcs[d.npcId];
  if (!n?.alive) { if (d.status === 'active' || d.status === 'bought') d.status = 'dead'; return; }
  if (d.status === 'bought') {
    if (d.boughtUntil !== undefined && w.day >= d.boughtUntil) w.scheduled.push({ day: w.day + 1, template: 'det_more', npcId: d.npcId });
    return;
  }
  if (d.status !== 'active') return;
  const cases = Object.values(w.cases).filter(c => c.status === 'open' && c.suspectId === PLAYER).length;
  d.file = clamp(d.file + DETECTIVE.perDay + w.player.heat * DETECTIVE.perHeat + cases * DETECTIVE.perCase);
  for (const [at, template] of [[DETECTIVE.watch, 'det_watch'], [DETECTIVE.witness, 'det_witness'], [DETECTIVE.raid, 'det_raid']] as const) {
    if (d.file >= at && !d.done.includes(at)) { d.done.push(at); w.scheduled.push({ day: w.day + 1, template, npcId: d.npcId }); break; }
  }
}

/** The raid: half the dirty money, a racketeering file with him as its witness, and he starts again. */
export function detectiveRaid(w: World) {
  const d = detective(w); if (!d) return;
  const seized = Math.round(w.player.dirty * DETECTIVE.raidSeize);
  w.player.dirty -= seized;
  openCase(w, 'racketeering', PLAYER, d.npcId, `Racketeering: Detective ${w.npcs[d.npcId].last}'s file, a year of it.`, DETECTIVE.raidEvidence);
  d.file = DETECTIVE.afterRaid; d.done = d.done.filter(x => x < DETECTIVE.witness);
  log(w, `Detective ${w.npcs[d.npcId].last} comes through your door with a warrant and a smile. ${money(seized)} goes into evidence bags.`, 'law');
}

export type DetMove = 'dig' | 'blackmail' | 'bribe' | 'lean' | 'transfer' | 'disappear';
export const bribePrice = (d: Detective) => Math.round(DETECTIVE.bribe.base + d.file * DETECTIVE.bribe.perFile);
export const digOdds = (w: World) => clamp(DETECTIVE.dig.base + skillOf(w, PLAYER, 'brains') * DETECTIVE.dig.perBrains, 5, 95);
export function leanOdds(w: World, d: Detective) {
  const n = w.npcs[d.npcId];
  return clamp(Math.round(DETECTIVE.lean.base + skillOf(w, PLAYER, 'muscle') * DETECTIVE.lean.perMuscle + w.player.fear * DETECTIVE.lean.perFear - n.nerve * DETECTIVE.lean.perNerve), 5, 95);
}
const hasCouncillor = (w: World) => Object.values(w.npcs).some(n => n.alive && n.official === 'councillor' && n.payroll);

export function detBlock(w: World, move: DetMove): string | undefined {
  const d = detective(w); if (!d || !w.npcs[d.npcId]?.alive) return 'There is no detective on you.';
  if (d.status !== 'active' && !(d.status === 'bought' && move === 'disappear')) return `Detective ${w.npcs[d.npcId].last} is not a problem right now.`;
  if (cityOfBlock(w, w.player.blockId) !== d.cityId) return 'He works another city.';
  switch (move) {
    case 'dig': return d.dirt ? 'You already have what you need on him.' : half(w) !== 'day' ? 'Records offices keep office hours.' : undefined;
    case 'blackmail': return d.dirt ? undefined : 'You have nothing on him. Dig first.';
    case 'bribe': return w.player.cash < bribePrice(d) ? `A detective wants clean money: ${money(bribePrice(d))}.` : undefined;
    case 'lean': return undefined;
    case 'transfer': return !hasCouncillor(w) ? 'Only somebody at City Hall can move a detective. Put a councillor on your payroll.' : w.player.cash < DETECTIVE.transfer.cost ? `The councillor wants ${money(DETECTIVE.transfer.cost)} clean for the favour.` : undefined;
    case 'disappear': return half(w) !== 'night' ? 'Not in daylight.' : w.player.cash + w.player.dirty < DETECTIVE.disappear.cost ? `It costs ${money(DETECTIVE.disappear.cost)} to have it done properly.` : undefined;
  }
}
export const detAp = (move: DetMove) => DETECTIVE[move].ap;

export function detMove(w: World, rng: Rng, move: DetMove) {
  const d = detective(w)!; const n = w.npcs[d.npcId]; const name = `Detective ${n.last}`;
  switch (move) {
    case 'dig':
      if (rng.float() * 100 < digOdds(w)) { d.dirt = true; log(w, `${name} has a second family in another district, and a first one that does not know. You have the addresses.`, 'good', { npcId: n.id }); }
      else log(w, `A day in the records office and the bars ${name} drinks in. Nothing.`, 'info', { npcId: n.id });
      break;
    case 'blackmail':
      d.file = clamp(d.file - DETECTIVE.blackmail.cut); d.status = 'bought'; d.boughtUntil = undefined;
      log(w, `You show ${name} the photographs. He looks at them a long time, and his file on you gets a great deal thinner.`, 'good', { npcId: n.id });
      break;
    case 'bribe': {
      const price = bribePrice(d);
      if (d.honest) { d.file = clamp(d.file + DETECTIVE.bribe.refused); log(w, `${name} counts the money, hands it back, and writes the amount in his notebook.`, 'law', { npcId: n.id }); break; }
      w.player.cash -= price; d.status = 'bought'; d.boughtUntil = w.day + DETECTIVE.boughtDays;
      log(w, `${name} takes ${money(price)} and remembers he has other cases.`, 'good', { npcId: n.id });
      break;
    }
    case 'lean':
      if (rng.float() * 100 < leanOdds(w, d)) { d.file = clamp(d.file + DETECTIVE.lean.win); n.rel.fear = clamp(n.rel.fear + 15); log(w, `${name} finds you waiting in his kitchen. He is more careful after that.`, 'good', { npcId: n.id }); }
      else { d.file = clamp(d.file + DETECTIVE.lean.lose); addHeat(w, DETECTIVE.lean.heat); log(w, `You lean on ${name}, and he leans back, harder. It goes in the file.`, 'law', { npcId: n.id }); }
      break;
    case 'transfer':
      w.player.cash -= DETECTIVE.transfer.cost; d.status = 'gone';
      log(w, `A word at City Hall, and ${name} is running traffic in the suburbs by Monday.`, 'good', { npcId: n.id });
      break;
    case 'disappear':
      if (!(w.player.dirty >= DETECTIVE.disappear.cost)) { const fromDirty = Math.min(w.player.dirty, DETECTIVE.disappear.cost); w.player.dirty -= fromDirty; w.player.cash -= DETECTIVE.disappear.cost - fromDirty; } else w.player.dirty -= DETECTIVE.disappear.cost;
      kill(w, n.id, 'never came home from work');
      d.status = 'dead';
      addHeat(w, DETECTIVE.disappear.heat);
      openCase(w, 'murder', PLAYER, undefined, `The disappearance of ${name}.`, DETECTIVE.disappear.evidence);
      log(w, `${name} never comes home. Every cop in the city knows whose name was in his notebook.`, 'war', { npcId: n.id });
      break;
  }
}

// ------------------------------------------------------------------------------------------ heir
/** Somebody in the outfit to carry the grudge: a lieutenant first, then a soldier; never the boss. */
function makeHeir(w: World, factionId: Id): Heir | undefined {
  const f = w.factions[factionId];
  const members = Object.values(w.npcs).filter(n => n.alive && n.faction === factionId && n.id !== f.bossId).sort((a, b) => (a.role === 'lieutenant' ? 0 : 1) - (b.role === 'lieutenant' ? 0 : 1) || a.age - b.age);
  const n = members[0]; if (!n) return undefined;
  n.nemesis = 'heir'; n.known = true;
  return { npcId: n.id, factionId, grudge: HEIR.start, since: w.day, status: 'active', nextBeat: w.day + HEIR.beatEvery, beats: 0 };
}
function tickHeir(w: World, h: Heir) {
  const n = w.npcs[h.npcId]; const f = w.factions[h.factionId];
  if (!n?.alive) { if (h.status === 'active') h.status = 'dead'; return; }
  if (!f?.alive) { if (h.status === 'active') { h.status = 'broken'; log(w, `${fullName(n)} has nothing left to inherit.`, 'good'); } return; }
  if (h.status !== 'active') return;
  // the boss is gone: the heir takes the chair, and the grudge comes with them
  if (!w.npcs[f.bossId]?.alive && f.bossId !== n.id) { f.bossId = n.id; n.role = 'boss'; h.grudge = clamp(h.grudge + 20); log(w, `${fullName(n)} takes the chair at ${theName(f)}. The first thing they say is your name.`, 'war', { npcId: n.id }); }
  h.grudge = clamp(h.grudge + HEIR.perDay + (f.standing < -60 ? HEIR.bitter : 0));
  if (h.grudge >= HEIR.boil) { if (!w.scheduled.some(s => s.template === 'heir_showdown') && !w.events.some(e => e.template === 'heir_showdown')) w.scheduled.push({ day: w.day + 1, template: 'heir_showdown', npcId: n.id, factionId: f.id }); return; }
  if (w.day >= h.nextBeat) { h.nextBeat = w.day + HEIR.beatEvery; h.beats++; w.scheduled.push({ day: w.day + 1, template: h.beats % 2 ? 'heir_message' : 'heir_hit', npcId: n.id, factionId: f.id }); }
}
export const meetOdds = (w: World) => clamp(HEIR.meet.base + skillOf(w, PLAYER, 'charm') * HEIR.meet.perCharm, 5, 95);
export type HeirMove = 'gift' | 'meet';
export function heirBlock(w: World, move: HeirMove): string | undefined {
  const h = heir(w); if (!h || h.status !== 'active' || !w.npcs[h.npcId]?.alive) return 'Nobody is carrying a grudge against you by name.';
  if (move === 'gift') return w.player.cash + w.player.dirty < HEIR.gift.cost ? `A proper gift is ${money(HEIR.gift.cost)}.` : undefined;
  return half(w) !== 'night' ? 'A sit-down is a dinner, and dinner is at night.' : undefined;
}
export function heirMove(w: World, rng: Rng, move: HeirMove) {
  const h = heir(w)!; const n = w.npcs[h.npcId];
  if (move === 'gift') {
    const fromDirty = Math.min(w.player.dirty, HEIR.gift.cost); w.player.dirty -= fromDirty; w.player.cash -= HEIR.gift.cost - fromDirty;
    h.grudge = clamp(h.grudge - HEIR.gift.cut);
    log(w, `A case of something old and expensive goes to ${fullName(n)}, with your respects. It is accepted. That is something.`, 'info', { npcId: n.id });
  } else if (rng.float() * 100 < meetOdds(w)) {
    h.grudge = clamp(h.grudge - HEIR.meet.cut);
    log(w, `Dinner with ${fullName(n)}. They came to hate you and left merely disliking you.`, 'good', { npcId: n.id });
  } else {
    h.grudge = clamp(h.grudge + HEIR.meet.worse);
    log(w, `Dinner with ${fullName(n)} ends with a glass thrown and a promise made.`, 'war', { npcId: n.id });
  }
}
/** The odds of facing the heir down: you and your guards against their people. */
export function duelOdds(w: World): number {
  const h = heir(w); if (!h) return 0;
  const f = w.factions[h.factionId]; if (!f) return 0;
  const guards = w.player.crewIds.filter(id => w.npcs[id]?.crew?.assignment?.kind === 'guard' && w.npcs[id].crew!.status === 'ready');
  return fightOdds(w, [PLAYER, ...guards.slice(0, 3)], soldiersOn(w, f));
}
/** How the showdown ends, from the card's choice. */
export function endHeir(w: World, rng: Rng, how: 'partner' | 'duel' | 'kill') {
  const h = heir(w); if (!h) return;
  const n = w.npcs[h.npcId]; const f = w.factions[h.factionId];
  if (how === 'partner') {
    h.status = 'partner';
    if (f) { f.standing = clamp(f.standing + HEIR.partner.standing, -100, 100); f.truceUntil = w.day + HEIR.partner.truce; }
    log(w, `${fullName(n)} shakes your hand in front of both families. Partners, for as long as it pays.`, 'good', { npcId: n.id });
  } else if (how === 'duel') {
    if (rng.float() * 100 < duelOdds(w)) {
      h.status = 'broken'; w.player.respect = clamp(w.player.respect + HEIR.duel.respect, 0, 100);
      if (f) f.standing = clamp(f.standing + 10, -100, 100);
      log(w, `You face ${fullName(n)} down in the street, and they are the one who looks away. It is over, and everybody saw.`, 'good', { npcId: n.id });
    } else {
      h.grudge = HEIR.duel.lostGrudge; w.player.hurtDays = Math.max(w.player.hurtDays ?? 0, 4);
      log(w, `${fullName(n)}'s people are better than yours tonight. You wake up in the doctor's back room.`, 'war', { npcId: n.id });
    }
  } else {
    h.status = 'dead';
    kill(w, n.id, `killed on your word`);
    addHeat(w, HEIR.kill.heat);
    if (f) { f.standing = -100; f.grievances.unshift(`The murder of ${fullName(n)}`); }
    log(w, `${fullName(n)} is found in the river. ${f ? `${theName(f)} will not rest now.` : ''}`, 'war', { npcId: n.id });
  }
}

// ---------------------------------------------------------------------------------------- nightly
export function tickStories(w: World) {
  const s = stories(w);
  if (!s.detective && (w.player.heat >= DETECTIVE.heatTrigger || w.day >= DETECTIVE.dayTrigger)) {
    s.detective = makeDetective(w);
    w.scheduled.push({ day: w.day + 1, template: 'det_intro', npcId: s.detective.npcId });
  }
  if (s.detective) tickDetective(w, s.detective);
  if (!s.heir) {
    const f = Object.values(w.factions).filter(x => x.alive && x.standing <= HEIR.standingTrigger).sort((a, b) => a.standing - b.standing)[0];
    if (f) { const h = makeHeir(w, f.id); if (h) { s.heir = h; w.scheduled.push({ day: w.day + 1, template: 'heir_oath', npcId: h.npcId, factionId: f.id }); } }
  }
  if (s.heir) tickHeir(w, s.heir);
}
