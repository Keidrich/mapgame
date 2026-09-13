/**
 * Faction politics beyond the stance ladder: succession crises the player can
 * back, and brokering peace between two factions.
 */
import type { Rng } from './rng';
import { PLAYER, type Faction, type GameEvent, type Id, type Npc, type World } from './types';
import { addInfluence, adjustRel, clamp, log, money, nid, standingCap } from './util';
import { stanceFor } from './generate';
import { addMemory } from './people';

export const CRISIS_DAYS = 3;

/** The boss is gone. Two lieutenants means a crisis; one means a quiet handover; none means the end. */
export function successionOrDeath(w: World, f: Faction) {
  const lts = f.lieutenantIds.map(id => w.npcs[id]).filter(n => n && n.alive);
  if (lts.length >= 2 && !f.crisis) { startCrisis(w, f, lts.slice(0, 2)); return; }
  const lt = lts[0];
  if (lt) { crown(w, f, lt, 'quiet'); }
  else { f.alive = false; f.crisis = undefined; log(w, `${f.name} is finished. Their blocks are up for grabs.`, 'warn', { factionId: f.id }); for (const b of Object.values(w.blocks)) delete b.influence[f.id]; for (const b of Object.values(w.businesses)) if (b.protection?.factionId === f.id) b.protection = undefined; }
}

function startCrisis(w: World, f: Faction, cands: Npc[]) {
  f.crisis = { since: w.day, resolvesDay: w.day + CRISIS_DAYS, candidateIds: cands.map(c => c.id), backedWith: 0 };
  const [a, b] = cands;
  log(w, `${f.name} has no boss. ${a.name} and ${b.name} both want the chair, and the soldiers are picking sides. It settles in ${CRISIS_DAYS} days.`, 'warn', { factionId: f.id });
  const known = f.standing[PLAYER] > -60;
  if (known && !w.pendingEvents.some(e => e.kind === 'succession' && e.refs.factionId === f.id)) {
    const desc = (n: Npc) => `${n.name} (${n.traits.join(', ') || 'unreadable'}; trust ${n.rel.trust})`;
    const ev: GameEvent = {
      id: nid(w, 'e'), day: w.day, kind: 'succession', title: `Who runs ${f.short} now?`,
      text: `Word comes through a lieutenant: ${f.name} is choosing. ${desc(a)} against ${desc(b)}. Money and a public word from you would tip it. Back the winner and the new boss owes you. Back the loser and the new boss never forgets.`,
      options: [
        { id: 'a', label: `Back ${a.name.split(' ')[0]} ($1,500)`, detail: 'Cash and your name behind them', costCash: 1500 },
        { id: 'b', label: `Back ${b.name.split(' ')[0]} ($1,500)`, detail: 'Cash and your name behind them', costCash: 1500 },
        { id: 'out', label: 'Stay out of it', detail: 'Whoever wins starts fresh with you' },
      ],
      refs: { factionId: f.id, npcId: a.id },
    };
    w.pendingEvents.push(ev);
  }
}

/** Put money and your name behind a candidate. Callable more than once; it stacks. */
export function backCandidate(w: World, f: Faction, npcId: Id, amount: number) {
  if (!f.crisis) return;
  const n = w.npcs[npcId];
  if (f.crisis.backing && f.crisis.backing !== npcId) { const prev = w.npcs[f.crisis.backing]; if (prev) adjustRel(prev, { trust: -30 }); log(w, `${prev?.name ?? 'Your first pick'} hears you switched horses.`, 'warn', { factionId: f.id }); f.crisis.backedWith = 0; }
  f.crisis.backing = npcId; f.crisis.backedWith += amount;
  adjustRel(n, { trust: 15, respect: 10 });
  log(w, `You put ${money(amount)} and your name behind ${n.name} for the ${f.short} chair.`, 'money', { factionId: f.id, npcId: n.id });
}

