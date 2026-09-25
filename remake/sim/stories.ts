/**
 * Stories (`content/stories.ts`): people whose business is you, for weeks at a time.
 *
 * Nothing here is written in. Each game's seed decides which kinds of story are on the table at all,
 * and where each one's trigger sits; the world decides the rest — a story begins only when what you
 * did sets it off (your heat, your fame, an outfit that hates you, somebody you had killed, somebody
 * you let go). No more than two run at once. Each is an `Arc` in `World.stories.arcs`: a person, a
 * meter that moves every night, cards at its turning points (`events.ts`), and moves you can make
 * against it from its panel. When one ends, another of its kind may come later, or may not.
 *
 * Every chance that decides whether a story exists comes from a hash of the seed, never the world's
 * rng: looking at the city does not change which stories it will have.
 */
import { NAME_GROUP_IDS, nickname, personName } from '@r/content/names';
import { ARCS, AVENGER, DETECTIVE, FRIEND, HEIR, MAX_ACTIVE, REPORTER, REST, TURNCOAT, type ArcKind } from '@r/content/stories';
import { half } from './clock';
import { fightOdds, soldiersOn } from './fights';
import { skillOf } from './kit';
import { openCase } from './law';
import { cityOfBlock } from './region';
import { kill } from './people';
import { hash01, Rng } from './rng';
import type { Id, Npc, World } from './types';
import { PLAYER } from './types';
import { addHeat, cap, clamp, fullName, log, money, nid, spend, their, them, they, theName, vb } from './util';

export type StoryStatus = 'active' | 'bought' | 'gone' | 'dead' | 'partner' | 'broken' | 'published' | 'forgiven' | 'cowed' | 'told' | 'paid' | 'spent' | 'conned' | 'walked';
export interface Arc {
  id: Id; kind: ArcKind; npcId: Id; since: number; status: StoryStatus;
  /** 0..100: the file, the story, the grudge, the hate, what they have told, the plan. */
  meter: number;
  /** Thresholds already acted on. */
  done: number[];
  ended?: number;
  factionId?: Id; cityId?: string;
  /** The detective's own: dirt on them, honest or not, bought until. */
  dirt?: boolean; honest?: boolean; boughtUntil?: number;
  /** The heir's weekly beat; the reporter's pieces run; the avenger's attempts; the case a turncoat feeds. */
  nextBeat?: number; beats?: number; caseId?: Id;
  /** The old friend's: whether it was a con all along (the seed's call). */
  con?: boolean;
}

const arcs = (w: World): Arc[] => ((w.stories ??= { arcs: [] }).arcs ??= []);
export const allArcs = (w: World) => arcs(w);
export const activeArcs = (w: World) => arcs(w).filter(a => a.status === 'active' || a.status === 'bought');
/** The live story of a kind, if there is one (a detective who is bought is still live: the arrangement can end). */
export const arcOf = (w: World, kind: ArcKind) => activeArcs(w).find(a => a.kind === kind);
export const detective = (w: World) => arcOf(w, 'detective');
export const heir = (w: World) => arcOf(w, 'heir');
const byId = (w: World, id: Id) => arcs(w).find(a => a.id === id);
const count = (w: World, kind: ArcKind) => arcs(w).filter(a => a.kind === kind).length;
/** The seed's roll for the n-th story of a kind, 0..1: under the chance, it is on the table. */
const roll = (w: World, kind: ArcKind, n: number, salt = '') => hash01(`${w.seed}:arc:${kind}:${n}${salt}`);
/** Where between two numbers this seed puts the n-th story's trigger. */
const between = (w: World, kind: ArcKind, n: number, [a, b]: number[]) => a + (b - a) * roll(w, kind, n, ':at');
const end = (a: Arc, w: World, status: StoryStatus) => { a.status = status; a.ended = w.day; };

// ------------------------------------------------------------------------------------------ people
/** Somebody new in the city, from their own stream so the rest of the city does not move. */
function newcomer(w: World, salt: number, traits: Npc['traits'], skills: Partial<Npc['skills']>, nemesis: Npc['nemesis']): Npc {
  const rng = new Rng(w.seed ^ salt);
  const city = cityOfBlock(w, w.player.blockId);
  const blocks = Object.values(w.blocks).filter(b => cityOfBlock(w, b.id) === city && b.businessIds.length);
  const b = rng.pick(blocks.length ? blocks : Object.values(w.blocks));
  const pn = personName(rng, rng.pick(NAME_GROUP_IDS));
  const id = nid(w, 'n');
  const n: Npc = {
    id, first: pn.first, last: pn.last, nick: rng.chance(0.4) ? nickname(rng) : undefined, pronoun: pn.pronoun, age: rng.int(30, 60), face: rng.int(1, 2 ** 30),
    role: 'patron', homeBlockId: b.id, skills: { muscle: rng.int(3, 7), brains: rng.int(5, 9), charm: rng.int(3, 8), wheels: 4, tech: 4, ...skills },
    traits, nerve: rng.int(55, 90), wealth: 40, rel: { trust: -10, fear: 0, respect: 0, owes: 0 }, memory: [], ties: [], known: true, alive: true, nemesis,
  };
  w.npcs[id] = n;
  return n;
}

