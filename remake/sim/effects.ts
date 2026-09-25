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
import { addHeat, addInfluence, clamp, fullName, log, money, shortName, poss } from './util';
import { crewCut } from './economy';
import { RAT } from '@r/content/family';
import { ambush } from './fights';
import { cheatHand, sitDown } from './backroom';
import { arcDo, arcOf, detective, endHeir } from './stories';
import { back } from './seasons';
import { PLAYER } from './types';

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
      case 'fire': { const n = w.npcs[e.npcId]; if (n?.crew) { freeFromAssignment(w, n); n.exCrew = w.day; n.crew = undefined; n.faction = undefined; n.role = 'patron'; p.crewIds = p.crewIds.filter(x => x !== n.id); } break; }
      case 'caught': { const n = w.npcs[e.npcId]; if (n?.crew) { const back = Math.round((n.crew.skimmed ?? 0) * 0.5); p.dirty += back; n.crew.skimmed = 0; n.crew.caughtDay = w.day; n.crew.loyalty = clamp(n.crew.loyalty - 8); } break; }
      case 'heal': { const n = w.npcs[e.npcId]; if (n?.crew?.status === 'injured') { n.crew.status = 'ready'; n.crew.statusDays = 0; } break; }
      case 'payroll': { const n = w.npcs[e.npcId]; if (n) { n.payroll = e.n > 0 ? e.n : undefined; n.payrollSince = w.day; } break; }
      case 'cut': { const n = w.npcs[e.npcId]; if (n?.crew) n.crew.cut = Math.max(0, n.crew.cut + e.n); break; }
      case 'rate': { const b = w.businesses[e.businessId]; if (b?.protection) b.protection.rate = e.n; break; }
      case 'agendaKnown': { const n = w.npcs[e.npcId]; if (n?.agenda) n.agenda.known = true; break; }
      case 'secretKnown': { const n = w.npcs[e.npcId]; if (n?.secret) n.secret.known = true; break; }
      case 'evidence': { const c = w.cases[e.caseId]; if (c) c.evidence = clamp(c.evidence + e.n); break; }
      case 'openCase': openCase(w, e.crime, e.suspect, e.witnessId, e.summary); break;
      case 'racketDown': { const r = w.rackets[e.racketId]; if (r) r.down = Math.max(r.down, e.days); break; }
      case 'jobOffer': { const j = e.job; const built = buildJob(w, rng, { kind: j.kind, blockId: j.blockId, businessId: j.targetBusinessId, npcId: j.targetNpcId, faction: j.targetFaction, source: j.sourceId ? w.npcs[j.sourceId] : undefined }); if (built) { built.intel = j.intel; if (j.title) built.title = j.title; if (e.tonight) { built.expires = w.day; built.planDays = 0; built.tonight = true; } } break; }
      case 'schedule': w.scheduled.push({ day: w.day + e.days, template: e.template, npcId: e.npcId, businessId: e.businessId, factionId: e.factionId, ...(e.n ? { n: e.n } : {}) }); break;
      case 'log': log(w, e.text, e.tone); break;
      case 'ratFed': { const n = w.npcs[e.npcId]; if (n?.crew?.rat) { n.crew.rat.fed = true; const worst = Object.values(w.cases).filter(c => c.status === 'open' && c.suspectId === PLAYER).sort((a, b) => b.evidence - a.evidence)[0]; if (worst) worst.evidence = clamp(worst.evidence - RAT.fedCut); log(w, `${fullName(n)} goes on talking, and now it is your story they tell.`, 'good', { npcId: n.id }); } break; }
      case 'defect': defect(w, e.npcId); break;
      case 'fight': ambush(w, rng, e.factionId); break;
      case 'table': if (!w.table || w.table.stage === 'left') sitDown(w, rng, e.businessId, e.stake, e.npcId); break;
      case 'cheatHand': cheatHand(w, rng, e.businessId, e.npcId, e.stake); break;
      case 'arc': { const a = arcOf(w, e.kind); if (a) { if (e.n) a.meter = clamp(a.meter + e.n); if (e.status) { a.status = e.status; a.ended = w.day; } } break; }
      case 'arcDo': arcDo(w, rng, e.kind, e.what); break;
      case 'detKeep': { const d = detective(w); if (d) d.boughtUntil = w.day + e.days; break; }
      case 'detFree': { const d = detective(w); if (d) { d.status = 'active'; d.boughtUntil = undefined; d.meter = clamp(d.meter + 10); } break; }
      case 'heirEnd': endHeir(w, rng, e.how); break;
      case 'season':
        if (!w.season) break;
        if (e.act === 'soften') w.season.soft = true;
        else if (e.act === 'end') w.season.to = w.day + 1;
        else if (e.side) back(w, e.side, e.amount ?? 0);
        break;
      case 'showdown': {
        const n = w.npcs[e.npcId]; if (!n?.crew) break;
        if (rng.float() * 100 < e.chance) { n.crew.loyalty = clamp(n.crew.loyalty + 20); p.fear = clamp(p.fear + 5, 0, 100); log(w, `${fullName(n)} looks at you a long time, and backs down.`, 'good', { npcId: n.id }); }
        else defect(w, e.npcId);
        break;
      }
    }
  }
}

