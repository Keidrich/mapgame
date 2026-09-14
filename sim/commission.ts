/**
 * The Commission: once the city has three living factions, the bosses form a
 * table. Every ten days a proposal comes up and the members vote. The player
 * hears about it, can lean on an ally without a chair, and votes with one.
 */
import type { Rng } from './rng';
import { PLAYER, type Faction, type GameEvent, type Proposal, type World } from './types';
import { addInfluence, clamp, log, money, nid, standingCap } from './util';
import { stanceFor } from './generate';
import { familiar, favours, leverageOver } from './standing';
import { owedToThem } from './ledger';
import { notoriety } from './nemesis';

/**
 * How much a boss's own dealings with the player are worth at the table. Small on purpose: this
 * moves a vote, it does not buy one, and the faction's interest is still most of the decision.
 */
export const PERSONAL = {
  perFavour: 14,      // something real you settled for them
  favourCap: 28,      // ...and no more than two of them count
  perOwed: 10,        // something they did for you that you have not repaid
  hold: 12,           // their street, their books, or somebody of theirs in your cellar
  grudge: 22,         // you humiliated them and they have not let it go
  asset: 16,          // they are already quietly yours
  perNotoriety: 0.35, // a boss who made his name beating you owes you nothing
  nemesisCap: 30,
  strangerShare: 0.25, // none of it counts for much from somebody you have never dealt with
  flip: 20,            // the pull needed to cross the floor at all
};

export const MEETING_EVERY = 10;

export function members(w: World): Faction[] { return (w.commission?.memberIds ?? []).filter(id => id !== PLAYER).map(id => w.factions[id]).filter(f => f && f.alive); }
export function seatReason(w: World): string | undefined {
  const c = w.commission; if (!c) return 'There is no Commission yet.';
  if (c.seat) return 'You already have a chair.';
  const mine = Object.values(w.blocks).filter(b => { const top = Object.entries(b.influence).sort((x, y) => y[1] - x[1])[0]; return top && top[0] === PLAYER && top[1] > 0; }).length;
  const ally = members(w).some(f => f.stance[PLAYER] === 'alliance');
  if (mine < 4 && !ally && w.player.respect < 40) return 'Needs 4 blocks, respect 40, or an ally at the table.';
  if (members(w).some(f => f.stance[PLAYER] === 'war')) return 'Nobody seats a man they are at war with.';
  return undefined;
}

export function tickCommission(w: World, rng: Rng) {
  const alive = Object.values(w.factions).filter(f => f.alive);
  if (!w.commission) {
    if (alive.length >= 3 && w.day >= 15) {
      w.commission = { formedDay: w.day, memberIds: alive.map(f => f.id), seat: false, nextMeeting: w.day + MEETING_EVERY, rulings: [] };
      log(w, `The bosses of ${alive.map(f => f.short).join(', ')} sit down at one table. The Commission will meet every ${MEETING_EVERY} days and rule on the city's business. You are not at the table. Yet.`, 'warn');
    }
    return;
  }
  const c = w.commission;
  // membership follows who is alive; new factions get a chair
  for (const f of alive) if (!c.memberIds.includes(f.id)) { c.memberIds.push(f.id); log(w, `${f.name} take a chair at the Commission.`, 'info', { factionId: f.id }); }
  c.memberIds = c.memberIds.filter(id => id === PLAYER ? c.seat : w.factions[id]?.alive);
  if (c.pending || w.day < c.nextMeeting) return;
  const prop = propose(w, rng); if (!prop) { c.nextMeeting = w.day + MEETING_EVERY; return; }
  c.pending = prop;
  const ally = members(w).find(f => f.stance[PLAYER] === 'alliance');
  const opts: GameEvent['options'] = c.seat
    ? [{ id: 'yes', label: 'Vote for it', detail: 'Members who agree with you warm; the others cool' }, { id: 'no', label: 'Vote against', detail: 'Members who agree with you warm; the others cool' }, { id: 'abstain', label: 'Abstain', detail: 'Nobody remembers you were there' }]
    : ally
      ? [{ id: 'ally_yes', label: `Have ${ally.short} push for it`, detail: 'Half a vote, and they know you asked' }, { id: 'ally_no', label: `Have ${ally.short} push against`, detail: 'Half a vote, and they know you asked' }, { id: 'watch', label: 'Watch from outside', detail: 'No say, no cost' }]
      : [{ id: 'watch', label: 'Wait for the ruling', detail: 'You are not at the table' }];
  w.pendingEvents.push({ id: nid(w, 'e'), day: w.day, kind: 'commission', title: `The Commission meets: ${label(prop)}`, text: prop.text, options: opts, refs: { factionId: prop.targetId && w.factions[prop.targetId] ? prop.targetId : undefined } });
}

