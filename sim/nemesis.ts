/**
 * The lieutenant who keeps turning up, and what that makes of them.
 *
 * Nothing here is a parallel system. The history is `sim/ledger.ts` — `remember()`, the same
 * logger a shopkeeper's sheet uses, because a lieutenant and a shopkeeper have the same *kind* of
 * history with the player. The magnitude is `content/standing.ts` — a win is worth what it cost
 * to win, through the same `STAKES` table that decides how much fear an act buys. The chair is
 * `sim/politics.ts` — the succession crisis that already existed, with notoriety on the scale.
 * The defection is `sim/agendas.ts` and `doFavour` — the concession gate every other big ask
 * goes through.
 *
 * The one genuinely new thing is `Npc.nemesis`, and it holds one number.
 */
import { MILESTONES, NEMESIS } from '@content/nemesis';
import { STAKES, type Stake } from '@content/standing';
import { remember } from './ledger';
import { connectionsOf } from './connections';
import type { Rng } from './rng';
import { PLAYER, type Faction, type Id, type Nemesis, type Npc, type World } from './types';
import { clamp, log } from './util';

/** Their working name. A nickname earned against you replaces the given one everywhere. */
export function nemesisName(n: Npc): string {
  const nick = n.nemesis?.nickname;
  if (!nick) return n.name;
  const parts = n.name.split(' ');
  return `${parts[0]} "${nick}" ${parts.slice(1).join(' ')}`.trim();
}

export function isNemesis(n: Npc | undefined): boolean { return !!n?.nemesis && n.nemesis.notoriety >= NEMESIS.known; }
export function notoriety(n: Npc | undefined): number { return n?.nemesis?.notoriety ?? 0; }

function start(w: World, n: Npc): Nemesis {
  if (!n.nemesis) n.nemesis = { since: w.day, wins: 0, losses: 0, notoriety: 0, earned: [] };
  return n.nemesis;
}

/** Whoever is actually leading a faction's move on the player today. */
export function leaderFor(w: World, f: Faction, rng: Rng): Npc | undefined {
  const lts = f.lieutenantIds.map(id => w.npcs[id]).filter(n => n?.alive);
  if (!lts.length) return undefined;
  // somebody who already has history with the player is far more likely to be sent again: that
  // is how a recurring antagonist happens at all, rather than a fresh name every time
  const weighted = lts.flatMap(n => Array<Npc>(1 + Math.round(notoriety(n) / 15)).fill(n));
  return rng.pick(weighted);
}

/**
 * One meeting, scored. `stake` is what the meeting actually cost — the same vocabulary the fear
 * system uses — so beating the player in a fight is worth roughly four times talking over them.
 * A loss takes some of it back, because a nemesis who keeps losing stops being one.
 */
export function scoreMeeting(w: World, n: Npc | undefined, won: boolean, stake: Stake, why: string): void {
  if (!n?.alive || n.crew || n.faction === PLAYER) return;
  const s = start(w, n);
  if (won) { s.wins++; s.notoriety = clamp(s.notoriety + NEMESIS.perWin * STAKES[stake].mult); }
  else { s.losses++; s.notoriety = clamp(s.notoriety - NEMESIS.perLoss * STAKES[stake].mult); }
  remember(w, n, won ? 'harm' : 'door', why);
  payMilestones(w, n);
}

/**
 * What the notoriety buys. Each milestone fires once, and each is one legible change — a trait,
 * a skill, or a name — so a player reading the log can always say what just happened to them.
 */
function payMilestones(w: World, n: Npc): void {
  const s = n.nemesis!;
  for (const m of MILESTONES) {
    if (s.notoriety < m.at || s.earned.includes(m.id)) continue;
    s.earned.push(m.id);
    if (m.trait && !n.traits.includes(m.trait)) n.traits = [...n.traits, m.trait];
    if (m.skill) n.skills = { ...n.skills, [m.skill.key]: clamp(n.skills[m.skill.key] + m.skill.by, 0, 10) };
    if (m.nickname && !s.nickname) {
      // deterministic: the name comes from the id, not from a roll, so a replay reads the same
      s.nickname = m.nickname[(n.id.length + s.wins + Math.round(s.notoriety)) % m.nickname.length];
      n.notes.push(`They call them ${s.nickname} now.`);
    }
    const line = `${nemesisName(n)} ${m.line}.`;
    remember(w, n, 'harm', line);
    log(w, line, 'warn', { npcId: n.id, factionId: n.faction });
  }
}

