/**
 * Fights (`content/fights.ts`). One resolver for every fight the game has — taking it to a rival's
 * block, an ambush at nightfall — so the odds on the button are the odds in the street.
 *
 * Your side is you and whoever you bring; theirs is a number of soldiers of a given strength. The
 * fight is three rounds; each side's power rolls up or down a quarter; the round's winner puts
 * one of the other side down. Guns need bullets, which run out mid-fight. What happened comes back
 * as a report (`World.fight`), shown round by round.
 */
import { ATTACK, FIGHT, GUNS, HURT, SOLDIER } from '@r/content/fights';
import { factionBlocks } from './factions';
import { armourOf, kitOf, skillOf } from './kit';
import { injure, kill } from './people';
import type { Rng } from './rng';
import type { Faction, FightReport, Id, Owner, World } from './types';
import { PLAYER } from './types';
import { addHeat, addInfluence, clamp, fullName, log } from './util';

type Who = typeof PLAYER | Id;
const hasGun = (w: World, who: Who) => GUNS.includes(kitOf(w, who).weapon as never);
const nameOf = (w: World, who: Who) => (who === PLAYER ? 'You' : fullName(w.npcs[who]));

/** One person's weight in a fight, with or without bullets for the gun they carry. */
export function personPower(w: World, who: Who, bullets: boolean): number {
  return FIGHT.base + skillOf(w, who, 'muscle') * FIGHT.perMuscle + (bullets && hasGun(w, who) ? FIGHT.gun : 0);
}

export interface Opponent { label: string; count: number; each: number; guns: boolean }

/** How many of an outfit's soldiers stand on one of its blocks, and how hard they hit. */
export function soldiersOn(w: World, f: Faction): Opponent {
  const held = Math.max(1, factionBlocks(w, f.id).length);
  const count = clamp(Math.round((f.soldiers / held) * SOLDIER.perBlock), SOLDIER.minOnBlock, SOLDIER.maxOnBlock);
  const guns = f.cash >= SOLDIER.armedCash;
  return { label: `the ${f.short}`, count, each: SOLDIER.power + (guns ? SOLDIER.armed : 0), guns };
}

/**
 * The chance to win, worked out the way the fight is: a round is won by the higher roll, a fight by
 * two rounds of three. Close enough to the dice to put on a button.
 */
export function fightOdds(w: World, side: Who[], them: Opponent): number {
  const us = side.reduce((t, x) => t + personPower(w, x, w.player.bullets > 0), 0);
  const they = them.count * them.each;
  // a round: P(us·U > they·V) with U, V uniform in 1 ± swing, by a fine grid
  let win = 0, n = 0; const s = FIGHT.swing;
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) { n++; if (us * (1 - s + (2 * s * i) / 20) > they * (1 - s + (2 * s * j) / 20)) win++; }
  const r = win / n;
  return Math.round((r * r * (3 - 2 * r)) * 100);   // best of three
}


/** Three rounds. Who goes down is decided round by round; the report says who and how. */
export function brawl(w: World, rng: Rng, side: Who[], them: Opponent, title: string): FightReport {
  const lines: string[] = []; let ours = 0, theirs = 0, down = 0;
  let standing = side.slice();
  const p = w.player;
  for (let round = 1; round <= FIGHT.rounds && standing.length && down < them.count; round++) {
    // bullets: each gunman fires a few a round while there are any
    let armed = 0;
    for (const x of standing) if (hasGun(w, x) && p.bullets >= FIGHT.bulletsPerRound) { p.bullets -= FIGHT.bulletsPerRound; armed++; }
    const us = standing.reduce((t, x) => t + personPower(w, x, false), 0) + armed * FIGHT.gun;
    const they = (them.count - down) * them.each;
    const a = us * (1 - FIGHT.swing + rng.float() * 2 * FIGHT.swing), b = they * (1 - FIGHT.swing + rng.float() * 2 * FIGHT.swing);
    if (a >= b) {
      ours++; down++;
      lines.push(`Round ${round}: ${armed ? 'shots in the dark, and' : 'fists and whatever is to hand, and'} one of ${them.label} goes down.`);
    } else {
      theirs++;
      const hit = rng.pick(standing);
      if (rng.chance(armourOf(kitOf(w, hit)))) { lines.push(`Round ${round}: ${hit === PLAYER ? 'you take one' : `${nameOf(w, hit)} takes one`} — and the vest keeps it.`); continue; }
      standing = standing.filter(x => x !== hit);
      if (hit === PLAYER) {
        const d = rng.int(FIGHT.youHurt[0], FIGHT.youHurt[1]);
        p.hurtDays = Math.max(p.hurtDays ?? 0, d);
        lines.push(`Round ${round}: you go down hard. ${d} days mending.`);
      } else if (them.guns && rng.chance(FIGHT.deadly)) {
        lines.push(`Round ${round}: ${nameOf(w, hit)} is shot, and does not get up.`);
        kill(w, hit, `shot in a fight with ${them.label}`);
      } else {
        const d = rng.int(FIGHT.hurt[0], FIGHT.hurt[1]);
        lines.push(`Round ${round}: ${nameOf(w, hit)} goes down. ${d} days out.`);
        injure(w, hit, d, `a fight with ${them.label}`);
      }
    }
  }
  const won = ours > theirs && ours > 0;
  lines.push(won ? `${them.label[0].toUpperCase()}${them.label.slice(1)} break and run.` : `You pull back, carrying whoever cannot walk.`);
  const report: FightReport = { day: w.day, title, lines, won, down };
  w.fight = report;
  return report;
}

