/**
 * When somebody comes for you.
 *
 * A faction's tick used to resolve its attacks on the player alone: you read in the morning
 * that your numbers racket had been wrecked and that was that. Now a direct attack — on a
 * racket, on a place you own, on one of your people — stops and waits for an answer. You pick
 * how to meet it, you see the odds before you commit, and the kit you are carrying counts
 * exactly as it does on a job.
 *
 * The three answers map onto the three op approaches, so `sim/items.ts` reads them unchanged:
 * standing and fighting is loud, walking away is quiet, and calling people in is the same
 * kind of work as an inside job — which is why a burner phone helps with it.
 *
 * Territorial pressure (soldiers leaning on a block you hold) is not a confrontation. Nobody
 * is standing in front of you for that one; it stays automatic.
 */
import { OP_DEFS, type OpApproach } from '@content/rackets';
import { COMPLICATIONS } from '@content/complications';
import { complicationBias, complicationOptions } from './complications';
import { resolveOp } from './ops';
import { kitApproachBias, kitHeatMult, kitSkillBoost } from './items';
import type { Rng } from './rng';
import { PLAYER, type Confrontation, type ConfrontApproach, type Faction, type Id, type TalkMove, type World } from './types';
import { resolveTalk, talkOptions } from './conversation';
import { nemesisName, scoreMeeting } from './nemesis';
import { ASSET } from '@content/informants';
import type { Stake } from '@content/standing';
import { remember } from './ledger';
import { addHeat, adjustRel, clamp, log, money, nid, spreadRep } from './util';
import { personalCover, succeed } from './legacy';

/** Which op approach each answer is cut from, for kit and for flavour. */
export const CONFRONT_AS: Record<ConfrontApproach, OpApproach> = { fight: 'loud', flee: 'quiet', backup: 'inside' };

export interface ConfrontOption {
  id: ConfrontApproach;
  label: string;
  icon: string;
  blurb: string;
  good: string;
  bad: string;
  chance: number;
  disabled?: string;
}

export function confrontations(w: World): Confrontation[] { return w.confrontations ?? []; }
export function activeConfrontation(w: World): Confrontation | undefined { return confrontations(w)[0]; }

/** Crew who could actually turn up: on their feet, not in a cell, not held somewhere. */
export function backupCrew(w: World): Id[] {
  return w.player.crewIds.filter(id => { const c = w.npcs[id]?.crew; return c && (c.status === 'idle' || c.status === 'assigned'); });
}

/**
 * The odds for one answer. Muscle and numbers against their soldiers, with the carried kit
 * folded in the way `opChance` does it: skillBoost adds to your side, approachBias scales it.
 */
export function confrontChance(w: World, c: Confrontation, approach: ConfrontApproach): number {
  const f = w.factions[c.factionId];
  const p = w.player;
  const crew = backupCrew(w);
  const kit = kitSkillBoost(w);
  const bias = 1 + kitApproachBias(w, CONFRONT_AS[approach]);
  const muscle = p.skills.muscle + (kit.muscle ?? 0);
  const wheels = p.skills.wheels + (kit.wheels ?? 0);
  const brains = p.skills.brains + (kit.brains ?? 0);
  const soldiers = f ? f.soldiers : 6;
  let base: number;
  switch (approach) {
    case 'fight':
      base = 34 + (muscle * 3 + crew.length * 6) * bias - soldiers * 1.6 - (c.war ? 8 : 0);
      break;
    case 'flee':
      base = 52 + (wheels * 3.5 + p.skills.charm) * bias - soldiers * 0.8 - (c.war ? 6 : 0);
      break;
    case 'backup':
      base = 26 + (crew.length * 11 + brains * 2 + p.respect * 0.2) * bias - soldiers * 1.2 - (c.war ? 6 : 0);
      break;
  }
  // An informant who got word out first is worth real odds: you are standing in the doorway when
  // they arrive instead of looking up from the till. Same shape as the kit bonus above.
  const ready = c.warned ? ASSET.warnedBonus : 0;
  // A complication is the same three answers against a different problem, so it rides the same
  // maths and only shifts the base: forcing a time-locked door is a bad idea whatever you own.
  return Math.max(3, Math.min(97, Math.round(base + ready + complicationBias(c, approach))));
}

