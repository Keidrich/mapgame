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
import type { OpApproach } from '@content/rackets';
import { kitApproachBias, kitHeatMult, kitSkillBoost } from './items';
import type { Rng } from './rng';
import { PLAYER, type Confrontation, type ConfrontApproach, type Faction, type Id, type World } from './types';
import { addHeat, adjustRel, clamp, log, nid, spreadRep } from './util';

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
  return Math.max(3, Math.min(97, Math.round(base)));
}

export function confrontOptions(w: World, c: Confrontation): ConfrontOption[] {
  const crew = backupCrew(w);
  return [
    { id: 'fight', label: 'Stand and fight', icon: '💥', blurb: 'You and whatever is in your hands, right here.', good: 'They go home hurt; the street sees it', bad: 'It lands harder, and on you', chance: confrontChance(w, c, 'fight') },
    { id: 'backup', label: 'Call in your people', icon: '📞', blurb: 'Get somebody down here before this finishes.', good: 'Numbers end it with less blood', bad: 'Somebody of yours gets hurt getting here', chance: confrontChance(w, c, 'backup'), disabled: crew.length ? undefined : 'Nobody to call.' },
    { id: 'flee', label: 'Walk away', icon: '🚶', blurb: 'Let them have this one and keep your teeth.', good: 'Nobody of yours is hurt', bad: 'They do what they came to do, and they tell people', chance: confrontChance(w, c, 'flee') },
  ];
}

/** Queue one. Called from the faction tick instead of applying the damage there and then. */
export function queueConfrontation(w: World, c: Omit<Confrontation, 'id' | 'day'>): Confrontation {
  const full: Confrontation = { ...c, id: nid(w, 'x'), day: w.day };
  w.confrontations = [...confrontations(w), full];
  log(w, full.text, 'warn', { factionId: full.factionId, businessId: full.businessId, npcId: full.npcId, blockId: full.blockId });
  return full;
}

/**
 * Answer one. `absent` is what happens when the day ends with the player never having dealt
 * with it: the attack lands as it would have before any of this existed.
 */
export function resolveConfrontation(w: World, c: Confrontation, approach: ConfrontApproach | 'absent', rng: Rng): boolean {
  w.confrontations = confrontations(w).filter(x => x.id !== c.id);
  const f: Faction | undefined = w.factions[c.factionId];
  const short = f?.short ?? 'They';
  const heat = (n: number) => addHeat(w, Math.round(n * kitHeatMult(w)), c.blockId);
  const won = approach !== 'absent' && rng.int(1, 100) <= confrontChance(w, c, approach);

  if (approach === 'absent') { land(w, c, rng, 1); log(w, `You were not there when ${short} came. ${damageLine(w, c)}`, 'bad', refs(c)); return false; }

  if (approach === 'flee') {
    if (won) {
      log(w, `You are out the back before they are through the door. Nothing of yours is broken, but ${short} tell it their way.`, 'info', refs(c));
      w.player.respect = clamp(w.player.respect - 2);
      if (f) f.standing[PLAYER] = clamp(f.standing[PLAYER] + 2, -100, 100);  // they got what they wanted without a fight
    } else {
      land(w, c, rng, 1);
      log(w, `You go for the door and they are already there. ${damageLine(w, c)}`, 'bad', refs(c));
      w.player.respect = clamp(w.player.respect - 4);
    }
    return won;
  }

  if (approach === 'backup') {
    const crew = backupCrew(w);
    const helper = crew.length ? w.npcs[rng.pick(crew)] : undefined;
    if (won) {
      if (f) f.soldiers = Math.max(0, f.soldiers - 1);
      log(w, `${helper ? `${helper.name} and two others` : 'Your people'} come round the corner before it starts properly. ${short} count heads and leave.`, 'good', refs(c));
      spreadRep(w, c.blockId ?? w.player.currentBlockId, { respect: 3 });
      heat(2);
      if (helper) adjustRel(helper, { trust: 4, respect: 3 });
    } else {
      land(w, c, rng, 0.6);
      if (helper?.crew) { helper.crew.status = 'injured'; helper.crew.statusDays = rng.int(3, 7); helper.crew.assignment = undefined; }
      log(w, `Your people get there late. ${damageLine(w, c)}${helper ? ` ${helper.name} took a beating on the way in.` : ''}`, 'bad', refs(c));
      heat(3);
    }
    return won;
  }

  // fight
  if (won) {
    if (f) { f.soldiers = Math.max(0, f.soldiers - 1); f.standing[PLAYER] = clamp(f.standing[PLAYER] - 4, -100, 100); }
    w.player.fear = clamp(w.player.fear + 4);
    spreadRep(w, c.blockId ?? w.player.currentBlockId, { respect: 4, fear: 3 });
    heat(c.war ? 6 : 4);
    log(w, `You put the first one down and the rest of them think better of it. ${short} leave with nothing. The street watched.`, 'good', refs(c));
  } else {
    land(w, c, rng, 1.25);
    w.player.heat = clamp(w.player.heat);
    heat(c.war ? 7 : 5);
    log(w, `There are more of them than there are of you. ${damageLine(w, c)} You will feel that tomorrow.`, 'bad', refs(c));
  }
  return won;
}

const refs = (c: Confrontation) => ({ factionId: c.factionId, businessId: c.businessId, npcId: c.npcId, blockId: c.blockId });

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
    if (biz) { biz.condition = clamp(biz.condition - Math.round((c.war ? 25 : 10) * severity)); adjustRel(w.npcs[biz.ownerId], { fear: 8 }); }
  } else {
    const n = c.npcId ? w.npcs[c.npcId] : undefined;
    if (n?.crew) {
      if (severity >= 1.2 && rng.chance(0.35)) { n.crew.status = 'dead'; n.alive = false; n.crew.assignment = undefined; }
      else { n.crew.status = 'injured'; n.crew.statusDays = rng.int(4, 9); n.crew.assignment = undefined; }
    }
  }
}

function damageLine(w: World, c: Confrontation): string {
  if (c.kind === 'racket') { const biz = c.businessId ? w.businesses[c.businessId] : undefined; return `They wrecked the racket at ${biz?.name ?? 'your place'} and took what was in the box.`; }
  if (c.kind === 'business') { const biz = c.businessId ? w.businesses[c.businessId] : undefined; return `${biz?.name ?? 'Your place'} is a mess.`; }
  const n = c.npcId ? w.npcs[c.npcId] : undefined;
  return `${n?.name ?? 'One of your people'} ${n?.crew?.status === 'dead' ? 'did not make it' : 'is laid up'}.`;
}