// ---------------------------------------------------------------------------------------- triggers
/**
 * Whether a story of this kind begins tonight, and with whom. Each kind asks the seed (is this game
 * one that has it? where does its trigger sit?) and then the world (has what sets it off happened?).
 */
function begin(w: World, kind: ArcKind): Arc | undefined {
  const n = count(w, kind);
  if (roll(w, kind, n) >= (n === 0 ? ARCS[kind].chance : ARCS[kind].again)) return undefined;
  const last = arcs(w).filter(a => a.kind === kind).at(-1);
  if (last && (last.ended === undefined || w.day - last.ended < REST)) return undefined;
  const p = w.player;
  const base = { id: nid(w, 'arc'), kind, since: w.day, status: 'active' as const, done: [] as number[] };
  switch (kind) {
    case 'detective': {
      if (p.heat < between(w, kind, n, DETECTIVE.heat) && w.day < between(w, kind, n, DETECTIVE.day)) return undefined;
      const honest = roll(w, kind, n, ':honest') < DETECTIVE.honest;
      const who = newcomer(w, 0xde7ec7 + n * 7919, honest ? ['honest', 'tough'] : ['greedy', 'tough'], { brains: 8 }, 'detective');
      return { ...base, npcId: who.id, meter: 10, honest, cityId: cityOfBlock(w, p.blockId) };
    }
    case 'reporter': {
      if (w.day < REPORTER.from || p.fear + p.respect < between(w, kind, n, REPORTER.fame)) return undefined;
      const who = newcomer(w, 0x9e7055 + n * 7919, ['honest', 'sly'], { charm: 7 }, 'reporter');
      return { ...base, npcId: who.id, meter: 10, beats: 0, cityId: cityOfBlock(w, p.blockId) };
    }
    case 'heir': {
      const f = Object.values(w.factions).filter(x => x.alive && x.standing <= between(w, kind, n, HEIR.standing)).sort((a, b) => a.standing - b.standing)[0];
      if (!f) return undefined;
      const members = Object.values(w.npcs).filter(x => x.alive && x.faction === f.id && x.id !== f.bossId && !x.nemesis).sort((a, b) => (a.role === 'lieutenant' ? 0 : 1) - (b.role === 'lieutenant' ? 0 : 1) || a.age - b.age);
      const who = members[0]; if (!who) return undefined;
      who.nemesis = 'heir'; who.known = true;
      return { ...base, npcId: who.id, factionId: f.id, meter: HEIR.start, nextBeat: w.day + HEIR.beatEvery, beats: 0 };
    }
    case 'avenger': {
      const pool = Object.values(w.npcs).filter(x => x.alive && x.agenda?.kind === 'revenge' && !x.crew && !x.official && !x.faction && !x.nemesis && !x.jailedDays);
      if (!pool.length || hash01(`${w.seed}:ven:${w.day}`) >= AVENGER.nightly) return undefined;
      const who = pool[Math.floor(hash01(`${w.seed}:venwho:${w.day}`) * pool.length)];
      who.nemesis = 'avenger'; who.known = true;
      return { ...base, npcId: who.id, meter: 10, beats: 0 };
    }
    case 'turncoat': {
      const pool = Object.values(w.npcs).filter(x => x.alive && !x.crew && x.exCrew !== undefined && w.day - x.exCrew <= TURNCOAT.within && !x.nemesis && !x.jailedDays);
      if (!pool.length || hash01(`${w.seed}:tc:${w.day}`) >= TURNCOAT.nightly) return undefined;
      const who = pool[0];
      who.nemesis = 'turncoat';
      return { ...base, npcId: who.id, meter: 10 };
    }
    case 'friend': {
      const at = Math.round(between(w, kind, n, FRIEND.day));
      if (w.day < at || w.day > at + 5) return undefined;
      const who = newcomer(w, 0xf12e7d + n * 7919, ['connected', 'sly'], {}, 'friend');
      who.rel.trust = 40;
      return { ...base, npcId: who.id, meter: 0, con: roll(w, kind, n, ':con') < FRIEND.con };
    }
  }
}
const OPENER: Record<ArcKind, string> = { detective: 'det_intro', reporter: 'rep_intro', heir: 'heir_oath', avenger: 'ven_note', turncoat: 'tc_gone', friend: 'of_pitch' };