function label(p: Proposal) { return { peace: 'the peace', tax: 'the pot', sanction: 'a sanction', carve: 'a claim', seat: 'a chair' }[p.kind]; }

function propose(w: World, rng: Rng): Proposal | undefined {
  const c = w.commission!; const ms = members(w); if (ms.length < 2) return undefined;
  const p = w.player;
  const cands: { w: number; make: () => Proposal | undefined }[] = [
    { w: ms.some(f => ms.some(o => o.id !== f.id && (f.stance[o.id] === 'war' || f.stance[o.id] === 'beef'))) || ms.some(f => f.stance[PLAYER] === 'war' || f.stance[PLAYER] === 'beef') ? 4 : 1, make: () => ({ kind: 'peace', text: 'The shooting is bad for business. Every beef and war between members stops for 15 days, and anyone who breaks it answers to the table.' }) },
    { w: 2, make: () => { const amount = 800 + ms.length * 200; return { kind: 'tax', amount, text: `Each chair puts ${money(amount)} in the pot. The pot goes to whoever holds the most blocks, to keep the peace on their turf.` }; } },
    { w: 3, make: () => { const warsOf = (id: string) => ms.filter(o => o.id !== id && o.stance[id] === 'war').length + (id !== PLAYER && w.factions[id]?.stance[PLAYER] === 'war' ? 1 : 0); const worst = [...ms.map(f => ({ id: f.id, n: warsOf(f.id) })), { id: PLAYER, n: ms.filter(f => f.stance[PLAYER] === 'war').length }].sort((a, b) => b.n - a.n)[0]; if (!worst || worst.n < 1) return undefined; const name = worst.id === PLAYER ? p.name : w.factions[worst.id].name; return { kind: 'sanction', targetId: worst.id, text: `${name} ${worst.id === PLAYER ? 'are' : 'are'} at war with too many people. The table cuts them off: no sit-downs, no favours, and their soldiers are told the money is elsewhere.` }; } },
    { w: 2, make: () => { const f = rng.pick(ms); const d = w.districts[f.homeDistrictId]; if (!d) return undefined; return { kind: 'carve', targetId: f.id, districtId: d.id, text: `${f.name} ask the table to recognise ${d.name} as theirs. Anybody else's people there would be guests.` }; } },
    { w: !c.seat && !seatReason(w) ? 4 : 0, make: () => ({ kind: 'seat', targetId: PLAYER, text: `A name comes up: ${p.name}. Blocks, respect, and nobody wants a loose cannon outside the room. Some say give them a chair. Some say they have not earned it.` }) },
  ];
  const pool = cands.filter(x => x.w > 0);
  for (let i = 0; i < 4 && pool.length; i++) { const pick = rng.weighted(pool.map(x => ({ item: x, w: x.w }))); const prop = pick.make(); if (prop) return prop; pool.splice(pool.indexOf(pick), 1); }
  return undefined;
}

/** How a faction votes: temperament and self-interest. */
function factionLean(f: Faction, prop: Proposal): boolean {
  const atWar = (id: string) => f.stance[id] === 'war' || f.stance[id] === 'beef';
  switch (prop.kind) {
    case 'peace': return f.temperament === 'diplomatic' || (f.temperament !== 'aggressive' && (f.soldiers < 10 || f.cash < 2000)) || (f.temperament === 'aggressive' && f.soldiers < 6);
    case 'tax': return f.temperament !== 'greedy' && f.cash > 5000;
    case 'sanction': return prop.targetId !== f.id && (atWar(prop.targetId!) || f.temperament === 'paranoid' || f.standing[prop.targetId!] < 0);
    case 'carve': return prop.targetId === f.id || (f.standing[prop.targetId!] ?? 0) > 20;
    case 'seat': return f.stance[PLAYER] === 'alliance' || (f.standing[PLAYER] > 25 && f.temperament !== 'paranoid');
  }
}

