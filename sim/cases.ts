/**
 * Cold cases. A hit, a big heist, an arson or a frame opens a file. Evidence
 * builds with heat and with a witness who is neither scared nor loyal; the
 * captain and a lawyer slow it. At 100 somebody is charged: one of the crew who
 * did it takes the fall, or the task force comes for you.
 */
import type { Rng } from './rng';
import { PLAYER, type CaseFile, type Id, type Npc, type World } from './types';
import { clamp, jailDays, log, officialTrust, nid } from './util';

export const CASE_COLD_AFTER = 25;

export function openCases(w: World): CaseFile[] { return (w.cases ?? []).filter(c => c.status === 'open'); }
export function caseWitnessOf(w: World, npcId: Id): CaseFile | undefined { return openCases(w).find(c => c.witnessId === npcId); }

/** Somebody on the block who would talk: low trust, not too scared, not yours. */
function pickWitness(w: World, blockId: Id | undefined, rng: Rng): Npc | undefined {
  if (!blockId) return undefined;
  const b = w.blocks[blockId]; if (!b) return undefined;
  const pool = b.businessIds.flatMap(id => { const z = w.businesses[id]; return z ? [z.ownerId, ...z.patronIds] : []; })
    .map(id => w.npcs[id]).filter(n => n && n.alive && !n.crew && !n.official && n.rel.trust < 30 && n.rel.fear < 50);
  return pool.length ? rng.pick(pool) : undefined;
}

export function openCase(w: World, kind: CaseFile['kind'], title: string, refs: CaseFile['refs'], suspectIds: Id[], rng: Rng, startEvidence = 15) {
  const witness = pickWitness(w, refs.blockId, rng);
  const c: CaseFile = { id: nid(w, 'k'), day: w.day, kind, title, evidence: startEvidence, status: 'open', witnessId: witness?.id, suspectIds: suspectIds.slice(), refs };
  (w.cases ??= []).push(c);
  log(w, `A detective opens a file on the ${title}.${witness ? ` ${witness.name} saw something.` : ' Nobody is talking. Yet.'}`, 'warn', { ...refs, npcId: witness?.id ?? refs.npcId });
}

/** A witness who has been scared or won over stops the file growing. */
export function silenceWitness(w: World, npcId: Id, how: 'scared' | 'paid' | 'gone'): boolean {
  const c = caseWitnessOf(w, npcId); if (!c) return false;
  c.witnessId = undefined; c.evidence = clamp(c.evidence - (how === 'gone' ? 35 : 25));
  log(w, how === 'gone' ? `The ${c.title} file just lost its only witness.` : `${w.npcs[npcId].name} will not be testifying about the ${c.title}. (evidence −25)`, how === 'gone' ? 'warn' : 'good', { npcId, blockId: c.refs.blockId });
  return true;
}
/** Money to the captain makes paper disappear. */
export function buryEvidence(w: World, amount: number) {
  const cut = Math.round(amount / 200);
  for (const c of openCases(w)) c.evidence = clamp(c.evidence - cut);
}

export function tickCases(w: World, rng: Rng) {
  const p = w.player;
  const captain = officialTrust(w, 'captain') >= 30;
  for (const c of openCases(w)) {
    const witness = c.witnessId ? w.npcs[c.witnessId] : undefined;
    if (witness && (!witness.alive || witness.crew)) c.witnessId = undefined;
    const talking = witness && witness.alive && witness.rel.fear < 40 && witness.rel.trust < 30;
    let d = 1.5 + p.heat * 0.04 + (talking ? 3 : 0) - (captain ? 1.5 : 0) - (p.lawyer ? 0.5 : 0);
    if (c.kind === 'hit') d += 1;
    const before = c.evidence;
    c.evidence = clamp(c.evidence + d);
    if (before < 50 && c.evidence >= 50) log(w, `Detectives are getting somewhere on the ${c.title}.${witness && talking ? ` ${witness.name} has been seen at the precinct.` : ''}`, 'warn', { ...c.refs, npcId: witness?.id });
    if (c.evidence >= 100) { charge(w, c, rng); continue; }
    if (w.day - c.day >= CASE_COLD_AFTER && c.evidence < 60) { c.status = 'cold'; c.closedDay = w.day; log(w, `The ${c.title} goes cold. The file stays open somewhere in a basement.`, 'info', c.refs); }
  }
}

function charge(w: World, c: CaseFile, rng: Rng) {
  const p = w.player; c.status = 'charged'; c.closedDay = w.day;
  const fall = c.suspectIds.map(id => w.npcs[id]).filter(n => n?.crew && n.alive && n.crew.status !== 'jailed' && n.crew.status !== 'dead');
  if (fall.length && rng.chance(0.6)) {
    const n = rng.pick(fall); n.crew!.status = 'jailed'; n.crew!.statusDays = jailDays(w, 40); n.crew!.assignment = undefined; n.crew!.loyalty = clamp(n.crew!.loyalty - 10);
    log(w, `The ${c.title} closes: ${n.name} is charged and takes the fall. ${n.crew!.statusDays} days${p.lawyer ? ' with your lawyer on it' : ''}. They will remember whether you looked after them.`, 'bad', { npcId: n.id, ...c.refs });
    return;
  }
  p.busts++; p.heat = clamp(p.heat - 30);
  const fine = 3000 + Math.round(p.cash * 0.25); p.cash -= fine;
  const lostDirty = Math.round(p.dirty * 0.5); p.dirty -= lostDirty;
  for (const id of p.racketIds) { const r = w.rackets[id]; if (r) { r.disrupted = Math.max(r.disrupted, 4); } }
  p.respect = clamp(p.respect - 8);
  log(w, `INDICTED on the ${c.title}. Lawyers and bail eat ${fine > 0 ? money(fine) : 'everything'}, ${money(lostDirty)} dirty cash is seized in the searches, and every racket goes dark for 4 days while you sit in a room with no windows.`, 'bad', c.refs);
  for (const f of Object.values(w.factions)) if (f.alive) f.standing[PLAYER] = clamp(f.standing[PLAYER] - 5, -100, 100);
}
function money(n: number) { return `$${Math.round(n).toLocaleString('en-US')}`; }
