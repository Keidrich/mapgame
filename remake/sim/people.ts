/** What happens to people: hurt, jailed, killed, promoted, and what the street says about it. */
import { XP_PER_LEVEL } from './economy';
import type { Id, Npc, Skill, World } from './types';
import { PLAYER } from './types';
import { addInfluence, clamp, fullName, log, remember, theName } from './util';

export function injure(w: World, id: Id, days: number, why: string) {
  const n = w.npcs[id]; if (!n?.alive) return;
  if (n.crew) { n.crew.status = 'injured'; n.crew.statusDays = Math.max(n.crew.statusDays, days); freeFromAssignment(w, n); }
  log(w, `${fullName(n)} is hurt — ${why}. Out ${days} days.`, 'bad', { npcId: id });
}

export function jail(w: World, id: Id, days: number, why: string) {
  const n = w.npcs[id]; if (!n?.alive) return;
  const judge = Object.values(w.npcs).find(x => x.official === 'judge' && x.payroll && x.alive);
  const d = Math.max(1, Math.round(days * (judge ? 0.5 : 1) * (w.player.lawyer ? 0.75 : 1)));
  if (n.crew) { n.crew.status = 'jailed'; n.crew.statusDays = d; freeFromAssignment(w, n); }
  else n.jailedDays = d;
  log(w, `${fullName(n)} is locked up — ${why}. ${d} days${judge ? ', and the judge is being reasonable' : ''}.`, 'law', { npcId: id });
}

export function kill(w: World, id: Id, why: string) {
  const n = w.npcs[id]; if (!n?.alive) return;
  n.alive = false;
  if (n.crew) { freeFromAssignment(w, n); w.player.crewIds = w.player.crewIds.filter(x => x !== id); }
  for (const r of Object.values(w.rackets)) if (r.runnerId === id) r.runnerId = undefined;
  for (const s of Object.values(w.safehouses)) for (const l of s.labs) if (l.workerId === id) l.workerId = undefined;
  // whoever loved them remembers who did it
  for (const t of n.ties) {
    const o = w.npcs[t.id]; if (!o?.alive || t.kind === 'rival') continue;
    if (why.includes('you')) { o.rel.trust = clamp(o.rel.trust - (t.kind === 'family' ? 50 : 25), -100, 100); if (t.kind === 'family' && !o.agenda) o.agenda = { kind: 'revenge', known: false, since: w.day, targetId: undefined }; }
  }
  // an outfit that loses its boss has a succession; one that loses a lieutenant loses a hand
  for (const f of Object.values(w.factions)) {
    if (f.bossId === id) succession(w, f.id);
    f.lieutenantIds = f.lieutenantIds.filter(x => x !== id);
  }
  log(w, `${fullName(n)} is dead — ${why}.`, 'bad', { npcId: id });
}

function succession(w: World, fid: Id) {
  const f = w.factions[fid];
  const heir = f.lieutenantIds.map(id => w.npcs[id]).filter(n => n?.alive).sort((a, b) => b.skills.brains + b.skills.muscle - a.skills.brains - a.skills.muscle)[0];
  if (!heir) { log(w, `The ${f.short} have nobody left to lead them.`, 'war'); f.soldiers = Math.floor(f.soldiers / 2); return; }
  f.bossId = heir.id; heir.role = 'boss';
  f.lieutenantIds = f.lieutenantIds.filter(x => x !== heir.id);
  f.soldiers = Math.max(0, f.soldiers - 3);
  log(w, `${fullName(heir)} takes over ${theName(f)}. Some of the soldiers do not stay to see how it goes.`, 'war');
}

export function freeFromAssignment(w: World, n: Npc) {
  if (!n.crew) return;
  const a = n.crew.assignment;
  if (a?.kind === 'racket' && w.rackets[a.racketId]?.runnerId === n.id) w.rackets[a.racketId].runnerId = undefined;
  if (a?.kind === 'lab') for (const s of Object.values(w.safehouses)) for (const l of s.labs) if (l.id === a.labId && l.workerId === n.id) l.workerId = undefined;
  if (a?.kind === 'job') { const j = w.jobs[a.jobId]; if (j) j.crewIds = j.crewIds.filter(x => x !== n.id); }
  n.crew.assignment = undefined;
}

export function gainXp(w: World, id: Id, amount: number) {
  const n = w.npcs[id]; if (!n?.crew) return;
  n.crew.xp += amount;
  while (n.crew.xp >= XP_PER_LEVEL * n.crew.level && n.crew.level < 6) {
    n.crew.xp -= XP_PER_LEVEL * n.crew.level; n.crew.level++;
    const best = (Object.keys(n.skills) as Skill[]).sort((a, b) => n.skills[b] - n.skills[a])[0];
    n.skills[best] = Math.min(10, n.skills[best] + 1);
    log(w, `${fullName(n)} is getting good at this: level ${n.crew.level}, ${best} ${n.skills[best]}.`, 'good', { npcId: id });
  }
}

/** The player learns by doing. A point of a skill every so often, faster when you are bad at it. */
export function practise(w: World, skill: Skill, amount: number) {
  const p = w.player;
  p.xp[skill] += amount;
  const need = 40 + p.skills[skill] * 18;
  if (p.xp[skill] >= need && p.skills[skill] < 10) {
    p.xp[skill] -= need; p.skills[skill]++;
    log(w, `Your ${skill} is ${p.skills[skill]} now.`, 'good');
  }
}

/**
 * Word gets around — along people. Whoever saw it hears it whole; their family and friends hear
 * most of it; everyone else on the block hears a little. Fear and respect both travel.
 */
export function spreadWord(w: World, npcId: Id | undefined, blockId: Id, fear: number, respect: number) {
  const hit = new Set<Id>();
  const touch = (n: Npc | undefined, k: number) => {
    if (!n?.alive || hit.has(n.id) || n.faction === PLAYER) return;
    hit.add(n.id);
    n.rel.fear = clamp(n.rel.fear + fear * k * (n.traits.includes('coward') ? 1.4 : n.traits.includes('tough') ? 0.6 : 1));
    n.rel.respect = clamp(n.rel.respect + respect * k);
  };
  const src = npcId ? w.npcs[npcId] : undefined;
  if (src) { touch(src, 1); for (const t of src.ties) touch(w.npcs[t.id], t.kind === 'family' ? 0.7 : 0.5); }
  for (const n of Object.values(w.npcs)) if (n.homeBlockId === blockId) touch(n, 0.3);
  w.player.fear = clamp(w.player.fear + fear * 0.12, 0, 100);
  w.player.respect = clamp(w.player.respect + respect * 0.12, 0, 100);
  if (fear + respect > 0) addInfluence(w, blockId, PLAYER, (fear + respect) * 0.08);
}

export function hire(w: World, n: Npc, cut: number) {
  n.crew = { loyalty: clamp(40 + n.rel.trust / 3 + (n.traits.includes('loyal') ? 15 : 0)), cut, joined: w.day, status: 'ready', statusDays: 0, xp: 0, level: 1 };
  n.faction = PLAYER; n.role = 'crew';
  if (!w.player.crewIds.includes(n.id)) w.player.crewIds.push(n.id);
  remember(n, w.day, 'hired', 'Came to work for you.');
}

export const readyCrew = (w: World) => w.player.crewIds.map(id => w.npcs[id]).filter(n => n?.alive && n.crew && n.crew.status !== 'jailed' && n.crew.status !== 'injured');
export const idleCrew = (w: World) => readyCrew(w).filter(n => !n.crew!.assignment);