/**
 * How far a boss's own history with the player pulls them off their outfit's line.
 *
 * A faction votes its interests, and until now that was the whole of it: the boss was a name on
 * the minutes. But the table is five men in a room, and a man who owes you something real, or one
 * you humiliated in front of his own people, does not vote the way the spreadsheet says. Which is
 * exactly the data `sim/standing.ts` and `sim/ledger.ts` already keep about everybody — favours
 * both ways, a grudge, a hold over them, and what beating them made of them.
 *
 * Positive pulls toward whatever the player wants; negative pushes away. Deliberately bounded: a
 * boss can be moved, not bought, and the faction's own interest is still most of the vote.
 */
export function personalPull(w: World, f: Faction): number {
  const boss = w.npcs[f.bossId];
  if (!boss?.alive) return 0;
  let pull = 0;
  pull += Math.min(PERSONAL.favourCap, favours(boss) * PERSONAL.perFavour);      // they owe you
  pull -= Math.min(PERSONAL.favourCap, owedToThem(boss) * PERSONAL.perOwed);     // or you owe them
  if (leverageOver(w, boss)) pull += PERSONAL.hold;                              // you have something on them
  if (boss.grudge) pull -= PERSONAL.grudge;                                      // you humiliated them
  if (boss.asset) pull += PERSONAL.asset;                                        // they already work for you
  // a boss who made his name beating you is not going to do you a favour at the table
  pull -= Math.min(PERSONAL.nemesisCap, notoriety(boss) * PERSONAL.perNotoriety);
  // and it only counts at all once you have actually dealt with them
  return familiar(w, boss) ? Math.round(pull) : Math.round(pull * PERSONAL.strangerShare);
}

/**
 * The vote itself: the outfit's lean, then the man. A pull only ever flips a vote when it is
 * strong enough to clear `PERSONAL.flip`, so most of the table still votes its interests and the
 * ones who cross the floor are the ones with a reason the player can point at.
 */
function vote(w: World, f: Faction, prop: Proposal): boolean {
  const lean = factionLean(f, prop);
  // which way "for the player" points on this proposal: a sanction on them is against, a seat
  // for them is for, and the rest of the table's business is not personal either way
  const forPlayer = prop.kind === 'seat' && prop.targetId === PLAYER ? 1
    : prop.kind === 'sanction' && prop.targetId === PLAYER ? -1
    : prop.kind === 'carve' && prop.targetId === PLAYER ? 1
    : 0;
  if (!forPlayer) return lean;
  const pull = personalPull(w, f) * forPlayer;
  if (lean && pull <= -PERSONAL.flip) return false;   // his outfit says yes and he will not
  if (!lean && pull >= PERSONAL.flip) return true;    // his outfit says no and he does it anyway
  return lean;
}

export function resolveMeeting(w: World, opt: string, rng: Rng) {
  const c = w.commission; const prop = c?.pending; if (!c || !prop) return;
  const ms = members(w);
  let yes = 0, no = 0; const votes: Record<string, boolean> = {};
  for (const f of ms) { const v = vote(w, f, prop); votes[f.id] = v; if (v) yes++; else no++; }
  const mine: boolean | undefined = opt === 'yes' || opt === 'ally_yes' ? true : opt === 'no' || opt === 'ally_no' ? false : undefined;
  if (mine !== undefined) { const weight = c.seat ? 1 : 0.5; if (mine) yes += weight; else no += weight; }
  if (opt.startsWith('ally_')) { const ally = ms.find(f => f.stance[PLAYER] === 'alliance'); if (ally) { votes[ally.id] = mine!; ally.standing[PLAYER] = clamp(ally.standing[PLAYER] - 3, -100, 100); } }
  const passed = yes > no;
  // members remember who stood with them
  if (mine !== undefined) for (const f of ms) { const d = votes[f.id] === mine ? 5 : -5; f.standing[PLAYER] = Math.min(clamp(f.standing[PLAYER] + d, -100, 100), standingCap(f)); f.stance[PLAYER] = stanceFor(f.standing[PLAYER]); }
  let text = `${label(prop)[0].toUpperCase()}${label(prop).slice(1)}: ${passed ? 'passed' : 'rejected'} ${yes}–${no}.`;
  if (passed) text += ' ' + apply(w, prop, rng);
  c.rulings.push({ day: w.day, text, passed }); if (c.rulings.length > 8) c.rulings.shift();
  c.pending = undefined; c.nextMeeting = w.day + MEETING_EVERY;
  log(w, `The Commission rules. ${text}`, passed && prop.kind === 'sanction' && prop.targetId === PLAYER ? 'bad' : 'info');
}