export function confrontOptions(w: World, c: Confrontation): ConfrontOption[] {
  // A conversation is the same queue entry with a different menu — generated from the graph, the
  // ledger and their agenda rather than from the three ways to meet a fist.
  if (c.kind === 'talk') return talkOptions(w, c) as unknown as ConfrontOption[];
  const crew = backupCrew(w);
  if (c.kind === 'op' && c.complication) {
    const o = complicationOptions(c);
    return [
      { id: 'fight', label: o.fight.label, icon: 'fist', blurb: o.fight.blurb, good: o.fight.good, bad: o.fight.bad, chance: confrontChance(w, c, 'fight') },
      { id: 'backup', label: o.backup.label, icon: 'crew', blurb: o.backup.blurb, good: o.backup.good, bad: o.backup.bad, chance: confrontChance(w, c, 'backup'), disabled: crew.length ? undefined : 'Nobody to call.' },
      { id: 'flee', label: o.flee.label, icon: 'legwork', blurb: o.flee.blurb, good: o.flee.good, bad: o.flee.bad, chance: confrontChance(w, c, 'flee') },
    ];
  }
  return [
    { id: 'fight', label: 'Stand and fight', icon: 'fist', blurb: 'You and whatever is in your hands, right here.', good: 'They go home hurt; the street sees it', bad: 'It lands harder, and on you', chance: confrontChance(w, c, 'fight') },
    { id: 'backup', label: 'Call in your people', icon: 'crew', blurb: 'Get somebody down here before this finishes.', good: 'Numbers end it with less blood', bad: 'Somebody of yours gets hurt getting here', chance: confrontChance(w, c, 'backup'), disabled: crew.length ? undefined : 'Nobody to call.' },
    { id: 'flee', label: 'Walk away', icon: 'legwork', blurb: 'Let them have this one and keep your teeth.', good: 'Nobody of yours is hurt', bad: 'They do what they came to do, and they tell people', chance: confrontChance(w, c, 'flee') },
  ];
}

/**
 * Is somebody already at this exact door today? Two acts a day in war can pick the same racket
 * twice, and then the player gets the same building's name in the queue twice over with no way
 * to tell the two apart — which is the one case where "it looks like a duplicate" really is one.
 */
export function alreadyAtTheDoor(w: World, c: Pick<Confrontation, 'businessId' | 'npcId' | 'blockId'>): boolean {
  const at = c.businessId ?? c.npcId ?? c.blockId;
  if (!at) return false;
  return confrontations(w).some(x => x.day === w.day && (x.businessId ?? x.npcId ?? x.blockId) === at);
}

/** Queue one. Called from the faction tick instead of applying the damage there and then. */
export function queueConfrontation(w: World, c: Omit<Confrontation, 'id' | 'day'>): Confrontation {
  const full: Confrontation = { ...c, id: nid(w, 'x'), day: w.day };
  w.confrontations = [...confrontations(w), full];
  if (full.kind !== 'talk' && full.npcId) remember(w, w.npcs[full.npcId], 'door', full.text);
  log(w, full.text, full.kind === 'talk' ? 'info' : 'warn', { factionId: full.factionId, businessId: full.businessId, npcId: full.npcId, blockId: full.blockId });
  return full;
}

/**
 * Answer one. `absent` is what happens when the day ends with the player never having dealt
 * with it: the attack lands as it would have before any of this existed.
 */