/** A capo walks, and takes his district's rackets dark and a share of the street with him. */
function defect(w: World, id: string) {
  const n = w.npcs[id]; if (!n?.crew) return;
  const a = n.crew.assignment;
  const d = a?.kind === 'district' ? a.districtId : undefined;
  if (d) {
    for (const rid of w.player.racketIds) { const r = w.rackets[rid]; const b = r && w.businesses[r.businessId]; if (b && w.blocks[b.blockId]?.districtId === d) r.down = Math.max(r.down, 10); }
    for (const bid of w.districts[d]?.blockIds ?? []) addInfluence(w, bid, PLAYER, -10);
  }
  freeFromAssignment(w, n);
  w.player.crewIds = w.player.crewIds.filter(x => x !== id);
  n.crew = undefined; n.faction = undefined; n.role = 'patron'; n.rel.trust = -40; n.exCrew = w.day;
  const f = w.player.family; if (f) { if (f.consigliere === id) f.consigliere = undefined; if (f.underboss === id) f.underboss = undefined; }
  log(w, `${fullName(n)} walks, and ${d ? `${w.districts[d].name} goes dark behind him` : 'takes a few friends along'}.`, 'war', { npcId: id });
}

/** The hint on a button, written from what it does. */
export function describe(w: World, effects: Effect[]): string {
  const out: string[] = [];
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const ARC_WORD = { detective: 'his file on you', reporter: 'her story', heir: 'their grudge', avenger: 'their hate', turncoat: 'what they tell', friend: 'the plan' } as const;
  const ARC_DO: Record<string, string> = { 'detective:raid': 'a raid: half your dirty money, and a thick file', 'reporter:runs': 'the piece runs: heat, and your name in print', 'avenger:attempt': 'a gun in a doorway', 'turncoat:sell': 'your secrets to a rival', 'turncoat:cops': 'a file with their name as the witness', 'turncoat:trial': 'everything they know, on the record', 'friend:payoff': 'the score, if it was ever real' };
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
      case 'heal': out.push(`${name(w, e.npcId)} patched up`); break;
      case 'payroll': out.push(e.n > 0 ? `${name(w, e.npcId)} on the payroll at ${money(e.n)}/wk` : `${name(w, e.npcId)} off the payroll`); break;
      case 'cut': out.push(`${poss(name(w, e.npcId))} cut ${e.n > 0 ? '+' : '−'}${money(Math.abs(e.n))}/day`); break;
      case 'rate': out.push(`rate ${Math.round(e.n * 100)}%`); break;
      case 'agendaKnown': out.push(`learn what ${name(w, e.npcId)} needs`); break;
      case 'secretKnown': out.push(`learn ${poss(name(w, e.npcId))} secret`); break;
      case 'evidence': out.push(`case evidence ${sign(e.n)}`); break;
      case 'openCase': out.push('a case file opens'); break;
      case 'racketDown': out.push(`a racket shut ${e.days}d`); break;
      case 'jobOffer': out.push('a job on your board'); break;
      case 'ratFed': out.push(`${name(w, e.npcId)} starts carrying your lies to the police`); break;
      case 'fight': out.push(`a fight: about ${e.odds}% to see them off`); break;
      case 'table': out.push(`a seat at the table, ${money(e.stake)} a hand`); break;
      case 'cheatHand': out.push(`${money(e.stake)} if nobody sees; the stake and the place if somebody does`); break;
      case 'arc': out.push([e.n ? `${ARC_WORD[e.kind]} ${sign(e.n)}` : '', e.status ? 'it ends here' : ''].filter(Boolean).join(', ')); break;
      case 'arcDo': out.push(ARC_DO[`${e.kind}:${e.what}`] ?? 'it comes to a head'); break;
      case 'detKeep': out.push(`bought for ${e.days} more days`); break;
      case 'detFree': out.push('he is back on you, and angrier'); break;
      case 'season': out.push(e.act === 'soften' ? 'the police look half as hard' : e.act === 'end' ? 'it ends tomorrow' : e.side === 'machine' ? 'the machine gets your money' : 'the reformers get your money'); break;
      case 'heirEnd': out.push(e.how === 'partner' ? 'partners, and a truce' : e.how === 'duel' ? 'a fight in the street, settled tonight' : 'a killing, and a war'); break;
      case 'defect': out.push(`${name(w, e.npcId)} walks, and their district goes dark`); break;
      case 'showdown': out.push(`${e.chance}% they back down; otherwise they walk with their district`); break;
      default: break;
    }
  }
  return out.join(' · ') || 'Nothing changes.';
}
const name = (w: World, id: string) => { const n = w.npcs[id]; return n ? shortName(n) : 'someone'; };
export { fullName };