// ------------------------------------------------------------------------------------------ nightly
/** One night of every live story, then maybe a new one. Called from `endDay`. */
export function tickStories(w: World) {
  for (const a of activeArcs(w)) {
    const n = w.npcs[a.npcId];
    if (!n?.alive) { end(a, w, 'dead'); continue; }
    if (n.jailedDays && a.kind !== 'detective' && a.kind !== 'reporter') continue;
    STEP[a.kind](w, a);
  }
  if (activeArcs(w).length >= MAX_ACTIVE) return;
  // the kinds in an order the seed and the day choose, so no kind always gets first look
  const kinds = (Object.keys(ARCS) as ArcKind[]).sort((x, y) => hash01(`${w.seed}:${w.day}:${x}`) - hash01(`${w.seed}:${w.day}:${y}`));
  for (const k of kinds) {
    if (arcOf(w, k)) continue;
    const a = begin(w, k);
    if (!a) continue;
    arcs(w).push(a);
    w.scheduled.push({ day: w.day + 1, template: OPENER[k], npcId: a.npcId, factionId: a.factionId });
    return;   // one new story a night at most
  }
}
/** Past a threshold for the first time: send its card. */
function beat(w: World, a: Arc, thresholds: [number, string][]) {
  for (const [at, template] of thresholds) if (a.meter >= at && !a.done.includes(at)) { a.done.push(at); w.scheduled.push({ day: w.day + 1, template, npcId: a.npcId, factionId: a.factionId }); return; }
}
const openFiles = (w: World) => Object.values(w.cases).filter(c => c.status === 'open' && c.suspectId === PLAYER).length;

const STEP: Record<ArcKind, (w: World, a: Arc) => void> = {
  detective: (w, a) => {
    if (a.status === 'bought') { if (a.boughtUntil !== undefined && w.day >= a.boughtUntil && !w.scheduled.some(s => s.template === 'det_more')) w.scheduled.push({ day: w.day + 1, template: 'det_more', npcId: a.npcId }); return; }
    a.meter = clamp(a.meter + DETECTIVE.perDay + w.player.heat * DETECTIVE.perHeat + openFiles(w) * DETECTIVE.perCase);
    beat(w, a, [[DETECTIVE.watch, 'det_watch'], [DETECTIVE.witness, 'det_witness'], [DETECTIVE.raid, 'det_raid']]);
  },
  reporter: (w, a) => {
    if (a.status !== 'active') return;
    a.meter = clamp(a.meter + REPORTER.perDay + w.player.heat * REPORTER.perHeat + (w.player.fear + w.player.respect) * REPORTER.perFame);
    beat(w, a, [[REPORTER.questions, 'rep_questions'], [REPORTER.draft, 'rep_draft'], [REPORTER.runs, 'rep_runs']]);
  },
  heir: (w, a) => {
    const n = w.npcs[a.npcId]; const f = w.factions[a.factionId!];
    if (!f?.alive) { end(a, w, 'broken'); log(w, `${fullName(n)} has nothing left to inherit.`, 'good'); return; }
    if (!w.npcs[f.bossId]?.alive && f.bossId !== n.id) { f.bossId = n.id; n.role = 'boss'; a.meter = clamp(a.meter + 20); log(w, `${fullName(n)} takes the chair at ${theName(f)}. The first thing they say is your name.`, 'war', { npcId: n.id }); }
    a.meter = clamp(a.meter + HEIR.perDay + (f.standing < -60 ? HEIR.bitter : 0));
    if (a.meter >= HEIR.boil) { if (!w.scheduled.some(s => s.template === 'heir_showdown') && !w.events.some(e => e.template === 'heir_showdown')) w.scheduled.push({ day: w.day + 1, template: 'heir_showdown', npcId: n.id, factionId: f.id }); return; }
    if (w.day >= (a.nextBeat ?? 0)) { a.nextBeat = w.day + HEIR.beatEvery; a.beats = (a.beats ?? 0) + 1; w.scheduled.push({ day: w.day + 1, template: a.beats % 2 ? 'heir_message' : 'heir_hit', npcId: n.id, factionId: f.id }); }
  },
  avenger: (w, a) => {
    a.meter = clamp(a.meter + AVENGER.perDay);
    beat(w, a, [[AVENGER.hire, 'ven_hire'], [AVENGER.attempt, 'ven_attempt']]);
  },
  turncoat: (w, a) => {
    a.meter = clamp(a.meter + TURNCOAT.perDay);
    beat(w, a, [[TURNCOAT.sell, 'tc_sell'], [TURNCOAT.cops, 'tc_cops'], [TURNCOAT.trial, 'tc_trial']]);
  },
  friend: (w, a) => {
    beat(w, a, [[FRIEND.doubt, 'of_doubt'], [100, 'of_payoff']]);
  },
};

