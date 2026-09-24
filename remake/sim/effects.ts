/**
 * What an event option does, as data. `describe` writes the button's hint from the same list
 * `apply` executes, so a card can never promise one thing and do another — the bug class the
 * original's payout audit spent a whole pass on.
 */
import { buildJob } from './jobs';
import { openCase } from './law';
import { freeFromAssignment, hire, injure, jail, kill } from './people';
import type { Rng } from './rng';
import type { Effect, World } from './types';
import { addHeat, addInfluence, clamp, fullName, log, money, shortName } from './util';
import { crewCut } from './economy';

export function apply(w: World, effects: Effect[], rng: Rng) {
  const p = w.player;
  for (const e of effects) {
    switch (e.k) {
      case 'cash': p.cash = Math.max(0, p.cash + e.n); break;
      case 'dirty': p.dirty = Math.max(0, p.dirty + e.n); break;
      case 'heat': addHeat(w, e.n); if (e.n < 0) p.heat = clamp(p.heat); break;
      case 'fear': p.fear = clamp(p.fear + e.n); break;
      case 'respect': p.respect = clamp(p.respect + e.n); break;
      case 'trust': { const n = w.npcs[e.npcId]; if (n) n.rel.trust = clamp(n.rel.trust + e.n, -100, 100); break; }
      case 'npcFear': { const n = w.npcs[e.npcId]; if (n) n.rel.fear = clamp(n.rel.fear + e.n); break; }
      case 'loyalty': { const n = w.npcs[e.npcId]; if (n?.crew) n.crew.loyalty = clamp(n.crew.loyalty + e.n); break; }
      case 'standing': { const f = w.factions[e.factionId]; if (f) f.standing = clamp(f.standing + e.n, -100, 100); break; }
      case 'influence': addInfluence(w, e.blockId, 'player', e.n); break;
      case 'goods': { const l = p.stash.goods; if (e.n > 0) { l.q = Math.round((l.q * l.n + 55 * e.n) / (l.n + e.n)); } l.n = Math.max(0, l.n + e.n); break; }
      case 'product': { const l = p.stash[e.product]; if (e.n > 0) { l.q = Math.round((l.q * l.n + 55 * e.n) / (l.n + e.n)); } l.n = Math.max(0, l.n + e.n); break; }
      case 'injure': injure(w, e.npcId, e.days, 'it came with the job'); break;
      case 'jail': jail(w, e.npcId, e.days, 'picked up'); break;
      case 'kill': kill(w, e.npcId, 'a decision you made'); break;
      case 'recruit': { const n = w.npcs[e.npcId]; if (n && !n.crew) hire(w, n, crewCut(n)); break; }
      case 'owes': { const n = w.npcs[e.npcId]; if (n) n.rel.owes += e.n; break; }
      case 'fire': { const n = w.npcs[e.npcId]; if (n?.crew) { freeFromAssignment(w, n); n.crew = undefined; n.faction = undefined; n.role = 'patron'; p.crewIds = p.crewIds.filter(x => x !== n.id); } break; }
      case 'caught': { const n = w.npcs[e.npcId]; if (n?.crew) { const back = Math.round((n.crew.skimmed ?? 0) * 0.5); p.dirty += back; n.crew.skimmed = 0; n.crew.caughtDay = w.day; n.crew.loyalty = clamp(n.crew.loyalty - 8); } break; }
      case 'heal': { const n = w.npcs[e.npcId]; if (n?.crew?.status === 'injured') { n.crew.status = 'ready'; n.crew.statusDays = 0; } break; }
      case 'payroll': { const n = w.npcs[e.npcId]; if (n) n.payroll = e.n > 0 ? e.n : undefined; break; }
      case 'cut': { const n = w.npcs[e.npcId]; if (n?.crew) n.crew.cut = Math.max(0, n.crew.cut + e.n); break; }
      case 'rate': { const b = w.businesses[e.businessId]; if (b?.protection) b.protection.rate = e.n; break; }
      case 'agendaKnown': { const n = w.npcs[e.npcId]; if (n?.agenda) n.agenda.known = true; break; }
      case 'secretKnown': { const n = w.npcs[e.npcId]; if (n?.secret) n.secret.known = true; break; }
      case 'evidence': { const c = w.cases[e.caseId]; if (c) c.evidence = clamp(c.evidence + e.n); break; }
      case 'openCase': openCase(w, e.crime, e.suspect, e.witnessId, e.summary); break;
      case 'racketDown': { const r = w.rackets[e.racketId]; if (r) r.down = Math.max(r.down, e.days); break; }
      case 'jobOffer': { const j = e.job; const built = buildJob(w, rng, { kind: j.kind, blockId: j.blockId, businessId: j.targetBusinessId, npcId: j.targetNpcId, faction: j.targetFaction, source: j.sourceId ? w.npcs[j.sourceId] : undefined }); if (built) { built.intel = j.intel; if (j.title) built.title = j.title; if (e.tonight) { built.expires = w.day; built.planDays = 0; built.tonight = true; } } break; }
      case 'schedule': w.scheduled.push({ day: w.day + e.days, template: e.template, npcId: e.npcId, businessId: e.businessId, factionId: e.factionId }); break;
      case 'log': log(w, e.text, e.tone); break;
    }
  }
}