function apply(w: World, prop: Proposal, rng: Rng): string {
  const p = w.player; const c = w.commission!; const ms = members(w);
  switch (prop.kind) {
    case 'peace': {
      for (const f of ms) for (const o of ms) if (f.id !== o.id && (f.stance[o.id] === 'war' || f.stance[o.id] === 'beef')) { f.truceUntil[o.id] = o.truceUntil[f.id] = w.day + 15; f.stance[o.id] = o.stance[f.id] = 'tension'; }
      for (const f of ms) if (f.stance[PLAYER] === 'war' || f.stance[PLAYER] === 'beef') { f.truceUntil[PLAYER] = Math.max(f.truceUntil[PLAYER] ?? 0, w.day + 15); f.stance[PLAYER] = 'tension'; }
      return 'Every gun in the city goes quiet for 15 days.';
    }
    case 'tax': {
      const amount = prop.amount ?? 1000; let pot = 0;
      for (const f of ms) { f.cash -= amount; pot += amount; }
      if (c.seat) { const fromDirty = Math.min(p.dirty, amount); p.dirty -= fromDirty; p.cash -= amount - fromDirty; pot += amount; }
      const holders = [...ms.map(f => ({ id: f.id, n: Object.values(w.blocks).filter(b => topOf(b.influence) === f.id).length })), ...(c.seat ? [{ id: PLAYER, n: Object.values(w.blocks).filter(b => topOf(b.influence) === PLAYER).length }] : [])].sort((a, b) => b.n - a.n);
      const top = holders[0];
      if (top.id === PLAYER) { p.dirty += pot; return `${money(pot)} lands in your lap: you hold the most blocks.`; }
      w.factions[top.id].cash += pot; return `${money(pot)} goes to ${w.factions[top.id].short}, who hold the most blocks.`;
    }
    case 'sanction': {
      if (prop.targetId === PLAYER) { for (const f of ms) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 20, -100, 100); f.stance[PLAYER] = stanceFor(f.standing[PLAYER]); } p.respect = clamp(p.respect - 8); return 'You are cut off. Every chair cools toward you, and your name is mud on the street for a while.'; }
      const t = w.factions[prop.targetId!]; if (!t) return '';
      for (const f of ms) if (f.id !== t.id) { f.standing[t.id] = t.standing[f.id] = clamp((f.standing[t.id] ?? 0) - 20, -100, 100); }
      t.soldiers = Math.max(1, t.soldiers - 3); t.standing[PLAYER] = clamp(t.standing[PLAYER] + 5, -100, 100);
      return `${t.short} lose three soldiers to the sanction and every other chair cools toward them.`;
    }
    case 'carve': {
      const f = w.factions[prop.targetId!]; const d = w.districts[prop.districtId!]; if (!f || !d) return '';
      for (const bid of d.blockIds) { addInfluence(w, bid, f.id, 10); if ((w.blocks[bid].influence[PLAYER] ?? 0) > 0) addInfluence(w, bid, PLAYER, -4); }
      return `${f.short}'s grip on ${d.name} tightens; everybody else's loosens.`;
    }
    case 'seat': {
      c.seat = true; if (!c.memberIds.includes(PLAYER)) c.memberIds.push(PLAYER); p.respect = clamp(p.respect + 10);
      return 'You have a chair. Your vote counts, the pot pays you, and members drift back toward peace with you.';
    }
  }
  void rng;
}
function topOf(inf: Record<string, number>): string | undefined { const e = Object.entries(inf).sort((a, b) => b[1] - a[1])[0]; return e && e[1] > 0 ? e[0] : undefined; }

export function petition(w: World, rng: Rng) {
  const c = w.commission!; const p = w.player; const ms = members(w);
  const avg = ms.reduce((s, f) => s + f.standing[PLAYER], 0) / Math.max(1, ms.length);
  const chance = 25 + p.skills.charm * 4 + p.respect * 0.4 + avg * 0.5 + (ms.some(f => f.stance[PLAYER] === 'alliance') ? 15 : 0);
  if (rng.int(1, 100) <= chance) { c.seat = true; c.memberIds.push(PLAYER); p.respect = clamp(p.respect + 10); log(w, 'The table votes you a chair. Your vote counts now, the pot pays you, and members drift back toward peace with you. (+10 respect)', 'good'); }
  else { for (const f of ms) if (f.temperament === 'paranoid') f.standing[PLAYER] = clamp(f.standing[PLAYER] - 5, -100, 100); log(w, `"Not yet." ${ms.find(f => f.temperament === 'paranoid')?.short ?? 'Somebody'} made sure of it. Come back with more blocks, or a friend at the table.`, 'warn'); }
}