// ---------------------------------------------------------------------------- what the cards do
/** The turning points the cards call for (effect `arcDo`). */
export function arcDo(w: World, rng: Rng, kind: ArcKind, what: string) {
  const a = arcOf(w, kind); if (!a) return;
  const n = w.npcs[a.npcId]; const p = w.player;
  switch (`${kind}:${what}`) {
    case 'detective:raid': {
      const seized = Math.round(p.dirty * DETECTIVE.raidSeize); p.dirty -= seized;
      openCase(w, 'racketeering', PLAYER, a.npcId, `Racketeering: Detective ${n.last}'s file, a year of it.`, DETECTIVE.raidEvidence);
      a.meter = DETECTIVE.afterRaid; a.done = a.done.filter(x => x < DETECTIVE.witness);
      log(w, `Detective ${n.last} comes through your door with a warrant and a smile. ${money(seized)} goes into evidence bags.`, 'law');
      break;
    }
    case 'reporter:runs': {
      addHeat(w, REPORTER.run.heat); p.respect = clamp(p.respect + REPORTER.run.respect, 0, 100); p.fear = clamp(p.fear + REPORTER.run.fear, 0, 100);
      a.beats = (a.beats ?? 0) + 1;
      log(w, `${fullName(n)}'s piece runs on the front page, with your photograph. Every precinct and every outfit reads it with breakfast.`, 'law', { npcId: n.id });
      if (a.beats >= REPORTER.pieces) end(a, w, 'published');
      else { a.meter = REPORTER.afterRun; a.done = a.done.filter(x => x < REPORTER.questions); }
      break;
    }
    case 'avenger:attempt': {
      const guard = p.crewIds.some(id => { const c = w.npcs[id]?.crew; return c?.status === 'ready' && c.assignment?.kind === 'guard' && c.assignment.blockId === p.blockId; });
      a.beats = (a.beats ?? 0) + 1;
      if (guard || rng.chance(0.25)) {
        end(a, w, 'broken'); n.jailedDays = 20;
        log(w, `The man ${fullName(n)} hired comes out of a doorway with a gun, and ${guard ? 'your guard' : 'a passing patrol'} is quicker. ${fullName(n)} is in a cell by morning.`, 'good', { npcId: n.id });
      } else {
        p.hurtDays = Math.max(p.hurtDays ?? 0, AVENGER.hurt); addHeat(w, AVENGER.heat);
        log(w, `Two shots from a doorway on your way home. One finds you. ${fullName(n)} will be disappointed you lived.`, 'war', { npcId: n.id });
        if (a.beats >= AVENGER.attempts) end(a, w, 'spent');
        else { a.meter = AVENGER.afterAttempt; a.done = a.done.filter(x => x < AVENGER.hire); }
      }
      break;
    }
    case 'turncoat:sell': {
      const f = Object.values(w.factions).filter(x => x.alive).sort((x, y) => x.standing - y.standing)[0];
      if (f) { f.standing = clamp(f.standing + TURNCOAT.sellStanding, -100, 100); log(w, `${fullName(n)} has been drinking with ${theName(f)}, and telling them where your money sleeps.`, 'war', { npcId: n.id }); }
      break;
    }
    case 'turncoat:cops': {
      const c = openCase(w, 'racketeering', PLAYER, n.id, `Racketeering: what ${fullName(n)} told the police about the outfit.`, TURNCOAT.copsEvidence);
      a.caseId = c.id;
      break;
    }
    case 'turncoat:trial': {
      const c = a.caseId ? w.cases[a.caseId] : undefined;
      if (c && c.status === 'open') c.evidence = clamp(c.evidence + TURNCOAT.trialEvidence);
      end(a, w, 'told');
      log(w, `${fullName(n)} has told them everything there is to tell, and signed it.`, 'law', { npcId: n.id });
      break;
    }
    case 'friend:payoff': {
      if (a.con) { end(a, w, 'conned'); log(w, `${fullName(n)} is gone, and so is everything you put in. The address was a laundromat. You should have known.`, 'bad', { npcId: n.id }); }
      else { const take = Math.round(FRIEND.payoff[0] + (FRIEND.payoff[1] - FRIEND.payoff[0]) * roll(w, 'friend', count(w, 'friend'), ':take')); p.dirty += take; p.respect = clamp(p.respect + 4, 0, 100); end(a, w, 'paid'); log(w, `It was real. ${fullName(n)} counts out your end on the kitchen table: ${money(take)}.`, 'money', { npcId: n.id }); }
      break;
    }
  }
}

