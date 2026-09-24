/**
 * When the player is taken off the board — convicted, or killed — the outfit does not have to
 * die with them. If somebody in the crew has earned it (level 2, loyalty 55: the same bar as a
 * lieutenant), they take over: your ground, your rackets, your places and most of the money stay;
 * the heat, the files and the grudges that were personal do not.
 *
 * Without this, one bust could run to a trial that ended the game twenty days later with nothing
 * the player could still do about it — the soak bot found it on its first large-city run.
 */
import { BACKGROUNDS } from '@r/content/world';
import { freeFromAssignment } from './people';
import { underboss } from './family';
import type { Ending, Npc, World } from './types';
import { clamp, fullName, log } from './util';

export function heirOf(w: World): Npc | undefined {
  // the underboss first, whatever their level: that is what the post is for (`family.ts`)
  const ub = underboss(w); if (ub) return ub;
  return w.player.crewIds.map(id => w.npcs[id]).filter(n => n?.alive && n.crew && n.crew.status !== 'jailed' && n.crew.level >= 2 && n.crew.loyalty >= 55)
    .sort((a, b) => (b.crew!.level * 10 + b.crew!.loyalty) - (a.crew!.level * 10 + a.crew!.loyalty))[0];
}

/** Hand the outfit on, or end the game if there is nobody to hand it to. */
export function succeed(w: World, ending: Ending, text: string) {
  const heir = heirOf(w);
  if (!heir) { w.over = { ending, day: w.day, text }; return; }
  const p = w.player;
  const was = p.nick ? `"${p.nick}"` : p.name;
  freeFromAssignment(w, heir);
  p.crewIds = p.crewIds.filter(x => x !== heir.id);
  heir.crew = undefined; heir.role = 'crew';
  heir.alive = false; // they become you: the person record retires, the player record carries on
  p.name = `${heir.first} ${heir.last}`; p.nick = heir.nick; p.face = heir.face;
  p.skills = { ...heir.skills }; p.xp = { muscle: 0, brains: 0, charm: 0, wheels: 0, tech: 0 };
  p.generation++;
  p.dirty = Math.round(p.dirty * 0.6);   // some of it walks out of the door with the old boss
  p.heat = 30; p.fear = clamp(p.fear * 0.6); p.respect = clamp(p.respect * 0.7);
  p.lawyer = false;
  for (const c of Object.values(w.cases)) if (c.suspectId === 'player' && (c.status === 'open' || c.status === 'charged')) c.status = 'closed';
  // the crew weigh up the new boss
  for (const id of p.crewIds) { const n = w.npcs[id]; if (n?.crew) n.crew.loyalty = clamp(n.crew.loyalty - 10 + (heir.traits.includes('connected') ? 5 : 0)); }
  log(w, `${text} ${was} is gone. ${fullName(heir)} takes over — same streets, same people, a new name on the door.`, 'war');
  void BACKGROUNDS;
}