export function tickCrisis(w: World, f: Faction, rng: Rng) {
  const c = f.crisis; if (!c) return;
  // soldiers drift away from a house with no head
  if (rng.chance(0.15) && f.soldiers > 2) f.soldiers--;
  const alive = c.candidateIds.map(id => w.npcs[id]).filter(n => n && n.alive && n.faction === f.id);
  if (alive.length === 1 && w.day < c.resolvesDay) { crown(w, f, alive[0], 'default'); return; }
  if (alive.length === 0) { f.crisis = undefined; successionOrDeath(w, f); return; }
  if (w.day < c.resolvesDay) return;
  const weight = (n: Npc) => n.skills.muscle + n.skills.charm + n.skills.brains / 2 + (n.traits.includes('ambitious') ? 2 : 0) + (c.backing === n.id ? 4 + Math.min(8, c.backedWith / 500) : 0) + rng.float() * 6;
  const ranked = alive.slice().sort((x, y) => weight(y) - weight(x));
  crown(w, f, ranked[0], 'contest', ranked[1]);
}

function crown(w: World, f: Faction, boss: Npc, how: 'quiet' | 'default' | 'contest', loser?: Npc) {
  const c = f.crisis; f.crisis = undefined;
  f.bossId = boss.id; boss.role = 'boss'; f.lieutenantIds = f.lieutenantIds.filter(id => id !== boss.id);
  const p = w.player;
  const setStanding = (v: number) => { f.standing[PLAYER] = Math.min(clamp(v, -100, 100), standingCap(f)); f.stance[PLAYER] = stanceFor(f.standing[PLAYER]); };
  let text = how === 'quiet' ? `${boss.name} takes over ${f.name}.` : how === 'default' ? `${boss.name} runs ${f.name} now; nobody else was left standing.` : `${boss.name} takes the ${f.short} chair.`;
  if (loser) {
    if (loser.traits.includes('ambitious') || loser.traits.includes('hothead')) { loser.faction = undefined; loser.role = 'patron'; f.lieutenantIds = f.lieutenantIds.filter(id => id !== loser.id); f.soldiers = Math.max(1, f.soldiers - 2); text += ` ${loser.name} walks out with a couple of soldiers and a grudge.`; }
    else text += ` ${loser.name} kisses the ring.`;
  }
  if (c?.backing) {
    if (c.backing === boss.id) {
      setStanding(f.standing[PLAYER] + 30); f.owed = (f.owed ?? 0) + 1; f.truceUntil[PLAYER] = Math.max(f.truceUntil[PLAYER] ?? 0, w.day + 15);
      adjustRel(boss, { trust: 30, respect: 15 }); p.respect = clamp(p.respect + 6);
      text += ` They know who put them there: ${f.short} owe you one, and there is a 15-day truce whether the soldiers like it or not.`;
      for (const b of Object.values(w.blocks)) if ((b.influence[f.id] ?? 0) > 0 && (b.influence[PLAYER] ?? 0) > 0) addInfluence(w, b.id, PLAYER, 3);
    } else {
      setStanding(f.standing[PLAYER] - 30); f.grudges.push(`backed:${w.npcs[c.backing]?.name.split(' ')[0] ?? 'rival'}`);
      adjustRel(boss, { trust: -40 });
      text += ` You backed the wrong horse. The new boss knows.`;
    }
  }
  const home = w.districts[f.homeDistrictId]?.blockIds[0]; if (home) addMemory(w, home, 'succession', `${boss.name} took over ${f.short}.`);
  log(w, text, c?.backing === boss.id ? 'good' : c?.backing ? 'bad' : 'warn', { factionId: f.id, npcId: boss.id });
}

/** Rare: a boss goes down without the player's help, and the house has to choose. */
export function bossChurn(w: World, f: Faction, rng: Rng) {
  if (f.crisis || !rng.chance(0.003)) return;
  const boss = w.npcs[f.bossId]; if (!boss) return;
  const how = rng.pick(['indicted by the feds', 'found dead in a parked car', 'shot outside a restaurant by somebody nobody can name', 'gone to Florida with a heart condition and the books']);
  boss.alive = false; boss.notes.push(how);
  log(w, `${boss.name} of ${f.name}: ${how}.`, 'warn', { factionId: f.id, npcId: boss.id });
  successionOrDeath(w, f);
}