// ------------------------------------------------------------------------------ what you can do
export type Move = 'dig' | 'blackmail' | 'bribe' | 'lean' | 'transfer' | 'disappear' | 'feed' | 'editor' | 'silence' | 'gift' | 'meet' | 'amends' | 'frighten' | 'buyback' | 'help' | 'walk';
export interface MoveInfo { move: Move; label: string; ap: number; cost?: number; odds?: number; night?: boolean; day?: boolean; grave?: boolean }

export const bribePrice = (a: Arc) => Math.round(DETECTIVE.bribe.base + a.meter * DETECTIVE.bribe.perFile);
const odds = (n: number) => clamp(Math.round(n), 5, 95);
export const digOdds = (w: World) => odds(DETECTIVE.dig.base + skillOf(w, PLAYER, 'brains') * DETECTIVE.dig.perBrains);
const leanWith = (w: World, a: Arc, base: number, perMuscle: number, perFear: number, perNerve = 0.5) => odds(base + skillOf(w, PLAYER, 'muscle') * perMuscle + w.player.fear * perFear - (w.npcs[a.npcId]?.nerve ?? 60) * perNerve);
export const meetOdds = (w: World) => odds(HEIR.meet.base + skillOf(w, PLAYER, 'charm') * HEIR.meet.perCharm);
const hasCouncillor = (w: World) => Object.values(w.npcs).some(n => n.alive && n.official === 'councillor' && n.payroll);
/** The odds of facing the heir down: you and your guards against their people. */
export function duelOdds(w: World): number {
  const h = heir(w); const f = h ? w.factions[h.factionId!] : undefined; if (!f) return 0;
  const guards = w.player.crewIds.filter(id => w.npcs[id]?.crew?.assignment?.kind === 'guard' && w.npcs[id].crew!.status === 'ready');
  return fightOdds(w, [PLAYER, ...guards.slice(0, 3)], soldiersOn(w, f));
}

/** What a story's panel offers, with costs and odds as the dice will use them. */
export function movesFor(w: World, a: Arc): MoveInfo[] {
  if (a.status !== 'active' && !(a.kind === 'detective' && a.status === 'bought')) return [];
  const who = w.npcs[a.npcId]; const t = who ? them(who) : 'them'; const r = who ? their(who) : 'their';
  switch (a.kind) {
    case 'detective': return a.status === 'bought' ? [{ move: 'disappear', label: `Make ${t} disappear`, ap: DETECTIVE.disappear.ap, cost: DETECTIVE.disappear.cost, night: true, grave: true }] : [
      a.dirt ? { move: 'blackmail', label: `Show ${t} the photographs`, ap: DETECTIVE.blackmail.ap } : { move: 'dig', label: `Dig into ${t}`, ap: DETECTIVE.dig.ap, odds: digOdds(w), day: true },
      { move: 'bribe', label: `Bribe ${t}`, ap: DETECTIVE.bribe.ap, cost: bribePrice(a) },
      { move: 'lean', label: `Lean on ${t}`, ap: DETECTIVE.lean.ap, odds: leanWith(w, a, DETECTIVE.lean.base, DETECTIVE.lean.perMuscle, DETECTIVE.lean.perFear, DETECTIVE.lean.perNerve) },
      { move: 'transfer', label: `Have ${t} moved`, ap: DETECTIVE.transfer.ap, cost: DETECTIVE.transfer.cost },
      { move: 'disappear', label: `Make ${t} disappear`, ap: DETECTIVE.disappear.ap, cost: DETECTIVE.disappear.cost, night: true, grave: true },
    ];
    case 'reporter': return [
      { move: 'feed', label: `Feed ${t} a better story`, ap: REPORTER.feed.ap },
      { move: 'editor', label: `Buy ${r} editor`, ap: REPORTER.editor.ap, cost: REPORTER.editor.cost },
      { move: 'lean', label: `Lean on ${t}`, ap: REPORTER.lean.ap, odds: leanWith(w, a, REPORTER.lean.base, REPORTER.lean.perMuscle, REPORTER.lean.perFear, 0.4) },
      { move: 'silence', label: `Silence ${t}`, ap: REPORTER.silence.ap, night: true, grave: true },
    ];
    case 'heir': return [
      { move: 'gift', label: 'Send a gift', ap: 0, cost: HEIR.gift.cost },
      { move: 'meet', label: 'Sit down with them', ap: HEIR.meet.ap, odds: meetOdds(w), night: true },
    ];
    case 'avenger': return [
      { move: 'amends', label: 'Make amends', ap: AVENGER.amends.ap, cost: AVENGER.amends.cost, odds: odds(AVENGER.amends.base + skillOf(w, PLAYER, 'charm') * AVENGER.amends.perCharm) },
      { move: 'frighten', label: 'Frighten them off', ap: AVENGER.frighten.ap, odds: leanWith(w, a, AVENGER.frighten.base, AVENGER.frighten.perMuscle, AVENGER.frighten.perFear, AVENGER.frighten.perNerve) },
      { move: 'silence', label: 'Silence them', ap: AVENGER.silence.ap, night: true, grave: true },
    ];
    case 'turncoat': return [
      { move: 'buyback', label: 'Buy their silence', ap: TURNCOAT.buyback.ap, cost: TURNCOAT.buyback.cost, odds: odds(TURNCOAT.buyback.base + skillOf(w, PLAYER, 'charm') * TURNCOAT.buyback.perCharm) },
      { move: 'frighten', label: 'Frighten them off', ap: TURNCOAT.frighten.ap, odds: leanWith(w, a, TURNCOAT.frighten.base, TURNCOAT.frighten.perMuscle, TURNCOAT.frighten.perFear, TURNCOAT.frighten.perNerve) },
      { move: 'silence', label: 'Silence them', ap: TURNCOAT.silence.ap, night: true, grave: true },
    ];
    case 'friend': return a.meter >= 100 ? [] : [
      { move: 'help', label: 'Put in time and money', ap: FRIEND.help.ap, cost: FRIEND.help.cost, day: true },
      { move: 'walk', label: 'Walk away from it', ap: 0 },
    ];
  }
}