/** Who comes with you: you, and whoever is named, ready, and in this city. */
export function sideOf(w: World, crewIds: Id[]): Who[] {
  const ready = crewIds.filter(id => { const n = w.npcs[id]; return n?.alive && n.crew?.status === 'ready' && n.crew.assignment?.kind !== 'job'; });
  return [PLAYER, ...ready.slice(0, ATTACK.maxCrew)];
}

/** Taking it to them: a fight on their block, for their soldiers and their ground. */
export function attack(w: World, rng: Rng, factionId: Owner, blockId: Id, crewIds: Id[]) {
  const f = w.factions[factionId]; const b = w.blocks[blockId];
  const side = sideOf(w, crewIds);
  const them = soldiersOn(w, f);
  const guns = side.some(x => hasGun(w, x)) && w.player.bullets > 0;
  const r = brawl(w, rng, side, them, `On ${b.name}, against the ${f.short}`);
  const p = w.player;
  f.soldiers = Math.max(0, f.soldiers - (r.down ?? 0));
  if (r.won) {
    addInfluence(w, blockId, PLAYER, ATTACK.win.influence); addInfluence(w, blockId, factionId, ATTACK.win.theirInfluence);
    p.fear = clamp(p.fear + ATTACK.win.fear, 0, 100); p.respect = clamp(p.respect + ATTACK.win.respect, 0, 100);
    f.standing = clamp(f.standing + ATTACK.win.standing, -100, 100);
    addHeat(w, ATTACK.win.heat + (guns ? ATTACK.gunHeat : 0), blockId);
  } else {
    p.fear = clamp(p.fear + ATTACK.lose.fear, 0, 100); p.respect = clamp(p.respect + ATTACK.lose.respect, 0, 100);
    f.standing = clamp(f.standing + ATTACK.lose.standing, -100, 100);
    addHeat(w, ATTACK.lose.heat + (guns ? ATTACK.gunHeat : 0), blockId);
  }
  f.grievances.unshift(`What you did on ${b.name}`); f.grievances = f.grievances.slice(0, 5);
  log(w, r.won ? `You took it to the ${f.short} on ${b.name}, and they ran. ${r.down ?? 0} of theirs down.` : `The ${f.short} held ${b.name}. You pulled back.`, r.won ? 'good' : 'war', { blockId });
}

/** An ambush: they came to you. Whoever is guarding the block you are on stands with you. */
export function ambush(w: World, rng: Rng, factionId: Owner) {
  const f = w.factions[factionId]; if (!f) return;
  const here = w.player.blockId;
  const guards = w.player.crewIds.filter(id => { const a = w.npcs[id]?.crew?.assignment; return a?.kind === 'guard' && a.blockId === here; });
  const them = soldiersOn(w, f); them.count = Math.max(2, Math.ceil(them.count * 0.7));
  const r = brawl(w, rng, sideOf(w, guards), them, `Outside, after dark: the ${f.short}`);
  f.soldiers = Math.max(0, f.soldiers - (r.down ?? 0));
  if (r.won) w.player.fear = clamp(w.player.fear + 3, 0, 100);
  log(w, r.won ? `The ${f.short} came for you, and went home short.` : `The ${f.short} came for you, and you are lucky to be walking.`, r.won ? 'good' : 'war');
}

/** The odds of seeing off an ambush, with whoever is guarding the block you are on. */
export function ambushOdds(w: World, factionId: Owner): number {
  const f = w.factions[factionId]; if (!f) return 0;
  const guards = w.player.crewIds.filter(id => { const a = w.npcs[id]?.crew?.assignment; return a?.kind === 'guard' && a.blockId === w.player.blockId; });
  const them = soldiersOn(w, f); them.count = Math.max(2, Math.ceil(them.count * 0.7));
  return fightOdds(w, sideOf(w, guards), them);
}

/** The morning's hours when you are hurt: fewer, and one less day to mend. */
export function hurtHours(w: World, hours: number): number {
  const p = w.player;
  if (!p.hurtDays) return hours;
  p.hurtDays--;
  return Math.max(HURT.minHours, hours - HURT.hoursLost);
}