export function resolveConfrontation(w: World, c: Confrontation, given: ConfrontApproach | TalkMove | 'absent', rng: Rng): boolean {
  // A conversation is answered, not survived. The reducer drives those directly through
  // `resolveTalk`, because a closing move has to run an actual scene and that is reducer work;
  // what reaches here is the End Day sweep, where an unanswered conversation is simply somebody
  // who got bored and left. It must never fall through to the damage code below.
  if (c.kind === 'talk') {
    resolveTalk(w, c, 'absent', rng);
    w.confrontations = confrontations(w).filter(x => x.id !== c.id);
    return false;
  }
  const approach = given as ConfrontApproach | 'absent';

  w.confrontations = confrontations(w).filter(x => x.id !== c.id);

  // A complication is not an attack: nothing is wrecked and nobody is hurt here. The answer is
  // recorded on the op and the job then finishes with it counted, through the ordinary resolver.
  if (c.kind === 'op' && c.opId) {
    const o = w.ops[c.opId];
    const won = approach !== 'absent' && rng.int(1, 100) <= confrontChance(w, c, approach);
    if (o) {
      if (o.complication) { o.complication.answered = approach; o.complication.won = won; }
      log(w, approach === 'absent'
        ? `Nobody made a decision at ${OP_DEFS[o.kind].label}, so the crew made their own. It did not go well.`
        : won
          ? `${COMPLICATIONS[c.complication!].label}: handled.`
          : `${COMPLICATIONS[c.complication!].label}: badly handled.`,
        approach === 'absent' || !won ? 'bad' : 'good', { opId: o.id });
      resolveOp(w, o, rng);
    }
    return won;
  }

  const f: Faction | undefined = w.factions[c.factionId];
  const short = f?.short ?? 'They';
  // whoever came is who this happened with, and it goes on their page like anybody else's
  const led = c.byNpcId ? w.npcs[c.byNpcId] : undefined;
  const stake: Stake = c.kind === 'you' || c.kind === 'loved' ? 'grave' : c.kind === 'crew' ? 'violence' : c.kind === 'business' || c.kind === 'racket' ? 'property' : 'backed';
  const heat = (n: number) => addHeat(w, Math.round(n * kitHeatMult(w)), c.blockId);
  const won = approach !== 'absent' && rng.int(1, 100) <= confrontChance(w, c, approach);

  if (approach === 'absent') {
    land(w, c, rng, 1);
    scoreMeeting(w, led, true, stake, `They came for ${what(w, c)} and you were not there. ${damageLine(w, c)}`);
    log(w, `You were not there when ${led ? nemesisName(led) : short} came to ${what(w, c)}. ${damageLine(w, c)}`, 'bad', refs(c));
    return false;
  }

  const score = (w2: World, w3: boolean, line: string) => scoreMeeting(w2, led, w3, stake, line);

  if (approach === 'flee') {
    score(w, !won, won ? `You went out the back on them at ${what(w, c)}.` : `They were already at the back door at ${what(w, c)}.`);
    if (won) {
      log(w, `You are out the back of ${what(w, c)} before they are through the door. Nothing of yours is broken, but ${short} tell it their way.`, 'info', refs(c));
      w.player.respect = clamp(w.player.respect - 2);
      if (f) f.standing[PLAYER] = clamp(f.standing[PLAYER] + 2, -100, 100);  // they got what they wanted without a fight
    } else {
      land(w, c, rng, 1);
      log(w, `You go for the door at ${what(w, c)} and they are already there. ${damageLine(w, c)}`, 'bad', refs(c));
      w.player.respect = clamp(w.player.respect - 4);
    }
    return won;
  }

  if (approach === 'backup') {
    score(w, !won, won ? `Your people got to ${what(w, c)} before they finished.` : `Your people got to ${what(w, c)} late.`);
    const crew = backupCrew(w);
    const helper = crew.length ? w.npcs[rng.pick(crew)] : undefined;
    if (won) {
      if (f) f.soldiers = Math.max(0, f.soldiers - 1);
      log(w, `${helper ? `${helper.name} and two others` : 'Your people'} come round the corner at ${what(w, c)} before it starts properly. ${short} count heads and leave.`, 'good', refs(c));
      spreadRep(w, c.blockId ?? w.player.currentBlockId, { respect: 3 }, 1, 'backed');
      heat(2);
      if (helper) adjustRel(w, helper, { trust: 4, respect: 3 });
    } else {
      land(w, c, rng, 0.6);
      if (helper?.crew) { helper.crew.status = 'injured'; helper.crew.statusDays = rng.int(3, 7); helper.crew.assignment = undefined; }
      log(w, `Your people got to ${what(w, c)} late. ${damageLine(w, c)}${helper ? ` ${helper.name} took a beating on the way in.` : ''}`, 'bad', refs(c));
      heat(3);
    }
    return won;
  }

  // fight
  score(w, !won, won ? `You put the first one down at ${what(w, c)}.` : `There were more of them than there were of you at ${what(w, c)}.`);
  if (won) {
    if (f) { f.soldiers = Math.max(0, f.soldiers - 1); f.standing[PLAYER] = clamp(f.standing[PLAYER] - 4, -100, 100); }
    w.player.fear = clamp(w.player.fear + 4);
    spreadRep(w, c.blockId ?? w.player.currentBlockId, { respect: 4, fear: 3 }, 1, 'violence');
    heat(c.war ? 6 : 4);
    log(w, `You put the first one down at ${what(w, c)} and the rest of them think better of it. ${short} leave with nothing. The street watched.`, 'good', refs(c));
  } else {
    land(w, c, rng, 1.25);
    w.player.heat = clamp(w.player.heat);
    heat(c.war ? 7 : 5);
    log(w, `There are more of them than there are of you at ${what(w, c)}. ${damageLine(w, c)} You will feel that tomorrow.`, 'bad', refs(c));
  }
  return won;
}

const refs = (c: Confrontation) => ({ factionId: c.factionId, businessId: c.businessId, npcId: c.npcId, blockId: c.blockId });
/**
 * Where it happened, for a ledger line that reads like a memory rather than a field name.
 *
 * Also in every outcome line above, and that is not decoration. In war a faction takes two acts a
 * day, so two *different* incidents — muscle in one of your rackets, one of your crew against a
 * wall across town — both resolved with a fight and both won printed the same fixed string
 * naming only the faction. It read as one event logged twice, and was reported as a duplicate-
 * processing bug in four separate soak runs. There was never a duplicate: the log was simply not
 * saying which of the two it was talking about.
 */