/** The hint on a button, written from what it does. */
export function describe(w: World, effects: Effect[]): string {
  const out: string[] = [];
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  for (const e of effects) {
    switch (e.k) {
      case 'cash': out.push(`${e.n > 0 ? '+' : '−'}${money(Math.abs(e.n))} clean`); break;
      case 'dirty': out.push(`${e.n > 0 ? '+' : '−'}${money(Math.abs(e.n))} dirty`); break;
      case 'heat': out.push(`heat ${sign(e.n)}`); break;
      case 'fear': out.push(`fear ${sign(e.n)}`); break;
      case 'respect': out.push(`respect ${sign(e.n)}`); break;
      case 'trust': out.push(`${name(w, e.npcId)} trust ${sign(e.n)}`); break;
      case 'npcFear': out.push(`${name(w, e.npcId)} fear ${sign(e.n)}`); break;
      case 'loyalty': out.push(`${name(w, e.npcId)} loyalty ${sign(e.n)}`); break;
      case 'standing': out.push(`${w.factions[e.factionId]?.short ?? 'them'} standing ${sign(e.n)}`); break;
      case 'influence': out.push(`influence ${sign(e.n)} on ${w.blocks[e.blockId]?.name}`); break;
      case 'goods': out.push(`${sign(e.n)} hot goods`); break;
      case 'product': out.push(`${sign(e.n)} ${e.product}`); break;
      case 'injure': out.push(`${name(w, e.npcId)} hurt ${e.days}d`); break;
      case 'jail': out.push(`${name(w, e.npcId)} jailed ${e.days}d`); break;
      case 'kill': out.push(`${name(w, e.npcId)} dies`); break;
      case 'recruit': out.push(`${name(w, e.npcId)} joins you`); break;
      case 'owes': out.push(`${name(w, e.npcId)} owes you`); break;
      case 'fire': out.push(`${name(w, e.npcId)} leaves the crew`); break;
      case 'caught': out.push(`${name(w, e.npcId)} stops skimming, and gives half of it back`); break;
      case 'heal': out.push(`${name(w, e.npcId)} back on their feet`); break;
      case 'payroll': out.push(e.n > 0 ? `${name(w, e.npcId)} on the payroll at ${money(e.n)}/wk` : `${name(w, e.npcId)} off the payroll`); break;
      case 'cut': out.push(`${name(w, e.npcId)}'s cut ${e.n > 0 ? '+' : '−'}${money(Math.abs(e.n))}/day`); break;
      case 'rate': out.push(`rate ${Math.round(e.n * 100)}%`); break;
      case 'agendaKnown': out.push(`learn what ${name(w, e.npcId)} needs`); break;
      case 'secretKnown': out.push(`learn ${name(w, e.npcId)}'s secret`); break;
      case 'evidence': out.push(`case evidence ${sign(e.n)}`); break;
      case 'openCase': out.push('a case file opens'); break;
      case 'racketDown': out.push(`a racket shut ${e.days}d`); break;
      case 'jobOffer': out.push('a job on your board'); break;
      default: break;
    }
  }
  return out.join(' · ') || 'Nothing changes.';
}
const name = (w: World, id: string) => { const n = w.npcs[id]; return n ? shortName(n) : 'someone'; };
export { fullName };
