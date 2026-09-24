/**
 * Somebody in a back room who does not want to be there.
 *
 * A successful snatch no longer pays on the spot: the person is held in one of your safehouses,
 * and every day that passes the family offers more — up to about half again — while a kidnap file
 * thickens and the odds they slip out grow if nobody is watching the door. You choose when to take
 * the money, when to let them go, and (for somebody an outfit cares about) whether to trade them
 * for a truce instead. Or the other thing.
 *
 * It runs the other way too: an outfit at war with you can take one of yours, and then you are the
 * family deciding whether to pay.
 */
import { SAFEHOUSE_TIERS } from '@r/content/world';
import { openCase } from './law';
import { freeFromAssignment, kill, spreadWord } from './people';
import type { Rng } from './rng';
import type { Hostage, Id, World } from './types';
import { PLAYER } from './types';
import { addInfluence, clamp, fullName, log, money, nid, remember, theName, they, vb } from './util';

export const HOSTAGE = {
  /** The family's offer climbs this much a day, to `ceiling` times the first. */
  rise: 0.12, ceiling: 1.6,
  /** Daily chance of an escape from a safehouse with nobody of yours on the block. */
  escape: 0.06, escapeGuarded: 0.01,
  /** What a kidnap file grows by a day while they are held. */
  evidence: 4,
};

/** Places to hold somebody: one per safehouse tier. */
export function holdingRoom(w: World): Id | undefined {
  return w.player.safehouseIds.find(id => {
    const s = w.safehouses[id]; if (!s) return false;
    const held = Object.values(w.hostages).filter(h => h.safehouseId === id).length;
    return held < s.tier;
  });
}
export const heldBy = (w: World, npcId: Id) => Object.values(w.hostages).find(h => h.npcId === npcId);
export const isHeld = (w: World, npcId: Id) => !!heldBy(w, npcId);

export function holdHostage(w: World, npcId: Id, ransom: number, safehouseId: Id): Hostage {
  const n = w.npcs[npcId];
  const s = w.safehouses[safehouseId];
  const family = n.ties.find(t => t.kind === 'family' && w.npcs[t.id]?.alive);
  const c = openCase(w, 'kidnap', PLAYER, family?.id, `The disappearance of ${fullName(n)}.`, 10);
  const h: Hostage = { id: nid(w, 'h'), npcId, holder: PLAYER, safehouseId, since: w.day, ransom: Math.round(ransom), first: Math.round(ransom), caseId: c.id };
  w.hostages[h.id] = h;
  n.rel.fear = clamp(n.rel.fear + 40);
  remember(n, w.day, 'hurt', 'Taken and held in a back room.');
  log(w, `${fullName(n)} is in the back room at ${s.name}. The family's first offer: ${money(h.ransom)}.`, 'warn', { npcId });
  return h;
}

/** Somebody of yours taken by an outfit. */
export function snatchCrew(w: World, factionId: Id, npcId: Id, rng: Rng) {
  const n = w.npcs[npcId];
  freeFromAssignment(w, n);
  if (n.crew) { n.crew.status = 'held'; n.crew.statusDays = 0; }
  const ask = Math.round((2000 + (n.crew?.level ?? 1) * 1500) / 100) * 100;
  const h: Hostage = { id: nid(w, 'h'), npcId, holder: factionId, since: w.day, ransom: ask, first: ask };
  w.hostages[h.id] = h;
  log(w, `${theName(w.factions[factionId])} have taken ${fullName(n)}. They want ${money(h.ransom)}.`, 'war', { npcId });
  void rng;
}

export function tickHostages(w: World, rng: Rng) {
  for (const h of Object.values(w.hostages)) {
    const n = w.npcs[h.npcId];
    if (!n?.alive) { delete w.hostages[h.id]; continue; }
    const days = w.day - h.since;
    if (h.holder === PLAYER) {
      const s = h.safehouseId ? w.safehouses[h.safehouseId] : undefined;
      if (!s) { release(w, h, 'The room they were held in is gone, and so are they.'); continue; }
      // the family pays more as the days go
      h.ransom = Math.round(h.first * Math.min(HOSTAGE.ceiling, 1 + HOSTAGE.rise * days) / 50) * 50;
      if (h.caseId && w.cases[h.caseId]?.status === 'open') w.cases[h.caseId].evidence = clamp(w.cases[h.caseId].evidence + HOSTAGE.evidence);
      const guarded = w.player.crewIds.some(id => { const a = w.npcs[id]?.crew?.assignment; return a?.kind === 'guard' && a.blockId === s.blockId; });
      if (rng.chance(guarded ? HOSTAGE.escape * 0.15 : HOSTAGE.escape + days * 0.01)) {
        release(w, h, `${fullName(n)} got out of ${s.name} in the night. ${n.pronoun === 'they' ? 'They are' : `${n.pronoun === 'he' ? 'He' : 'She'} is`} talking to the police.`);
        if (h.caseId && w.cases[h.caseId]) { w.cases[h.caseId].evidence = clamp(w.cases[h.caseId].evidence + 30); if (!w.cases[h.caseId].witnessIds.includes(n.id)) w.cases[h.caseId].witnessIds.push(n.id); }
      }
    } else {
      // one of yours, held by an outfit: the price goes up, and on the fifth day they stop asking
      const f = w.factions[h.holder];
      if (!f?.alive) { freeCrew(w, h, `${theName(f ?? { name: 'them' })} are finished, and ${fullName(n)} walks out of wherever they were kept.`); continue; }
      if (days >= 5) { delete w.hostages[h.id]; kill(w, n.id, `killed by ${theName(f)} when nobody paid`); for (const id of w.player.crewIds) { const c = w.npcs[id]?.crew; if (c) c.loyalty = clamp(c.loyalty - 8); } continue; }
      h.ransom = Math.round(h.first * (1 + 0.1 * days) / 50) * 50;
    }
  }
}