function what(w: World, c: Confrontation): string {
  const biz = c.businessId ? w.businesses[c.businessId] : undefined;
  if (biz) return biz.name;
  const n = c.npcId ? w.npcs[c.npcId] : undefined;
  if (n) return n.name;
  return w.blocks[c.blockId ?? '']?.name ?? 'your ground';
}

/** What they came to do, done — scaled by how badly it went. */
function land(w: World, c: Confrontation, rng: Rng, severity: number) {
  const p = w.player;
  if (c.kind === 'racket') {
    const r = c.racketId ? w.rackets[c.racketId] : undefined;
    const biz = c.businessId ? w.businesses[c.businessId] : undefined;
    if (r) { r.disrupted = Math.max(r.disrupted, Math.round(rng.int(2, 5) * severity)); r.threatened = w.day + 6; }
    if (biz) biz.condition = clamp(biz.condition - Math.round(15 * severity));
    const stolen = Math.round((r?.lastIncome ?? 0) * 2 * severity);
    if (stolen) p.dirty = Math.max(0, p.dirty - stolen);
  } else if (c.kind === 'business') {
    const biz = c.businessId ? w.businesses[c.businessId] : undefined;
    if (biz) { biz.condition = clamp(biz.condition - Math.round((c.war ? 25 : 10) * severity)); adjustRel(w, w.npcs[biz.ownerId], { fear: 8 }, 'property'); }
  } else if (c.kind === 'you') {
    // They came for you, and nobody stopped them. See `sim/legacy.ts` for what a death means:
    // control passes, the city does not reset, and the blocks are still there under a new name.
    landOnPlayer(w, c, rng, severity);
  } else if (c.kind === 'loved') {
    const n = c.npcId ? w.npcs[c.npcId] : undefined;
    if (n) { n.taken = w.day; log(w, `${n.name} is not at home. Somebody left an address and a time.`, 'bad', { npcId: n.id }); }
  } else {
    const n = c.npcId ? w.npcs[c.npcId] : undefined;
    if (n?.crew) {
      if (severity >= 1.2 && rng.chance(0.35)) { n.crew.status = 'dead'; n.alive = false; n.crew.assignment = undefined; }
      else { n.crew.status = 'injured'; n.crew.statusDays = rng.int(4, 9); n.crew.assignment = undefined; }
    }
  }
}

/**
 * What it costs when somebody gets to the player themselves.
 *
 * Deliberately survivable most of the time and not always: `personalCover` is what men who are
 * awake and a house with a gate are actually worth, and it is subtracted here, on this night,
 * rather than being a number on a screen. A severity that gets past all of it is a killing, and
 * a killing hands the outfit to whoever is left standing (`succeed`).
 */
function landOnPlayer(w: World, c: Confrontation, rng: Rng, severity: number) {
  const p = w.player;
  const led = c.byNpcId ? w.npcs[c.byNpcId] : undefined;
  const who = led ? nemesisName(led) : (w.factions[c.factionId]?.short ?? 'They');
  const got = rng.int(0, 100) + severity * 30 - personalCover(w);
  if (got > 78) {
    const gone = `${who} got to you, and there was nobody between you and them.`;
    log(w, gone, 'bad', refs(c));
    succeed(w, gone);
    return;
  }
  if (got > 45) {
    // hurt, and off the street for a while: jailedDays is the existing "you are not available"
    p.jailedDays = Math.max(p.jailedDays, rng.int(3, 7));
    p.ap = 0; p.legwork = 0;
    p.respect = clamp(p.respect - 6);
    const lost = Math.round(p.dirty * 0.3); p.dirty -= lost;
    log(w, `${who} put you in a room for a while. You are on your back for days and ${money(lost)} went with them. It could have been the other thing.`, 'bad', refs(c));
    return;
  }
  p.respect = clamp(p.respect - 2);
  log(w, `${who} came for you and it did not come off. You are walking, and everybody saw how close it was.`, 'warn', refs(c));
}

function damageLine(w: World, c: Confrontation): string {
  if (c.kind === 'you') return 'They came for you personally.';
  if (c.kind === 'loved') { const n = c.npcId ? w.npcs[c.npcId] : undefined; return `They took ${n?.name ?? 'somebody who is nothing to do with any of this'}.`; }
  if (c.kind === 'racket') { const biz = c.businessId ? w.businesses[c.businessId] : undefined; return `They wrecked the racket at ${biz?.name ?? 'your place'} and took what was in the box.`; }
  if (c.kind === 'business') { const biz = c.businessId ? w.businesses[c.businessId] : undefined; return `${biz?.name ?? 'Your place'} is a mess.`; }
  const n = c.npcId ? w.npcs[c.npcId] : undefined;
  return `${n?.name ?? 'One of your people'} ${n?.crew?.status === 'dead' ? 'did not make it' : 'is laid up'}.`;
}