export function storyBlock(w: World, arcId: Id, move: Move): string | undefined {
  const a = byId(w, arcId); if (!a) return 'No such story.';
  const m = movesFor(w, a).find(x => x.move === move); if (!m) return 'Not now.';
  const n = w.npcs[a.npcId]; if (!n?.alive) return 'They are gone.';
  if (m.night && half(w) !== 'night') return 'Not in daylight.';
  if (m.day && half(w) !== 'day') return 'That is daytime work.';
  if (a.cityId && cityOfBlock(w, w.player.blockId) !== a.cityId && move !== 'gift') return 'They work another city.';
  if (move === 'bribe' && w.player.cash < (m.cost ?? 0)) return `A detective wants clean money: ${money(m.cost ?? 0)}.`;
  if (move === 'editor' && w.player.cash < (m.cost ?? 0)) return `An editor wants clean money: ${money(m.cost ?? 0)}.`;
  if (move === 'transfer' && !hasCouncillor(w)) return 'Only somebody at City Hall can move a detective. Put a councillor on your payroll.';
  if (move === 'transfer' && w.player.cash < (m.cost ?? 0)) return `The councillor wants clean money: ${money(m.cost ?? 0)}.`;
  if (move === 'feed' && !Object.values(w.factions).some(f => f.alive)) return 'There is nobody else left to write about.';
  if (m.cost && w.player.cash + w.player.dirty < m.cost) return `It costs ${money(m.cost)}.`;
  return undefined;
}
export const moveAp = (w: World, arcId: Id, move: Move) => { const a = byId(w, arcId); return (a && movesFor(w, a).find(x => x.move === move)?.ap) ?? 0; };

/** Pay from clean for the moves that want clean money, from dirty first for the rest. */
function payFor(w: World, move: Move, n: number) { if (move === 'bribe' || move === 'editor' || move === 'transfer') w.player.cash -= n; else spend(w, n); }