function release(w: World, h: Hostage, text: string) {
  delete w.hostages[h.id];
  log(w, text, 'bad', { npcId: h.npcId });
}
function freeCrew(w: World, h: Hostage, text: string) {
  delete w.hostages[h.id];
  const n = w.npcs[h.npcId];
  if (n?.crew) { n.crew.status = 'injured'; n.crew.statusDays = 2; }
  log(w, text, 'good', { npcId: h.npcId });
}

export type HostageChoice = 'ransom' | 'release' | 'trade' | 'kill' | 'pay';

/** What each choice does, for the button. */
export function hostageChoices(w: World, h: Hostage): { choice: HostageChoice; label: string; hint: string; disabled?: string }[] {
  const n = w.npcs[h.npcId];
  if (h.holder !== PLAYER) {
    const f = w.factions[h.holder];
    return [{ choice: 'pay', label: `Pay ${theName(f)} ${money(h.ransom)}`, hint: `${fullName(n)} comes home. The price goes up every day, and on the fifth they stop asking.`, disabled: w.player.cash + w.player.dirty < h.ransom ? `You need ${money(h.ransom)}.` : undefined }];
  }
  const f = n.faction && n.faction !== PLAYER ? w.factions[n.faction] : undefined;
  const out: { choice: HostageChoice; label: string; hint: string; disabled?: string }[] = [
    { choice: 'ransom', label: `Take the ${money(h.ransom)}`, hint: 'The money, and they go home frightened. The file stays open.' },
    { choice: 'release', label: 'Let them go', hint: 'No money. The street hears you kept your word; the file thins.' },
  ];
  if (f?.alive) out.push({ choice: 'trade', label: `Trade them to ${theName(f)} for a truce`, hint: 'Twenty days of peace, standing with them repaired, and a block you both want is yours.' });
  out.push({ choice: 'kill', label: 'Make sure nobody sees them again', hint: 'The street will be very afraid of you, and the police will be very interested.' });
  return out;
}

export function resolveHostage(w: World, h: Hostage, choice: HostageChoice) {
  const n = w.npcs[h.npcId]; const p = w.player;
  if (h.holder !== PLAYER) {
    const f = w.factions[h.holder];
    const d = Math.min(p.dirty, h.ransom); p.dirty -= d; p.cash -= h.ransom - d; f.cash += h.ransom;
    freeCrew(w, h, `You pay ${theName(f)} ${money(h.ransom)} and ${fullName(n)} is dropped on a corner, bruised and grateful.`);
    if (n.crew) n.crew.loyalty = clamp(n.crew.loyalty + 20);
    return;
  }
  delete w.hostages[h.id];
  const c = h.caseId ? w.cases[h.caseId] : undefined;
  switch (choice) {
    case 'ransom':
      p.dirty += h.ransom;
      n.wealth = Math.max(5, n.wealth - 25);
      for (const t of n.ties) { const o = w.npcs[t.id]; if (o && t.kind === 'family') o.rel.trust = clamp(o.rel.trust - 30, -100, 100); }
      spreadWord(w, n.id, n.homeBlockId, 8, 0);
      log(w, `The family pays ${money(h.ransom)}. ${fullName(n)} goes home and does not say where ${they(n)} ${vb(n, 'were', 'was')}.`, 'money', { npcId: n.id });
      break;
    case 'release':
      if (c) c.evidence = clamp(c.evidence - 20);
      p.respect = clamp(p.respect + 3);
      log(w, `You let ${fullName(n)} go. Word gets round that you kept your word.`, 'info', { npcId: n.id });
      break;
    case 'trade': {
      const f = w.factions[n.faction!];
      f.truceUntil = w.day + 20; f.standing = clamp(Math.max(f.standing, -10) + 20, -100, 100); f.grievances = [];
      const both = Object.values(w.blocks).filter(b => (b.influence[PLAYER] ?? 0) > 5 && (b.influence[f.id] ?? 0) > 5).sort((a, b) => (b.influence[PLAYER] ?? 0) - (a.influence[PLAYER] ?? 0))[0];
      if (both) { addInfluence(w, both.id, f.id, -(both.influence[f.id] ?? 0)); addInfluence(w, both.id, PLAYER, 15); }
      if (c) c.evidence = clamp(c.evidence - 30);
      log(w, `${fullName(n)} goes back to ${theName(f)} in exchange for twenty quiet days${both ? ` and ${both.name}` : ''}.`, 'good', { npcId: n.id });
      break;
    }
    case 'kill':
      kill(w, n.id, 'while you were holding them');
      p.fear = clamp(p.fear + 8);
      if (c) { c.crime = 'murder'; c.evidence = clamp(c.evidence + 25); }
      spreadWord(w, undefined, n.homeBlockId, 12, -3);
      log(w, `${fullName(n)} is not coming home.`, 'bad', { npcId: n.id });
      break;
  }
  void SAFEHOUSE_TIERS;
}