/** What their record against you adds to their case for the chair. Read by `tickCrisis`. */
export function successionWeight(n: Npc): number { return notoriety(n) * NEMESIS.successionWeight; }

/**
 * Who a faction would actually put forward when the boss goes down. The two with the strongest
 * case, and a record against the player is a large part of that case — a lieutenant who has been
 * beating you in public is exactly who the soldiers would follow.
 */
export function candidatesFor(w: World, f: Faction): Npc[] {
  const lts = f.lieutenantIds.map(id => w.npcs[id]).filter(n => n?.alive);
  return lts.slice().sort((a, b) =>
    (successionWeight(b) + b.skills.muscle + b.skills.charm) - (successionWeight(a) + a.skills.muscle + a.skills.charm));
}

/**
 * Lieutenant-vs-lieutenant. An `ambition` agenda used to mean one thing — a chair, eventually —
 * and every ambitious lieutenant in the city wanted the same one. Sometimes what they actually
 * want is the person standing between them and it, and the connections graph says who that is:
 * somebody they know is a far better target for a quiet move than a stranger two districts away.
 */
export function schemeTarget(w: World, n: Npc, rng: Rng): Id | undefined {
  const f = n.faction ? w.factions[n.faction] : undefined;
  if (!f || n.role !== 'lieutenant') return undefined;
  const peers = f.lieutenantIds.map(id => w.npcs[id]).filter(x => x?.alive && x.id !== n.id);
  if (!peers.length) return undefined;
  const known = new Set(connectionsOf(w, n).map(c => c.npc.id));
  const close = peers.filter(x => known.has(x.id));
  return rng.pick(close.length ? close : peers).id;
}

/**
 * A scheme coming off. The rival is pushed out of the faction — not killed; this is politics —
 * and the schemer takes their standing with it. Called from the agenda milestone, so it runs on
 * the sim's own clock whether or not the player is anywhere near it.
 */
export function resolveScheme(w: World, n: Npc, rng: Rng): boolean {
  const f = n.faction ? w.factions[n.faction] : undefined;
  const rival = n.agenda?.target ? w.npcs[n.agenda.target] : undefined;
  if (!f || !rival?.alive || rival.faction !== f.id) return false;
  const mine = n.skills.brains + n.skills.charm + notoriety(n) / 10;
  const theirs = rival.skills.brains + rival.skills.charm + notoriety(rival) / 10;
  if (rng.int(0, 100) > 50 + (mine - theirs) * 4) {
    log(w, `${nemesisName(n)} moved on ${nemesisName(rival)} inside ${f.short} and it did not come off. They are the one on the outside now.`, 'info', { factionId: f.id, npcId: n.id });
    n.role = 'soldier'; f.lieutenantIds = f.lieutenantIds.filter(id => id !== n.id);
    return false;
  }
  rival.faction = undefined; rival.role = 'patron';
  f.lieutenantIds = f.lieutenantIds.filter(id => id !== rival.id);
  f.soldiers = Math.max(1, f.soldiers - 1);
  start(w, n).notoriety = clamp(notoriety(n) + 10);
  rival.notes.push(`Pushed out of ${f.short} by ${nemesisName(n)}.`);
  remember(w, rival, 'door', `${nemesisName(n)} took their place in ${f.short}.`);
  log(w, `${nemesisName(n)} has ${nemesisName(rival)} out of ${f.name}. Somebody moved and it was not the boss.`, 'warn', { factionId: f.id, npcId: n.id });
  return true;
}

export { PLAYER };