export function storyMove(w: World, rng: Rng, arcId: Id, move: Move) {
  const a = byId(w, arcId)!; const n = w.npcs[a.npcId]; const p = w.player;
  const m = movesFor(w, a).find(x => x.move === move)!;
  if (m.cost && move !== 'bribe') payFor(w, move, m.cost);
  const hit = (o?: number) => rng.float() * 100 < (o ?? 50);
  const name = fullName(n);
  const murder = (heat: number, evidence: number, what: string) => {
    kill(w, n.id, 'never came home'); end(a, w, 'dead'); addHeat(w, heat);
    openCase(w, 'murder', PLAYER, undefined, `The disappearance of ${name}.`, evidence);
    log(w, `${name} never comes home. ${what}`, 'war', { npcId: n.id });
  };
  switch (`${a.kind}:${move}`) {
    case 'detective:dig':
      if (hit(m.odds)) { a.dirt = true; log(w, `Detective ${n.last} has a second family in another district, and a first one that does not know. You have the addresses.`, 'good', { npcId: n.id }); }
      else log(w, `A day in the records office and the bars Detective ${n.last} drinks in. Nothing.`, 'info', { npcId: n.id });
      break;
    case 'detective:blackmail': a.meter = clamp(a.meter - DETECTIVE.blackmail.cut); a.status = 'bought'; a.boughtUntil = undefined; log(w, `You show Detective ${n.last} the photographs. ${cap(their(n))} file on you gets a great deal thinner.`, 'good', { npcId: n.id }); break;
    case 'detective:bribe':
      if (a.honest) { a.meter = clamp(a.meter + DETECTIVE.bribe.refused); log(w, `Detective ${n.last} counts the money, hands it back, and writes the amount in ${their(n)} notebook.`, 'law', { npcId: n.id }); break; }
      p.cash -= m.cost!; a.status = 'bought'; a.boughtUntil = w.day + DETECTIVE.boughtDays;
      log(w, `Detective ${n.last} takes ${money(m.cost!)} and remembers ${they(n)} ${vb(n, 'have', 'has')} other cases.`, 'good', { npcId: n.id });
      break;
    case 'detective:lean':
      if (hit(m.odds)) { a.meter = clamp(a.meter + DETECTIVE.lean.win); n.rel.fear = clamp(n.rel.fear + 15); log(w, `Detective ${n.last} finds you waiting in ${their(n)} kitchen. ${cap(they(n))} ${vb(n, 'are', 'is')} more careful after that.`, 'good', { npcId: n.id }); }
      else { a.meter = clamp(a.meter + DETECTIVE.lean.lose); addHeat(w, DETECTIVE.lean.heat); log(w, `You lean on Detective ${n.last}, and ${they(n)} ${vb(n, 'lean', 'leans')} back, harder. It goes in the file.`, 'law', { npcId: n.id }); }
      break;
    case 'detective:transfer': end(a, w, 'gone'); log(w, `A word at City Hall, and Detective ${n.last} is running traffic in the suburbs by Monday.`, 'good', { npcId: n.id }); break;
    case 'detective:disappear': murder(DETECTIVE.disappear.heat, DETECTIVE.disappear.evidence, `Every cop in the city knows whose name was in ${their(n)} notebook.`); break;
    case 'reporter:feed': {
      const f = Object.values(w.factions).filter(x => x.alive).sort((x, y) => x.standing - y.standing)[0]!;
      a.meter = clamp(a.meter - REPORTER.feed.cut); f.standing = clamp(f.standing + REPORTER.feed.standing, -100, 100);
      log(w, `You give ${name} ${theName(f)}'s books instead. It is a better story, and it is not about you.`, 'good', { npcId: n.id });
      break;
    }
    case 'reporter:editor': end(a, w, 'bought'); log(w, `${name}'s editor takes ${money(m.cost!)} and finds the paper has no room for the piece. Or the next one.`, 'good', { npcId: n.id }); break;
    case 'reporter:lean':
      if (hit(m.odds)) { a.meter = clamp(a.meter + REPORTER.lean.win); log(w, `${name} decides the story is not worth what it would cost.`, 'good', { npcId: n.id }); }
      else { a.meter = clamp(a.meter + REPORTER.lean.lose); addHeat(w, REPORTER.lean.heat); log(w, `${name} writes down every word you said, and quotes it.`, 'law', { npcId: n.id }); }
      break;
    case 'reporter:silence': murder(REPORTER.silence.heat, REPORTER.silence.evidence, `The paper runs ${their(n)} photograph on the front page for a week.`); break;
    case 'heir:gift': a.meter = clamp(a.meter - HEIR.gift.cut); log(w, `A case of something old and expensive goes to ${name}, with your respects. It is accepted. That is something.`, 'info', { npcId: n.id }); break;
    case 'heir:meet':
      if (hit(m.odds)) { a.meter = clamp(a.meter - HEIR.meet.cut); log(w, `Dinner with ${name}. They came to hate you and left merely disliking you.`, 'good', { npcId: n.id }); }
      else { a.meter = clamp(a.meter + HEIR.meet.worse); log(w, `Dinner with ${name} ends with a glass thrown and a promise made.`, 'war', { npcId: n.id }); }
      break;
    case 'avenger:amends':
      if (hit(m.odds)) { end(a, w, 'forgiven'); if (n.agenda?.kind === 'revenge') n.agenda = undefined; log(w, `${name} takes the envelope and your apology, and says it is finished. It may even be true.`, 'good', { npcId: n.id }); }
      else log(w, `${name} throws your money in the gutter.`, 'bad', { npcId: n.id });
      break;
    case 'avenger:frighten': case 'turncoat:frighten':
      if (hit(m.odds)) { end(a, w, 'cowed'); n.rel.fear = clamp(n.rel.fear + 30); log(w, `${name} leaves town the next morning, and does not leave an address.`, 'good', { npcId: n.id }); }
      else { a.meter = clamp(a.meter + (a.kind === 'avenger' ? AVENGER.frighten.worse : TURNCOAT.frighten.worse)); log(w, `${name} does not frighten. Now they are in a hurry.`, 'war', { npcId: n.id }); }
      break;
    case 'avenger:silence': murder(AVENGER.silence.heat, AVENGER.silence.evidence, 'Nobody who knew the family is surprised, and nobody says so.'); break;
    case 'turncoat:buyback':
      if (hit(m.odds)) { end(a, w, 'paid'); log(w, `${name} takes the money and a ticket out of town. What they knew goes with them.`, 'good', { npcId: n.id }); }
      else log(w, `${name} takes your money and keeps talking anyway.`, 'bad', { npcId: n.id });
      break;
    case 'turncoat:silence': murder(TURNCOAT.silence.heat, TURNCOAT.silence.evidence, 'Everybody who ever worked for you notices.'); break;
    case 'friend:help': a.meter = clamp(a.meter + FRIEND.help.add); log(w, `A day with ${name} on the plan: floor plans, a truck, a man who owes somebody. It is ${Math.round(a.meter)}% ready.`, 'info', { npcId: n.id }); break;
    case 'friend:walk': end(a, w, 'walked'); log(w, `You tell ${name} you are out. They look disappointed, or relieved.`, 'info', { npcId: n.id }); break;
  }
}