// ---------------------------------------------------------------- brokering
export function brokerParties(w: World, n: Npc, otherId: Id): { a: Faction; b: Faction } | undefined {
  const a = n.faction ? w.factions[n.faction] : undefined; const b = w.factions[otherId];
  if (!a || !b || a.id === b.id) return undefined;
  return { a, b };
}
export function brokerReason(w: World, n: Npc, otherId: Id): string | undefined {
  const pr = brokerParties(w, n, otherId); if (!pr) return 'They do not speak for a faction.';
  const { a, b } = pr;
  if (!a.alive || !b.alive) return 'One of them is already gone.';
  const st = a.stance[b.id]; if (st !== 'beef' && st !== 'war') return `${a.short} and ${b.short} are not fighting.`;
  if (a.standing[PLAYER] < -20 || b.standing[PLAYER] < -20) return 'Neither side sits down with someone they are at odds with. Fix your own standing first.';
  if (a.stance[PLAYER] === 'war' || b.stance[PLAYER] === 'war') return 'You are at war with one of them.';
  return undefined;
}

export function broker(w: World, n: Npc, otherId: Id, approach: string, ok: boolean, rng: Rng): 'good' | 'bad' {
  const p = w.player; const { a, b } = brokerParties(w, n, otherId)!;
  const cap = (f: Faction, v: number) => Math.min(clamp(v, -100, 100), standingCap(f));
  if (approach === 'split') { p.cash -= 4000; a.cash += 2000; b.cash += 2000; }
  if (ok) {
    const days = approach === 'lean' ? 15 : 20;
    a.standing[b.id] = b.standing[a.id] = Math.max(a.standing[b.id] ?? 0, -10);
    a.stance[b.id] = b.stance[a.id] = 'tension';
    a.truceUntil[b.id] = b.truceUntil[a.id] = w.day + days;
    const gain = approach === 'favour' ? 8 : 15;
    for (const f of [a, b]) { f.standing[PLAYER] = cap(f, f.standing[PLAYER] + gain); f.stance[PLAYER] = stanceFor(f.standing[PLAYER]); }
    if (approach === 'favour') { if (a.owed) a.owed--; }
    p.respect = clamp(p.respect + (approach === 'lean' ? 4 : 8)); if (approach === 'lean') p.fear = clamp(p.fear + 3);
    const fee = approach === 'split' ? 0 : 400 + Math.round((a.soldiers + b.soldiers) * 25);
    if (fee) p.dirty += fee;
    adjustRel(n, { trust: 10, respect: 15 });
    log(w, `${a.short} and ${b.short} stop shooting: ${days}-day truce, brokered by you.${fee ? ` Both sides send a little something for your trouble: ${money(fee)}.` : ''} Everybody in the room will remember who made it happen.`, 'good', { factionId: a.id });
    return 'good';
  }
  if (approach === 'lean') { for (const f of [a, b]) { f.standing[PLAYER] = cap(f, f.standing[PLAYER] - 12); f.stance[PLAYER] = stanceFor(f.standing[PLAYER]); } adjustRel(n, { respect: -10 }); log(w, `Both sides leave the room hating each other a little less and you a lot more.`, 'bad', { factionId: a.id }); }
  else if (approach === 'favour') { a.standing[PLAYER] = cap(a, a.standing[PLAYER] - 10); a.stance[PLAYER] = stanceFor(a.standing[PLAYER]); if (a.owed) a.owed--; adjustRel(n, { trust: -8 }); log(w, `${a.short} feel used. Nothing changes between them and ${b.short}.`, 'bad', { factionId: a.id }); }
  else { const f = rng.pick([a, b]); f.standing[PLAYER] = cap(f, f.standing[PLAYER] - 5); log(w, `${money(4000)} gone. ${f.short} at least say thanks for the envelope.`, 'bad', { factionId: a.id }); }
  return 'bad';
}