/** How the heir's showdown ends, from its card (effect `heirEnd`). */
export function endHeir(w: World, rng: Rng, how: 'partner' | 'duel' | 'kill') {
  const h = heir(w); if (!h) return;
  const n = w.npcs[h.npcId]; const f = w.factions[h.factionId!];
  if (how === 'partner') {
    end(h, w, 'partner');
    if (f) { f.standing = clamp(f.standing + HEIR.partner.standing, -100, 100); f.truceUntil = w.day + HEIR.partner.truce; }
    log(w, `${fullName(n)} shakes your hand in front of both families. Partners, for as long as it pays.`, 'good', { npcId: n.id });
  } else if (how === 'duel') {
    if (rng.float() * 100 < duelOdds(w)) {
      end(h, w, 'broken'); w.player.respect = clamp(w.player.respect + HEIR.duel.respect, 0, 100);
      if (f) f.standing = clamp(f.standing + 10, -100, 100);
      log(w, `You face ${fullName(n)} down in the street, and they are the one who looks away. It is over, and everybody saw.`, 'good', { npcId: n.id });
    } else {
      h.meter = HEIR.duel.lostGrudge; w.player.hurtDays = Math.max(w.player.hurtDays ?? 0, 4);
      log(w, `${fullName(n)}'s people are better than yours tonight. You wake up in the doctor's back room.`, 'war', { npcId: n.id });
    }
  } else {
    end(h, w, 'dead');
    kill(w, n.id, `killed on your word`);
    addHeat(w, HEIR.kill.heat);
    if (f) { f.standing = -100; f.grievances.unshift(`The murder of ${fullName(n)}`); }
    log(w, `${fullName(n)} is found in the river. ${f ? `${theName(f)} will not rest now.` : ''}`, 'war', { npcId: n.id });
  }
}

/** A save from before stories were procedural carried one detective and one heir: they become arcs. */
export function migrateStories(w: World) {
  const s = w.stories as (World['stories'] & { detective?: Arc & { file?: number }; heir?: Arc & { grudge?: number } }) | undefined;
  if (!s || s.arcs) return;
  const out: Arc[] = [];
  if (s.detective) out.push({ ...s.detective, id: nid(w, 'arc'), kind: 'detective', meter: s.detective.file ?? 0, done: s.detective.done ?? [] });
  if (s.heir) out.push({ ...s.heir, id: nid(w, 'arc'), kind: 'heir', meter: s.heir.grudge ?? 0, done: [] });
  w.stories = { arcs: out };
}
